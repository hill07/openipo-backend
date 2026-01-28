import mongoose from 'mongoose';

const siteStatSchema = new mongoose.Schema({
    identifier: { type: String, default: 'main', unique: true },
    visitors: { type: Number, default: 0 },
    lastUpdated: { type: Date, default: Date.now }
});

export default mongoose.model('SiteStat', siteStatSchema);
