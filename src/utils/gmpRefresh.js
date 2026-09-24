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
        };
    });
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
    const rows = (await fetchRows()).filter((r) => LIVE_STATUSES.has(r.status));

    const docs = await IpoFull.find({
        isDeleted: { $ne: true },
        'dates.listing': { $gte: new Date(Date.now() - 2 * 86400000) },
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

        // No live quote ("--") is not the same as a premium of zero. Leave whatever we
        // have and say so, rather than flattening a real number to 0.
        if (!row.quoted) {
            report.noQuote.push(`${doc.companyName} (showing ₹${Number(doc.gmp?.current) || 0})`);
            continue;
        }

        const next = row.gmp ?? 0;
        const prev = Number(doc.gmp?.current) || 0;
        if (prev === next) {
            report.unchanged.push(doc.companyName);
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
        doc.gmp.history = [...(doc.gmp.history || []), { date: new Date(), gmp: next }].slice(-60);

        report.updated.push({
            name: doc.companyName,
            slug: doc.slug,
            from: prev,
            to: next,
            matchedBy: how,
            percent: ourPrice ? Number(((next / ourPrice) * 100).toFixed(2)) : null,
        });

        if (apply) await doc.save();
    }

    return { report, backup };
}
