import mongoose from 'mongoose';

const visitorSchema = new mongoose.Schema({
    ip: { type: String, required: true, unique: true },
    lastVisit: { type: Date, default: Date.now },
    visitCount: { type: Number, default: 1 },
    deviceType: { type: String, default: 'unknown' }, // mobile | tablet | desktop | unknown
    os: { type: String, default: 'unknown' },
    browser: { type: String, default: 'unknown' },
    userAgent: { type: String, default: '' }
});

export default mongoose.model('Visitor', visitorSchema);
