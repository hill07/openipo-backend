import mongoose from 'mongoose';

const alertSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    ipoSlug: {
        type: String,
        required: true
    },
    ipoName: {
        type: String,
        required: true
    }
}, { timestamps: true });

// Ensure a user can only have one alert per IPO
alertSchema.index({ userId: 1, ipoSlug: 1 }, { unique: true });

export default mongoose.model('Alert', alertSchema);
