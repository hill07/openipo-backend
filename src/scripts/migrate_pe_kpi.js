
import dotenv from "dotenv";
dotenv.config();

import mongoose from "mongoose";

// Define a minimal schema just for this operation
const tempSchema = new mongoose.Schema({}, { strict: false });
const TempIpo = mongoose.models.IpoFull || mongoose.model("IpoFull", tempSchema);

async function run() {
    console.log("🔄 Connecting to DB...");
    await mongoose.connect(process.env.MONGO_URI);

    console.log("🚀 Starting Migration: Converting P/E fields to Arrays...");

    try {
        const ipos = await TempIpo.find({
            $or: [
                { "financials.kpi.pePreIpo": { $type: "string" } },
                { "financials.kpi.pePostIpo": { $type: "string" } }
            ]
        });

        console.log(`Found ${ipos.length} IPOs to migrate.`);

        for (const ipo of ipos) {
            let kpi = ipo.financials?.kpi || {};
            let updates = {};
            let needsUpdate = false;

            // Migrate pePreIpo
            if (typeof kpi.pePreIpo === 'string') {
                const val = kpi.pePreIpo.trim();
                if (val) {
                    updates["financials.kpi.pePreIpo"] = [{ period: "N/A", value: val }];
                } else {
                    updates["financials.kpi.pePreIpo"] = [];
                }
                needsUpdate = true;
            }

            // Migrate pePostIpo
            if (typeof kpi.pePostIpo === 'string') {
                const val = kpi.pePostIpo.trim();
                if (val) {
                    updates["financials.kpi.pePostIpo"] = [{ period: "N/A", value: val }];
                } else {
                    updates["financials.kpi.pePostIpo"] = [];
                }
                needsUpdate = true;
            }

            if (needsUpdate) {
                await TempIpo.updateOne({ _id: ipo._id }, { $set: updates });
                console.log(`✅ Migrated IPO: ${ipo.companyName}`);
            }
        }

    } catch (error) {
        console.error("❌ Error:", error);
    }

    console.log("🏁 Migration Complete.");
    process.exit(0);
}

run();
