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

export async function fetchReport(reportId) {
    const { year, fy } = financialYear();
    const url = `https://webnodejs.investorgain.com/cloud/v2/report/data-read/${reportId}/1/1/${year}/${fy}/0/all?search=&v=${Date.now()}`;
    const res = await fetch(url, {
        headers: {
            'User-Agent': UA,
            Accept: 'application/json',
            Referer: 'https://www.investorgain.com/',
        },
    });
    if (!res.ok) throw new Error(`${res.status} ${res.statusText} from report ${reportId}`);
    const json = await res.json();
    return json.reportTableData || [];
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
