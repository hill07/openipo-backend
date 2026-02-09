
import { z } from 'zod';
import ipoFullSchema from '../validators/ipoFull.zod.js';

async function run() {
    console.log("🚀 Testing Zod Validation...");

    const payload = {
        companyName: "Zod Test Company",
        financials: {
            kpi: {
                roe: [{ period: "2024", value: "10" }],
                pePreIpo: [{ period: "2024", value: "25.5" }],
                pePostIpo: [{ period: "2025", value: "30.5" }]
            },
            table: []
        }
    };

    try {
        console.log("Parsing payload...");
        const parsed = ipoFullSchema.partial().parse(payload);

        console.log("Parsed KPI Keys:", Object.keys(parsed.financials?.kpi || {}));

        if (parsed.financials?.kpi?.pePreIpo) {
            console.log("✅ pePreIpo present in parsed output:", parsed.financials.kpi.pePreIpo);
            console.log("🎉 Zod Schema is CORRECT.");
        } else {
            console.error("❌ pePreIpo MISSING in parsed output (Stripped).");
            console.error("Schema Kpi Definition:", JSON.stringify(ipoFullSchema.shape.financials.shape.kpi.shape, null, 2)); // rough introspection
        }

    } catch (error) {
        console.error("❌ Validation Failed:", error.errors || error);
    }
}

run();
