/**
 * Run: node seeds/seedBrandmanRetailFinal.js
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

  ipoId: 19,
  slug: "brandman-retail-limited-ipo",

  isPublished: true,

  companyName: "Brandman Retail Limited",

  logo: "https://logo.clearbit.com/brandmanretail.com",

  type: "SME",
  issueType: "IPO",

  symbol: { nse: "BRANDMAN", bse: "" },

  exchanges: ["NSE SME"],

  dates: {
    open: new Date("2026-02-04"),
    close: new Date("2026-02-06"),
    allotment: new Date("2026-02-09"),
    listing: new Date("2026-02-11")
  },

  status: "UPCOMING",

  lotSize: 800,

  priceBand: { min:167, max:176 },

  issueSize: { cr:86.08, shares:4891200 },

  faceValue:10,

  issueBreakdown:{
    total:{ cr:86.08, shares:4891200 },
    fresh:{ cr:86.08, shares:4891200 },
    ofs:{ cr:0, shares:0 }
  },

  shareHolding:{
    pre:13565986,
    post:18457186
  },

  listingAt:["NSE SME"],

  marketMaker:"Gretex Share Broking Limited, Shree Bahubali Stock Broking Limited",

  registrar:"Bigshare Services Pvt Ltd",

  leadManagers:["Gretex Corporate Services Limited"],

  gmp:{
    current:8.5,
    percent:4.83,
    estListingPrice:184.5,
    lastUpdatedAtText:"",
    source:"IPO Premium"
  },

  reservations:[
    { category:"QIB", sharesOffered:2320000 },
    { category:"HNI", sharesOffered:699200 },
    { category:"Retail", sharesOffered:1627200 },
    { category:"MarketMaker", sharesOffered:244800 }
  ],

  lotDistribution:[
    { category:"Retail", lots:"2", shares:"1600", amount:"281600", reserved:"1017" },
    { category:"sHNI", lots:"3", shares:"2400", amount:"422400", reserved:"97" },
    { category:"bHNI", lots:"8", shares:"6400", amount:"1126400", reserved:"194" }
  ],

  financials:{
    table:[
      { period:"Dec-25", assets:101.31, totalIncome:97.21, pat:19.67, ebitda:27.02, netWorth:60.26, reservesSurplus:46.7, totalBorrowing:15.68 },
      { period:"Mar-25", assets:84.73, totalIncome:136.3, pat:20.95, ebitda:31.15, netWorth:29.79, reservesSurplus:17.04, totalBorrowing:11.87 },
      { period:"Mar-24", assets:40.49, totalIncome:123.49, pat:8.27, ebitda:12.01, netWorth:8.84, reservesSurplus:8.59, totalBorrowing:3.53 }
    ],

    kpis:[
      { period:"Dec-25", roe:43.69, roce:36.92, eps:15.2, pePre:11.39, pePost:12.38 },
      { period:"Mar-25", roe:108.47, roce:75.08, eps:16.43 },
      { period:"Mar-24", roe:175.92, roce:93.22, eps:6.49 }
    ]
  },

  peers:[
    { name:"Redtape Limited", cmp:145.96, pe:47.39, roe:21.55 },
    { name:"Bata India Limited", cmp:1219.9, pe:47.41, roe:20.99 },
    { name:"Lehar Footwears Limited", cmp:212.75, pe:34.59, roe:9.67 },
    { name:"Liberty Shoes Limited", cmp:321.3, pe:40.57, roe:6.09 }
  ],

  objectives:[
    "Working capital",
    "Store expansion",
    "General corporate purposes"
  ],

  strengths:[
    "Experienced promoters and professional management",
    "Omni-channel distribution presence",
    "Asset-light scalable business model"
  ],

  weaknesses:[
    "Dependence on non-exclusive brand agreements",
    "Store expansion uncertainty",
    "Reliance on e-commerce marketplaces"
  ],

  description:
    "Brandman Retail Limited distributes international sports and lifestyle brands through EBOs, MBOs and e-commerce platforms across India.",

  address:
    "DPT 718-719, 7th Floor DLF Prime Tower, Okhla Industrial Area Phase-I, New Delhi 110020",

  updatedByEmail:"admin@openipo.in"
};

async function seed(){

  await mongoose.connect(MONGO_URI);

  await IpoFull.findOneAndUpdate(
    { slug:ipoSeedData.slug },
    { $set:ipoSeedData },
    { upsert:true }
  );

  console.log("✅ Brandman Retail FINAL IPO Seeded");

  process.exit();
}

seed();
