import mongoose from "mongoose";
import mongooseLeanVirtuals from "mongoose-lean-virtuals";

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

const subscriptionCategorySchema = new mongoose.Schema({
    enabled: { type: Boolean, default: true },
    category: String,
    sharesOffered: Number,
    appliedShares: Number,
    // Some issues (BSE SME especially) are only ever published as a MULTIPLE, with no
    // share counts anywhere: the exchange reports 0 offered and we hold no prospectus
    // reservation. Storing the reported multiple lets those IPOs show a correct, real
    // subscription figure instead of nothing, while Offered/Bids stay blank because we
    // genuinely do not know them.
    timesReported: Number,
    // Set on a breakdown row (sNII / bNII sit under NII). Sub-rows are displayed but
    // excluded from every total, or the parent's shares would be counted twice.
    parent: String
}, { toJSON: { virtuals: true }, toObject: { virtuals: true } });

subscriptionCategorySchema.virtual('times').get(function () {
    if (this.sharesOffered && this.appliedShares) return this.appliedShares / this.sharesOffered;
    return this.timesReported || 0;
});

const reservationSchema = new mongoose.Schema({
    enabled: { type: Boolean, default: true },
    category: String,        // Retail, QIB, HNI, Employee, Shareholder, Policyholder, MarketMaker
    sharesOffered: Number,
    anchorShares: Number     // only when category === "QIB"
}, { toJSON: { virtuals: true }, toObject: { virtuals: true } });

reservationSchema.virtual('percentage').get(function () {
    // Access parent document (IpoFull)
    const ipo = this.ownerDocument ? this.ownerDocument() : this.parent();
    if (!ipo || !ipo.totalIssueShares) return 0;
    return (this.sharesOffered / ipo.totalIssueShares) * 100;
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
        lastUpdatedAtText: String,
        history: [gmpHistorySchema]
    },

    /* ===== Subscription ===== */

    subscription: {
        updatedAtText: String,
        source: String,

        // Overall multiple as published, for issues where no share counts exist.
        totalTimesReported: Number,

        days: [subscriptionDaySchema],

        // REMOVED: summary (dynamic calculation only)

        categories: [subscriptionCategorySchema]
    },

    /* ===== Reservation ===== */

    reservations: [reservationSchema],

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
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
});

/* Virtuals */

ipoFullSchema.virtual('totalIssueShares').get(function () {
    if (!this.reservations) return 0;
    return this.reservations.reduce((sum, r) => (r.enabled && r.sharesOffered) ? sum + r.sharesOffered : sum, 0);
});

ipoFullSchema.virtual('subscription.totalTimes').get(function () {
    if (!this.subscription || !this.subscription.categories) return 0;

    // Sum enabled categories
    const totalOffered = this.subscription.categories.reduce((sum, c) => (c.enabled && !c.parent && c.sharesOffered) ? sum + c.sharesOffered : sum, 0);
    const totalApplied = this.subscription.categories.reduce((sum, c) => (c.enabled && !c.parent && c.appliedShares) ? sum + c.appliedShares : sum, 0);

    // No share counts anywhere: fall back to the overall multiple as published.
    // Never average the category multiples — they are weighted by reservation size.
    if (!totalOffered) return this.subscription.totalTimesReported || 0;
    return totalApplied / totalOffered;
});

ipoFullSchema.virtual('subscription.totalOffered').get(function () {
    if (!this.subscription || !this.subscription.categories) return 0;
    return this.subscription.categories.reduce((sum, c) => (c.enabled && !c.parent && c.sharesOffered) ? sum + c.sharesOffered : sum, 0);
});

ipoFullSchema.virtual('subscription.totalApplied').get(function () {
    if (!this.subscription || !this.subscription.categories) return 0;
    return this.subscription.categories.reduce((sum, c) => (c.enabled && !c.parent && c.appliedShares) ? sum + c.appliedShares : sum, 0);
});

ipoFullSchema.virtual('gmp.percent').get(function () {
    if (!this.gmp || !this.gmp.current || !this.priceBand?.max) return 0;
    return Number(((this.gmp.current / this.priceBand.max) * 100).toFixed(2));
});

ipoFullSchema.virtual('gmp.estListingPrice').get(function () {
    if (!this.gmp || !this.priceBand?.max) return 0;
    return this.priceBand.max + (this.gmp.current || 0);
});

/* Text Index */

ipoFullSchema.index({
    companyName: "text",
    "symbol.nse": "text",
    "symbol.bse": "text"
});

/* Indexes for the actual sort/filter keys used by the public + admin lists */
ipoFullSchema.index({ createdAt: -1 });
ipoFullSchema.index({ isPublished: 1, isDeleted: 1, "dates.open": -1 });

/* Enable virtuals on .lean({ virtuals: true }) reads */
ipoFullSchema.plugin(mongooseLeanVirtuals);

export default mongoose.model("IpoFull", ipoFullSchema);
