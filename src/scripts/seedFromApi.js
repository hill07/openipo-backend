
import mongoose from "mongoose";
import { slugify } from "../utils/slugify.js";
import IpoFull from "../models/IpoFull.js";
import dotenv from "dotenv";

dotenv.config();

const API_URL = "https://www.ipoguru.in/api/v1/ipos";
const API_KEY = process.env.IPOGURU_API_KEY || "ipo_aqaPRjr3VHJmzwuqB7XZZZMJgLyQeJpzjgODecTs";

// Static data fallback from user request
const staticData = {
    "success": true,
    "count": 7,
    "data": [
        {
            "name": "Teamtech Formwork Solutions",
            "type": "SME",
            "sub_type": "NSE SME",
            "open_date": "2026-05-19",
            "close_date": "2026-05-21",
            "allotment_date": "2026-05-22",
            "listing_date": "2026-05-26",
            "listing_price": null,
            "price_band": "TBA",
            "issue_price": "tba",
            "face_value": "5",
            "lot_size": "tba",
            "issue_size": "₹tba Cr",
            "sale_type": null,
            "listing_on": null,
            "registrar": "Kfin Technologies Ltd.",
            "status": "Upcoming",
            "subscription": {
                "qib": null, "nii": null, "retail": null, "total": null, "updated_at": null
            },
            "gmp": {
                "price": null, "percentage": 0, "updated_at": null
            }
        },
        {
            "name": "Goldline Pharmaceutical",
            "type": "SME",
            "sub_type": "BSE SME",
            "open_date": "2026-05-12",
            "close_date": "2026-05-14",
            "allotment_date": "2026-05-15",
            "listing_date": "2026-05-19",
            "listing_price": "tba",
            "price_band": "41-43",
            "issue_price": "43",
            "face_value": "10",
            "lot_size": "3000",
            "issue_size": "₹12 Cr",
            "sale_type": null,
            "listing_on": null,
            "registrar": "Bigshare Services Pvt.Ltd.",
            "status": "Open",
            "subscription": {
                "qib": "1.31", "nii": "18.07", "retail": "34.07", "total": "20.79", "updated_at": "12 May 2026, 05:10 PM IST"
            },
            "gmp": {
                "price": "18", "percentage": "42", "updated_at": "12 May 2026, 09:06 PM IST"
            }
        },
        {
            "name": "RFBL Flexi Pack",
            "type": "SME",
            "sub_type": "NSE SME",
            "open_date": "2026-05-12",
            "close_date": "2026-05-14",
            "allotment_date": "2026-05-15",
            "listing_date": "2026-05-19",
            "listing_price": null,
            "price_band": "47-50",
            "issue_price": "50",
            "face_value": "10",
            "lot_size": "3000",
            "issue_size": "₹35 Cr",
            "sale_type": null,
            "listing_on": null,
            "registrar": "Kfin Technologies Ltd.",
            "status": "Open",
            "subscription": {
                "qib": "1.12", "nii": "1.59", "retail": "1.07", "total": "1.24", "updated_at": "12 May 2026, 05:00 PM IST"
            },
            "gmp": {
                "price": "0", "percentage": 0, "updated_at": "12 May 2026, 09:07 PM IST"
            }
        },
        {
            "name": "Simca Advertising",
            "type": "SME",
            "sub_type": "NSE SME",
            "open_date": "2026-05-08",
            "close_date": "2026-05-12",
            "allotment_date": "2026-05-13",
            "listing_date": "2026-05-15",
            "listing_price": null,
            "price_band": "174-183",
            "issue_price": "183",
            "face_value": "10",
            "lot_size": "600",
            "issue_size": "₹58.04 Cr",
            "sale_type": null,
            "listing_on": null,
            "registrar": "MUFG Intime India Pvt.Ltd.",
            "status": "Closed",
            "subscription": {
                "qib": "101.08", "nii": "81.7", "retail": "70.89", "total": "80.93", "updated_at": "12 May 2026, 05:10 PM IST"
            },
            "gmp": {
                "price": "10", "percentage": "5", "updated_at": "12 May 2026, 10:18 PM IST"
            }
        },
        {
            "name": "Bagmane Prime Office REIT",
            "type": "Mainboard",
            "sub_type": "Trust",
            "open_date": "2026-05-05",
            "close_date": "2026-05-07",
            "allotment_date": "2026-05-12",
            "listing_date": "2026-05-15",
            "listing_price": null,
            "price_band": "95-100",
            "issue_price": "100",
            "face_value": null,
            "lot_size": null,
            "issue_size": "₹3405 Cr",
            "sale_type": "Fresh capital cum OFS",
            "listing_on": null,
            "registrar": "Kfin Technologies Ltd.",
            "status": "Closed",
            "subscription": {
                "qib": "26.58", "nii": "22.82", "retail": null, "total": "24.96", "updated_at": "12 May 2026, 10:22 AM IST"
            },
            "gmp": {
                "price": "4", "percentage": "4", "updated_at": "12 May 2026, 09:07 PM IST"
            }
        },
        {
            "name": "Recode Studios",
            "type": "SME",
            "sub_type": "BSE SME",
            "open_date": "2026-05-05",
            "close_date": "2026-05-07",
            "allotment_date": "2026-05-08",
            "listing_date": "2026-05-12",
            "listing_price": "213.10",
            "price_band": "150 - 158",
            "issue_price": "158",
            "face_value": "10",
            "lot_size": "800",
            "issue_size": "₹44.59 Cr",
            "sale_type": null,
            "listing_on": null,
            "registrar": "MUDRA RTA VENTURES PVT LTD",
            "status": "Closed",
            "subscription": {
                "qib": "137.99", "nii": "298.07", "retail": "216.65", "total": "217.89", "updated_at": "08 May 2026, 07:59 AM IST"
            },
            "gmp": {
                "price": "42", "percentage": "27", "updated_at": "11 May 2026, 04:16 PM IST"
            }
        },
        {
            "name": "Value 360 Communications",
            "type": "SME",
            "sub_type": "NSE SME",
            "open_date": "2026-05-04",
            "close_date": "2026-05-06",
            "allotment_date": "2026-05-07",
            "listing_date": "2026-05-11",
            "listing_price": "78.40",
            "price_band": "95 -98",
            "issue_price": "98",
            "face_value": "10",
            "lot_size": "1200",
            "issue_size": "₹42 Cr Cr",
            "sale_type": "Fresh capital cum OFS",
            "listing_on": null,
            "registrar": "Kfin Technologies Ltd.",
            "status": "Closed",
            "subscription": {
                "qib": "17", "nii": "1.42", "retail": "0.77", "total": "1.25", "updated_at": "06 May 2026, 05:10 PM IST"
            },
            "gmp": {
                "price": "0", "percentage": 0, "updated_at": "10 May 2026, 01:03 PM IST"
            }
        }
    ]
};

