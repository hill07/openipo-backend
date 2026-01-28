import jwt from 'jsonwebtoken';
import Admin from '../models/Admin.js';
import dotenv from 'dotenv';

dotenv.config();

export const protectAdmin = async (req, res, next) => {
    let token;

    if (req.cookies && req.cookies.admin_token) {
        token = req.cookies.admin_token;
    }

    if (!token) {
        return res.status(401).json({ success: false, message: 'Not authorized, no token' });
    }

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);

        // Select logic remains same as old file
        const admin = await Admin.findById(decoded.id).select('-passwordHash -twoFactorSecretEncrypted -twoFactorBackupCodes');

        if (!admin) {
            return res.status(401).json({ success: false, message: 'Not authorized, admin not found' });
        }

        if (!admin.isActive) {
            return res.status(403).json({ success: false, message: 'Admin account is deactivated' });
        }

        if (decoded.scope !== 'full_access') {
            return res.status(401).json({ success: false, message: '2FA verification required' });
        }

        req.admin = admin;
        next();
    } catch (error) {
        console.error("Admin Auth Error:", error.message);
        return res.status(401).json({ success: false, message: 'Not authorized, token failed' });
    }
};
