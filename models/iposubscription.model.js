import mongoose from "mongoose";

const SubscriptionRowSchema = new mongoose.Schema(
  {
    name: String,
    shareOffered: Number,
    shareBid: Number,
    subscriptionTimes: String,
    totalAmount: String,
    subscriptionCategory: Number,
  },
  { _id: false }
);

const IpoSubscriptionSchema = new mongoose.Schema(
  {
    ipoId: { type: Number, required: true, index: true },
    slug: { type: String, required: true, index: true }, // ❌ not unique

    subscriptions: [SubscriptionRowSchema],
  },
  { timestamps: true }
);

IpoSubscriptionSchema.index({ ipoId: 1 }, { unique: true });

export default mongoose.model("IpoSubscription", IpoSubscriptionSchema);
