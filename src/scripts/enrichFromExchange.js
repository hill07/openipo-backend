/**
 * Fill IPO records from the exchange's own issue information.
 *
 * Auto-discovery creates a record from the GMP feed as soon as an issue is announced,
 * which gives dates and a price band and nothing else. Everything a reader actually
 * wants — the registrar and how to reach them, the lead managers, the face value, the
 * exact share count, the lot size, and above all the Red Herring Prospectus — sits in
 * the NSE's `issueInfo` block and was never being read.
 *
 * SOURCES: the NSE only. Documents in particular are taken from nsearchives.nseindia.com,
 * never from an aggregator — a prospectus link has to point at the exchange or the
 * regulator, both so it is authoritative and so it does not rot when a third party
 * reorganises their file store.
 *
 *   npm run enrich:exchange            every record missing exchange detail (dry run)
 *   npm run enrich:exchange -- --apply
 *   npm run enrich:exchange -- --slug acme-india-industries-ipo --apply
 *
 * BSE-only SME issues are not covered: they do not appear in the NSE's feeds at all,
 * and the BSE's own API refuses requests from datacentre addresses. Those are reported
 * at the end so they can be filled by hand.
 */
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import IpoFull from '../models/IpoFull.js';

dotenv.config();

const APPLY = process.argv.includes('--apply');
const slugArg = (() => {
    const i = process.argv.indexOf('--slug');
    return i > -1 ? process.argv[i + 1] : null;
})();

const NSE = 'https://www.nseindia.com';
const UA =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36';
const TIMEOUT_MS = 25000;

