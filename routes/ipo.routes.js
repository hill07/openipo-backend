import express from "express";
import {
  getAllIPOs,
  getIPOBySlug,
  getOpenIPOs,
  getUpcomingIPOs,
  getClosedIPOs,
  getListedTodayIPOs
} from "../controller/ipo.controller.js";


import { apiLimiter } from "../middleware/rateLimiter.js";

const router = express.Router();

// All routes use rate limiting
router.use(apiLimiter);

// GET all IPOs (with filters, search, sort, pagination)
router.get("/", getAllIPOs);

// Convenience endpoints for status-based queries
// NOTE: these must be defined BEFORE the "/:slug" route, otherwise
// paths like "/status/open" would be captured as a slug.
router.get("/status/open", getOpenIPOs);
router.get("/status/upcoming", getUpcomingIPOs);
router.get("/status/closed", getClosedIPOs);
router.get("/status/listed-today", getListedTodayIPOs);

// GET single IPO by slug
router.get("/:slug", getIPOBySlug);

export default router;