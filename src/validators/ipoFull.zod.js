import { z } from 'zod';

// Helper for optional numbers that might come as strings
const numeric = z.preprocess((a) => {
    if (typeof a === 'string') {
        if (a.trim() === '') return undefined;
        // Strip commas and then parse
        return parseFloat(a.replace(/,/g, ''));
    }
    return a;
}, z.number().optional().nullable());

// Helper for dates
const dateSchema = z.preprocess((arg) => {
    if (typeof arg === 'string' || arg instanceof Date) {
        if (arg === '') return undefined;
        return new Date(arg);
    }
    return arg;
}, z.date().optional().nullable());

const ipoFullSchema = z.object({
    // Identity
    ipoId: z.preprocess((a) => {
        if (typeof a === 'string') return parseFloat(a);
        return a;
    }, z.number().optional()),
    slug: z.string().optional(),
    isPublished: z.boolean().default(false),
    views: z.number().default(0),

    // Basic Info
    companyName: z.string().min(1, "Company Name is required"),
    logo: z.string().optional(),
    type: z.enum(['MAINBOARD', 'SME']).default('MAINBOARD'),
    issueType: z.enum(['IPO', 'FPO']).default('IPO'),

    // sector: z.string().optional(), // Removed by user
    // industry: z.string().optional(), // Removed by user

    symbol: z.object({
        nse: z.string().optional(),
        bse: z.string().optional()
    }).optional(),

    exchanges: z.array(z.string()).optional(),

    dates: z.object({
        open: dateSchema,
        close: dateSchema,
        allotment: dateSchema,
        listing: dateSchema
    }).optional(),

    allotment: z.object({
        isAllotted: z.boolean().default(false).optional(),
        allotmentLink: z.string().optional()
    }).optional(),

    status: z.enum(['UPCOMING', 'OPEN', 'CLOSED', 'ALLOTMENT', 'LISTED']).default('UPCOMING'),

    // Pricing
    lotSize: numeric,
    priceBand: z.object({
        min: numeric,
        max: numeric
    }).optional(),
    minInvestment: numeric,

    issueSize: z.object({
        cr: numeric,
        shares: numeric
    }).optional(),

    faceValue: numeric,

    issueBreakdown: z.object({
        total: z.object({ cr: numeric, shares: numeric }).optional(),
        fresh: z.object({ cr: numeric, shares: numeric }).optional(),
        ofs: z.object({ cr: numeric, shares: numeric }).optional()
    }).optional(),

    shareHolding: z.object({
        pre: numeric,
        post: numeric
    }).optional(),

    listingAt: z.array(z.string()).optional(),
    marketMaker: z.string().optional(),
    registrar: z.string().optional(),
    registrarAddress: z.string().optional(),
    leadManagers: z.array(z.string()).optional(),

    // GMP
    gmp: z.object({
        current: numeric.default(0),
        percent: numeric,
        estListingPrice: numeric,
        // trend: z.enum(['BULLISH', 'NEUTRAL', 'BEARISH']).optional(), // Removed by user
        lastUpdatedAtText: z.string().optional(),
        source: z.string().optional(),
        history: z.array(z.object({
            date: dateSchema,
            gmp: numeric
        })).optional()
    }).optional(),

    // Subscription
    subscription: z.object({
        categories: z.array(z.object({
            enabled: z.boolean().default(true).optional(),
            category: z.string().optional(),
            sharesOffered: numeric,
            appliedShares: numeric
        })).optional(),

        // Totals (Backend Calculated)
        totalTimes: numeric,
        totalOffered: numeric,
        totalApplied: numeric,

        days: z.array(z.object({
            day: z.string().optional(),
            date: z.string().or(z.date()).optional(), // Allow date string or object
            qib: numeric,
            retail: numeric,
            hni: numeric,
            shni: numeric,
            bhni: numeric,
            total: numeric
        })).optional()
    }).optional(),

    // Reservation
    reservations: z.array(z.object({
        enabled: z.boolean().default(true).optional(),
        category: z.string().optional(),
        sharesOffered: numeric,
        anchorShares: numeric
    })).optional(),

    // Lot Distribution
    lotDistribution: z.array(z.object({
        category: z.string().optional(),
        lots: numeric,
        shares: numeric,
        amount: numeric,
        reserved: numeric
    })).optional(),

    limits: z.object({
        retail: z.object({ minLots: numeric, maxLots: numeric }).optional(),
        shni: z.object({ minLots: numeric, maxLots: numeric }).optional(),
        bhni: z.object({ minLots: numeric, maxLots: numeric }).optional()
    }).optional(),

    // Financials
    financials: z.object({
        table: z.array(z.object({
            period: z.string().optional(),
            assets: numeric,
            totalIncome: numeric,
            pat: numeric,
            ebitda: numeric,
            netWorth: numeric,
            reservesSurplus: numeric,
            totalBorrowing: numeric
        })).optional(),

        kpis: z.array(z.object({
            period: z.string().optional(),
            roe: numeric,
            roce: numeric,
            eps: numeric,
            pePre: numeric,
            pePost: numeric,
            ronw: numeric
        })).optional()
    }).optional(),

    // Content
    promoters: z.array(z.string()).optional(),

    peers: z.array(z.object({
        name: z.string().optional(),
        cmp: numeric,
        pe: numeric,
        roe: numeric
    })).optional(),

    objectives: z.array(z.string()).optional(),
    description: z.string().optional(),
    strengths: z.array(z.string()).optional(),
    weaknesses: z.array(z.string()).optional(),
    address: z.string().optional(),

    // Documents
    docs: z.object({
        drhp: z.string().optional(),
        rhp: z.string().optional(),
        anchor: z.string().optional(),
        boa: z.string().optional(),
        applyLink: z.string().optional()
    }).optional(),

    // SEO
    seo: z.object({
        title: z.string().optional(),
        description: z.string().optional(),
        keywords: z.array(z.string()).optional()
    }).optional(),

    sources: z.object({
        gmp: z.string().optional(),
        subscription: z.string().optional(),
        financials: z.string().optional()
    }).optional(),

    // Meta (handled by controller usually, but validating potential inputs)
    updatedByEmail: z.string().optional()
});

export default ipoFullSchema;
