import mongoose from 'mongoose';

const visitorSchema = new mongoose.Schema({
    ip: { type: String, required: true, unique: true },
    lastVisit: { type: Date, default: Date.now },
    visitCount: { type: Number, default: 1 }
});

export default mongoose.model('Visitor', visitorSchema);
