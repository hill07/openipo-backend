/**
 * CLI wrapper around utils/gmpRefresh.js.
 *
 *   node src/scripts/refreshGmp.js           # dry run: prints what would change
 *   node src/scripts/refreshGmp.js --apply   # writes
 *
 * The same refresh runs automatically inside the server (utils/subscriptionScheduler.js).
 */
import fs from 'fs';
import path from 'path';
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { refreshGmp } from '../utils/gmpRefresh.js';

dotenv.config();

const APPLY = process.argv.includes('--apply');

if (!process.env.MONGO_URI) {
    console.error('MONGO_URI is not set (add it to openipo-backend/.env).');
    process.exit(1);
}

async function run() {
    await mongoose.connect(process.env.MONGO_URI);
    const { host, name: dbName } = mongoose.connection;
    console.log(`${APPLY ? 'APPLY' : 'DRY RUN'} — ${host}/${dbName}\n`);

    const { report, backup } = await refreshGmp({ apply: APPLY });

    console.log(
        `Source has ${report.sourceRows} unlisted IPOs; we hold ${report.candidates} that have not listed.\n`
    );
    console.log(`Updated:   ${report.updated.length}`);
    for (const u of report.updated) {
        const pct = u.percent === null ? '' : ` (${u.percent}%)`;
        console.log(`  ${u.name} — ₹${u.from} -> ₹${u.to}${pct}  [matched by ${u.matchedBy}]`);
    }
    console.log(`\nUnchanged: ${report.unchanged.length}`);
    if (report.noQuote.length) {
        console.log(`
No live quote right now (left unchanged): ${report.noQuote.length}`);
        for (const n of report.noQuote) console.log(`  ${n}`);
    }
    if (report.implausible.length) {
        console.log(`
Implausible — NOT written: ${report.implausible.length}`);
        for (const m of report.implausible) console.log(`  ${m}`);
    }
    if (report.priceMismatch.length) {
        console.log(`\nPrice mismatch — NOT written: ${report.priceMismatch.length}`);
        for (const m of report.priceMismatch) console.log(`  ${m}`);
    }
    if (report.unmatched.length) {
        console.log(`\nNot in our database: ${report.unmatched.length}`);
        for (const u of report.unmatched) console.log(`  ${u}`);
    }

    if (APPLY && backup.length) {
        const file = path.resolve(process.cwd(), `gmp-backup-${Date.now()}.json`);
        fs.writeFileSync(file, JSON.stringify(backup, null, 2));
        console.log(`\nPrevious values backed up to ${file}`);
    }
    if (!APPLY) console.log('\nDry run — nothing was written. Re-run with --apply to save.');

    await mongoose.disconnect();
}

run().catch(async (error) => {
    console.error('refreshGmp failed:', error);
    await mongoose.disconnect().catch(() => {});
    process.exit(1);
});
