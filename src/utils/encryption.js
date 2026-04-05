import crypto from 'crypto';
import dotenv from 'dotenv';

dotenv.config();

const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY; // Must be 32 chars (32 bytes as UTF-8 ASCII)
const IV_LENGTH = 16; // For AES, this is always 16

function getKeyBuffer() {
    if (!ENCRYPTION_KEY || typeof ENCRYPTION_KEY !== 'string' || ENCRYPTION_KEY.length !== 32) {
        return null;
    }
    return Buffer.from(ENCRYPTION_KEY, 'utf8');
}

if (!getKeyBuffer()) {
    console.warn('⚠️ ENCRYPTION_KEY is missing or not exactly 32 characters. Admin 2FA encrypt/decrypt will fail.');
}

export const encrypt = (text) => {
    if (!text) return null;
    const keyBuf = getKeyBuffer();
    if (!keyBuf) return null;
    try {
        const iv = crypto.randomBytes(IV_LENGTH);
        const cipher = crypto.createCipheriv('aes-256-cbc', keyBuf, iv);
        let encrypted = cipher.update(text);
        encrypted = Buffer.concat([encrypted, cipher.final()]);
        return iv.toString('hex') + ':' + encrypted.toString('hex');
    } catch (error) {
        console.error("Encryption error:", error);
        return null;
    }
};

export const decrypt = (text) => {
    try {
        if (!text || typeof text !== 'string') return null;
        const keyBuf = getKeyBuffer();
        if (!keyBuf) {
            console.error("Decryption failed: ENCRYPTION_KEY is missing or invalid (must be exactly 32 ASCII characters).");
            return null;
        }

        const textParts = text.split(':');
        if (textParts.length < 2) return null;
        const ivHex = textParts.shift();
        const encHex = textParts.join(':');
        if (!ivHex || !encHex) return null;

        // Validate hex strings before passing to Buffer.from
        const hexRegex = /^[0-9a-fA-F]+$/;
        if (!hexRegex.test(ivHex) || !hexRegex.test(encHex)) {
            console.error("Decryption failed: stored value contains invalid hex data.");
            return null;
        }

        const iv = Buffer.from(ivHex, 'hex');
        const encryptedText = Buffer.from(encHex, 'hex');
        const decipher = crypto.createDecipheriv('aes-256-cbc', keyBuf, iv);
        let decrypted = decipher.update(encryptedText);
        decrypted = Buffer.concat([decrypted, decipher.final()]);
        const result = decrypted.toString();
        // Return null if decrypted value is empty
        return result && result.trim() ? result : null;
    } catch (error) {
        console.error("Decryption error:", error.message || error);
        return null;
    }
};
