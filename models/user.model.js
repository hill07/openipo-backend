import mongoose from "mongoose";

const UserSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true
    },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      index: true
    },
    passwordHash: {
      type: String,
      required: true
    },
    watchlist: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: "IPO"
    }],
    alerts: [{
      ipoId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "IPO"
      },
      type: {
        type: String,
        enum: ["opens_tomorrow", "closes_today", "gmp_change", "subscription_threshold", "listing"]
      },
      threshold: Number, // for subscription threshold
      isActive: { type: Boolean, default: true }
    }],
    preferences: {
      emailNotifications: { type: Boolean, default: true },
      alertFrequency: { type: String, enum: ["instant", "daily", "weekly"], default: "daily" }
    },
    lastLogin: Date,
    isActive: { type: Boolean, default: true },
    role: {
      type: String,
      enum: ["user", "admin"],
      default: "user"
    }
  },
  { timestamps: true }
);

UserSchema.index({ email: 1 });
UserSchema.index({ watchlist: 1 });

const User = mongoose.model("User", UserSchema);
export default User;