import mongoose from "mongoose";
import logger from '../utils/logger.js';

export default async function connectDB() {
  try {
    const conn = await mongoose.connect(process.env.MONGO_URI);
    logger.info(`✅ MongoDB Connected: ${conn.connection.host}`);
  } catch (err) {
    logger.error("❌ MongoDB connection failed:", err.message);
    process.exit(1);
  }
}
