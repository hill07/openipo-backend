import mongoose from "mongoose";
import dotenv from "dotenv";
import bcrypt from "bcrypt";

// ✅ Update path if your folder structure differs
import Admin from "../models/Admin.js";

dotenv.config();

async function seedAdmin() {
  try {
    const { MONGO_URI, ADMIN_EMAIL, ADMIN_PASSWORD } = process.env;

    if (!MONGO_URI) {
      console.error("❌ MONGO_URI missing in .env");
      process.exit(1);
    }

    if (!ADMIN_EMAIL || !ADMIN_PASSWORD) {
      console.error("❌ ADMIN_EMAIL or ADMIN_PASSWORD missing in .env");
      console.log("✅ Add these in backend/.env:");
      console.log("ADMIN_EMAIL=admin@openipo.com");
      console.log("ADMIN_PASSWORD=StrongPassword123!");
      process.exit(1);
    }

    await mongoose.connect(MONGO_URI);
    console.log("✅ MongoDB connected");

    // ✅ Check if admin already exists
    const existing = await Admin.findOne({ email: ADMIN_EMAIL.toLowerCase() });

    if (existing) {
      console.log("⚠️ Admin already exists:", existing.email);
      console.log("✅ Seed skipped (no changes made).");
      process.exit(0);
    }

    // ✅ Hash password
    const saltRounds = 12;
    const passwordHash = await bcrypt.hash(ADMIN_PASSWORD, saltRounds);

    // ✅ Create SUPER_ADMIN
    const admin = await Admin.create({
      email: ADMIN_EMAIL.toLowerCase(),
      passwordHash,
      role: "SUPER_ADMIN",
      isActive: true,

      // ✅ 2FA initially disabled (admin will enable it after login)
      twoFactorEnabled: false,
      twoFactorSecretEncrypted: null,
      twoFactorBackupCodes: [],
      twoFactorVerifiedAt: null,

      failedLoginCount: 0,
      lockUntil: null,
    });

    console.log("✅ SUPER_ADMIN created successfully!");
    console.log("Email:", admin.email);
    console.log("Role:", admin.role);
    console.log("2FA Enabled:", admin.twoFactorEnabled);

    process.exit(0);
  } catch (err) {
    console.error("❌ seedAdmin failed:", err.message);
    process.exit(1);
  }
}

seedAdmin();
