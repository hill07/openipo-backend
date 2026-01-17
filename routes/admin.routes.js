import express from "express";
import { 
  createIPO, 
  updateIPO, 
  deleteIPO, 
  getAllIPOsAdmin, 
  getIPOAdmin, 
  getAdminDashboard 
} from "../controller/admin.controller.js";
import { protect, admin } from "../middleware/auth.js";
import { apiLimiter } from "../middleware/rateLimiter.js";

const router = express.Router();

router.use(apiLimiter);
router.use(protect); // All routes require authentication
router.use(admin); // All routes require admin role

// Dashboard
router.get("/dashboard", getAdminDashboard);

// IPO CRUD
router.get("/ipos", getAllIPOsAdmin);
router.get("/ipos/:id", getIPOAdmin);
router.post("/ipos", createIPO);
router.put("/ipos/:id", updateIPO);
router.delete("/ipos/:id", deleteIPO);

export default router;