import express from "express";
import cors from "cors";
import helmet from "helmet";
import dotenv from "dotenv";
import hpp from "hpp";
import cookieParser from "cookie-parser";
import mongoSanitize from "express-mongo-sanitize";
import xss from "xss-clean";
import compression from "compression";
import morgan from "morgan";
import rateLimit from "express-rate-limit";
import connectDB from "./config/db.js";

// V2 Imports
import adminIpoRoutes from "./routes/v2/adminIpo.routes.js";
import publicIpoRoutes from "./routes/v2/publicIpo.routes.js";
import visitorRoutes from "./routes/visitor.routes.js";

// Admin Auth (Kept)
import adminAuthRoutes from "./routes/adminAuth.routes.js";
import { notFound as notFoundMiddleware } from "./middlewares/notFound.js";
import { errorHandler } from "./middlewares/errorHandler.js";

import logger from './utils/logger.js';

dotenv.config();
await connectDB();

const app = express();
app.disable("x-powered-by");

app.use(helmet());
app.use(compression());
app.use(morgan("combined"));
app.use(express.json({ limit: "1mb" }));
app.use(cookieParser());

// prevent NoSQL injection + XSS
app.use(mongoSanitize());
app.use(xss());
app.use(hpp());

// CORS strict
app.use(cors({
  origin: (origin, callback) => {
    const allowedOrigins = process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN.split(",") : [];

    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);

    if (allowedOrigins.indexOf(origin) !== -1 || !process.env.CORS_ORIGIN) {
      return callback(null, true);
    }

    // Allow local development (localhost, 127.0.0.1, and local network IPs)
    if (
      origin.startsWith("http://localhost") ||
      origin.startsWith("http://127.0.0.1") ||
      origin.startsWith("http://10.") ||       // Private network 10.x.x.x
      origin.startsWith("http://192.168.") ||  // Private network 192.168.x.x
      origin.startsWith("http://172.16.")      // Private network 172.16.x.x - 172.31.x.x (simplification)
    ) {
      return callback(null, true);
    }

    const msg = 'The CORS policy for this site does not allow access from the specified Origin.';
    return callback(new Error(msg), false);
  },
  credentials: true
}));

// global rate limiter (light)
app.use(rateLimit({
  windowMs: 60 * 1000,
  limit: 300,
  standardHeaders: true,
  legacyHeaders: false
}));

app.get("/", (req, res) => res.send("✅ OpenIPO V2 Backend Running"));

// ✅ API Routes

// Admin Auth
app.use("/api/admin/auth", adminAuthRoutes);

// V2 Admin IPOs
app.use("/api/v2/admin/ipos", adminIpoRoutes);

// V2 Public IPOs
app.use("/api/v2/ipos", publicIpoRoutes);

// Visitor Counter
app.use("/api/public/visitors", visitorRoutes);

// Error Handling
app.use(notFoundMiddleware);
app.use(errorHandler);

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => logger.info(`✅ Server running on port ${PORT}`));
