/**
 * Shared access to the public IPO report feed used for Grey Market Premium and for
 * BSE SME subscription (the one segment the NSE's own API does not carry).
 *
 * The year and financial year sit in the path, so they are derived rather than
 * hardcoded — a literal "2026/2026-27" would have gone stale on 1 April 2027 and
 * failed silently, leaving the site showing yesterday's numbers for ever.
 */
const UA =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36';

/** Indian financial year for a date: April–March, e.g. 2026-27. */
export function financialYear(date = new Date()) {
    const ist = new Date(date.toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
    const year = ist.getFullYear();
    const startYear = ist.getMonth() >= 3 ? year : year - 1; // month 3 = April
    return { year, fy: `${startYear}-${String(startYear + 1).slice(-2)}` };
}

/**
 * The report is cached server-side, and the cache is keyed per parameter set.
 *
 * `cacheKey` carries no time component, so the `v=` cache-buster we send is ignored:
 * two requests seconds apart return byte-identical bodies, including the server's own
 * `currentTime`. One bucket can therefore sit twenty minutes behind another while both
 * serve the same 49 rows — ours was answering 11:20 while a sibling held 11:39.
 *
 * So ask a couple of buckets and keep whichever reports the most recent time. They
 * return the same report; only their cache entries differ in age.
 */
const FEED_VARIANTS = ['1/1', '1/2'];

async function readVariant(reportId, variant, year, fy) {
    const url =
        `https://webnodejs.investorgain.com/cloud/v2/report/data-read/${reportId}/${variant}/${year}/${fy}/0/all` +
        `?search=&v=${Date.now()}`;
    const res = await fetch(url, {
        headers: {
            'User-Agent': UA,
            Accept: 'application/json',
            Referer: 'https://www.investorgain.com/',
        },
        signal: AbortSignal.timeout(20000),
    });
    if (!res.ok) throw new Error(`${res.status} ${res.statusText} from report ${reportId}`);
    const json = await res.json();
    return { rows: json.reportTableData || [], at: json.currentTime || '', variant };
}

export async function fetchReport(reportId) {
    const { year, fy } = financialYear();

    const results = await Promise.allSettled(
        FEED_VARIANTS.map((variant) => readVariant(reportId, variant, year, fy))
    );

    const ok = results.filter((r) => r.status === 'fulfilled').map((r) => r.value).filter((r) => r.rows.length);
    if (!ok.length) {
        const first = results.find((r) => r.status === 'rejected');
        throw first ? first.reason : new Error(`report ${reportId} returned no rows`);
    }

    // Newest cache entry wins; a partial bucket must not beat a complete one.
    const mostRows = Math.max(...ok.map((r) => r.rows.length));
    const complete = ok.filter((r) => r.rows.length === mostRows);
    complete.sort((a, b) => String(b.at).localeCompare(String(a.at)));

    return complete[0].rows;
}

/** Report cells arrive as rendered HTML fragments. */
export function stripHtml(value) {
    return String(value ?? '')
        .replace(/<[^>]*>/g, ' ')
        .replace(/&#8377;/g, '')
        .replace(/&nbsp;/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}
