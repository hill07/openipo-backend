import express from "express";
import { register, login, getProfile, adminLogin } from "../controller/auth.controller.js";
import { authLimiter } from "../middleware/rateLimiter.js";
import { protect } from "../middleware/auth.js";

const router = express.Router();

router.post("/register", authLimiter, register);
router.post("/login", authLimiter, login);
router.post("/admin/login", authLimiter, adminLogin);
router.get("/profile", protect, getProfile);

export default router;