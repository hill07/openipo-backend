/**
 * Seed File for IpoFull Collection
 * Run: node seeds/seedIpoFull.js
 */

import mongoose from "mongoose";
import dotenv from "dotenv";
import IpoFull from "../models/IpoFull.js"; // ✅ adjust path if needed

dotenv.config();

const MONGO_URI = process.env.MONGO_URI;

if (!MONGO_URI) {
  console.error("❌ MONGO_URI missing in .env file");
  process.exit(1);
}

// ✅ Full Sample IPO Document (Shadowfax)
const ipoSeedData = {
  ipoId: 11,
  slug: "shadowfax-technologies-limited-ipo",
  isPublished: true,

  // --- Basic Info ---
  companyName: "Shadowfax Technologies Ltd.",
  logo: "https://logo.clearbit.com/shadowfax.in",
  type: "MAINBOARD",
  issueType: "IPO",

  symbol: {
    nse: "SHADOWFAX",
    bse: "544999",
    sme: "",
  },

  exchanges: ["NSE", "BSE"],

  // Dates
  dates: {
    open: new Date("2026-01-20T00:00:00.000Z"),
    close: new Date("2026-01-22T00:00:00.000Z"),
    allotment: new Date("2026-01-23T00:00:00.000Z"),
    listing: new Date("2026-01-28T00:00:00.000Z"),
  },

  status: "ALLOTMENT",

  // Lot & Price
  lotSize: 120,
  priceBand: {
    min: 118,
    max: 124,
  },
  minInvestment: 14880,

  // Issue Size
  issueSize: {
    cr: 1907.27,
    shares: 153812016,
  },

  // --- Issue Details ---
  faceValue: 10,

  issueBreakdown: {
    total: {
      cr: 1907.27,
      shares: 153812016,
    },
    fresh: {
      cr: 1000.0,
      shares: 80645161,
    },
    ofs: {
      cr: 907.27,
      shares: 73166855,
    },
  },

  shareHoldingPreIssue: "497,488,085 Equity Shares",
  shareHoldingPostIssue: "578,133,246 Equity Shares",

  listingAt: ["BSE", "NSE"],
  marketMaker: "—",
  registrar: "KFin Technologies Limited",
  leadManagers: [
    "ICICI Securities Limited",
    "JM Financial Limited",
    "Morgan Stanley India Company Pvt Ltd",
  ],

  // --- GMP ---
  gmp: {
    current: 0,
    percent: 0,
    estListingPrice: 124,
    lastUpdatedAtText: "22-Jan-2026 18:27:03",
    source: "Market rumors / IPO Premium",
    history: [
      {
        date: "22-Jan-2026",
        gmp: 0,
        updatedAt: new Date("2026-01-22T12:57:03.000Z"),
      },
      {
        date: "21-Jan-2026",
        gmp: 0,
        updatedAt: new Date("2026-01-21T12:57:03.000Z"),
      },
      {
        date: "20-Jan-2026",
        gmp: 0,
        updatedAt: new Date("2026-01-20T12:57:03.000Z"),
      },
    ],
  },

  // --- Subscription ---
  subscription: {
    updatedAtText: "22-Jan-2026 18:27:03",
    source: "NSE / IPO Premium",
    summary: {
      qib: 4.0,
      retail: 2.42,
      nii: 0.88,
      shni: 1.33,
      bhni: 0.66,
      emp: 2.17,
      total: 2.86,
    },
    categories: [
      {
        name: "QIB",
        sharesOffered: 46022638,
        sharesBid: 184033800,
        subscriptionTimes: 4.0,
      },
      {
        name: "NII (HNI)",
        sharesOffered: 23011319,
        sharesBid: 20313840,
        subscriptionTimes: 0.88,
      },
      {
        name: "bNII (10L+)",
        sharesOffered: 15340879,
        sharesBid: 10119600,
        subscriptionTimes: 0.66,
      },
      {
        name: "sNII (2-10L)",
        sharesOffered: 7670440,
        sharesBid: 10194240,
        subscriptionTimes: 1.33,
      },
      {
        name: "Retail",
        sharesOffered: 15340879,
        sharesBid: 37164720,
        subscriptionTimes: 2.42,
      },
      {
        name: "Employees",
        sharesOffered: 403226,
        sharesBid: 876000,
        subscriptionTimes: 2.17,
      },
      {
        name: "Total",
        sharesOffered: 84778062,
        sharesBid: 242388360,
        subscriptionTimes: 2.86,
      },
    ],
  },

  // --- Reservation ---
  reservations: [
    { name: "Anchor", sharesOffered: 69033955, percentage: 44.88 },
    { name: "QIB", sharesOffered: 46022638, percentage: 29.92 },
    { name: "HNI", sharesOffered: 23011319, percentage: 14.96 },
    { name: "Retail", sharesOffered: 15340879, percentage: 9.97 },
    { name: "Employee", sharesOffered: 403226, percentage: 0.26 },
    { name: "Total", sharesOffered: 153812016, percentage: 100 },
  ],

  // --- Lot Distribution ---
  lotDistribution: [
    {
      category: "Retail",
      lots: 1,
      shares: 120,
      amount: 14880,
      reserved: 127841,
    },
    {
      category: "sHNI",
      lots: 14,
      shares: 1680,
      amount: 208320,
      reserved: 4566,
    },
    {
      category: "bHNI",
      lots: 68,
      shares: 8160,
      amount: 1011840,
      reserved: 9131,
    },
  ],

  limits: {
    retail: { minLots: 1, maxLots: 13 },
    shni: { minLots: 14, maxLots: 67 },
    bhni: { minLots: 68, maxLots: 999 },
  },

  // --- Financials ---
  financials: {
    table: [
      {
        period: "Sep-25",
        assets: "1453.16",
        revenue: "1819.80",
        expense: "—",
        pat: "21.04",
        ebitda: "64.34",
        netWorth: "693.53",
        reserves: "281.26",
        debt: "147.44",
      },
      {
        period: "Mar-25",
        assets: "1259.26",
        revenue: "2514.66",
        expense: "—",
        pat: "6.43",
        ebitda: "56.19",
        netWorth: "660.43",
        reserves: "248.16",
        debt: "132.23",
      },
      {
        period: "Mar-24",
        assets: "786.14",
        revenue: "1896.48",
        expense: "—",
        pat: "-11.88",
        ebitda: "11.37",
        netWorth: "421.78",
        reserves: "172.47",
        debt: "40.33",
      },
      {
        period: "Mar-23",
        assets: "442.73",
        revenue: "1422.89",
        expense: "—",
        pat: "-142.64",
        ebitda: "-113.47",
        netWorth: "176.32",
        reserves: "171.20",
        debt: "66.69",
      },
    ],
    valuation: [
      { label: "EPS Pre IPO", value: "₹0.12" },
      { label: "EPS Post IPO", value: "₹0.73" },
      { label: "P/E Pre IPO", value: "1017.96" },
      { label: "P/E Post IPO", value: "170.39" },
      { label: "Debt/Equity", value: "0.20" },
      { label: "RoNW", value: "0.97%" },
      { label: "Price to Book Value", value: "8.97" },
      { label: "Market Cap", value: "₹7168.85 Cr" },
    ],
  },

  promoters: ["Abhishek Bansal", "Vaibhav Khandelwal"],

  peers: [
    { name: "Blue Dart Express Limited", cmp: "₹6,600", pe: "50.70", roe: "17.25%" },
    { name: "Delhivery Limited", cmp: "₹400", pe: "195.07", roe: "1.75%" },
  ],

  // --- Objectives ---
  objectives: [
    "Funding of capital expenditure requirements of the Company in relation to the network infrastructure",
    "Funding of lease payments for new first mile centers, last mile centers and sort centers",
    "Funding of branding, marketing and communication costs",
    "Unidentified inorganic acquisitions and general corporate purposes",
  ],

  // --- Reviewers ---
  reviewers: [
    { name: "Capital Market", rating: "Neutral", summary: "Valuation seems fully priced; wait for listing performance." },
    { name: "SBICAP Securities Limited", rating: "Neutral", summary: "Good growth but competitive sector and risks exist." },
    { name: "SMIFS Limited", rating: "Apply", summary: "Strong demand outlook; apply for long term investors." },
    { name: "Ventura Securities Limited", rating: "Apply", summary: "Good business model with strong network." },
    { name: "Sushil Finance Ltd", rating: "May Apply", summary: "Apply only if risk appetite is high." },
    { name: "Pioneer Investcorp Ltd. (PINC)", rating: "Not Rated", summary: "No recommendation published yet." },
  ],

  // --- Docs ---
  docs: {
    drhp: "https://example.com/shadowfax/drhp.pdf",
    rhp: "https://example.com/shadowfax/rhp.pdf",
    anchor: "https://example.com/shadowfax/anchor.pdf",
    boa: "https://example.com/shadowfax/allotment.pdf",
    applyLink: "https://zerodha.com/ipo/apply/shadowfax",
  },

  // --- About ---
  description:
    "Shadowfax Technologies Ltd is a technology-led logistics solutions provider in India focused on e-commerce, D2C, hyperlocal, quick commerce, and personal courier services. The company operates a nationwide logistics network with thousands of touchpoints and sort centres, supported by an asset-light model.",

  strengths: [
    "Agile and customisable logistics platform – Enables faster go-to-market delivery solutions for clients.",
    "Largest gig-based last-mile delivery infrastructure – Deep penetration supports e-commerce and quick commerce.",
    "Robust nationwide network backbone – Extensive automation and touchpoints drive efficiency and scalability.",
  ],

  weaknesses: [
    "Losses and negative cash flows – History of operating losses may continue due to expansion.",
    "Network concentration risk – Disruption across network could materially affect operations.",
    "High client concentration – Major client contributes ~49–59% of revenue; risk if relationship breaks.",
  ],

  address:
    "3rd Floor, Shilpitha Tech Park, Sy No. 55/3 & 55/4, Outer Ring Road, Devarabisanahalli Village, Bellandur, Bengaluru, Karnataka, 560103",

  // --- Meta ---
  updatedBy: null,
  updatedByEmail: "admin@openipo.in",

  isDeleted: false,
  deletedAt: null,
};

async function seed() {
  try {
    console.log("🔌 Connecting DB...");
    await mongoose.connect(MONGO_URI);
    console.log("✅ MongoDB Connected");

    // ✅ UPSERT (recommended)
    const result = await IpoFull.findOneAndUpdate(
      { slug: ipoSeedData.slug },
      { $set: ipoSeedData },
      { upsert: true, new: true }
    );

    console.log("✅ Seed successful:", result.slug);
    process.exit(0);
  } catch (err) {
    console.error("❌ Seed failed:", err);
    process.exit(1);
  }
}

seed();
