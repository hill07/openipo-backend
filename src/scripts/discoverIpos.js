/**
 * Add IPOs that exist in the market but not in our database, and report existing
 * records whose headline facts have drifted from the exchange.
 *
 *   node src/scripts/discoverIpos.js           # dry run
 *   node src/scripts/discoverIpos.js --apply   # writes
 */
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { discoverIpos } from '../utils/ipoDiscovery.js';

dotenv.config();

const APPLY = process.argv.includes('--apply');

if (!process.env.MONGO_URI) {
    console.error('MONGO_URI is not set (add it to openipo-backend/.env).');
    process.exit(1);
}

const run = async () => {
    await mongoose.connect(process.env.MONGO_URI);
    console.log(`${APPLY ? 'APPLY' : 'DRY RUN'} — ${mongoose.connection.name}\n`);

    const { created, drifted, skipped } = await discoverIpos({ apply: APPLY });

    console.log(`New IPOs to publish: ${created.length}`);
    for (const c of created) {
        console.log(
            `  ${c.opens}  ${c.type.padEnd(9)} ${c.name.padEnd(34)} ${c.band.padEnd(16)} lot ${c.lot || '?'}  ₹${c.sizeCr || '?'} Cr${c.bandFromExchange ? '' : '   [price band unconfirmed]'}`
        );
    }

    console.log(`\nExisting records that disagree with the source: ${drifted.length}`);
    for (const d of drifted) console.log(`  ! ${d}`);

    if (skipped.length) {
        console.log(`\nSkipped: ${skipped.length}`);
        for (const s of skipped) console.log(`  · ${s}`);
    }

    if (!APPLY) console.log('\nDry run — nothing was written. Re-run with --apply to save.');
    await mongoose.disconnect();
};

run().catch(async (error) => {
    console.error('discoverIpos failed:', error);
    await mongoose.disconnect().catch(() => {});
    process.exit(1);
});
