import mongoose from "mongoose";
import Settings from "./src/models/Settings.js";
import dotenv from "dotenv";

dotenv.config();

const seed = async () => {
    try {
        if (!process.env.MONGO_URI) {
            // Fallback or error if no URI. Assuming .env exists as seen in file list
            console.error("No MONGO_URI");
            process.exit(1);
        }
        await mongoose.connect(process.env.MONGO_URI);

        await Settings.findOneAndUpdate(
            { key: "global" },
            { applyLink: "https://zerodha.com/ipo" },
            { upsert: true, new: true }
        );

        console.log("✅ Settings Seeded with https://zerodha.com/ipo");
        process.exit(0);
    } catch (error) {
        console.error("Error seeding:", error);
        process.exit(1);
    }
};

seed();
