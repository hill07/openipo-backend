
import dotenv from "dotenv";
dotenv.config();

import mongoose from "mongoose";
import IpoFull from "../models/IpoFull.js"; // Adjust path if needed

async function run() {
    console.log("🔄 Connecting to DB...");
    await mongoose.connect(process.env.MONGO_URI);

    console.log("🚀 Testing Persistence for P/E Arrays...");

    try {
        // Create a dummy IPO object with the structure we expect
        const testData = {
            ipoId: 999999,
            slug: 'test-persistence-ipo',
            companyName: 'Test Persistence Ltd',
            isPublished: false,
            financials: {
                kpi: {
                    roe: [{ period: '2023', value: '10' }],
                    pePreIpo: [{ period: '2024', value: '25.5' }], // The field in question
                    pePostIpo: [{ period: '2025', value: '30.5' }]
                },
                table: []
            }
        };

        // Attempt to create (or update if exists)
        // We use findOneAndUpdate with upsert to mimic the controller somewhat, 
        // but simple validate() is enough to check schema.

        const doc = new IpoFull(testData);

        console.log("...Validating...");
        await doc.validate();
        console.log("✅ Mongoose Validation Passed!");

        // Now let's try to actually save it to see if DB accepts it
        await IpoFull.deleteOne({ ipoId: 999999 }); // cleanup prev
        await doc.save();
        console.log("✅ Saved to DB!");

        // Read it back
        const saved = await IpoFull.findOne({ ipoId: 999999 });
        console.log("Read back PE Pre:", saved.financials.kpi.pePreIpo);

        if (saved.financials.kpi.pePreIpo.length > 0 && saved.financials.kpi.pePreIpo[0].value === '25.5') {
            console.log("🎉 SUCCESS: Data persisted correctly.");
        } else {
            console.error("❌ FAILURE: Data lost.");
        }

        await IpoFull.deleteOne({ ipoId: 999999 }); // cleanup

    } catch (error) {
        console.error("❌ Error:", error);
    }

    process.exit(0);
}

run();
