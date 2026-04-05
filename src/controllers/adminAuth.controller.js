import Admin from '../models/Admin.js';
import jwt from 'jsonwebtoken';
import { authenticator } from "otplib";
import QRCode from "qrcode";
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { encrypt, decrypt } from '../utils/encryption.js';
import { logAdminAction } from '../utils/auditLogger.js';

// Generate Access Token (HttpOnly Cookie) - Full Access
const generateToken = (res, adminId) => {
    const token = jwt.sign({ id: adminId, scope: 'full_access' }, process.env.JWT_SECRET, {
        expiresIn: '12h', // 12 hours session
    });

    const cookieOptions = {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax', // Use 'none' for cross-site prod, 'lax' for local
        maxAge: 12 * 60 * 60 * 1000,
    };

    // Only set domain in production to avoid issues with localhost
    if (process.env.NODE_ENV === 'production') {
        cookieOptions.domain = '.openipo.in';
    }

    res.cookie('admin_token', token, cookieOptions);
};

// @desc    Step 1: Login with Email & Password
// @route   POST /api/admin/auth/login
// @access  Public
export const loginStep1 = async (req, res, next) => {
    try {
        const { email, password } = req.body;

        // 1. Check admin logic
        const admin = await Admin.findOne({ email });

        // Brute force check could go here (failedLoginCount)

        if (admin && (await admin.matchPassword(password))) {

            if (!admin.isActive) return res.status(403).json({ message: "Account disabled" });

            // Check if 2FA is enabled
            if (!admin.twoFactorEnabled) {
                // If 2FA NOT enabled, we might force them to setup, OR for this specific request "No admin route should work without completing 2FA".
                // But how do they setup 2FA if they can't login?
                // Usually: Login -> If NO 2FA -> Redirect to Setup Page (with a temp token)
                // If YES 2FA -> Redirect to Verify Page (with a temp token)

                // Generate TEMP token (short lived, limited scope)
                const jwtSecret = process.env.JWT_SECRET || "fallback_secret_for_development";
                const tempToken = jwt.sign({ id: admin._id, scope: 'pre_2fa' }, jwtSecret, { expiresIn: '5m' });

                await logAdminAction(admin._id, 'LOGIN_STEP1_SUCCESS', req, { message: "2FA not enabled yet" });

                return res.json({
                    step: 'setup_2fa',
                    tempToken,
                    message: 'Please complete 2FA setup'
                });
            }

            // 2FA Enabled -> returning temp token for verification
            const jwtSecret = process.env.JWT_SECRET || "fallback_secret_for_development";
            const tempToken = jwt.sign({ id: admin._id, scope: 'pre_2fa' }, jwtSecret, { expiresIn: '5m' });

            await logAdminAction(admin._id, 'LOGIN_STEP1_SUCCESS', req, { message: "Proceed to 2FA" });

            return res.json({
                step: 'verify_2fa',
                tempToken,
                message: 'Enter 2FA Code'
            });

        } else {
            // Log failed attempt if admin exists (or just generic log)
            if (admin) {
                admin.failedLoginCount += 1;
                await admin.save();
                await logAdminAction(admin._id, 'LOGIN_FAILED', req);
            }
            return res.status(401).json({ message: 'Invalid credentials' });
        }
    } catch (err) {
        next(err);
    }
};

