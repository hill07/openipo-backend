/**
 * Extract the factual parts of an IPO record from saved HTML pages.
 *
 * The exchanges are the first source and cover most of what matters — see
 * enrichFromExchange.js — but they publish nothing machine-readable for BSE-only SME
 * issues, and neither exchange exposes the financial summary, the lot ladder or the
 * category reservation in a form we can read. Those figures all originate in the
 * prospectus; this reads them from a saved page rather than parsing the PDF.
 *
 * ONLY FACTS ARE TAKEN: registrar, lead managers, share counts, financial figures, lot
 * sizes and reservation percentages. Written descriptions, strengths and risk summaries
 * are someone else's editorial and are never copied — the site was rejected for
 * low-value content, and duplicated prose would make that worse rather than better.
 *
 *   npm run extract:facts -- <directory-of-saved-pages>
 *   npm run extract:facts -- <directory> --apply
 *
 * Each file is named <slug>.html. Nothing is overwritten: a field already holding a
 * value, whether from the exchange or entered by hand, is left alone.
 */
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import mongoose from 'mongoose';
import IpoFull from '../models/IpoFull.js';

dotenv.config();

const APPLY = process.argv.includes('--apply');
const dirArg = process.argv.slice(2).find((a) => !a.startsWith('--'));

/* ---------------------------------------------------------------- parsing */

/** Contents of the element carrying this id, by counting nested divs. */
function elementById(html, id) {
    const at = html.indexOf('id="' + id + '"');
    if (at === -1) return '';
    let i = html.indexOf('>', at) + 1;
    const start = i;
    let depth = 1;
    while (depth > 0 && i < html.length) {
        const open = html.indexOf('<div', i);
        const close = html.indexOf('</div>', i);
        if (close === -1) break;
        if (open !== -1 && open < close) { depth++; i = open + 4; } else { depth--; i = close + 6; }
    }
    return html.slice(start, i);
}

