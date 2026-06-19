import mongoose from 'mongoose';

const visitorSchema = new mongoose.Schema({
    ip: { type: String, required: true, unique: true },
    lastVisit: { type: Date, default: Date.now },
    visitCount: { type: Number, default: 1 },
    deviceType: { type: String, default: 'unknown' }, // mobile | tablet | desktop | unknown
    deviceModel: { type: String, default: '' },       // e.g. "Samsung SM-G991B", "iPhone", "Redmi Note 11"
    os: { type: String, default: 'unknown' },
    browser: { type: String, default: 'unknown' },
    userAgent: { type: String, default: '' },
    country: { type: String, default: '' },
    countryCode: { type: String, default: '' },
    city: { type: String, default: '' },
    isp: { type: String, default: '' }
});

export default mongoose.model('Visitor', visitorSchema);
