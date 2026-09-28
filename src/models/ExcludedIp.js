import mongoose from 'mongoose';

/**
 * IPs whose visits are neither counted nor stored — the site owner's own machines,
 * office connections, monitoring probes. An address listed here is dropped at the
 * tracking endpoint before any record is written, and its existing visitor row is
 * removed when it is added.
 */
const excludedIpSchema = new mongoose.Schema(
    {
        ip: { type: String, required: true, unique: true, trim: true },
        note: { type: String, default: '', trim: true },
        addedBy: { type: String, default: '' },
    },
    { timestamps: true }
);

export default mongoose.model('ExcludedIp', excludedIpSchema);
