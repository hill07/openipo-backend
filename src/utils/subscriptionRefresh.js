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

const nameKey = (s) =>
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

export function istDay(value = new Date()) {
    return new Date(value).toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
}

async function nseSession() {
    const res = await fetch(`${NSE}/market-data/all-upcoming-issues-ipo`, {
        headers: { 'User-Agent': UA, Accept: 'text/html' },
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
    const res = await fetch(url, { headers });
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
        if (!/^\d+$/.test(srNo)) continue; // "2.1", "1(a)" etc. are breakdowns of a parent row

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

        const parsed = parseActiveCat(detail);
        if (!parsed.categories.size) {
            report.errors.push(`${doc.companyName}: no category rows in the NSE response`);
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
                    sharesOffered: row.offered,
                    appliedShares: row.bid,
                });
                changes.push(
                    `${category}: added from NSE — ${row.bid.toLocaleString('en-IN')} bid of ${row.offered.toLocaleString('en-IN')} offered`
                );
                continue;
            }

            const prevApplied = Number(target.appliedShares) || 0;
            if (prevApplied !== row.bid) {
                changes.push(
                    `${target.category}: ${prevApplied.toLocaleString('en-IN')} -> ${row.bid.toLocaleString('en-IN')} bid`
                );
                target.appliedShares = row.bid;
            }

            // Only fill offered when we have nothing from the prospectus.
            if (!Number(target.sharesOffered) && row.offered) {
                target.sharesOffered = row.offered;
                changes.push(
                    `${target.category}: offered set to ${row.offered.toLocaleString('en-IN')} from NSE`
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
    { column: 'QIB', aliases: ['QIB'] },
    { column: 'NII', aliases: ['NII', 'HNI'] },
    { column: 'RII', aliases: ['Retail', 'RII'] },
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

        for (const { column, aliases } of TIMES_COLUMNS) {
            const times = Number(stripHtml(row[column]));
            if (!Number.isFinite(times) || times <= 0) continue;

            const lower = aliases.map((a) => a.toLowerCase());
            const target = doc.subscription.categories.find((c) =>
                lower.includes(String(c.category || '').toLowerCase())
            );
            if (!target || !Number(target.sharesOffered)) continue;

            const applied = Math.round(times * Number(target.sharesOffered));
            if (Number(target.appliedShares) === applied) continue;
            target.appliedShares = applied;
            changes.push(`${target.category}: ${times}x of the reserved portion`);
        }

        if (!changes.length) {
            // Nothing writable: without a prospectus reservation there is no denominator
            // to turn "0.4x" back into a bid count, so say so rather than look idle.
            if (!doc.subscription.categories.some((c) => Number(c.sharesOffered))) {
                report.skippedRows.push(
                    `${doc.companyName}: BSE feed has figures but our record holds no reservation to measure them against`
                );
            } else {
                report.unchanged.push(doc.companyName);
            }
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
