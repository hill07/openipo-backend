import mongoose from "mongoose";

const BasisOfAllotmentSchema = new mongoose.Schema(
  {
    ipoId: { type: Number, required: true, index: true },
    slug: { type: String, required: true, index: true }, // ❌ not unique

    companyName: String,
    companyLogo: String,
    type: String,
    exchanged: String,
    issueType: String,

    startDate: String,
    endDate: String,
    allotmentDate: String,
    listingDate: String,

    lotSize: Number,
    minimumPrice: Number,
    maximumPrice: Number,

    basicOfAllotment: String,
  },
  { timestamps: true }
);

BasisOfAllotmentSchema.index({ ipoId: 1 }, { unique: true });

export default mongoose.model("BasisOfAllotment", BasisOfAllotmentSchema);
