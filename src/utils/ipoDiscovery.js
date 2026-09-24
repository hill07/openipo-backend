import IpoFull from '../models/IpoFull.js';
import { slugify } from './slugify.js';
import { computeDerivedFields } from './ipoCalculations.js';
import ipoFullZodSchema from '../validators/ipoFull.zod.js';
import { istDay, nameKey } from './subscriptionRefresh.js';
import { fetchReport, stripHtml } from './reportFeed.js';

/**
 * Create records for IPOs that exist in the market but not in our database, and
 * report existing records whose headline facts have drifted from the exchange.
 *
 * Six issues once opened on the same morning with no page on the site at all: the
 * refresh jobs only ever UPDATE records, so an IPO nobody entered stays invisible.
 *
 * What a created record holds is deliberately limited to facts two sources agree on
 * — name, segment, dates, price band, lot size, issue size. The prospectus material
 * (reservations, financials, objects, registrar) is left empty for a human to fill;
 * see subscriptionAudit.js, which keeps reporting the record as derived until then.
 */
const LIST_REPORT = 331;
const UA =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36';
const NSE = 'https://www.nseindia.com';

const num = (v) => {
    const n = Number(String(v ?? '').replace(/[^0-9.]/g, ''));
    return Number.isFinite(n) && n > 0 ? n : null;
};

const isoDay = (v) => {
    const s = String(v || '').slice(0, 10);
    return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
};

/**
 * The exchange is the authority on the price band. The public feed carries a single
 * price that is sometimes the cap and sometimes stale — Runwal showed 305 there while
 * NSE published a Rs 290-302 band — so NSE is preferred wherever it lists the issue.
 */
async function nseUpcoming() {
    try {
        const home = await fetch(`${NSE}/market-data/all-upcoming-issues-ipo`, {
            headers: { 'User-Agent': UA, Accept: 'text/html' },
        });
        const cookie = (home.headers.getSetCookie?.() || []).map((c) => c.split(';')[0]).join('; ');
        const headers = {
            'User-Agent': UA,
            Accept: 'application/json',
            Referer: `${NSE}/`,
            Cookie: cookie,
        };
        const rows = await Promise.all(
            [`${NSE}/api/all-upcoming-issues?category=ipo`, `${NSE}/api/ipo-current-issue`].map(
                async (url) => {
                    const res = await fetch(url, { headers });
                    return res.ok ? res.json() : [];
                }
            )
        );
        const byName = new Map();
        for (const row of rows.flat()) {
            // "Rs.290 to Rs.302" — the second number carries its own "Rs." prefix, which
            // a naive [\d.]+ pattern trips over and silently returns no band for.
            const band = String(row.issuePrice || '').match(
                /(\d+(?:\.\d+)?)\s*to\s*(?:Rs\.?\s*)?(\d+(?:\.\d+)?)/i
            );
            byName.set(nameKey(row.companyName), {
                name: String(row.companyName || '').trim() || null,
                symbol: row.symbol || null,
                series: row.series || null,
                min: band ? Number(band[1]) : num(row.issuePrice),
                max: band ? Number(band[2]) : num(row.issuePrice),
            });
        }
        return byName;
    } catch {
        return new Map();
    }
}

function parseRow(row) {
    const name = String(row['~ipo_name'] || '').trim();
    return {
        name,
        status: String(row['~ipo_status1'] || '').trim(),
        type: String(row['~ipo_category1'] || '').toUpperCase() === 'SME' ? 'SME' : 'MAINBOARD',
        price: num(row['Price (₹)']),
        lot: num(row.Lot),
        sizeCr: num(stripHtml(row['IPO Size'])),
        open: isoDay(row['~Srt_Open']),
        close: isoDay(row['~Srt_Close']),
        allotment: isoDay(row['~Srt_BoA_Dt']),
        listing: isoDay(row['~Str_Listing']),
    };
}

/**
 * @param {{ apply?: boolean }} options
 * @returns {Promise<{ created: Array, drifted: Array, skipped: Array }>}
 */
