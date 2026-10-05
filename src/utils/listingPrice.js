/**
 * The opening price of a newly listed IPO, taken from the exchange rather than an
 * aggregator.
 *
 * A share does not simply start trading at 10:00. The NSE runs a special pre-open
 * session for new listings from 09:00, and during it publishes an Indicative
 * Equilibrium Price — the price discovery that becomes the opening trade. That figure
 * is available from about 09:45, which is the window that matters: a page that reports
 * the listing price an hour late is reporting history.
 *
 * Reading it from the GMP report instead would mean the site is, by construction,
 * always behind whoever publishes that report. This reads the same event at source.
 *
 *   GET /api/market-data-pre-open?key=IPO   new listings during the session
 *   GET /api/market-data-pre-open?key=SME   NSE SME (Emerge)
 *   GET /api/market-data-pre-open?key=ALL   everything, ~2.4 MB
 *
 * BSE-only SME issues are not covered — they do not list on the NSE, so nothing here
 * will ever see them. Those still come from the report feed, which is a fallback rather
 * than the primary source.
 *
 * Callers must already have a mongoose connection.
 */
import IpoFull from '../models/IpoFull.js';
import * as angel from './angelOne.js';

const NSE = (process.env.NSE_BASE_URL || 'https://www.nseindia.com').replace(/\/$/, '');
const UA =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36';
const TIMEOUT_MS = 25000;

/** Set when the relay is in use; it holds the NSE session and answers on the token. */
const PROXY_AUTH = process.env.NSE_PROXY_TOKEN
    ? { 'x-refresh-token': process.env.NSE_PROXY_TOKEN }
    : {};

function istNow() {
    return new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });
}

/** Today in IST as YYYY-MM-DD, so listing dates compare as strings. */
function istDay(value = new Date()) {
    const d = value instanceof Date ? value : new Date(value);
    return Number.isNaN(d.getTime()) ? null : d.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
}

