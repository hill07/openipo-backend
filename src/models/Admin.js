import mongoose from "mongoose";
import bcrypt from "bcryptjs";

const AdminSchema = new mongoose.Schema(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true },

    role: { type: String, enum: ["ADMIN", "SUPER_ADMIN"], default: "ADMIN" },
    isActive: { type: Boolean, default: true },

    // ✅ 2FA
    twoFactorEnabled: { type: Boolean, default: false },
    twoFactorSecretEncrypted: { type: String, default: null },
    twoFactorBackupCodes: { type: [String], default: [] },
    twoFactorVerifiedAt: { type: Date, default: null },

    // ✅ Security
    lastLoginAt: { type: Date, default: null },
    lastLoginIp: { type: String, default: null },
    failedLoginCount: { type: Number, default: 0 },
    lockUntil: { type: Date, default: null },
    passwordChangedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

// Method to verify password
AdminSchema.methods.matchPassword = async function (enteredPassword) {
  return await bcrypt.compare(enteredPassword, this.passwordHash);
};

// Method to verify backup code
AdminSchema.methods.verifyBackupCode = async function (code) {
  for (let hashedCode of this.twoFactorBackupCodes) {
    if (await bcrypt.compare(code, hashedCode)) {
      this.twoFactorBackupCodes = this.twoFactorBackupCodes.filter(c => c !== hashedCode);
      await this.save();
      return true;
    }
  }
  return false;
};

export default mongoose.model("Admin", AdminSchema);