export async function discoverIpos({ apply = false } = {}) {
    const rows = (await fetchReport(LIST_REPORT)).map(parseRow);
    const exchange = await nseUpcoming();
    const docs = await IpoFull.find({ isDeleted: { $ne: true } });

    const byKey = new Map(docs.map((d) => [nameKey(d.companyName), d]));
    const keys = [...byKey.keys()];
    const today = istDay();
    let nextId = docs.reduce((m, d) => Math.max(m, d.ipoId || 0), 0) + 1;

    const out = { created: [], drifted: [], skipped: [] };

    for (const row of rows) {
        if (!['U', 'O'].includes(row.status) || !row.name) continue;

        const key = nameKey(row.name);
        const match =
            byKey.get(key) ||
            byKey.get(keys.find((k) => k.startsWith(key) || key.startsWith(k)) || '\u0000');
        const band = exchange.get(key) || null;

        if (match) {
            out.drifted.push(...compare(match, row, band));
            continue;
        }

        if (!row.open || !row.close) {
            out.skipped.push(`${row.name}: no open/close date at source`);
            continue;
        }
        if (row.close < today) continue; // already over; nothing to publish

        // Without an exchange band we know only the one price the feed carries. Many SME
        // issues are genuinely fixed-price, but a book-built issue has a floor we simply
        // do not have — so record the price we know and leave the floor empty rather
        // than inventing one.
        const priceMax = band?.max || row.price;
        const priceMin = band?.min || undefined;
        if (!priceMax) {
            out.skipped.push(`${row.name}: no price available`);
            continue;
        }

        const record = {
            ipoId: nextId++,
            slug: `${slugify(band?.name || row.name)}-ipo`,
            isPublished: true,
            companyName: band?.name || row.name,
            type: row.type,
            issueType: 'IPO',
            symbol: band?.symbol ? { nse: band.symbol } : undefined,
            dates: {
                open: row.open,
                close: row.close,
                allotment: row.allotment || undefined,
                listing: row.listing || undefined,
            },
            priceBand: { min: priceMin, max: priceMax },
            lotSize: row.lot || undefined,
            issueSize: {
                cr: row.sizeCr || undefined,
                shares: row.sizeCr && priceMax ? Math.round((row.sizeCr * 1e7) / priceMax) : undefined,
            },
            // No band from the exchange means the single feed price was used for both
            // ends; that needs a human to confirm against the RHP.
            needsPriceCheck: !band,
        };

        const parsed = ipoFullZodSchema.safeParse(record);
        if (!parsed.success) {
            out.skipped.push(`${row.name}: ${parsed.error.issues[0]?.message || 'failed validation'}`);
            continue;
        }

        const doc = computeDerivedFields({ ...parsed.data });
        delete doc.needsPriceCheck;

        out.created.push({
            name: band?.name || row.name,
            slug: record.slug,
            type: row.type,
            opens: row.open,
            band: priceMin ? `₹${priceMin}–₹${priceMax}` : `₹${priceMax}`,
            bandFromExchange: Boolean(band),
            lot: row.lot,
            sizeCr: row.sizeCr,
        });

        if (apply) await IpoFull.create(doc);
    }

    return out;
}

/** Headline facts that readers act on; anything else is left to the prospectus. */
function compare(doc, row, band) {
    const drift = [];
    const check = (label, ours, theirs) => {
        if (ours && theirs && String(ours) !== String(theirs)) {
            drift.push(`${doc.companyName}: ${label} ours ${ours} vs source ${theirs}`);
        }
    };

    check('open date', doc.dates?.open ? istDay(doc.dates.open) : null, row.open);
    check('close date', doc.dates?.close ? istDay(doc.dates.close) : null, row.close);
    check('listing date', doc.dates?.listing ? istDay(doc.dates.listing) : null, row.listing);
    check('lot size', doc.lotSize, row.lot);
    if (band) {
        check('price band low', doc.priceBand?.min, band.min);
        check('price band high', doc.priceBand?.max, band.max);
    }
    return drift;
}