async function nseHeaders() {
    if (Object.keys(PROXY_AUTH).length) {
        return { ...PROXY_AUTH, 'User-Agent': UA, Accept: 'application/json' };
    }
    const res = await fetch(`${NSE}/market-data/pre-open-market-cm-and-emerge-market`, {
        headers: { 'User-Agent': UA, Accept: 'text/html' },
        signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const jar =
        typeof res.headers.getSetCookie === 'function'
            ? res.headers.getSetCookie()
            : (res.headers.get('set-cookie') || '').split(/,(?=\s*[^;=,]+=)/).filter(Boolean);
    const cookie = jar.map((c) => c.split(';')[0].trim()).filter(Boolean).join('; ');
    if (!cookie) throw new Error('no NSE session cookie — the API answers 403 without one');
    return {
        'User-Agent': UA,
        Accept: 'application/json, text/plain, */*',
        Referer: `${NSE}/market-data/pre-open-market-cm-and-emerge-market`,
        'X-Requested-With': 'XMLHttpRequest',
        Cookie: cookie,
    };
}

/** symbol -> { iep, lastPrice, previousClose } across the pre-open buckets. */
async function preOpenBySymbol(headers, report, wanted = new Set()) {
    const found = new Map();

    // IPO holds new listings and costs a few hundred bytes; SME covers Emerge at ~60 KB.
    //
    // ALL is deliberately not queried. It is 2.4 MB of the whole market, fetched to find
    // one or two symbols, every couple of minutes through the listing window — megabytes
    // a minute for data the other two buckets already carry. If both miss, the report
    // feed covers the gap at no cost.
    for (const key of ['IPO', 'SME']) {
        try {
            const res = await fetch(`${NSE}/api/market-data-pre-open?key=${key}`, {
                headers,
                signal: AbortSignal.timeout(TIMEOUT_MS),
            });
            if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
            const json = await res.json();
            const rows = json?.data || [];
            for (const row of rows) {
                const m = row?.metadata || {};
                if (!m.symbol) continue;
                const price = Number(m.iep) || Number(m.lastPrice) || 0;
                if (!price) continue;
                if (!found.has(m.symbol)) {
                    found.set(m.symbol, { price, previousClose: Number(m.previousClose) || 0 });
                }
            }
            report.buckets.push(`${key}: ${rows.length} rows`);

            // Stop as soon as every symbol we are waiting on has been found. ALL is
            // 2.4 MB against a few hundred bytes for IPO, and pulling it every run
            // "just in case" is a megabytes-per-minute habit for data we already have.
            if (wanted.size && [...wanted].every((sym) => found.has(sym))) break;
        } catch (error) {
            report.errors.push(`pre-open ${key}: ${error.message}`);
        }
    }
    return found;
}

/**
 * Angel One quotes, keyed by the plain NSE symbol.
 *
 * Preferred when configured: it asks for the two or three symbols we are waiting on,
 * where the exchange's pre-open route means pulling a market-wide dump to find them.
 */
async function angelBySymbol(symbols, report) {
    const out = new Map();
    if (!angel.isConfigured() || !symbols.length) return out;

    try {
        const tokens = await angel.instrumentTokens(symbols);
        const list = [...tokens.values()].map((t) => t.token);
        if (!list.length) {
            // Nothing to quote: a company has no instrument token until it lists, so this
            // is the normal state the evening before. Still prove the session works —
            // otherwise a bad PIN or TOTP secret stays hidden until the one morning it
            // matters, when there is no time to fix it.
            try {
                await angel.login();
                report.buckets.push('angel: session OK, no listed symbol to quote yet');
            } catch (error) {
                report.errors.push(`Angel One login: ${error.message}`);
            }
            return out;
        }

        const { quotes, unfetched } = await angel.quotes(list);
        const byToken = new Map([...tokens].map(([symbol, t]) => [t.token, symbol]));

        for (const [token, q] of quotes) {
            const symbol = byToken.get(token);
            if (!symbol) continue;
            // Before the first trade prints, `ltp` is empty and the discovered price
            // shows as the open; afterwards `ltp` is the live figure. Take either.
            const price = q.ltp || q.open || 0;
            if (price) out.set(symbol, { price, previousClose: q.close || 0 });
        }
        report.buckets.push(
            `angel: ${quotes.size} quoted${unfetched?.length ? `, ${unfetched.length} unfetched` : ''}`
        );
    } catch (error) {
        report.errors.push(`Angel One: ${error.message}`);
    }
    return out;
}

/**
 * @param {{ apply?: boolean }} options
 * @returns {Promise<{ report: object }>}
 */
export async function captureListingPrices({ apply = false } = {}) {
    const report = { buckets: [], captured: [], skipped: [], errors: [] };
    const today = istDay();

    // Only issues listing today or in the last few days: a listing price is written
    // once and never revised, so there is nothing to gain from scanning the archive.
    const docs = await IpoFull.find({
        isDeleted: { $ne: true },
        'dates.listing': { $gte: new Date(Date.now() - 5 * 86400000) },
    });
    const pending = docs.filter((d) => !Number(d.gmp?.listingPrice));
    report.candidates = pending.length;

    if (!pending.length) return { report };

    const wanted = new Set(
        pending.map((d) => String(d.symbol?.nse || '').toUpperCase()).filter(Boolean)
    );

    // Angel One first when configured: a targeted quote for the two or three symbols we
    // actually need, rather than an exchange-wide pre-open dump to find them.
    const prices = await angelBySymbol([...wanted], report);

    // The exchange feed stays as the fallback, so an expired broker session or a bad
    // login degrades to a working source instead of losing the listing entirely.
    if (!prices.size) {
        try {
            const headers = await nseHeaders();
            const preOpen = await preOpenBySymbol(headers, report, wanted);
            for (const [sym, v] of preOpen) prices.set(sym, v);
        } catch (error) {
            report.errors.push(`NSE session: ${error.message}`);
        }
    }
    if (!prices.size) return { report };

    for (const doc of pending) {
        const symbol = doc.symbol?.nse;
        if (!symbol) {
            report.skipped.push(`${doc.companyName}: no NSE symbol on record`);
            continue;
        }

        const hit = prices.get(String(symbol).toUpperCase());
        if (!hit) continue;

        // The issue price is what the gain is measured against. Prefer our own figure —
        // the exchange's previousClose is the issue price only on the listing day itself.
        const issuePrice = Number(doc.priceBand?.max) || hit.previousClose || 0;
        if (!issuePrice) {
            report.skipped.push(`${doc.companyName}: no issue price to compare against`);
            continue;
        }

        const listingDay = doc.dates?.listing ? istDay(doc.dates.listing) : null;
        if (listingDay && listingDay > today) {
            report.skipped.push(`${doc.companyName}: listing date is ${listingDay}, not yet`);
            continue;
        }

        if (!doc.gmp) doc.gmp = {};
        doc.gmp.listingPrice = hit.price;
        doc.gmp.listingGain = Number((((hit.price - issuePrice) / issuePrice) * 100).toFixed(2));
        doc.gmp.listedAtText = istNow();

        if (apply) {
            try {
                await doc.save();
            } catch (error) {
                report.errors.push(`${doc.companyName}: save failed — ${error.message}`);
                continue;
            }
        }
        report.captured.push(
            `${doc.companyName} [${symbol}]: ₹${hit.price} (${doc.gmp.listingGain}% on ₹${issuePrice})`
        );
    }

    return { report };
}
