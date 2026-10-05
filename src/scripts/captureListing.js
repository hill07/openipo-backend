/**
 * Capture listing prices from the exchange's pre-open session.
 *
 *   npm run capture:listing
 *   npm run capture:listing -- --apply
 *
 * Meant for the 09:00-10:00 window on a listing day; outside it the exchange publishes
 * nothing and the run is a no-op.
 */
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import { captureListingPrices } from '../utils/listingPrice.js';

dotenv.config();

const APPLY = process.argv.includes('--apply');

async function main() {
    await mongoose.connect(process.env.MONGO_URI);
    console.log(`${APPLY ? 'APPLY' : 'DRY RUN'} — listing price capture\n`);

    const { report } = await captureListingPrices({ apply: APPLY });

    console.log('pending listings :', report.candidates ?? 0);
    if (report.buckets?.length) console.log('pre-open buckets :', report.buckets.join(' | '));

    if (report.captured.length) {
        console.log('\nCaptured:');
        report.captured.forEach((c) => console.log('  ' + c));
    } else {
        console.log('\nNothing captured — no listing in the pre-open session right now.');
    }
    if (report.skipped?.length) {
        console.log('\nSkipped:');
        report.skipped.forEach((x) => console.log('  ' + x));
    }
    if (report.errors?.length) {
        console.log('\nErrors:');
        report.errors.forEach((x) => console.log('  ' + x));
    }
    if (!APPLY) console.log('\nDry run — re-run with --apply to save.');

    await mongoose.disconnect();
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
