/**
 * Run: node seeds/seedStridersImpex.js
 */

import mongoose from "mongoose";
import dotenv from "dotenv";
import IpoFull from "../models/IpoFull.js";

dotenv.config();

const MONGO_URI = process.env.MONGO_URI;

if (!MONGO_URI) {
  console.error("❌ Missing MONGO_URI");
  process.exit(1);
}

const ipoSeedData = {

  ipoId: 32,
  slug: "striders-impex-ipo",

  isPublished: true,

  companyName: "Striders Impex Ltd",
  logo: "https://logo.clearbit.com/striders.biz",

  type: "SME",
  issueType: "IPO",

  symbol: {
    nse: "STRIDERS",
    bse: null
  },

  exchanges: ["NSE SME"],

  dates: {
    open: new Date("2026-02-26"),
    close: new Date("2026-03-02"),
    allotment: new Date("2026-03-04"),
    listing: new Date("2026-03-06")
  },

  status: "OPEN",

  lotSize: 1600,

  priceBand: { min: 71, max: 72 },

  issueSize: { cr: 36.28, shares: 5040000 },

  faceValue: 10,

  issueBreakdown: {
    total: { cr: 36.28, shares: 5040000 },
    fresh: { cr: 32.62, shares: 4531200 },
    ofs: { cr: 3.66, shares: 508800 }
  },

  shareHolding: {
    pre: 14085680,
    post: 18616880
  },

  listingAt: ["NSE SME"],

  registrar: "MUFG Intime India Private Limited (Link Intime)",

  leadManagers: [
    "Capitalsquare Advisors Private Limited"
  ],

  // marketMaker: {
  //   name: "Nikunj Stock Brokers Ltd.",
  //   shares: 252800,
  //   amountCr: 1.82
  // },

  gmp: {
    current: 0,
    percent: 0,
    estListingPrice: 72,
    lastUpdatedAtText: "02-Mar-2026",
    source: "IPO Premium"
  },

  lotDistribution: [
    { category: "Retail", lots: 2, shares: 3200, amount: 230400, reserved: 0 },
    { category: "sHNI", lots: 3, shares: 4800, amount: 345600, reserved: 0 },
    { category: "bHNI", lots: 9, shares: 14400, amount: 1036800, reserved: 0 }
  ],

  financials: {
    table: [
      { period: "Dec-25", assets: 58.83, income: 49.61, pat: 4.01, ebitda: 6.49, netWorth: 23.53, debt: 22.92 },
      { period: "Mar-25", assets: 48.70, income: 61.95, pat: 8.41, ebitda: 9.32, netWorth: 14.88, debt: 20.55 },
      { period: "Mar-24", assets: 29.45, income: 41.77, pat: 4.39, ebitda: 5.31, netWorth: 6.47, debt: 14.65 }
    ],

    kpis: [
      { period: "Dec-25", roe: 17.05, eps: 2.91 },
      { period: "Mar-25", roe: 56.51, eps: 6.27 },
      { period: "Mar-24", roe: 67.78, eps: 3.27 }
    ]
  },

  peers: [
    { name: "Ok Play India Limited", pe: null, cmp: 5.49, faceValue: 1 }
  ],

  strengths: [
    "Asset-light licensing and brand-led business model",
    "Dual-country sourcing strategy enhancing supply chain flexibility",
    "Strong proprietary IP portfolio supporting brand ownership and margins"
  ],

  weaknesses: [
    "High dependence on China-based manufacturers",
    "Reliance on third-party licensed IPs",
    "Customer concentration risk impacting revenue stability"
  ],

  description:
    "Incorporated in 2021, Striders Impex Limited is engaged in licensing, own-brand development and distribution of toys and kids consumer merchandise with a strong focus on proprietary IP creation and asset-light scalability.",

  address:
    "14th Floor, Office No. 1406 & 1407, Ajmera Sikova, Sikova Industrial Marg, LBS Marg, Ghatkopar (W), Mumbai, Maharashtra, 400086",

  website: "https://www.striders.biz/",

  updatedByEmail: "admin@openipo.in"
};

async function seed() {
  await mongoose.connect(MONGO_URI);

  await IpoFull.findOneAndUpdate(
    { slug: ipoSeedData.slug },
    { $set: ipoSeedData },
    { upsert: true }
  );

  console.log("✅ Striders Impex IPO seeded successfully");

  process.exit();
}

seed();