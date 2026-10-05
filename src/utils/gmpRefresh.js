/**
 * Refresh Grey Market Premium for IPOs that have not listed yet.
 *
 * Source: investorgain.com's public GMP report. GMP is NOT official data — no
 * exchange, regulator or registrar publishes it — so this is an aggregator's
 * reading of dealer quotes, and the site labels it as indicative everywhere.
 *
 * Writes `gmp.current` only. `gmp.percent` and `gmp.estListingPrice` are mongoose
 * virtuals computed from our own price band, so a premium is always expressed
 * against the price WE publish, never against the aggregator's.
 *
 * Matching is deliberately strict. Names differ between sources ("Core Integra
 * Consulting" vs "Coreintegra Consulting Services Limited"), so a prefix match is
 * allowed — but only when the cap price agrees within 2%. A name that matches
 * while the price does not is reported, never written: writing another company's
 * premium onto an IPO page is worse than showing no premium at all.
 *
 * Callers must already have a mongoose connection.
 */
import IpoFull from '../models/IpoFull.js';
import { fetchReport } from './reportFeed.js';

const GMP_REPORT = 331;

/** Statuses on the source that mean "not listed yet", the only ones where GMP applies. */
const LIVE_STATUSES = new Set(['U', 'O', 'C', 'CT']);

const nameKey = (s) =>
    String(s || '')
        .toLowerCase()
        .replace(/\b(limited|ltd|private|pvt|india|the)\b/g, '')
        .replace(/[^a-z0-9]/g, '');

const num = (v) => {
    const n = Number(String(v ?? '').replace(/[^0-9.-]/g, ''));
    return Number.isFinite(n) ? n : null;
};

function istNow() {
    return new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });
}

async function fetchRows() {
    const rows = await fetchReport(GMP_REPORT);
    return rows.map((r) => {
        const { gmp, quoted } = parseCurrentGmp(r.GMP);
        return {
            name: String(r['~ipo_name'] || '').trim(),
            status: String(r['~ipo_status1'] || '').trim(),
            gmp,
            quoted,
            sourcePercent: num(r['~gmp_percent_calc']),
            price: num(r['Price (₹)']),
            listing: parseListing(r.Name),
        };
    });
}

/**
 * Once an issue lists, the report appends the opening price and the gain on the issue
 * price to its name: "Orient Cables IPO L@450 (65.44%)". That is the outcome the grey
 * market was predicting, and it is the one figure on these pages that never changes
 * again — so it is worth capturing the day it appears rather than reconstructing it
 * later from an archive that is only published after the close.
 */
