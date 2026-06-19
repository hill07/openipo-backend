import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Import model using absolute path to be safe
import IpoFull from '../src/models/IpoFull.js';

dotenv.config({ path: path.join(__dirname, '../.env') });

const clearGmpSources = async () => {
    try {
        if (!process.env.MONGO_URI) {
            throw new Error('MONGO_URI not found in environment');
        }

        await mongoose.connect(process.env.MONGO_URI);
        console.log('Connected to MongoDB');

        const result = await IpoFull.updateMany({}, {
            $set: {
                'gmp.source': '',
                'gmp.sourceLink': ''
            }
        });

        console.log(`Successfully cleared GMP source data for ${result.modifiedCount} IPOs.`);
        process.exit(0);
    } catch (error) {
        console.error('Error clearing GMP sources:', error);
        process.exit(1);
    }
};

clearGmpSources();