// @desc    Step 2: Verify 2FA OTP
// @route   POST /api/admin/auth/verify-2fa
// @access  Public (requires tempToken in body or header, but logic handles it)
export const verify2FA = async (req, res, next) => {
    try {
        const { token, tempToken } = req.body; // token is OTP, tempToken is JWT

        if (!tempToken) return res.status(401).json({ message: "Missing session token" });

        // Verify temp token
        let decoded;
        try {
            const jwtSecret = process.env.JWT_SECRET || "fallback_secret_for_development";
            decoded = jwt.verify(tempToken, jwtSecret);
            if (decoded.scope !== 'pre_2fa') return res.status(401).json({ message: "Invalid token scope" });
        } catch (e) {
            return res.status(401).json({ message: "Session expired" });
        }

        const admin = await Admin.findById(decoded.id).select('+twoFactorSecretEncrypted +twoFactorBackupCodes');
        if (!admin) return res.status(404).json({ message: "Admin not found" });

        // Decrypt secret
        if (!admin.twoFactorSecretEncrypted) return res.status(400).json({ message: "2FA not set up" });

        const enc = admin.twoFactorSecretEncrypted;
        if (typeof enc !== 'string' || !enc.includes(':')) {
            return res.status(400).json({ message: "Invalid 2FA secret storage; re-run 2FA setup." });
        }

        const secret = decrypt(enc);
        if (secret == null || typeof secret !== 'string' || !secret.trim()) {
            return res.status(500).json({
                message:
                    'Could not decrypt 2FA secret. Set ENCRYPTION_KEY to exactly 32 ASCII characters in .env and restart the server. It must match the key used when 2FA was first enabled.',
            });
        }

        const rawCode = String(token ?? '').replace(/\s/g, '');
        if (!rawCode) {
            return res.status(400).json({ message: 'Enter your 2FA code or a backup code.' });
        }

        // TOTP is 6 digits; backup codes are separate format
        let isValid = false;
        try {
            isValid = /^\d{6}$/.test(rawCode) && authenticator.check(rawCode, secret);
        } catch (otpErr) {
            console.error("OTP check error in verify2FA:", otpErr.message);
            return res.status(500).json({ message: "2FA verification failed internally. Please re-setup 2FA." });
        }

        let usedBackup = false;
        if (!isValid) {
            usedBackup = await admin.verifyBackupCode(rawCode);
        }

        if (isValid || usedBackup) {
            // SUCCESS
            admin.lastLoginAt = new Date();
            admin.lastLoginIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
            admin.failedLoginCount = 0;
            await admin.save();

            // Issue final cookies
            generateToken(res, admin._id);

            await logAdminAction(admin._id, 'LOGIN_SUCCESS', req, { method: usedBackup ? 'backup_code' : 'otp' });

            return res.json({ success: true, message: "Logged in successfully" });
        } else {
            await logAdminAction(admin._id, '2FA_FAILED', req);
            return res.status(401).json({ message: "Invalid OTP code" });
        }
    } catch (err) {
        next(err);
    }
};

// @desc    Logout
// @route   POST /api/admin/auth/logout
export const logout = async (req, res) => {
    const cookieOptions = {
        httpOnly: true,
        expires: new Date(0)
    };

    if (process.env.NODE_ENV === 'production') {
        cookieOptions.domain = '.openipo.in';
    }

    res.cookie('admin_token', '', cookieOptions);
    if (req.admin) {
        await logAdminAction(req.admin._id, 'LOGOUT', req);
    }
    return res.json({ message: "Logged out" });
};

// @desc    Get Current Admin
// @route   GET /api/admin/auth/me
// @access  Private
export const getMe = async (req, res) => {
    res.json(req.admin);
};

// @desc    Setup 2FA (Generate QR)
// @route   POST /api/admin/auth/setup-2fa
// @access  Private (Valid Token with full_access OR pre_2fa if strictly enforcing setup flow)
export const setup2FA = async (req, res, next) => {
    try {
        // Determine admin. Either from req.admin (if fully logged in) OR verify tempToken
        let adminId;

        // If user is already logged in (modifying 2FA)
        if (req.admin) {
            adminId = req.admin._id;
        } else {
            // If coming from Step 1 (Force Setup)
            const { tempToken } = req.body;
            if (!tempToken) return res.status(401).json({ message: "Unlock token required" });
            const jwtSecret = process.env.JWT_SECRET || "fallback_secret_for_development";
            const decoded = jwt.verify(tempToken, jwtSecret);
            adminId = decoded.id;
        }

        const admin = await Admin.findById(adminId);
        if (!admin) return res.status(404).json({ message: "Admin not found" });

        // Generate Secret
        const secret = authenticator.generateSecret();
        const otpauth = authenticator.keyuri(admin.email, 'OpenIPO Admin', secret);

        // Save Secret Temporarily? 
        // Requirement says: "stores secret temporarily until verified"
        // We can store it in DB but maybe mark 'twoFactorEnabled: false' until confirmed.
        // Ideally we store it encrypted.

        admin.twoFactorSecretEncrypted = encrypt(secret);
        await admin.save();

        // Generate QR
        const qrCodeUrl = await QRCode.toDataURL(otpauth);

        await logAdminAction(admin._id, '2FA_SETUP_INIT', req);

        res.json({ secret, qrCodeUrl }); // Send secret so they can manually type if needed
    } catch (err) {
        next(err);
    }
};

