
import dotenv from "dotenv";
dotenv.config();

import mongoose from "mongoose";

// Define a minimal schema just for this operation to avoid import issues
const tempSchema = new mongoose.Schema({}, { strict: false });
const TempIpo = mongoose.models.IpoFull || mongoose.model("IpoFull", tempSchema);

async function run() {
    console.log("🔄 Connecting to DB...");
    await mongoose.connect(process.env.MONGO_URI);

    console.log("🧹 Clearing old KPI data from all IPOs...");

    try {
        const result = await TempIpo.updateMany(
            {},
            {
                $unset: { "financials.kpis": 1, "financials.kpiPeriods": 1 }
            }
        );
        console.log(`✅ Unset fields on ${result.modifiedCount} docs.`);

        // Initialize financials.kpi structure if it doesn't exist
        // We use an empty structure that matches the schema
        const kpiStructure = {
            roe: [],
            ronw: [],
            epsBasic: [],
            pePreIpo: "",
            pePostIpo: ""
        };

        const initResult = await TempIpo.updateMany(
            { "financials.kpi": { $exists: false } },
            {
                $set: {
                    "financials.kpi": kpiStructure
                }
            }
        );
        console.log(`✅ Initialized 'financials.kpi' on ${initResult.modifiedCount} docs.`);

    } catch (error) {
        console.error("❌ Error:", error);
    }

    process.exit(0);
}

run();
