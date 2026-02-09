
import IpoFull from './src/models/IpoFull.js';
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { calculateIpoStatus } from './src/utils/ipoCalculations.js';

dotenv.config();

const run = async () => {
    try {
        await mongoose.connect(process.env.MONGO_URI);

        const ipo = await IpoFull.findOne({ slug: 'grover-jewells-limited-ipo' });

        if (ipo) {
            console.log('DB Status:', ipo.status);
            console.log('Dates:', JSON.stringify(ipo.dates, null, 2));

            const calculated = calculateIpoStatus(ipo.dates);
            console.log('Calculated Status (Backend Util):', calculated);

            // Simulate "Today" check
            const now = new Date();
            console.log('Server Date:', now.toISOString());
            console.log('Close Date:', ipo.dates.close ? ipo.dates.close.toISOString() : 'Null');
        } else {
            console.log('IPO Not Found');
        }

    } catch (e) {
        console.error(e);
    } finally {
        await mongoose.connection.close();
    }
};

run();