// @desc    Confirm 2FA Setup
// @route   POST /api/admin/2fa/confirm
export const confirm2FA = async (req, res, next) => {
    try {
        const { token, tempToken } = req.body; // token = OTP

        let adminId;
        // Determine context (logged in vs setup flow)
        if (req.cookies && req.cookies.admin_token) {
            // Verify cookie? Actually 'protectAdmin' middleware handles this usually.
            // If we are calling this endpoint, we might assume protectAdmin OR manual check if coming from pre_2fa
            // For simplicity let's handle "pre_2fa" token if cookie missing
            try {
                const jwtSecret = process.env.JWT_SECRET || "fallback_secret_for_development";
                const decoded = jwt.verify(req.cookies.admin_token, jwtSecret);
                adminId = decoded.id;
            } catch (e) {
                // fall back to tempToken
            }
        }

        if (!adminId && tempToken) {
            const jwtSecret = process.env.JWT_SECRET || "fallback_secret_for_development";
            const decoded = jwt.verify(tempToken, jwtSecret);
            adminId = decoded.id;
        }

        if (!adminId) return res.status(401).json({ message: "Unauthorized" });

        const admin = await Admin.findById(adminId).select('+twoFactorSecretEncrypted');

        // Decrypt
        if (!admin.twoFactorSecretEncrypted) {
            return res.status(400).json({ message: "2FA secret not found. Please re-run 2FA setup." });
        }

        const secret = decrypt(admin.twoFactorSecretEncrypted);
        if (!secret || typeof secret !== 'string' || !secret.trim()) {
            return res.status(500).json({
                message: 'Could not decrypt 2FA secret. Ensure ENCRYPTION_KEY in .env is exactly 32 characters and matches the key used during 2FA setup.'
            });
        }

        // Verify OTP
        let isValid = false;
        try {
            isValid = authenticator.check(String(token ?? '').replace(/\s/g, ''), secret);
        } catch (otpErr) {
            console.error("OTP verification error:", otpErr.message);
            return res.status(500).json({ message: "2FA verification failed internally. Please re-setup 2FA." });
        }

        if (!isValid) return res.status(400).json({ message: "Invalid OTP" });

        // Enable & Generate Backup Codes
        admin.twoFactorEnabled = true;
        admin.twoFactorVerifiedAt = new Date();

        // Generate 10 backup codes
        const backupCodes = Array.from({ length: 10 }, () => crypto.randomBytes(4).toString('hex').toUpperCase());

        // Hash backup codes
        const hashedCodes = await Promise.all(backupCodes.map(code => bcrypt.hash(code, 10)));

        admin.twoFactorBackupCodes = hashedCodes;

        // Update Login Stats since they are now effectively logged in
        admin.lastLoginAt = new Date();
        admin.lastLoginIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress;

        await admin.save();

        await logAdminAction(admin._id, '2FA_SETUP_COMPLETE', req);

        // If they just finished setup, they might need to be "logged in" fully now? 
        // Or we ask them to login again? 
        // User flow: "if otp correct -> set JWT session cookie"
        generateToken(res, adminId);

        return res.json({
            success: true,
            backupCodes,
            message: "2FA Enabled & Backup Codes Generated. Save them now!"
        });

    } catch (err) {
        next(err);
    }
}

// @desc    Change Password
// @route   PUT /api/admin/auth/password
// @access  Private
export const changePassword = async (req, res, next) => {
    try {
        const { currentPassword, newPassword } = req.body;
        const admin = await Admin.findById(req.admin._id).select('+passwordHash');

        if (!(await admin.matchPassword(currentPassword))) {
            return res.status(401).json({ message: 'Incorrect current password' });
        }

        const salt = await bcrypt.genSalt(10);
        admin.passwordHash = await bcrypt.hash(newPassword, salt);
        admin.passwordChangedAt = new Date();

        await admin.save();
        await logAdminAction(admin._id, 'PASSWORD_CHANGE', req);

        res.json({ message: 'Password updated successfully' });
    } catch (err) {
        next(err);
    }
};
