
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import IpoFull from '../models/IpoFull.js';

dotenv.config();

const fullIpoData = {
    ipoId: 1001,
    companyName: "Golden Era Technologies Ltd",
    slug: "golden-era-technologies-ipo",
    type: "MAINBOARD",
    status: "UPCOMING",
    issueType: "IPO",
    symbol: { nse: "GOLDEN", bse: "500123" },

    dates: {
        open: new Date("2025-04-10"),
        close: new Date("2025-04-12"),
        allotment: new Date("2025-04-13"),
        listing: new Date("2025-04-15")
    },

    priceBand: { min: 450, max: 500 },
    lotSize: 30,
    faceValue: 5,
    minInvestment: 15000,

    issueSize: { cr: 1200, shares: 2400000 },

    // --- Detailed Financials ---
    financials: {
        table: [
            { period: "Mar-25", revenue: "500.50", expense: "350.20", pat: "150.30", netWorth: "1200.00", reserves: "800.00", debt: "200.00" },
            { period: "Mar-24", revenue: "420.00", expense: "310.00", pat: "110.00", netWorth: "1050.00", reserves: "600.00", debt: "250.00" },
            { period: "Mar-23", revenue: "350.00", expense: "280.00", pat: "70.00", netWorth: "900.00", reserves: "450.00", debt: "300.00" }
        ],

        // --- KPIs (The Fix Benchmark) ---
        kpis: [
            { period: "Mar-25", roe: 25.5, roce: 28.2, eps: 15.2, pePre: 32.5, pePost: 35.0, ronw: 18.2 },
            { period: "Mar-24", roe: 22.1, roce: 24.5, eps: 12.0, pePre: 28.0, pePost: 30.0, ronw: 16.5 }
        ]
    },

    // --- Peers (The Fix Benchmark) ---
    peers: [
        { name: "Tata Technologies", cmp: "1200", pe: "65.5", roe: "20.2" },
        { name: "KPIT Tech", cmp: "1500", pe: "80.2", roe: "22.5" }
    ],

    // --- GMP Data ---
    gmp: {
        current: 250,
        lastUpdatedAtText: "Updated 1 hour ago",
        history: [
            { date: "2025-04-01", gmp: 100 },
            { date: "2025-04-02", gmp: 120 },
            { date: "2025-04-05", gmp: 180 },
            { date: "2025-04-08", gmp: 250 }
        ]
    },

    // --- Lot Distribution (New Feature) ---
    lotDistribution: [
        { category: "Retail (Min)", lots: 1, shares: 30, amount: 15000, reserved: 35 },
        { category: "Retail (Max)", lots: 13, shares: 390, amount: 195000, reserved: 0 },
        { category: "sHNI (Min)", lots: 14, shares: 420, amount: 210000, reserved: 15 },
        { category: "bHNI (Min)", lots: 67, shares: 2010, amount: 1005000, reserved: 15 }
    ],

    promoters: ["Mr. John Doe", "Mrs. Jane Doe"],

    description: "Golden Era Technologies is a leading provider of AI-driven solutions.",
    strengths: ["Strong Market Position", "High Growth Rate", "Debt Free"],
    weaknesses: ["High Valuation", "Competitive Market"],
    address: "Tech Park, Bengaluru, India"
};

const seedDB = async () => {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log("✅ MongoDB Connected");

        // Remove existing if exists
        await IpoFull.deleteOne({ slug: fullIpoData.slug });

        const ipo = await IpoFull.create(fullIpoData);
        console.log("✅ Golden Record Seeded Successfully:");
        console.log(`   ID: ${ipo._id}`);
        console.log(`   Slug: ${ipo.slug}`);
        console.log("   KPIs:", ipo.financials.kpis.length);
        console.log("   Peers:", ipo.peers.length);

        process.exit();
    } catch (error) {
        console.error("❌ Seeding Error:", error);
        process.exit(1);
    }
};

seedDB();
