/**
 * Live subscription figures for open (and just-closed) IPOs, from the NSE.
 *
 * Source: https://www.nseindia.com/api/ipo-detail — the `activeCat` block, which is the
 * CONSOLIDATED NSE + BSE bid count, so it is right for BSE-listed issues too.
 *
 * What it writes: `subscription.categories[].appliedShares` (the bid count) and, where
 * our record has no reservation of its own, `sharesOffered`. The offered figures in our
 * database come from the prospectus and are more reliable than the exchange's offered
 * column, which is quoted on the lower price band and reads 0 for many SME issues — so
 * bids ÷ prospectus reservation is the ratio we keep.
 *
 * Totals (totalTimes / totalOffered / totalApplied) are left to computeDerivedFields,
 * the same helper the admin save path uses, so nothing here can drift from the app.
 *
 * A category the exchange reports that our record holds no reservation for is only
 * carried when the exchange also published a real offered figure; otherwise it is
 * reported and skipped, because NSE mislabels some SME categories and quotes 0 offered.
 *
 * Callers must already have a mongoose connection.
 */
import IpoFull from '../models/IpoFull.js';
import { computeDerivedFields } from './ipoCalculations.js';
import { fetchReport, stripHtml } from './reportFeed.js';

/**
 * BSE SME issues do not appear in the NSE's api/ipo-current-issue feed at all —
 * on a typical day that left 7 of our 17 open IPOs with no subscription figures.
 * This second pass covers exactly those, from a public report of BSE bid data.
 *
 * It reports subscription as MULTIPLES rather than share counts, so the applied
 * shares are reconstructed as times x our prospectus reservation. The ratio the
 * site shows is therefore the published one; only the absolute bid count is
 * derived, and it is never written for a category we hold no reservation for.
 */
const BSE_SUB_REPORT = 333;

const UA =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36';
const NSE = 'https://www.nseindia.com';

// No upstream gets to hang the job. Without this a stalled NSE connection held the
// lock open and every later run answered 409 until the service restarted.
const REQUEST_TIMEOUT_MS = 20000;

export const nameKey = (s) =>
    String(s || '')
        .toLowerCase()
        .replace(/\b(limited|ltd|private|pvt|india|the)\b/g, '')
        .replace(/[^a-z0-9]/g, '');

/** NSE's verbose category labels -> the category names used in our documents. */
function mapCategory(label) {
    const s = String(label || '').toLowerCase();
    if (s.includes('qualified institutional')) return 'QIB';
    if (s.includes('non institutional')) return 'NII';
    if (s.includes('retail')) return 'Retail';
    if (s.includes('employee')) return 'Employee';
    if (s.includes('shareholder')) return 'Shareholder';
    if (s.includes('policyholder')) return 'Policyholder';
    if (s.includes('market maker')) return 'MarketMaker';
    return null;
}

/** Aliases so an NII row lands on a record that calls the same category HNI. */
const ALIASES = {
    NII: ['NII', 'HNI', 'NII/HNI'],
    bNII: ['bNII', 'BNII', 'HNI 10+'],
    sNII: ['sNII', 'SNII', 'HNI 2+'],
    QIB: ['QIB'],
    Retail: ['Retail', 'RII'],
    Employee: ['Employee', 'Employees'],
    Shareholder: ['Shareholder', 'Shareholders'],
    Policyholder: ['Policyholder', 'Policyholders'],
    MarketMaker: ['MarketMaker', 'Market Maker'],
};

const num = (v) => {
    const n = Number(String(v ?? '').replace(/,/g, ''));
    return Number.isFinite(n) ? n : null;
};

/** Minutes past midnight, IST. */
function istMinutes() {
    const [h, m] = new Date()
        .toLocaleTimeString('en-GB', { timeZone: 'Asia/Kolkata', hour12: false })
        .split(':')
        .map(Number);
    return h * 60 + m;
}

export function istDay(value = new Date()) {
    return new Date(value).toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
}

