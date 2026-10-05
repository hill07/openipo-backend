/**
 * Apply company write-ups to IPO records from a JSON file.
 *
 * Auto-discovery creates a record as soon as an issue is announced, but it can only
 * fill what the exchanges publish: dates, price band, lot size, subscription. The
 * narrative — what the company does, what it is good at, what could go wrong — has no
 * machine-readable source, so every newly discovered IPO arrives with an empty page.
 * Those pages are held back from the index until this is run (see the frontend's
 * lib/indexability.js), because a price band and a table of exchange figures is not a
 * document worth submitting to a search engine.
 *
 * The write-ups must be ORIGINAL. Copying another site's summaries would turn a
 * thin-content problem into a duplicate-content one, which is the harder of the two to
 * recover from and is the specific reason the site's ad application was rejected.
 *
 *   npm run fill:content -- path/to/prose.json
 *   npm run fill:content -- path/to/prose.json --apply
 *
 * The JSON is an array of { slug, description, strengths[], weaknesses[], objectives[]? }.
 * Saving through the model (not the raw collection) is deliberate: the pre-save hook
 * recomputes `proseWords`, and that counter is what returns the page to the index and
 * to the sitemap.
 */
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import mongoose from 'mongoose';
import IpoFull from '../models/IpoFull.js';

dotenv.config();

const APPLY = process.argv.includes('--apply');
const fileArg = process.argv.slice(2).find((a) => !a.startsWith('--'));

/** Words of prose a page needs before it is worth indexing; mirrors the frontend. */
const MIN_PROSE_WORDS = 60;

function countWords(value) {
    if (!value) return 0;
    if (Array.isArray(value)) return value.reduce((n, v) => n + countWords(v), 0);
    return String(value).split(/\s+/).filter(Boolean).length;
}

async function main() {
    if (!fileArg) {
        console.error('Usage: npm run fill:content -- <file.json> [--apply]');
        process.exitCode = 1;
        return;
    }

    const file = path.resolve(fileArg);
    if (!fs.existsSync(file)) {
        console.error(`No such file: ${file}`);
        process.exitCode = 1;
        return;
    }

    const rows = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (!Array.isArray(rows)) {
        console.error('Expected a JSON array of records.');
        process.exitCode = 1;
        return;
    }

    await mongoose.connect(process.env.MONGO_URI);
    console.log(`${APPLY ? 'APPLYING' : 'DRY RUN'} — ${rows.length} record(s) from ${path.basename(file)}\n`);

    let written = 0;
    let missing = 0;
    let thin = 0;

    for (const row of rows) {
        if (!row?.slug) { console.log('  skipped: entry with no slug'); continue; }

        const doc = await IpoFull.findOne({ slug: row.slug });
        if (!doc) { console.log(`  NO RECORD  ${row.slug}`); missing++; continue; }

        if (row.description) doc.description = row.description;
        if (row.strengths) doc.strengths = row.strengths;
        if (row.weaknesses) doc.weaknesses = row.weaknesses;
        if (row.objectives) doc.objectives = row.objectives;

        const words =
            countWords(row.description) + countWords(row.strengths) +
            countWords(row.weaknesses) + countWords(row.objectives);

        // Writing too little leaves the page noindex anyway, which is worth knowing now
        // rather than wondering later why it never appeared in the sitemap.
        const short = words < MIN_PROSE_WORDS;
        if (short) thin++;

        if (APPLY) await doc.save();

        console.log(`  ${row.slug.padEnd(36)}${String(words).padStart(4)} words${short ? '   (still below the index threshold)' : ''}`);
        written++;
    }

    console.log(`\n${APPLY ? 'Applied' : 'Would apply'}: ${written}` +
        (missing ? `, ${missing} with no matching record` : '') +
        (thin ? `, ${thin} still too short to index` : ''));
    if (!APPLY) console.log('Re-run with --apply to write.');

    await mongoose.disconnect();
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
