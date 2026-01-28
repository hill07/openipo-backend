import AdminAuditLog from '../models/AdminAuditLog.js';

/**
 * Logs an admin action to the database
 * @param {string|ObjectId} adminId - The ID of the admin performing the action
 * @param {string} action - The action type (e.g., 'LOGIN_SUCCESS', 'CREATE_IPO')
 * @param {Object} req - The Express request object (to extract IP and UserAgent)
 * @param {Object} [meta={}] - Additional metadata to store
 */
export const logAdminAction = async (adminId, action, req, meta = {}) => {
    try {
        const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown';
        const userAgent = req.headers['user-agent'] || 'unknown';

        await AdminAuditLog.create({
            adminId,
            action,
            ip,
            userAgent,
            meta
        });
    } catch (error) {
        // Fail silently to appropriate logging service in prod, but console in dev
        console.error("❌ Failed to log admin action:", error);
    }
};