async function nseSession() {
    const res = await fetch(`${NSE}/market-data/all-upcoming-issues-ipo`, {
        headers: { 'User-Agent': UA, Accept: 'text/html' },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    const cookie = (res.headers.getSetCookie?.() || []).map((c) => c.split(';')[0]).join('; ');
    return {
        'User-Agent': UA,
        Accept: 'application/json, text/plain, */*',
        'Accept-Language': 'en-US,en;q=0.9',
        Referer: `${NSE}/market-data/all-upcoming-issues-ipo`,
        Cookie: cookie,
    };
}

async function getJson(url, headers) {
    const res = await fetch(url, { headers, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
    if (!res.ok) throw new Error(`${res.status} ${res.statusText} for ${url}`);
    return res.json();
}

/** Only the top-level rows carry an offered figure; the lettered sub-rows are a breakdown. */
function parseActiveCat(detail) {
    const rows = detail?.activeCat?.dataList || [];
    const out = { categories: new Map(), totalBid: null };

    for (const row of rows) {
        const srNo = String(row.srNo ?? '');
        const label = String(row.category ?? '');

        if (label === 'Category') continue; // header row
        if (label.trim().toLowerCase() === 'total') {
            out.totalBid = num(row.noOfSharesBid);
            continue;
        }
        // "1(a)", "2.1(b)" are lettered breakdowns with no offered figure — skip those.
        // "2.1" / "2.2" ARE meaningful: the exchange's own bNII / sNII split.
        const isTop = /^\d+$/.test(srNo);
        const isNiiSplit = srNo === '2.1' || srNo === '2.2';
        if (!isTop && !isNiiSplit) continue;

        if (isNiiSplit) {
            // 2.1 = bids above Rs 10 lakh (bNII), 2.2 = Rs 2-10 lakh (sNII).
            out.categories.set(srNo === '2.1' ? 'bNII' : 'sNII', {
                label,
                bid: num(row.noOfSharesBid),
                offered: num(row.noOfShareOffered),
                parent: 'NII',
            });
            continue;
        }

        const category = mapCategory(label);
        if (!category) continue;
        out.categories.set(category, {
            label,
            bid: num(row.noOfSharesBid),
            offered: num(row.noOfShareOffered),
        });
    }
    return out;
}

/**
 * Rebase the exchange's offered quantities onto the prospectus share count.
 *
 * NSE sizes the fresh issue at the FLOOR price while it is still bidding, so its
 * "shares offered" are larger than the offer actually is: for Moneyview, fresh
 * Rs 750cr / Rs 32 + OFS = 33,48,69,200 shares against the prospectus figure of
 * 32,10,82,435 at the Rs 34 cap. Every other IPO site quotes the prospectus basis,
 * and so does the final basis-of-allotment once the price is fixed, so the exchange
 * figure reads high by ~4% and makes every subscription multiple read low.
 *
 * Bids still come from the exchange untouched — only the denominator is restated.
 */
function capBasis(doc) {
    const capShares = Number(doc.issueSize?.shares) || 0;
    const floor = Number(doc.priceBand?.min) || 0;
    const freshCr = Number(doc.issueBreakdown?.fresh?.cr) || 0;
    const ofsShares = Number(doc.issueBreakdown?.ofs?.shares) || 0;
    if (!capShares || !floor || (!freshCr && !ofsShares)) return null;

    const exchangeTotal = (freshCr * 1e7) / floor + ofsShares;
    if (!exchangeTotal) return null;

    const scale = capShares / exchangeTotal;
    // A scale outside this range means the inputs disagree; leave the data alone.
    return scale > 0.8 && scale <= 1.0001 ? { scale, capShares } : null;
}

/**
 * Net-of-anchor QIB percentages that SEBI's structures produce: 50% QIB less a 60%
 * anchor leaves 20%; a loss-making issuer's 75% QIB less anchor leaves 30%.
 */
const QIB_NET_SHARES = [0.2, 0.3];

/**
 * The reservation split is whatever the DRHP/RHP says — it is NOT a fixed formula.
 * Employee, shareholder and policyholder quotas, SME structures and loss-making
 * issuers all change it. So the exchange's published proportions are preserved
 * exactly and only the price basis is restated.
 *
 * QIB is the one exception. The exchange publishes it net of anchor, and anchor is a
 * fixed share count that does not move with the price basis, so scaling alone leaves
 * it wrong. Where the scaled figure lands within a percentage point of a net-of-anchor
 * structure, it is snapped to that exact share; otherwise it is left scaled. No other
 * category is ever snapped, so a real 34.2% retail portion stays 34.2% instead of
 * being rounded up into a 35% that the prospectus never said.
 */
function rebaseOffered(offered, basis, category) {
    if (!basis || !offered) return offered;
    const scaled = offered * basis.scale;

    if (category === 'QIB') {
        const pct = scaled / basis.capShares;
        const standard = QIB_NET_SHARES.find((s) => Math.abs(pct - s) <= 0.01);
        if (standard) return Math.round(standard * basis.capShares);
    }
    return Math.round(scaled);
}

/**
 * @param {{ apply?: boolean, closedWithinDays?: number }} options
 * @returns {Promise<{ report: object, backup: Array }>} report.updated carries the per-IPO changes
 */
export async function refreshSubscriptions({ apply = false, closedWithinDays = 2 } = {}) {
    const headers = await nseSession();
    const current = await getJson(`${NSE}/api/ipo-current-issue`, headers);

    const today = istDay();
    const docs = await IpoFull.find({ isDeleted: { $ne: true } });

    const bySymbol = new Map();
    const byName = new Map();
    for (const doc of docs) {
        // `symbol` is { nse, bse }, not a string — both sides are worth indexing.
        for (const s of [doc.symbol?.nse, doc.symbol?.bse]) {
            if (s) bySymbol.set(String(s).toUpperCase(), doc);
        }
        byName.set(nameKey(doc.companyName), doc);
    }

    const report = {
        activeIssues: current.length,
        updated: [],
        unchanged: [],
        unmatched: [],
        skippedRows: [],
        noExchangeRow: [],
        notStarted: [],
        errors: [],
    };
    const backup = [];

    for (const issue of current) {
        const doc =
            bySymbol.get(String(issue.symbol).toUpperCase()) || byName.get(nameKey(issue.companyName));

        if (!doc) {
            report.unmatched.push(`${issue.companyName} (${issue.symbol})`);
            continue;
        }

        // Skip issues that closed longer ago than the window — their numbers are final.
        const close = doc.dates?.close ? istDay(doc.dates.close) : null;
        if (close && close < today) {
            const age = Math.round((new Date(today) - new Date(close)) / 86400000);
            if (age > closedWithinDays) continue;
        }

        // Matched by name because the record had no NSE symbol — store it so the next
        // run matches exactly instead of relying on name normalisation.
        const learnedSymbol = !doc.symbol?.nse ? String(issue.symbol).toUpperCase() : null;

        let detail;
        try {
            detail = await getJson(
                `${NSE}/api/ipo-detail?symbol=${encodeURIComponent(issue.symbol)}&series=${encodeURIComponent(issue.series)}`,
                headers
            );
        } catch (error) {
            report.errors.push(`${doc.companyName}: ${error.message}`);
            continue;
        }

        const basis = capBasis(doc);

        // Categories whose offered quantity came from the prospectus. The exchange
        // figure is a price-basis estimate; the RHP is the actual allocation, so a
        // prospectus number is never overwritten by a derived one.
        const fromProspectus = new Set(
            (doc.reservations || [])
                .filter((r) => r.enabled !== false && Number(r.sharesOffered))
                .map((r) => String(r.category || '').toLowerCase())
        );

        const parsed = parseActiveCat(detail);
        if (!parsed.categories.size) {
            // Bidding opens at 10:00 IST and the exchange publishes nothing before then,
            // so an empty response on an issue's first morning is expected, not a fault.
            const opensToday = doc.dates?.open && istDay(doc.dates.open) === today;
            if (opensToday && istMinutes() < 10 * 60 + 15) {
                report.notStarted.push(`${doc.companyName}: bidding has not opened yet`);
            } else {
                report.errors.push(`${doc.companyName}: no category rows in the NSE response`);
            }
            continue;
        }

        if (!Array.isArray(doc.subscription?.categories)) doc.subscription = { categories: [] };
        const before = JSON.parse(JSON.stringify(doc.subscription.categories || []));
        const changes = [];

        // Most imported records carry no subscription rows at all. Seed them from the
        // prospectus reservations — Anchor is already excluded from the QIB reservation,
        // and MarketMaker is excluded from the totals by computeDerivedFields.
        if (!doc.subscription.categories.length && doc.reservations?.length) {
            for (const res of doc.reservations) {
                if (res.enabled === false) continue;
                if (['Anchor', 'MarketMaker'].includes(res.category)) continue;
                doc.subscription.categories.push({
                    enabled: true,
                    category: res.category,
                    sharesOffered: Number(res.sharesOffered) || 0,
                    appliedShares: 0,
                });
            }
            if (doc.subscription.categories.length) {
                changes.push(
                    `seeded ${doc.subscription.categories.length} categories from the prospectus reservations`
                );
            }
        }

        for (const [category, row] of parsed.categories) {
            if (row.bid === null) continue;

            const aliases = (ALIASES[category] || [category]).map((a) => a.toLowerCase());
            const target = doc.subscription.categories.find((c) =>
                aliases.includes(String(c.category || '').toLowerCase())
            );

            if (!target) {
                if (!row.offered) {
                    report.skippedRows.push(
                        `${doc.companyName}: "${row.label}" -> ${category} (no reservation on our record, NSE offered 0)`
                    );
                    continue;
                }
                doc.subscription.categories.push({
                    enabled: true,
                    category,
                    sharesOffered: rebaseOffered(row.offered, basis, category),
                    appliedShares: row.bid,
                    ...(row.parent ? { parent: row.parent } : {}),
                });
                changes.push(
                    `${category}: added from NSE — ${row.bid.toLocaleString('en-IN')} bid of ${row.offered.toLocaleString('en-IN')} offered`
                );
                continue;
            }

            if (row.parent && !target.parent) target.parent = row.parent;

            const prevApplied = Number(target.appliedShares) || 0;
            if (prevApplied !== row.bid) {
                changes.push(
                    `${target.category}: ${prevApplied.toLocaleString('en-IN')} -> ${row.bid.toLocaleString('en-IN')} bid`
                );
                target.appliedShares = row.bid;
            }

            // Only fill offered when we have nothing from the prospectus.
            const prospectusHeld = (ALIASES[category] || [category]).some((a) =>
                fromProspectus.has(a.toLowerCase())
            );
            const offered = prospectusHeld ? 0 : rebaseOffered(row.offered, basis, category);
            if (offered && Number(target.sharesOffered) !== offered) {
                const before = Number(target.sharesOffered) || 0;
                target.sharesOffered = offered;
                changes.push(
                    before
                        ? `${target.category}: offered restated ${before.toLocaleString('en-IN')} -> ${offered.toLocaleString('en-IN')}`
                        : `${target.category}: offered set to ${offered.toLocaleString('en-IN')}`
                );
            }
        }

        // A category we reserve shares for but the exchange published no row for leaves
        // the overall ratio understated, so name it rather than let it pass silently.
        const missing = doc.subscription.categories
            .filter((c) => c.enabled !== false && c.category !== 'MarketMaker' && !Number(c.appliedShares))
            .map((c) => c.category);
        if (missing.length) {
            report.noExchangeRow.push(`${doc.companyName}: no NSE row for ${missing.join(', ')}`);
        }

        if (learnedSymbol) {
            doc.symbol = { ...(doc.symbol?.toObject?.() || doc.symbol || {}), nse: learnedSymbol };
            changes.push(`NSE symbol recorded as ${learnedSymbol}`);
        }

        if (!changes.length) {
            report.unchanged.push(doc.companyName);
            continue;
        }

        doc.subscription.source = 'NSE';
        doc.subscription.updatedAtText = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });
        computeDerivedFields(doc);

        report.updated.push({
            name: doc.companyName,
            slug: doc.slug,
            total: doc.subscription.totalTimes,
            changes,
        });
        backup.push({ slug: doc.slug, subscription: { categories: before } });

        if (apply) {
            // One conflicted document must not abandon the rest of the pass.
            try {
                await doc.save();
            } catch (error) {
                report.errors.push(`${doc.companyName}: save failed — ${error.message}`);
            }
        }
    }

    // Second pass: BSE SME issues, which the NSE feed does not carry at all.
    await refreshBseSme({ docs, byName, report, backup, apply, today });

    return { report, backup };
}

/** "24-09-2026" -> "2026-09-24"; anything else -> null. */
function fromDmy(value) {
    const m = String(value || '').match(/^(\d{2})-(\d{2})-(\d{4})$/);
    return m ? `${m[3]}-${m[2]}-${m[1]}` : null;
}

const TIMES_COLUMNS = [
    { column: 'QIB', aliases: ['QIB'], canonical: 'QIB' },
    { column: 'NII', aliases: ['NII', 'HNI'], canonical: 'NII' },
    { column: 'RII', aliases: ['Retail', 'RII'], canonical: 'Retail' },
];

async function refreshBseSme({ docs, byName, report, backup, apply, today }) {
    let rows;
    try {
        rows = await fetchReport(BSE_SUB_REPORT);
    } catch (error) {
        report.errors.push(`BSE SME feed: ${error.message}`);
        return;
    }

    const handled = new Set(report.updated.map((u) => u.slug));

    for (const row of rows) {
        const name = stripHtml(row.Name).replace(/\s*(BSE|NSE)\s*SME.*$/i, '').trim();
        const doc = byName.get(nameKey(name));
        if (!doc || handled.has(doc.slug)) continue;

        // The exchange feed is authoritative where it exists; only fill the gap.
        if (String(doc.subscription?.source || '') === 'NSE' && doc.subscription?.categories?.length) {
            const anyBids = doc.subscription.categories.some((c) => Number(c.appliedShares));
            if (anyBids) continue;
        }

        // Guard against a name collision: the closing date must agree.
        const rowClose = fromDmy(stripHtml(row['Closing Date']));
        const ourClose = doc.dates?.close ? istDay(doc.dates.close) : null;
        if (!rowClose || !ourClose || rowClose !== ourClose) {
            report.skippedRows.push(
                `${doc.companyName}: BSE feed closing date ${rowClose || '?'} != our ${ourClose || '?'} — skipped`
            );
            continue;
        }

        const status = statusOf(doc, today);
        if (status === 'future' || status === 'stale') continue;

        if (!Array.isArray(doc.subscription?.categories)) doc.subscription = { categories: [] };
        const before = JSON.parse(JSON.stringify(doc.subscription.categories || []));
        const changes = [];

        if (!doc.subscription.categories.length && doc.reservations?.length) {
            for (const res of doc.reservations) {
                if (res.enabled === false) continue;
                if (['Anchor', 'MarketMaker'].includes(res.category)) continue;
                doc.subscription.categories.push({
                    enabled: true,
                    category: res.category,
                    sharesOffered: Number(res.sharesOffered) || 0,
                    appliedShares: 0,
                });
            }
            if (doc.subscription.categories.length) {
                changes.push(`seeded ${doc.subscription.categories.length} categories from the prospectus reservations`);
            }
        }

        for (const { column, aliases, canonical } of TIMES_COLUMNS) {
            const times = Number(stripHtml(row[column]));
            if (!Number.isFinite(times) || times <= 0) continue;

            const lower = aliases.map((a) => a.toLowerCase());
            let target = doc.subscription.categories.find((c) =>
                lower.includes(String(c.category || '').toLowerCase())
            );

            // No row for this category yet: carry the published multiple on its own.
            // push() stores a COPY as a subdocument, so re-read it — mutating the plain
            // object we passed in would be silently discarded on save.
            if (!target) {
                doc.subscription.categories.push({
                    enabled: true,
                    category: canonical,
                    sharesOffered: 0,
                    appliedShares: 0,
                });
                target = doc.subscription.categories[doc.subscription.categories.length - 1];
            }

            if (Number(target.sharesOffered)) {
                // We know the reserved portion, so the bid count can be reconstructed.
                const applied = Math.round(times * Number(target.sharesOffered));
                if (Number(target.appliedShares) === applied) continue;
                target.appliedShares = applied;
                changes.push(`${target.category}: ${times}x of the reserved portion`);
            } else {
                // No reservation anywhere: store the multiple as published and leave the
                // share columns empty rather than inventing numbers to fill them.
                if (Number(target.timesReported) === times) continue;
                target.timesReported = times;
                changes.push(`${target.category}: ${times}x (as published, no share counts available)`);
            }
        }

        // The overall multiple, for issues that have no share counts to total up.
        const totalReported = Number(stripHtml(row.Total).replace(/[^\d.].*$/, ''));
        if (Number.isFinite(totalReported) && totalReported > 0) {
            if (Number(doc.subscription.totalTimesReported) !== totalReported) {
                doc.subscription.totalTimesReported = totalReported;
                if (!doc.subscription.categories.some((c) => Number(c.sharesOffered))) {
                    changes.push(`overall ${totalReported}x (as published)`);
                }
            }
        }

        if (!changes.length) {
            // Nothing writable: without a prospectus reservation there is no denominator
            // to turn "0.4x" back into a bid count, so say so rather than look idle.
            report.unchanged.push(doc.companyName);
            continue;
        }

        doc.subscription.source = 'BSE';
        doc.subscription.updatedAtText = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });
        computeDerivedFields(doc);

        report.updated.push({
            name: `${doc.companyName} (BSE SME)`,
            slug: doc.slug,
            total: doc.subscription.totalTimes,
            changes,
        });
        backup.push({ slug: doc.slug, subscription: { categories: before } });

        if (apply) {
            // One conflicted document must not abandon the rest of the pass.
            try {
                await doc.save();
            } catch (error) {
                report.errors.push(`${doc.companyName}: save failed — ${error.message}`);
            }
        }
    }
}

/** open / recent (worth refreshing) vs future / stale (not). */
function statusOf(doc, today) {
    const open = doc.dates?.open ? istDay(doc.dates.open) : null;
    const close = doc.dates?.close ? istDay(doc.dates.close) : null;
    if (open && today < open) return 'future';
    if (close && today > close) {
        const age = Math.round((new Date(today) - new Date(close)) / 86400000);
        return age > 2 ? 'stale' : 'recent';
    }
    return 'open';
}