function parseListing(cell) {
    const text = String(cell || '').replace(/<[^>]*>/g, ' ').replace(/&#8377;/g, ' ');
    const m = text.match(/L@\s*([\d.]+)\s*\(\s*(-?[\d.]+)\s*%\s*\)/i);
    if (!m) return null;
    const price = num(m[1]);
    const gain = num(m[2]);
    return price ? { price, gain } : null;
}

/**
 * The CURRENT premium, from the rendered cell: "₹<b>6</b> (3.24%) … 3 ↓ / 9.50 ↑".
 *
 * Do not be tempted by `~max_gmp1`: that is the day's HIGH, not the live quote —
 * for the same row above it reads 9.50. Publishing it would overstate every
 * premium on the site. "--" means no quote right now, which is not the same as
 * a premium of zero, so it is reported as unquoted and left alone.
 */
function parseCurrentGmp(cell) {
    const text = String(cell || '')
        .replace(/<[^>]*>/g, ' ')
        .replace(/&#8377;/g, '')
        .replace(/&nbsp;/g, ' ');
    const match = text.match(/(-?[\d.]+|--)\s*\(\s*(-?[\d.]+)%\s*\)/);
    if (!match) return { gmp: null, quoted: false };
    if (match[1] === '--') return { gmp: 0, quoted: false };
    return { gmp: num(match[1]), quoted: true };
}

/** Exact key, else a prefix match in either direction (source names are often shorter). */
function findDoc(row, byKey, keys) {
    const key = nameKey(row.name);
    if (byKey.has(key)) return { doc: byKey.get(key), how: 'name' };
    if (key.length < 10) return { doc: null, how: null };

    const hits = keys.filter((k) => k.startsWith(key) || key.startsWith(k));
    if (hits.length === 1) return { doc: byKey.get(hits[0]), how: 'prefix' };
    return { doc: null, how: hits.length > 1 ? 'ambiguous' : null };
}

/**
 * @param {{ apply?: boolean }} options
 * @returns {Promise<{ report: object, backup: Array }>}
 */
export async function refreshGmp({ apply = false } = {}) {
    // Live issues carry a premium worth updating. A listed one carries no premium at
    // all, but its row holds the opening price — the one figure here that is final — so
    // those rows are kept too and handled separately below.
    const rows = (await fetchRows()).filter((r) => LIVE_STATUSES.has(r.status) || r.listing);

    // Two days was enough while this job only tracked premiums, which stop at listing.
    // Capturing the opening price needs a wider window: an issue that listed last week
    // still has its figure in the feed, and a run that only ever looked back 48 hours
    // would miss any listing that happened while the job was down.
    const docs = await IpoFull.find({
        isDeleted: { $ne: true },
        'dates.listing': { $gte: new Date(Date.now() - 30 * 86400000) },
    });

    const byKey = new Map(docs.map((d) => [nameKey(d.companyName), d]));
    const keys = [...byKey.keys()];

    const report = {
        sourceRows: rows.length,
        candidates: docs.length,
        updated: [],
        unchanged: [],
        priceMismatch: [],
        implausible: [],
        noQuote: [],
        saveFailed: [],
        unmatched: [],
    };
    const backup = [];

    for (const row of rows) {
        const { doc, how } = findDoc(row, byKey, keys);
        if (!doc) {
            report.unmatched.push(`${row.name}${how === 'ambiguous' ? ' (ambiguous name)' : ''}`);
            continue;
        }

        // The guard: a name may match loosely, the cap price must not.
        const ourPrice = Number(doc.priceBand?.max) || null;
        if (ourPrice && row.price && Math.abs(row.price - ourPrice) / ourPrice > 0.02) {
            report.priceMismatch.push(
                `${doc.companyName}: source says ₹${row.price}, our price band caps at ₹${ourPrice} — skipped`
            );
            continue;
        }

        // Listing price, captured before anything else.
        //
        // Once an issue lists the grey market stops quoting it, so this would otherwise
        // fall into the no-quote branch below and never be read. It is also the one
        // figure here that is final — recording it the day it appears avoids depending
        // on the exchange's end-of-day archive, which is not published until after the
        // close and so cannot serve a listing-morning page.
        if (row.listing && !doc.gmp?.listingPrice) {
            if (!doc.gmp) doc.gmp = {};
            doc.gmp.listingPrice = row.listing.price;
            doc.gmp.listingGain = row.listing.gain;
            doc.gmp.listedAtText = istNow();
            report.listed = report.listed || [];
            report.listed.push(`${doc.companyName}: listed at ₹${row.listing.price} (${row.listing.gain}%)`);
            if (apply) {
                try {
                    await doc.save();
                } catch (error) {
                    report.errors.push(`${doc.companyName}: save failed — ${error.message}`);
                }
            }
        }

        // A listed issue has no premium to track; its row was kept only for the price above.
        if (!LIVE_STATUSES.has(row.status)) continue;

        // The grey market has stopped quoting this issue: the report shows "--" rather
        // than a figure. The premium is published as zero.
        //
        // This is a deliberate choice over keeping the last real number. Holding it left
        // an eleven-day-old "+₹8 (+15.38%)" on the page looking current, and the honest
        // alternative — showing the stale figure with a notice explaining it — cluttered
        // the card for issues nobody trades. Zero reads cleanly and is what readers
        // expect; the last real quote is still in `history`, and `quoted: false` records
        // that this is an absence of trading rather than a measured premium.
        if (!row.quoted) {
            report.noQuote.push(`${doc.companyName} (showing ₹${Number(doc.gmp?.current) || 0})`);

            const held = Number(doc.gmp?.current) || 0;
            const alreadyMarked = doc.gmp?.quoted === false;
            if (held !== 0 || !alreadyMarked) {
                if (held !== 0) backup.push({ slug: doc.slug, gmp: { current: held } });
                if (!doc.gmp) doc.gmp = {};
                doc.gmp.current = 0;
                doc.gmp.quoted = false;
                // Stamp only when a figure actually changed, so the card does not claim a
                // fresh reading for a record that was merely re-confirmed as unquoted.
                if (held !== 0) doc.gmp.lastUpdatedAtText = istNow();
                if (apply) {
                    try {
                        await doc.save();
                    } catch (error) {
                        report.errors.push(`${doc.companyName}: save failed — ${error.message}`);
                    }
                }
            }
            continue;
        }

        const next = row.gmp ?? 0;
        const prev = Number(doc.gmp?.current) || 0;
        if (prev === next) {
            report.unchanged.push(doc.companyName);
            // The premium has not moved, but a quote DID arrive. Returning here without
            // recording that left the flag wherever it was: an issue that stopped being
            // quoted and later resumed at the same price would have kept telling readers
            // the figure was historic, indefinitely.
            if (doc.gmp?.quoted !== true) {
                if (!doc.gmp) doc.gmp = {};
                doc.gmp.quoted = true;
                doc.gmp.quotedAtText = istNow();
                if (apply) {
                    try {
                        await doc.save();
                    } catch (error) {
                        report.errors.push(`${doc.companyName}: save failed — ${error.message}`);
                    }
                }
            }
            continue;
        }

        // A premium above 100% of the issue price is almost always a parsing or
        // matching error rather than a real quote, so flag it instead of publishing.
        const ourCap = Number(doc.priceBand?.max) || null;
        if (ourCap && next > ourCap) {
            report.implausible.push(
                `${doc.companyName}: source GMP ₹${next} exceeds the ₹${ourCap} issue price — skipped`
            );
            continue;
        }

        backup.push({ slug: doc.slug, gmp: { current: prev } });

        if (!doc.gmp) doc.gmp = {};
        doc.gmp.current = next;
        doc.gmp.lastUpdatedAtText = istNow();
        // A real quote came through: the issue is being traded again.
        doc.gmp.quoted = true;
        doc.gmp.quotedAtText = istNow();
        doc.gmp.history = [...(doc.gmp.history || []), { date: new Date(), gmp: next }].slice(-60);

        report.updated.push({
            name: doc.companyName,
            slug: doc.slug,
            from: prev,
            to: next,
            matchedBy: how,
            percent: ourPrice ? Number(((next / ourPrice) * 100).toFixed(2)) : null,
        });

        if (apply) {
            try {
                await doc.save();
            } catch (error) {
                report.saveFailed.push(`${doc.companyName}: ${error.message}`);
            }
        }
    }

    return { report, backup };
}
