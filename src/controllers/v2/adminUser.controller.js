import bcrypt from 'bcrypt';
import User from '../../models/User.js';
import { responseHandler } from '../../utils/responseHandler.js';
import logger from '../../utils/logger.js';

/** Matches the cost used when a user registers, so admin-set passwords verify identically. */
const SALT_ROUNDS = 10;
const MIN_PASSWORD_LENGTH = 8;

/** Never send the password hash or the OTP to the browser. */
const SAFE_FIELDS = 'name email mobileNumber isVerified createdAt updatedAt';

export const getUsers = async (req, res, next) => {
    try {
        const page = Math.max(1, parseInt(req.query.page) || 1);
        const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 25));
        const skip = (page - 1) * limit;
        const search = String(req.query.search || '').trim();

        // Escaped so a search for "a.b" cannot be read as a pattern.
        const filter = search
            ? {
                  $or: [
                      { name: { $regex: search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' } },
                      { email: { $regex: search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' } },
                      { mobileNumber: { $regex: search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' } },
                  ],
              }
            : {};

        const [users, total] = await Promise.all([
            User.find(filter).select(SAFE_FIELDS).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
            User.countDocuments(filter),
        ]);

        return responseHandler(res, 200, true, {
            users,
            total,
            page,
            pages: Math.ceil(total / limit) || 1,
        });
    } catch (error) {
        next(error);
    }
};

/**
 * Set a site user's password on their behalf.
 *
 * Support requests ("I cannot log in") are the reason this exists. The new password is
 * hashed with the same cost as registration, never logged, and any pending OTP is
 * cleared so an old reset link cannot be used afterwards.
 */
export const setUserPassword = async (req, res, next) => {
    try {
        const { password } = req.body || {};

        if (typeof password !== 'string' || password.trim().length < MIN_PASSWORD_LENGTH) {
            return responseHandler(res, 400, false, null, `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
        }

        const user = await User.findById(req.params.id);
        if (!user) return responseHandler(res, 404, false, null, 'User not found.');

        user.password = await bcrypt.hash(password.trim(), SALT_ROUNDS);
        user.otp = null;
        user.otpExpires = null;
        await user.save();

        // The admin's identity and the target are worth recording; the password is not.
        logger.info(`[admin] password reset for ${user.email} by ${req.admin?.email || 'admin'}`);

        return responseHandler(res, 200, true, { id: user._id, email: user.email }, 'Password updated.');
    } catch (error) {
        next(error);
    }
};

/**
 * Remove a site user. Irreversible, so the client asks for confirmation first; the
 * deletion is logged with the admin who performed it.
 */
export const deleteUser = async (req, res, next) => {
    try {
        const user = await User.findByIdAndDelete(req.params.id);
        if (!user) return responseHandler(res, 404, false, null, 'User not found.');

        logger.info(`[admin] deleted user ${user.email} by ${req.admin?.email || 'admin'}`);
        return responseHandler(res, 200, true, { id: user._id, email: user.email }, 'User deleted.');
    } catch (error) {
        next(error);
    }
};
