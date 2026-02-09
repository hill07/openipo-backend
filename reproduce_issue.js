import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import IpoFull from './src/models/IpoFull.js';

// Setup environment
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '.env') });

const connectDB = async () => {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log('MongoDB Connected');
    } catch (err) {
        console.error('Connection Failed:', err);
        process.exit(1);
    }
};

const run = async () => {
    await connectDB();

    try {
        console.log("--- Starting Reproduction Script (Empty Values) ---");

        // 1. Find or Create a Test IPO
        let ipo = await IpoFull.findOne({ slug: 'test-kpi-ipo' });
        if (!ipo) {
            console.log("Creating Test IPO...");
            ipo = await IpoFull.create({
                companyName: 'Test KPI IPO',
                slug: 'test-kpi-ipo',
                ipoId: 99999,
                type: 'MAINBOARD'
            });
        }
        console.log("Found IPO:", ipo.slug);

        // 2. Define KPI Data Update with EMPTY values
        const kpiUpdate = {
            roe: [{ period: 'FY25-Empty', value: '' }], // Empty string logic
            ronw: [],
            epsBasic: []
        };

        const updatePayload = {
            financials: {
                kpi: kpiUpdate,
                table: []
            }
        };

        console.log("Updating with Payload (Empty ROE):", JSON.stringify(updatePayload, null, 2));

        const updatedIpo = await IpoFull.findOneAndUpdate(
            { slug: 'test-kpi-ipo' },
            { $set: updatePayload },
            { new: true }
        );

        // 4. Verification
        console.log("--- Verification ---");
        const kpiStored = updatedIpo.financials.kpi;
        console.log("Stored KPIs:", JSON.stringify(kpiStored, null, 2));

        if (kpiStored.roe.length > 0 && kpiStored.roe.some(r => r.period === 'FY25-Empty')) {
            console.log("SUCCESS: Empty Value KPI was saved.");
        } else {
            console.log("FAILURE: Empty Value KPI was NOT saved.");
        }

    } catch (error) {
        console.error("Error during reproduction:", error);
    } finally {
        await mongoose.disconnect();
        console.log("Disconnected");
    }
};

run();
