import mongoose from "mongoose";

const GmpRowSchema = new mongoose.Schema(
  {
    ipoPrice: Number,
    gmpDate: String,
    gmpPrice: Number,
    sub2SaudaRate: String,
    lastUpdate: String,
    estimatedListingPrice: String,
    estimatedListingPercentage: String,
  },
  { _id: false }
);

const IpoGmpSchema = new mongoose.Schema(
  {
    ipoId: { type: Number, required: true, index: true },
    slug: { type: String, required: true, index: true }, // ❌ not unique

    gmpHistory: [GmpRowSchema],
  },
  { timestamps: true }
);

IpoGmpSchema.index({ ipoId: 1 }, { unique: true });

export default mongoose.model("IpoGmp", IpoGmpSchema);
