/**
 * CLI wrapper around utils/subscriptionRefresh.js.
 *
 *   node src/scripts/refreshSubscription.js                     # dry run: prints what would change
 *   node src/scripts/refreshSubscription.js --apply             # writes
 *   node src/scripts/refreshSubscription.js --apply --days 3    # also refresh issues closed <=3 days ago
 *
 * The same refresh runs automatically inside the server (utils/subscriptionScheduler.js);
 * this script is for a manual run or a one-off backfill. --apply first writes a backup of
 * the previous category values next to the working directory.
 */
import fs from 'fs';
import path from 'path';
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { refreshSubscriptions } from '../utils/subscriptionRefresh.js';

dotenv.config();

const args = process.argv.slice(2);
const APPLY = args.includes('--apply');
const daysArg = args.indexOf('--days');
const CLOSED_WITHIN_DAYS = daysArg > -1 ? Number(args[daysArg + 1]) : 2;

if (!process.env.MONGO_URI) {
    console.error('MONGO_URI is not set (add it to openipo-backend/.env).');
    process.exit(1);
}

async function run() {
    await mongoose.connect(process.env.MONGO_URI);
    const { host, name: dbName } = mongoose.connection;
    console.log(`${APPLY ? 'APPLY' : 'DRY RUN'} — ${host}/${dbName}\n`);

    const { report, backup } = await refreshSubscriptions({
        apply: APPLY,
        closedWithinDays: CLOSED_WITHIN_DAYS,
    });

    console.log(`NSE is reporting ${report.activeIssues} active issues.\n`);
    console.log(`Updated:   ${report.updated.length}`);
    for (const u of report.updated) {
        console.log(`  ${u.name} — now ${u.total}x overall`);
        for (const c of u.changes) console.log(`      ${c}`);
    }
    console.log(
        `\nUnchanged: ${report.unchanged.length}${report.unchanged.length ? ` (${report.unchanged.join(', ')})` : ''}`
    );
    if (report.noExchangeRow.length) {
        console.log(
            `\nCategories with no exchange row (overall ratio is understated for these): ${report.noExchangeRow.length}`
        );
        for (const n of report.noExchangeRow) console.log(`  ${n}`);
    }
    if (report.skippedRows.length) {
        console.log(`\nSkipped rows (reported, never guessed): ${report.skippedRows.length}`);
        for (const s of report.skippedRows) console.log(`  ${s}`);
    }
    if (report.unmatched.length) {
        console.log(`\nNot in our database: ${report.unmatched.length}`);
        for (const u of report.unmatched) console.log(`  ${u}`);
    }
    if (report.notStarted.length) {
        console.log(`
Bidding not open yet (nothing to read): ${report.notStarted.length}`);
        for (const n of report.notStarted) console.log(`  ${n}`);
    }
    if (report.errors.length) {
        console.log(`\nErrors: ${report.errors.length}`);
        for (const e of report.errors) console.log(`  ${e}`);
    }

    if (APPLY && backup.length) {
        const file = path.resolve(process.cwd(), `subscription-backup-${Date.now()}.json`);
        fs.writeFileSync(file, JSON.stringify(backup, null, 2));
        console.log(`\nPrevious values backed up to ${file}`);
    }
    if (!APPLY) console.log('\nDry run — nothing was written. Re-run with --apply to save.');

    await mongoose.disconnect();
}

run().catch(async (error) => {
    console.error('refreshSubscription failed:', error);
    await mongoose.disconnect().catch(() => {});
    process.exit(1);
});
