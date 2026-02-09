
import dotenv from "dotenv";
dotenv.config();

import mongoose from "mongoose";

// Define a minimal schema just for this operation
const tempSchema = new mongoose.Schema({}, { strict: false });
const TempIpo = mongoose.models.IpoFull || mongoose.model("IpoFull", tempSchema);

async function run() {
    console.log("🔄 Connecting to DB...");
    await mongoose.connect(process.env.MONGO_URI);

    console.log("🚀 Starting Restoration: Moving P/E data back to KPI Arrays...");

    try {
        const ipos = await TempIpo.find({});
        console.log(`Found ${ipos.length} IPOs to check.`);

        for (const ipo of ipos) {
            let table = ipo.financials?.table || [];
            let kpi = ipo.financials?.kpi || {};

            // Initialize arrays if missing
            if (!Array.isArray(kpi.pePreIpo)) kpi.pePreIpo = [];
            if (!Array.isArray(kpi.pePostIpo)) kpi.pePostIpo = [];

            let needsUpdate = false;
            let updatedTable = [];

            for (const row of table) {
                // Check PePreIpo
                if (row.pePreIpo) {
                    kpi.pePreIpo.push({
                        period: row.period || "N/A",
                        value: row.pePreIpo
                    });
                    delete row.pePreIpo; // Remove from table row
                    needsUpdate = true;
                }

                // Check PePostIpo
                if (row.pePostIpo) {
                    kpi.pePostIpo.push({
                        period: row.period || "N/A",
                        value: row.pePostIpo
                    });
                    delete row.pePostIpo; // Remove from table row
                    needsUpdate = true;
                }

                updatedTable.push(row);
            }

            if (needsUpdate) {
                // Update the document
                await TempIpo.updateOne(
                    { _id: ipo._id },
                    {
                        $set: {
                            "financials.kpi": kpi,
                            "financials.table": updatedTable
                        }
                    }
                );
                console.log(`✅ Restored data for: ${ipo.companyName}`);
            }
        }

    } catch (error) {
        console.error("❌ Error:", error);
    }

    console.log("🏁 Restoration Complete.");
    process.exit(0);
}

run();
