import mongoose from "mongoose";

const LeadManagerSchema = new mongoose.Schema(
  {
    leadManagerId: Number,
    name: String,
    phone: String,
    email: String,
    website: String,
  },
  { _id: false }
);

const MarketMakerSchema = new mongoose.Schema(
  {
    marketMakerId: Number,
    name: String,
  },
  { _id: false }
);

const LotSizeSchema = new mongoose.Schema(
  {
    name: String,
    lot: Number,
    shares: Number,
    price: String,
  },
  { _id: false }
);

const RegistrarSchema = new mongoose.Schema(
  {
    name: String,
    phone: String,
    email: String,
    website: String,
  },
  { _id: false }
);

const TimeLineSchema = new mongoose.Schema(
  {
    startDate: String,
    endDate: String,
    allotmentDate: String,
    refundDate: String,
    creditShareDate: String,
    listingDate: String,
  },
  { _id: false }
);

const PromoterHoldingSchema = new mongoose.Schema(
  {
    preIssue: String,
    postIssue: String,
    promoterNames: [String],
  },
  { _id: false }
);

const ValuationSchema = new mongoose.Schema(
  {
    name: String,
    value: String,
  },
  { _id: false }
);

const IpoDetailsSchema = new mongoose.Schema(
  {
    ipoId: { type: Number, required: true, index: true },
    slug: { type: String, required: true, index: true }, // ❌ NOT unique

    companyName: String,
    companyLogo: String,
    type: { type: String, enum: ["MAINBOARD", "SME"] },
    exchanged: { type: String, enum: ["BOTH", "NSE", "BSE"] },
    issueType: { type: String, enum: ["IPO", "FPO"] },

    minimumPrice: Number,
    maximumPrice: Number,
    faceValue: Number,
    lotSize: Number,

    ipoType: String,

    shareHoldingPreIssue: Number,
    shareHoldingPostIssue: Number,

    totalIssueShares: Number,
    totalIssuePrice: String,

    freshIssueShares: Number,
    freshIssuePrice: String,

    ofsIssueShares: Number,
    ofsIssuePrice: String,

    drhpLink: String,
    rhpLink: String,
    anchorListLink: String,

    financialInformation: String,
    about: String,
    strength: String,
    risk: String,
    objectives: String,
    companyAddress: String,

    timeLine: TimeLineSchema,
    registrar: RegistrarSchema,

    gmpPrice: Number,

    leadMangers: [LeadManagerSchema],
    marketMaker: [MarketMakerSchema],
    lotSizes: [LotSizeSchema],

    promoterHolding: PromoterHoldingSchema,
    valuations: [ValuationSchema],
  },
  { timestamps: true }
);

// ✅ one detail per ipoId
IpoDetailsSchema.index({ ipoId: 1 }, { unique: true });

export default mongoose.model("IpoDetails", IpoDetailsSchema);
