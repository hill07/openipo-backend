import express from "express";
import { registerUser, verifyOtp, loginUser, updateProfile, toggleAlert, getMyAlerts } from "../controllers/auth.controller.js";
import { protect } from "../middleware/auth.middleware.js"; // Assuming auth middleware exists

const router = express.Router();

router.post("/register", registerUser);
router.post("/verify-otp", verifyOtp);
router.post("/login", loginUser);

// Protected routes
router.put("/profile", protect, updateProfile);
router.post("/alerts/toggle", protect, toggleAlert);
router.get("/alerts", protect, getMyAlerts);

export default router;
