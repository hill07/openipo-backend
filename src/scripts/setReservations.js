/**
 * Enter an IPO's reservation split from its prospectus.
 *
 *   node src/scripts/setReservations.js <slug> QIB=1987592 NII=1491825 Retail=3480926 Employee=54496
 *   node src/scripts/setReservations.js <slug> ... --apply
 *
 * This is the one number set no feed can give us. NSE sizes the offer at the floor
 * price while bidding is open, BSE publishes nothing reachable, and the registrar's
 * exact figures only arrive after the issue closes — so until these are entered the
 * offered quantities are derived and carry a fraction of a per cent of error.
 *
 * Once entered they are authoritative: the refresh copies them into the subscription
 * table and never overwrites them, so the multiples become exact.
 *
 * Anchor and MarketMaker are accepted too, and are excluded from the subscription
 * totals in the usual way.
 */
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import IpoFull from '../models/IpoFull.js';
import { computeDerivedFields } from '../utils/ipoCalculations.js';

dotenv.config();

const KNOWN = ['QIB', 'NII', 'HNI', 'Retail', 'Employee', 'Shareholder', 'Policyholder', 'Anchor', 'MarketMaker'];

const args = process.argv.slice(2);
const APPLY = args.includes('--apply');
const slugArg = args.find((a) => !a.includes('=') && !a.startsWith('--'));
const pairs = args.filter((a) => a.includes('='));

if (!slugArg || !pairs.length) {
    console.error('Usage: node src/scripts/setReservations.js <slug> QIB=… NII=… Retail=… [Employee=…] [--apply]');
    process.exit(1);
}
if (!process.env.MONGO_URI) {
    console.error('MONGO_URI is not set (add it to openipo-backend/.env).');
    process.exit(1);
}

const fmt = (n) => Number(n).toLocaleString('en-IN');

async function run() {
    await mongoose.connect(process.env.MONGO_URI);

    const slug = slugArg.replace(/-ipo$/, '');
    const doc = await IpoFull.findOne({ slug: { $in: [slug, `${slug}-ipo`] } });
    if (!doc) {
        console.error(`No IPO found for "${slugArg}".`);
        await mongoose.disconnect();
        process.exit(1);
    }

    const entered = [];
    for (const pair of pairs) {
        const [rawName, rawValue] = pair.split('=');
        const name = KNOWN.find((k) => k.toLowerCase() === rawName.trim().toLowerCase());
        if (!name) {
            console.error(`Unknown category "${rawName}". Known: ${KNOWN.join(', ')}`);
            await mongoose.disconnect();
            process.exit(1);
        }
        const shares = Number(String(rawValue).replace(/[, ]/g, ''));
        if (!Number.isFinite(shares) || shares <= 0) {
            console.error(`"${pair}" is not a positive share count.`);
            await mongoose.disconnect();
            process.exit(1);
        }
        entered.push({ category: name, sharesOffered: Math.round(shares) });
    }

    const issueShares = Number(doc.issueSize?.shares) || 0;
    const total = entered.reduce((sum, e) => sum + e.sharesOffered, 0);

    console.log(`${doc.companyName}  (${doc.type})`);
    console.log(`  issue size on record : ${issueShares ? fmt(issueShares) + ' shares' : 'unknown'}`);
    for (const e of entered) console.log(`  ${e.category.padEnd(12)} ${fmt(e.sharesOffered).padStart(14)}`);
    console.log(`  ${'entered total'.padEnd(12)} ${fmt(total).padStart(14)}`);

    // A total ABOVE the issue is impossible; below is normal when the anchor portion
    // is not entered, so that is reported rather than refused.
    if (issueShares && total > issueShares * 1.01) {
        console.error(`\nRefused: the entered shares exceed the issue size by ${(((total / issueShares) - 1) * 100).toFixed(1)}%.`);
        await mongoose.disconnect();
        process.exit(1);
    }
    if (issueShares && total < issueShares * 0.99) {
        const gap = issueShares - total;
        console.log(`  ${'unaccounted'.padEnd(12)} ${fmt(gap).padStart(14)}  (expected if the anchor portion was not entered)`);
    }

    // Reservations are the record of the prospectus; the subscription table mirrors
    // them so the multiples are computed against the real reserved quantities.
    doc.reservations = entered.map((e) => ({ enabled: true, ...e }));

    if (!Array.isArray(doc.subscription?.categories)) doc.subscription = { categories: [] };
    for (const e of entered) {
        if (['Anchor'].includes(e.category)) continue;
        const existing = doc.subscription.categories.find(
            (c) => String(c.category || '').toLowerCase() === e.category.toLowerCase()
        );
        if (existing) existing.sharesOffered = e.sharesOffered;
        else doc.subscription.categories.push({ enabled: true, category: e.category, sharesOffered: e.sharesOffered, appliedShares: 0 });
    }
    // sNII / bNII are a split of the NII portion, so they follow the entered figure
    // using the exchange's own proportion (two thirds above Rs 10 lakh, one third
    // below). Left alone they would keep their derived values and disagree with NII.
    const niiEntered = entered.find((e) => ['NII', 'HNI'].includes(e.category))?.sharesOffered;
    if (niiEntered) {
        const subRows = doc.subscription.categories.filter((c) => c.parent);
        const parentBefore = subRows.reduce((sum, c) => sum + (Number(c.sharesOffered) || 0), 0);
        for (const row of subRows) {
            const ratio = parentBefore ? (Number(row.sharesOffered) || 0) / parentBefore : 0;
            if (ratio) row.sharesOffered = Math.round(ratio * niiEntered);
        }
    }

    doc.subscription.offeredSource = 'prospectus';
    computeDerivedFields(doc);

    console.log('\nResulting subscription table:');
    for (const c of doc.subscription.categories) {
        if (c.enabled === false) continue;
        console.log(
            `  ${String(c.category).padEnd(10)} offered ${fmt(c.sharesOffered || 0).padStart(14)}  bids ${fmt(c.appliedShares || 0).padStart(14)}  ${Number(c.times || 0).toFixed(2)}x`
        );
    }
    console.log(`  TOTAL      ${Number(doc.subscription.totalTimes || 0).toFixed(2)}x`);

    if (APPLY) {
        await doc.save();
        console.log('\nSaved. The refresh will keep these figures and never overwrite them.');
    } else {
        console.log('\nDry run — nothing was written. Add --apply to save.');
    }

    await mongoose.disconnect();
}

run().catch(async (error) => {
    console.error('setReservations failed:', error);
    await mongoose.disconnect().catch(() => {});
    process.exit(1);
});
