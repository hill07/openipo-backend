import mongoose from 'mongoose';

const adminAuditLogSchema = new mongoose.Schema({
    adminId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Admin',
        required: true
    },
    action: {
        type: String,
        required: true,
        index: true
    },
    ip: {
        type: String,
        default: 'unknown'
    },
    userAgent: {
        type: String,
        default: 'unknown'
    },
    meta: {
        type: mongoose.Schema.Types.Mixed,
        default: {}
    }
}, {
    timestamps: true
});

// Index for easier searching of history
adminAuditLogSchema.index({ adminId: 1, createdAt: -1 });

export default mongoose.model('AdminAuditLog', adminAuditLogSchema);
