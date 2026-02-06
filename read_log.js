import mongoose from 'mongoose';
import AdminAuditLog from './src/models/AdminAuditLog.js';
import dotenv from 'dotenv';

dotenv.config();

const run = async () => {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        const log = await AdminAuditLog.findOne({ action: 'UPDATE_IPO' }).sort({ createdAt: -1 });
        console.log('Latest Audit Log Meta:', JSON.stringify(log?.meta, null, 2));
    } catch (e) {
        console.error(e);
    } finally {
        await mongoose.connection.close();
    }
};

run();