function parsePriceBand(priceBand) {
    if (!priceBand || priceBand === "TBA") return { min: 0, max: 0 };
    const parts = priceBand.replace(/\s+/g, '').split("-");
    if (parts.length === 2) {
        return { min: parseFloat(parts[0]), max: parseFloat(parts[1]) };
    }
    const single = parseFloat(priceBand);
    return { min: single || 0, max: single || 0 };
}

function parseIssueSize(issueSize) {
    if (!issueSize || issueSize.includes("tba")) return { cr: 0 };
    const match = issueSize.match(/₹([\d\.]+)\s*Cr/);
    if (match) {
        return { cr: parseFloat(match[1]) };
    }
    return { cr: 0 };
}

function mapStatus(status) {
    const s = status.toUpperCase();
    if (s === "UPCOMING") return "UPCOMING";
    if (s === "OPEN") return "OPEN";
    if (s === "CLOSED") return "CLOSED";
    return "UPCOMING";
}

async function fetchData() {
    try {
        console.log("Fetching latest IPO data from API...");
        const response = await fetch(API_URL, {
            headers: { "X-API-KEY": API_KEY }
        });
        if (!response.ok) throw new Error(`API returned ${response.status}`);
        const json = await response.json();
        return json;
    } catch (error) {
        console.warn("API fetch failed, using static data fallback:", error.message);
        return staticData;
    }
}

async function seed() {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log("Connected to MongoDB");

        const apiResponse = await fetchData();
        if (!apiResponse.success || !apiResponse.data) {
            console.error("Invalid API response format");
            process.exit(1);
        }

        // Find max ipoId
        const lastIpo = await IpoFull.findOne().sort({ ipoId: -1 });
        let nextIpoId = (lastIpo ? lastIpo.ipoId : 0) + 1;

        for (const item of apiResponse.data) {
            const slug = slugify(item.name) + "-ipo";
            const pb = parsePriceBand(item.price_band);
            const isize = parseIssueSize(item.issue_size);

            const mappedData = {
                companyName: item.name,
                slug: slug,
                type: item.type === "SME" ? "SME" : "MAINBOARD",
                issueType: "IPO",
                dates: {
                    open: item.open_date ? new Date(item.open_date) : null,
                    close: item.close_date ? new Date(item.close_date) : null,
                    allotment: item.allotment_date ? new Date(item.allotment_date) : null,
                    listing: item.listing_date ? new Date(item.listing_date) : null,
                },
                priceBand: pb,
                faceValue: parseFloat(item.face_value) || 0,
                lotSize: parseFloat(item.lot_size) || 0,
                issueSize: isize,
                registrar: item.registrar,
                status: mapStatus(item.status),
                gmp: {
                    current: parseFloat(item.gmp.price) || 0,
                    lastUpdatedAtText: item.gmp.updated_at,
                    source: "IPOGuru"
                },
                subscription: {
                    updatedAtText: item.subscription.updated_at,
                    source: "IPOGuru",
                    categories: [
                        { category: "QIB", appliedShares: parseFloat(item.subscription.qib) || 0, sharesOffered: 1, enabled: item.subscription.qib !== null },
                        { category: "NII", appliedShares: parseFloat(item.subscription.nii) || 0, sharesOffered: 1, enabled: item.subscription.nii !== null },
                        { category: "Retail", appliedShares: parseFloat(item.subscription.retail) || 0, sharesOffered: 1, enabled: item.subscription.retail !== null }
                    ]
                },
                isPublished: true
            };

            // Check if exists
            let existing = await IpoFull.findOne({ slug: slug });
            if (existing) {
                // Update
                await IpoFull.updateOne({ slug: slug }, { $set: mappedData });
                console.log(`Updated: ${item.name}`);
            } else {
                // Create
                mappedData.ipoId = nextIpoId++;
                await IpoFull.create(mappedData);
                console.log(`Created: ${item.name} with ID ${mappedData.ipoId}`);
            }
        }

        console.log("Seeding completed successfully");
        process.exit(0);
    } catch (error) {
        console.error("Error seeding data:", error);
        process.exit(1);
    }
}

seed();
