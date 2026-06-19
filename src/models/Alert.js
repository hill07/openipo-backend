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
// Lookups by IPO slug (alert scheduler) and by user (profile alerts list)
alertSchema.index({ ipoSlug: 1 });

export default mongoose.model('Alert', alertSchema);
