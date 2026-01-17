import mongoose from "mongoose";
import dotenv from "dotenv";
import bcrypt from "bcryptjs";
import User from "../models/user.model.js";
import connectDB from "../config/db.js";

dotenv.config();

async function createAdmin() {
  try {
    console.log("🔌 Connecting to MongoDB...");
    await connectDB();

    const email = process.env.ADMIN_EMAIL || "admin@openipo.com";
    const password = process.env.ADMIN_PASSWORD || "admin123";
    const name = process.env.ADMIN_NAME || "Admin User";

    // Check if admin already exists
    const existingAdmin = await User.findOne({ email });
    if (existingAdmin) {
      if (existingAdmin.role === "admin") {
        console.log(`⚠️  Admin user already exists with email: ${email}`);
        console.log("   To change password, delete the user first or update manually.");
        process.exit(0);
      } else {
        // Update existing user to admin
        const salt = await bcrypt.genSalt(10);
        const passwordHash = await bcrypt.hash(password, salt);
        
        existingAdmin.passwordHash = passwordHash;
        existingAdmin.role = "admin";
        existingAdmin.name = name;
        existingAdmin.isActive = true;
        await existingAdmin.save();
        
        console.log(`✅ Updated existing user to admin role`);
        console.log(`   Email: ${email}`);
        console.log(`   Password: ${password}`);
        process.exit(0);
      }
    }

    // Hash password
    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

    // Create admin user
    const admin = await User.create({
      name,
      email,
      passwordHash,
      role: "admin",
      isActive: true
    });

    console.log("✅ Admin user created successfully!");
    console.log("\n📋 Admin Credentials:");
    console.log(`   Email: ${email}`);
    console.log(`   Password: ${password}`);
    console.log(`   Name: ${name}`);
    console.log("\n⚠️  IMPORTANT: Change the default password after first login!");
    console.log("\n🔗 Login URL: http://localhost:3000/admin/login");

    process.exit(0);
  } catch (error) {
    console.error("❌ Error creating admin user:", error);
    process.exit(1);
  }
}

createAdmin();
