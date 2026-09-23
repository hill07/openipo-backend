/**
 * Import a prepared IPO payload (array of IpoFull-shaped records) into the database.
 *
 *   node src/scripts/importIpoPayload.js <payload.json>           # dry run: prints the plan
 *   node src/scripts/importIpoPayload.js <payload.json> --apply   # writes
 *
 * Records go through the same zod validation and computeDerivedFields as the admin
 * create/update path. Existing records are matched by slug OR company name (so
 * "X Ltd." and "X Limited" don't become duplicates) and updated in place, keeping
 * their ipoId and slug. --apply first writes a backup of the records it updates and
 * a rollback manifest of the ones it inserts, next to the payload file.
 */
import fs from 'fs';
import path from 'path';
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import IpoFull from '../models/IpoFull.js';
import ipoFullSchema from '../validators/ipoFull.zod.js';
import { computeDerivedFields } from '../utils/ipoCalculations.js';

dotenv.config();

const args = process.argv.slice(2);
const APPLY = args.includes('--apply');
const payloadPath = args.find((a) => !a.startsWith('--'));

if (!payloadPath) {
    console.error('Usage: node src/scripts/importIpoPayload.js <payload.json> [--apply]');
    process.exit(1);
}
if (!process.env.MONGO_URI) {
    console.error('MONGO_URI is not set (add it to openipo-backend/.env).');
    process.exit(1);
}

const nameKey = (s) =>
    String(s || '')
        .toLowerCase()
        .replace(/\b(limited|ltd|private|pvt|india|the)\b/g, '')
        .replace(/[^a-z0-9]/g, '');

async function run() {
    const payloadFile = path.resolve(payloadPath);
    const outDir = path.dirname(payloadFile);
    const payload = JSON.parse(fs.readFileSync(payloadFile, 'utf8'));

    await mongoose.connect(process.env.MONGO_URI);
    const { host, name: dbName } = mongoose.connection;

    const existing = await IpoFull.find({}, { _id: 1, ipoId: 1, slug: 1, companyName: 1, isDeleted: 1 }).lean();
    const bySlug = new Map(existing.map((d) => [d.slug.replace(/-ipo$/, ''), d]));
    const byName = new Map(existing.map((d) => [nameKey(d.companyName), d]));
    let nextId = existing.reduce((m, d) => Math.max(m, d.ipoId || 0), 0) + 1;

    const plan = { insert: [], update: [], invalid: [] };
    for (const rec of payload) {
        const match = bySlug.get(String(rec.slug).replace(/-ipo$/, '')) || byName.get(nameKey(rec.companyName));
        let doc;
        try {
            doc = ipoFullSchema.parse(rec);
        } catch (e) {
            const msg = e.errors?.map((x) => `${x.path.join('.')}: ${x.message}`).join('; ') || e.message;
            plan.invalid.push({ slug: rec.slug, error: msg });
            continue;
        }
        computeDerivedFields(doc);
        if (match) {
            delete doc.ipoId;
            delete doc.slug;
            plan.update.push({ match, doc });
        } else {
            doc.ipoId = nextId++;
            plan.insert.push({ doc });
        }
    }

    console.log(`${APPLY ? 'APPLY' : 'DRY RUN'} against ${host}/${dbName} — existing records: ${existing.length}`);
    console.log(`insert: ${plan.insert.length} | update: ${plan.update.length} | invalid: ${plan.invalid.length}`);
    for (const u of plan.update) console.log(`  update  ${u.match.slug} (ipoId ${u.match.ipoId}) <- ${u.doc.companyName}`);
    for (const i of plan.invalid) console.log(`  INVALID ${i.slug}: ${i.error}`);

    if (!APPLY) return;
    if (plan.invalid.length) throw new Error('Refusing to apply while any record is invalid.');

    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupFile = path.join(outDir, `backup-before-update-${stamp}.json`);
    const updatedIds = plan.update.map((u) => u.match._id);
    fs.writeFileSync(backupFile, JSON.stringify(await IpoFull.find({ _id: { $in: updatedIds } }).lean(), null, 1));
    console.log(`backup of ${updatedIds.length} record(s) -> ${backupFile}`);

    const inserted = [];
    for (const { doc } of plan.insert) {
        const created = await IpoFull.create(doc);
        inserted.push({ _id: String(created._id), ipoId: created.ipoId, slug: created.slug });
    }
    for (const { match, doc } of plan.update) {
        await IpoFull.updateOne({ _id: match._id }, { $set: { ...doc, isDeleted: false } }, { runValidators: true });
    }

    const manifest = path.join(outDir, `rollback-manifest-${stamp}.json`);
    fs.writeFileSync(manifest, JSON.stringify({ db: `${host}/${dbName}`, inserted, updatedBackup: backupFile }, null, 1));
    console.log(`inserted ${inserted.length}, updated ${plan.update.length}. rollback manifest -> ${manifest}`);
}

run()
    .then(() => mongoose.disconnect())
    .catch(async (err) => {
        console.error(err.message || err);
        await mongoose.disconnect();
        process.exit(1);
    });
