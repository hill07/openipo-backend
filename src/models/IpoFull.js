import mongoose from "mongoose";

/* ---------- Sub Schemas ---------- */

const subscriptionDaySchema = new mongoose.Schema({
    day: String,
    date: Date,
    qib: Number,
    retail: Number,
    hni: Number,
    shni: Number,
    bhni: Number,
    total: Number
});

const gmpHistorySchema = new mongoose.Schema({
    date: Date,
    gmp: Number,
    updatedAt: { type: Date, default: Date.now }
});

/* ---------- Main Schema ---------- */

const ipoFullSchema = new mongoose.Schema({

    /* ===== Identity ===== */

    ipoId: { type: Number, unique: true, required: true },

    slug: { type: String, unique: true, required: true, index: true },

    isPublished: { type: Boolean, default: false, index: true },


    /* ===== Basic ===== */

    companyName: { type: String, required: true },

    logo: String,

    type: { type: String, enum: ["MAINBOARD", "SME"], default: "MAINBOARD" },

    issueType: { type: String, enum: ["IPO", "FPO"], default: "IPO" },


    symbol: {
        nse: { type: String, default: "" },
        bse: { type: String, default: "" },
    },

    exchanges: [String],

    /* ===== Dates ===== */

    dates: {
        open: Date,
        close: Date,
        allotment: Date,
        listing: Date
    },

    allotment: {
        isAllotted: { type: Boolean, default: false },
        allotmentLink: String
    },

    status: {
        type: String,
        enum: ["UPCOMING", "OPEN", "CLOSED", "ALLOTMENT", "LISTED"],
        default: "UPCOMING"
    },

    /* ===== Pricing ===== */

    lotSize: Number,

    priceBand: {
        min: Number,
        max: Number
    },

    minInvestment: Number,

    issueSize: {
        cr: Number,
        shares: Number
    },

    faceValue: Number,

    issueBreakdown: {
        total: { cr: Number, shares: Number },
        fresh: { cr: Number, shares: Number },
        ofs: { cr: Number, shares: Number }
    },

    shareHolding: {
        pre: Number,
        post: Number
    },

    listingAt: [String],
    marketMaker: String,
    registrar: String,
    registrarAddress: String,
    leadManagers: [String],

    /* ===== GMP ===== */

    gmp: {
        current: { type: Number, default: 0 },
        percent: Number,
        estListingPrice: Number,
        lastUpdatedAtText: String,
        source: String,
        history: [gmpHistorySchema]
    },

    /* ===== Subscription ===== */

    subscription: {
        updatedAtText: String,
        source: String,

        days: [subscriptionDaySchema],

        summary: {
            qib: Number,
            retail: Number,
            hni: Number,
            shni: Number,
            bhni: Number,
            emp: Number,
            total: Number
        },

        categories: [{
            name: String,
            sharesOffered: Number,
            sharesBid: Number,
            subscriptionTimes: Number
        }]
    },

    /* ===== Reservation ===== */

    reservations: [{
        name: String,
        sharesOffered: Number,
        percentage: Number
    }],

    /* ===== Lot Distribution ===== */

    lotDistribution: [{
        category: String,
        lots: String,
        shares: String,
        amount: String,
        reserved: String
    }],

    limits: {
        retail: { minLots: Number, maxLots: Number },
        shni: { minLots: Number, maxLots: Number },
        bhni: { minLots: Number, maxLots: Number }
    },

    /* ===== Financials (₹ Crore) ===== */

    financials: {
        table: [{
            period: String,
            assets: Number,
            totalIncome: Number,
            pat: Number,
            ebitda: Number,
            netWorth: Number,
            reservesSurplus: Number,
            totalBorrowing: Number
        }],

        kpis: [{
            period: String,
            roe: Number,
            roce: Number,
            eps: Number,
            pePre: Number,
            pePost: Number,
            ronw: Number
        }]
    },

    /* ===== Content ===== */

    promoters: [String],

    peers: [{
        name: String,
        cmp: Number,
        pe: Number,
        roe: Number
    }],

    objectives: [String],

    description: String,
    strengths: [String],
    weaknesses: [String],
    address: String,

    /* ===== Documents ===== */

    docs: {
        drhp: String,
        rhp: String,
        anchor: String,
        boa: String,
        applyLink: String
    },

    /* ===== SEO ===== */

    seo: {
        title: String,
        description: String,
        keywords: [String]
    },

    sources: {
        gmp: String,
        subscription: String,
        financials: String
    },

    /* ===== Meta ===== */

    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "Admin" },
    updatedByEmail: String,

    isDeleted: { type: Boolean, default: false, index: true },
    deletedAt: Date

}, {
    timestamps: true
});

/* Text Index */

ipoFullSchema.index({
    companyName: "text",
    "symbol.nse": "text",
    "symbol.bse": "text"
});

export default mongoose.model("IpoFull", ipoFullSchema);
