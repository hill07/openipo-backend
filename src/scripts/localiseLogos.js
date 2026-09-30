/**
 * Move company logos off other people's servers and onto ours.
 *
 * Some records point at a logo hosted by the company itself, and two pointed at a
 * competitor's CDN. Those break without warning: one already 403s when the request
 * carries our Referer, and a competitor can swap or remove an image at any time.
 *
 * Two phases, because the image files live in the FRONTEND repo and the logo path lives
 * in the database. Flipping the database before the files are deployed points the live
 * site at 404s — which is exactly what happened the first time this was done by hand.
 *
 *   npm run logos:download          fetch remote logos into frontend/public/company-icons
 *   npm run logos:download -- --apply
 *
 *   npm run logos:switch            after the frontend is deployed, repoint the records
 *   npm run logos:switch -- --apply
 *
 * The switch phase refuses to touch a record until it has fetched the local file from
 * the live site and got a 200, so it cannot break a working logo again.
 */
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();

const APPLY = process.argv.includes('--apply');
const MODE = process.argv.includes('switch') ? 'switch' : 'download';

const HERE = path.dirname(fileURLToPath(import.meta.url));
// backend/src/scripts -> repo root -> frontend/public/company-icons
const ICON_DIR = path.resolve(HERE, '../../../frontend/public/company-icons');
const SITE = (process.env.PUBLIC_SITE_URL || 'https://www.openipo.in').replace(/\/$/, '');

// The handover list between the two phases. It lives beside this script, NOT under
// frontend/public — anything in that directory is served to the open web, and the
// pending list is internal state, not a public asset.
const PENDING_FILE = path.resolve(HERE, '../../.pending-logos.json');

const UA =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36';

/** Only formats a browser will render inline; anything else is a redirect or an error page. */
const EXTENSIONS = {
    'image/png': '.png',
    'image/jpeg': '.jpg',
    'image/svg+xml': '.svg',
    'image/webp': '.webp',
    'image/gif': '.gif',
};

const MIN_BYTES = 100;

/** Local path a record should end up pointing at. */
function localPath(slug, ext) {
    return `/company-icons/${slug.replace(/-ipo$/, '')}${ext}`;
}

async function download(collection) {
    const docs = await collection
        .find(
            { isPublished: true, isDeleted: false, logo: { $nin: [null, ''] } },
            { projection: { slug: 1, logo: 1, companyName: 1 } }
        )
        .toArray();

    const remote = docs.filter((d) => !String(d.logo).trim().startsWith('/'));
    console.log(`${remote.length} record(s) still load a logo from another host.\n`);

    const mapping = [];
    const failed = [];

    for (const doc of remote) {
        const url = String(doc.logo).trim();
        try {
            const res = await fetch(url, {
                headers: { 'User-Agent': UA, Accept: 'image/*,*/*' },
                signal: AbortSignal.timeout(20000),
            });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);

            const type = (res.headers.get('content-type') || '').split(';')[0].trim();
            const ext = EXTENSIONS[type];
            if (!ext) throw new Error(`not an image (${type || 'no content-type'})`);

            const buffer = Buffer.from(await res.arrayBuffer());
            if (buffer.length < MIN_BYTES) throw new Error(`too small (${buffer.length} bytes)`);

            const target = localPath(doc.slug, ext);
            if (APPLY) fs.writeFileSync(path.join(ICON_DIR, path.basename(target)), buffer);

            mapping.push({ slug: doc.slug, from: url, to: target });
            console.log(`  ok    ${doc.slug} -> ${target} (${buffer.length} bytes, ${type})`);
        } catch (error) {
            failed.push({ slug: doc.slug, companyName: doc.companyName, url, reason: error.message });
            console.log(`  FAIL  ${doc.slug}: ${error.message}`);
        }
    }

    if (APPLY) {
        fs.writeFileSync(PENDING_FILE, JSON.stringify(mapping, null, 2));
    }

    console.log(`\n${APPLY ? 'Saved' : 'Would save'} ${mapping.length} file(s); ${failed.length} could not be fetched.`);
    if (failed.length) {
        console.log('\nStill without a usable logo — these need one supplied by hand:');
        failed.forEach((f) => console.log(`  ${f.slug}  (${f.companyName})  ${f.reason}`));
    }
    if (APPLY) {
        console.log('\nNext: commit and deploy the frontend, THEN run `npm run logos:switch -- --apply`.');
    }
}

async function switchToLocal(collection) {
    const listFile = PENDING_FILE;
    if (!fs.existsSync(listFile)) {
        console.error(`No pending list at ${listFile}. Run the download phase first.`);
        process.exitCode = 1;
        return;
    }

    const mapping = JSON.parse(fs.readFileSync(listFile, 'utf8'));
    let switched = 0;
    let blocked = 0;

    for (const entry of mapping) {
        // The whole point of this phase: prove the file is actually being served before
        // a record is allowed to depend on it.
        let live = false;
        try {
            const res = await fetch(`${SITE}${entry.to}`, {
                method: 'HEAD',
                headers: { 'User-Agent': UA },
                signal: AbortSignal.timeout(15000),
            });
            live = res.ok;
        } catch {
            live = false;
        }

        if (!live) {
            console.log(`  blocked ${entry.slug}: ${SITE}${entry.to} is not being served yet`);
            blocked++;
            continue;
        }

        if (APPLY) {
            await collection.updateOne({ slug: entry.slug }, { $set: { logo: entry.to } });
        }
        console.log(`  ok      ${entry.slug} -> ${entry.to}`);
        switched++;
    }

    console.log(
        `\n${APPLY ? 'Switched' : 'Would switch'} ${switched} record(s); ${blocked} blocked because the file is not live.`
    );
    if (APPLY && switched && !blocked) {
        fs.rmSync(listFile);
        console.log('Pending list cleared.');
    }
}

async function main() {
    if (!fs.existsSync(ICON_DIR)) {
        console.error(`Icon directory not found: ${ICON_DIR}`);
        process.exitCode = 1;
        return;
    }

    await mongoose.connect(process.env.MONGO_URI);
    const collection = mongoose.connection.collection('ipofulls');

    console.log(`${MODE === 'switch' ? 'SWITCH' : 'DOWNLOAD'} phase — ${APPLY ? 'APPLYING' : 'dry run'}\n`);

    if (MODE === 'switch') await switchToLocal(collection);
    else await download(collection);

    await mongoose.disconnect();
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