const decode = (s) =>
    String(s)
        .replace(/&#8377;/g, '₹').replace(/&amp;/g, '&').replace(/&#39;|&apos;/g, "'")
        .replace(/&quot;/g, '"').replace(/&nbsp;/g, ' ').replace(/&[a-z#0-9]+;/gi, ' ')
        .replace(/\s+/g, ' ').trim();

const cellText = (html) => decode(String(html).replace(/<[^>]+>/g, ' '));

/** Every <table> in a fragment, as arrays of row cells. */
function tables(fragment) {
    return [...String(fragment).matchAll(/<table[\s\S]*?<\/table>/gi)].map((m) =>
        [...m[0].matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)]
            .map((r) => [...r[1].matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)].map((c) => cellText(c[1])))
            .filter((row) => row.some(Boolean))
    );
}

/** "1,29,40,000" -> 12940000; "₹23.45 Cr" -> 23.45; "30.01%" -> 30.01 */
function num(text) {
    if (text === undefined || text === null) return null;
    const m = String(text).replace(/[,₹%]/g, '').match(/-?\d+(?:\.\d+)?/);
    return m ? Number(m[0]) : null;
}

/** Find a labelled value in a two-column table. */
function labelled(rows, needle) {
    const hit = rows.find((r) => r[0] && r[0].toLowerCase().includes(needle));
    return hit ? hit[1] : null;
}

/* ------------------------------------------------------------- extraction */

function extract(html) {
    const out = {};

    /* --- IPO details, KPIs and financials all live in the about block --- */
    const about = elementById(html, 'ipo-about');
    const aboutTables = tables(about);

    const details = aboutTables.find((t) => t.some((r) => /total issue size|face value/i.test(r[0] || '')));
    if (details) {
        const face = num(labelled(details, 'face value'));
        if (face) out.faceValue = face;

        const pre = num(labelled(details, 'share holding pre'));
        const post = num(labelled(details, 'share holding post'));
        if (pre || post) out.shareHolding = { ...(pre ? { pre } : {}), ...(post ? { post } : {}) };

        const marketMaker = labelled(details, 'market maker');
        if (marketMaker && !/^\d/.test(marketMaker)) out.marketMaker = marketMaker;

        // "35,00,000 shares (aggregating up to ₹23.45 Cr)"
        const parse = (label) => {
            const v = labelled(details, label);
            if (!v) return null;
            const shares = num(v);
            const cr = (v.match(/₹\s*([\d.]+)\s*Cr/i) || [])[1];
            if (!shares && !cr) return null;
            return { ...(shares ? { shares } : {}), ...(cr ? { cr: Number(cr) } : {}) };
        };
        const total = parse('total issue size');
        const fresh = parse('fresh issue');
        const ofs = parse('offer for sale');
        if (total || fresh || ofs) {
            out.issueBreakdown = {
                ...(total ? { total } : {}), ...(fresh ? { fresh } : {}), ...(ofs ? { ofs } : {}),
            };
        }
        if (total) out.issueSize = total;
    }

    // KPI table: first column is the label, remaining columns are periods.
    const kpiTable = aboutTables.find((t) => t.some((r) => /^roce$/i.test((r[0] || '').trim())));
    if (kpiTable) {
        const header = kpiTable.find((r) => /kpi/i.test(r[0] || '')) || [];
        const periods = header.slice(1);
        const row = (name) => kpiTable.find((r) => new RegExp(name, 'i').test((r[0] || '').trim()));
        const kpis = periods.map((period, i) => ({
            period,
            roe: num(row('^roe')?.[i + 1]),
            roce: num(row('^roce')?.[i + 1]),
            eps: num(row('^eps')?.[i + 1]),
        })).filter((k) => k.period && (k.roe || k.roce || k.eps));
        // P/E is quoted once for the issue, not per period.
        const pePre = num(row('p/e pre')?.[1]);
        const pePost = num(row('p/e post')?.[1]);
        if (kpis.length) {
            if (pePre) kpis[0].pePre = pePre;
            if (pePost) kpis[0].pePost = pePost;
            out.financialsKpis = kpis;
        }
    }

    // Financial table: "Period Ended | Mar-26 | Mar-25 | Mar-24" then one row per line item.
    const finTable = aboutTables.find((t) => t.some((r) => /period ended/i.test(r[0] || '')));
    if (finTable) {
        const header = finTable.find((r) => /period ended/i.test(r[0] || '')) || [];
        const periods = header.slice(1);
        const row = (name) => finTable.find((r) => new RegExp(name, 'i').test((r[0] || '').trim()));
        const table = periods.map((period, i) => ({
            period,
            assets: num(row('^assets')?.[i + 1]),
            totalIncome: num(row('total income')?.[i + 1]),
            pat: num(row('profit after tax')?.[i + 1]),
            ebitda: num(row('^ebitda')?.[i + 1]),
            netWorth: num(row('net worth')?.[i + 1]),
            reservesSurplus: num(row('reserves')?.[i + 1]),
            totalBorrowing: num(row('borrowing')?.[i + 1]),
        })).filter((r) => r.period && (r.assets || r.totalIncome || r.pat));
        if (table.length) out.financialsTable = table;
    }

    /* --- Lot ladder --- */
    const lotTable = tables(elementById(html, 'sec-lots'))
        .find((t) => /category/i.test(t[0]?.[0] || '') && /lots/i.test(t[0]?.[1] || ''));
    if (lotTable) {
        const rows = lotTable
            .filter((r) => r.length >= 4 && !/category/i.test(r[0]))
            .map((r) => ({ category: r[0], lots: r[1], shares: r[2], amount: r[3], reserved: r[4] || '' }))
            .filter((r) => r.category && r.shares);
        if (rows.length) out.lotDistribution = rows;
    }

    /* --- Registrar and lead managers --- */
    const registrar = elementById(html, 'sec-registrar');
    if (registrar) {
        const flat = cellText(registrar);
        const name = (flat.match(/Registrar\s+(.+?)\s+(?:\+91|\d{6,}|https?:)/i) || [])[1];
        if (name && name.length < 90) out.registrar = name.trim();
        // The address block repeats the registrar's name, then the postal address.
        const addr = (flat.match(/(?:Limited|Ltd\.?)\s+((?:\d|Office|Plot|Unit|Selenium|C-|B-|S6|No\.)[^|]{20,180}?\d{6})/) || [])[1];
        if (addr) out.registrarAddress = addr.trim();
    }

    const leads = elementById(html, 'sec-lead-managers');
    if (leads) {
        // Everything before the Registrar block, which follows in the same container.
        const text = cellText(leads).replace(/^Lead Managers?\s*/i, '').split(/\bRegistrar\b/)[0];
        const list = text.split(/\s{2,}|,(?=\s*[A-Z])/)
            .map((s) => s.trim())
            .filter((s) => s.length > 6 && /(limited|ltd|llp|capital|securities|advisors|finance)/i.test(s));
        if (list.length) out.leadManagers = [...new Set(list)];
    }

    return out;
}

/* ------------------------------------------------------------------ apply */

async function main() {
    if (!dirArg) {
        console.error('Usage: npm run extract:facts -- <directory-of-saved-pages> [--apply]');
        process.exitCode = 1;
        return;
    }
    const dir = path.resolve(dirArg);
    if (!fs.existsSync(dir)) {
        console.error('No such directory: ' + dir);
        process.exitCode = 1;
        return;
    }

    const files = fs.readdirSync(dir).filter((f) => f.endsWith('.html'));
    await mongoose.connect(process.env.MONGO_URI);
    console.log((APPLY ? 'APPLYING' : 'DRY RUN') + ' — ' + files.length + ' saved page(s)\n');

    let touched = 0;
    for (const file of files) {
        const slug = file.replace(/\.html$/, '');
        const doc = await IpoFull.findOne({ slug });
        if (!doc) { console.log('  NO RECORD  ' + slug); continue; }

        const found = extract(fs.readFileSync(path.join(dir, file), 'utf8'));
        const filled = [];

        // Never overwrite: the exchange, or a person, may already have filled this.
        const setIfEmpty = (field, value, isEmpty) => {
            if (value === undefined || value === null) return;
            if (!isEmpty()) return;
            doc.set(field, value);
            filled.push(field);
        };

        setIfEmpty('registrar', found.registrar, () => !doc.registrar);
        setIfEmpty('registrarAddress', found.registrarAddress, () => !doc.registrarAddress);
        setIfEmpty('leadManagers', found.leadManagers, () => !doc.leadManagers?.length);
        setIfEmpty('faceValue', found.faceValue, () => !doc.faceValue);
        setIfEmpty('marketMaker', found.marketMaker, () => !doc.marketMaker);
        setIfEmpty('shareHolding', found.shareHolding, () => !doc.shareHolding?.pre && !doc.shareHolding?.post);
        setIfEmpty('issueBreakdown', found.issueBreakdown, () => !doc.issueBreakdown?.total?.shares);
        setIfEmpty('issueSize', found.issueSize, () => !doc.issueSize?.shares && !doc.issueSize?.cr);
        setIfEmpty('lotDistribution', found.lotDistribution, () => !doc.lotDistribution?.length);
        setIfEmpty('financials.table', found.financialsTable, () => !doc.financials?.table?.length);
        setIfEmpty('financials.kpis', found.financialsKpis, () => !doc.financials?.kpis?.length);

        if (!filled.length) continue;
        if (APPLY) await doc.save();
        console.log('  ' + slug.padEnd(34) + filled.join(', '));
        touched++;
    }

    console.log('\n' + (APPLY ? 'Updated' : 'Would update') + ': ' + touched + ' record(s)');
    if (!APPLY) console.log('Re-run with --apply to write.');
    await mongoose.disconnect();
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
