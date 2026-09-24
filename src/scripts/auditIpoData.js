/**
 * Report IPOs that are showing wrong or missing information to readers.
 *
 *   node src/scripts/auditIpoData.js
 *
 * Exits 1 when there are problems, so it can be used as a check in CI or a shell loop.
 * The same audit is served at /api/internal/audit for the external scheduler.
 */
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { auditIpoData } from '../utils/subscriptionAudit.js';

dotenv.config();

if (!process.env.MONGO_URI) {
    console.error('MONGO_URI is not set (add it to openipo-backend/.env).');
    process.exit(1);
}

const run = async () => {
    await mongoose.connect(process.env.MONGO_URI);
    const { checked, live, problems, warnings, healthy } = await auditIpoData();

    console.log(`Checked ${checked} records; ${live} are live or about to open.\n`);
    console.log(`Problems (readers see these): ${problems.length}`);
    for (const p of problems) console.log(`  ✗ ${p}`);
    console.log(`\nWarnings: ${warnings.length}`);
    for (const w of warnings) console.log(`  · ${w}`);

    await mongoose.disconnect();
    if (!healthy) process.exitCode = 1;
};

run().catch(async (error) => {
    console.error('auditIpoData failed:', error);
    await mongoose.disconnect().catch(() => {});
    process.exit(1);
});