/** The NSE hands out a cookie on the HTML page and rejects API calls without it. */
async function nseSession() {
    const res = await fetch(`${NSE}/market-data/all-upcoming-issues-ipo`, {
        headers: { 'User-Agent': UA, Accept: 'text/html' },
        signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const cookie = (res.headers.getSetCookie?.() || [])
        .map((c) => c.split(';')[0])
        .join('; ');
    return {
        'User-Agent': UA,
        Accept: 'application/json',
        Referer: `${NSE}/market-data/all-upcoming-issues-ipo`,
        ...(cookie ? { Cookie: cookie } : {}),
    };
}

async function getJson(url, headers) {
    const res = await fetch(url, { headers, signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
    return res.json();
}

/** Company names differ in punctuation and suffixes between our records and the NSE's. */
const nameKey = (s) =>
    String(s || '')
        .toLowerCase()
        .replace(/&/g, ' and ')
        .replace(/\b(limited|ltd|private|pvt|the)\b/g, ' ')
        .replace(/[^a-z0-9]/g, '');

/** issueInfo arrives as title/value rows; some values are wrapped in stray quotes. */
function infoMap(detail) {
    const map = new Map();
    for (const row of detail?.issueInfo?.dataList || []) {
        const title = String(row.title || '').trim().toLowerCase();
        const value = String(row.value || '').replace(/^"|"$/g, '').trim();
        if (title && value) map.set(title, value);
    }
    return map;
}

const findRow = (map, needle) => {
    for (const [k, v] of map) if (k.includes(needle)) return v;
    return null;
};

/** First number in a string, with the "Rs." prefix removed so its dot is not read as a decimal point. */
function firstNumber(text) {
    if (!text) return null;
    const m = String(text).replace(/rs\.?/gi, ' ').match(/(\d[\d,]*(?:\.\d+)?)/);
    return m ? Number(m[1].replace(/,/g, '')) : null;
}

function applyIssueInfo(doc, detail, series) {
    const info = infoMap(detail);
    if (!info.size) return [];
    const changes = [];

    const set = (label, value, assign) => {
        if (value === null || value === undefined || value === '') return;
        assign();
        changes.push(`${label}: ${value}`);
    };

    const symbol = detail?.issueInfo?.symbol || findRow(info, 'symbol');
    if (symbol && !doc.symbol?.nse) {
        set('symbol', symbol, () => {
            doc.symbol = { ...(doc.symbol?.toObject?.() || doc.symbol || {}), nse: symbol };
        });
    }

    const registrar = findRow(info, 'name of the registrar');
    if (registrar && !doc.registrar) set('registrar', registrar, () => { doc.registrar = registrar; });

    const registrarAddress = findRow(info, 'address of the registrar');
    if (registrarAddress && !doc.registrarAddress) {
        set('registrar address', registrarAddress.slice(0, 60) + '…', () => {
            doc.registrarAddress = registrarAddress;
        });
    }

    const leads = findRow(info, 'book running lead manager') || findRow(info, 'lead manager');
    if (leads && !doc.leadManagers?.length) {
        const list = leads.split(/\s*(?:,|\band\b)\s*/).map((s) => s.trim()).filter(Boolean);
        set('lead managers', list.length, () => { doc.leadManagers = list; });
    }

    const faceValue = firstNumber(findRow(info, 'face value'));
    if (faceValue && !doc.faceValue) set('face value', faceValue, () => { doc.faceValue = faceValue; });

    // "200 Equity Shares and in multiples thereof"
    const lot = firstNumber(findRow(info, 'bid lot') || findRow(info, 'minimum order quantity'));
    if (lot && !doc.lotSize) set('lot size', lot, () => { doc.lotSize = lot; });

    // "Rs. 70/- to Rs. 75/-per equity share"
    const range = findRow(info, 'price range');
    if (range && !(doc.priceBand?.min && doc.priceBand?.max)) {
        const nums = [...String(range).replace(/rs\.?/gi, ' ').matchAll(/(\d+(?:\.\d+)?)/g)].map((m) => Number(m[1]));
        if (nums.length >= 2) {
            set('price band', `${nums[0]}–${nums[1]}`, () => {
                doc.priceBand = { ...(doc.priceBand?.toObject?.() || doc.priceBand || {}), min: nums[0], max: nums[1] };
            });
        }
    }

    // "Fresh issue of up to 1,44,56,000 Equity Shares" plus any offer-for-sale tranche.
    const sizeText = findRow(info, 'issue size');
    if (sizeText && !Number(doc.issueSize?.shares)) {
        const counts = [...sizeText.matchAll(/([\d,]{5,})\s*Equity Shares/gi)]
            .map((m) => Number(m[1].replace(/,/g, '')))
            .filter(Number.isFinite);
        if (counts.length) {
            const total = counts.reduce((a, b) => a + b, 0);
            set('issue size', `${total.toLocaleString('en-IN')} shares`, () => {
                doc.issueSize = { ...(doc.issueSize?.toObject?.() || doc.issueSize || {}), shares: total };
            });
        }
    }

    // The prospectus, from the exchange's own archive.
    const rhp = findRow(info, 'red herring prospectus');
    const rhpUrl = rhp && rhp.match(/https?:\/\/\S+/)?.[0];
    if (rhpUrl && !doc.docs?.rhp) {
        set('RHP', 'nsearchives', () => {
            doc.docs = { ...(doc.docs?.toObject?.() || doc.docs || {}), rhp: rhpUrl };
        });
    }

    // The series comes from the feed that resolved the symbol; issueInfo does not
    // always carry it, and defaulting an SME issue to "NSE, BSE" would be wrong.
    const isSme = String(series || detail?.issueInfo?.series || '').toUpperCase() === 'SME';
    if (!doc.exchanges?.length) {
        const listing = isSme ? ['NSE SME'] : ['NSE', 'BSE'];
        set('exchanges', listing.join(', '), () => { doc.exchanges = listing; });
    }
    if (!doc.listingAt?.length) {
        doc.listingAt = isSme ? ['NSE SME'] : ['NSE', 'BSE'];
    }

    return changes;
}

/**
 * BSE SME issues never appear in the NSE's feeds, and the BSE's own JSON API refuses
 * requests from datacentre addresses. Its SME site still publishes a plain HTML index
 * of prospectuses, with the files hosted on bseindia.com — the authoritative source,
 * and the only one we will link to.
 */
const BSE_SME = 'https://www.bsesme.com/PublicIssues';

async function bseProspectuses() {
    const out = new Map();
    for (const [page, kind] of [['RHP.aspx', 'rhp'], ['SMEIPODRHP.aspx', 'drhp']]) {
        try {
            const res = await fetch(`${BSE_SME}/${page}`, {
                headers: { 'User-Agent': UA, Accept: 'text/html' },
                signal: AbortSignal.timeout(TIMEOUT_MS),
            });
            if (!res.ok) throw new Error(String(res.status));
            const html = await res.text();

            // Row by row, not a sliding window. A window that spans up to a few hundred
            // characters runs past </tr> and pairs a company with the NEXT row's file:
            // the table has four consecutive rows carrying the same company name, and a
            // window match handed one of them a different issuer's prospectus.
            const grid = html.match(/id="ContentPlaceHolder1_grdvwDRHP"([\s\S]*?)<\/table>/i);
            const body = grid ? grid[1] : html;
            let n = 0;
            for (const row of body.match(/<tr>[\s\S]*?<\/tr>/gi) || []) {
                const nameCell = row.match(/TTRow_left[^>]*>([\s\S]*?)<\/td>/i);
                const link = row.match(/href="([^"]+)"/i);
                if (!nameCell || !link) continue;

                const name = nameCell[1].replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').trim();
                const url = link[1].replace(/&amp;/g, '&').trim();

                // The exchange's own table occasionally contains a server file path
                // rather than a URL ("https://.../Download/E:\inetpub\..."). Storing one
                // would put a dead download link on the page.
                if (!/^https?:\/\//i.test(url) || /[A-Za-z]:\\|inetpub/i.test(url)) {
                    console.log(`    skipped ${name}: exchange published a malformed link`);
                    continue;
                }
                if (!name) continue;
                const key = nameKey(name);
                const entry = out.get(key) || {};
                if (!entry[kind]) entry[kind] = url;
                out.set(key, entry);
                n++;
            }
            console.log(`  BSE SME ${kind.toUpperCase()} index: ${n} companies`);
        } catch (error) {
            console.log(`  BSE SME ${kind.toUpperCase()} index unavailable: ${error.message}`);
        }
    }
    return out;
}

async function main() {
    await mongoose.connect(process.env.MONGO_URI);

    const query = slugArg
        ? { slug: slugArg }
        : {
              isPublished: true,
              isDeleted: false,
              $or: [
                  { registrar: { $in: [null, ''] } },
                  { leadManagers: { $size: 0 } },
                  { 'docs.rhp': { $in: [null, ''] } },
              ],
          };
    const docs = await IpoFull.find(query).sort({ 'dates.open': -1 });
    console.log(`${APPLY ? 'APPLYING' : 'DRY RUN'} — ${docs.length} record(s) to enrich\n`);

    const headers = await nseSession();

    // Symbol lookup: current issues first, then the past-issues archive.
    const symbols = new Map();
    for (const [url, label] of [
        [`${NSE}/api/ipo-current-issue`, 'current'],
        [`${NSE}/api/public-past-issues`, 'past'],
    ]) {
        try {
            const json = await getJson(url, headers);
            const rows = Array.isArray(json) ? json : json?.data || [];
            for (const r of rows) {
                const name = r.companyName && r.companyName !== '?' ? r.companyName : r.company;
                if (name && r.symbol) {
                    const k = nameKey(name);
                    if (!symbols.has(k)) symbols.set(k, { symbol: r.symbol, series: r.series || 'EQ' });
                }
            }
            console.log(`  ${label} issues: ${rows.length} rows`);
        } catch (error) {
            console.log(`  ${label} issues unavailable: ${error.message}`);
        }
    }
    console.log(`  symbol lookup holds ${symbols.size} names\n`);

    let enriched = 0;
    const notOnNse = [];

    for (const doc of docs) {
        const known = doc.symbol?.nse
            ? { symbol: doc.symbol.nse, series: doc.type === 'SME' ? 'SME' : 'EQ' }
            : symbols.get(nameKey(doc.companyName));

        if (!known) { notOnNse.push(doc.companyName); continue; }

        let detail;
        try {
            detail = await getJson(
                `${NSE}/api/ipo-detail?symbol=${encodeURIComponent(known.symbol)}&series=${encodeURIComponent(known.series)}`,
                headers
            );
        } catch (error) {
            console.log(`  ${doc.slug}: detail unavailable (${error.message})`);
            continue;
        }

        const changes = applyIssueInfo(doc, detail, known.series);
        if (!changes.length) continue;

        if (APPLY) await doc.save();
        console.log(`  ${doc.slug} [${known.symbol}]`);
        for (const c of changes) console.log(`      ${c}`);
        enriched++;

        await new Promise((r) => setTimeout(r, 700));
    }

    // Second pass: prospectus links for the issues the NSE does not carry.
    let fromBse = 0;
    if (notOnNse.length) {
        console.log('\n  --- BSE SME prospectus pass ---');
        const bse = await bseProspectuses();
        for (const doc of docs) {
            if (doc.docs?.rhp) continue;
            // Exact key first. The exchange and our records disagree on singulars and
            // plurals — "SJP Ultrasonic" here against "SJP ULTRASONICS LIMITED" there —
            // so fall back to a prefix match, but only on a stem long enough that it
            // cannot belong to a different issuer.
            const key = nameKey(doc.companyName);
            let hit = bse.get(key);
            if (!hit) {
                for (const [k, v] of bse) {
                    const shorter = Math.min(k.length, key.length);
                    if (shorter >= 10 && (k.startsWith(key) || key.startsWith(k))) { hit = v; break; }
                }
            }
            if (!hit || !(hit.rhp || hit.drhp)) continue;

            const current = doc.docs?.toObject?.() || doc.docs || {};
            doc.docs = {
                ...current,
                ...(hit.rhp && !current.rhp ? { rhp: hit.rhp } : {}),
                ...(hit.drhp && !current.drhp ? { drhp: hit.drhp } : {}),
            };
            if (!doc.exchanges?.length) doc.exchanges = ['BSE SME'];
            if (!doc.listingAt?.length) doc.listingAt = ['BSE SME'];

            if (APPLY) await doc.save();
            console.log(`  ${doc.slug}: prospectus from bseindia.com`);
            fromBse++;
        }
    }

    console.log(`\n${APPLY ? 'Enriched' : 'Would enrich'}: ${enriched} from the NSE, ${fromBse} from the BSE`);
    const stillBare = notOnNse.length - fromBse;
    if (stillBare > 0) {
        console.log(`\nNo exchange source found for ${stillBare} issue(s); these need filling by hand.`);
    }
    if (!APPLY) console.log('\nRe-run with --apply to write.');

    await mongoose.disconnect();
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
