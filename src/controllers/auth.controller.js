import User from "../models/User.js";
import sendEmail from "../utils/sendEmail.js";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import logger from "../utils/logger.js";
import Alert from "../models/Alert.js";

const generateOTP = () => {
    return Math.floor(100000 + Math.random() * 900000).toString();
};

export const registerUser = async (req, res) => {
    try {
        const { name, email, password } = req.body;

        if (!name || !email || !password) {
            return res.status(400).json({ success: false, message: "Please provide all fields" });
        }

        const existingUser = await User.findOne({ email });

        if (existingUser) {
            if (existingUser.isVerified) {
                return res.status(400).json({ success: false, message: "User already registered and verified." });
            }
            // If exists and not verified, we will update OTP and resend
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        const otp = generateOTP();
        const otpExpires = new Date(Date.now() + 15 * 60 * 1000); // 15 mins expiry

        let user;
        if (existingUser && !existingUser.isVerified) {
            existingUser.name = name;
            existingUser.password = hashedPassword;
            existingUser.otp = otp;
            existingUser.otpExpires = otpExpires;
            await existingUser.save();
            user = existingUser;
        } else {
            user = await User.create({
                name,
                email,
                password: hashedPassword,
                isVerified: false,
                otp,
                otpExpires,
            });
        }

        // Simple Cleaner Email Template
        const emailHtml = `
  <div style="max-width: 600px; margin: auto; font-family: sans-serif; background-color: #ffffff; padding: 32px; border: 1px solid #e2e8f0; border-radius: 12px;">
    <h1 style="color: #0f172a; margin: 0 0 16px 0; font-size: 24px; font-weight: 700;">Welcome!</h1>
    <p style="font-size: 16px; color: #334155; line-height: 1.5; margin-bottom: 24px;">
      Your OpenIPO verification code is:
    </p>
    <div style="font-size: 32px; font-weight: 800; color: #0ea5e9; letter-spacing: 6px; margin-bottom: 24px;">
      ${otp}
    </div>
    <p style="font-size: 14px; color: #64748b; margin-top: 24px;">
      This code expires in 15 minutes.
    </p>
  </div>
`;

        await sendEmail({
            to: user.email,
            subject: "Verify your OpenIPO Account",
            text: `Your OTP is ${otp}`,
            html: emailHtml,
        });

        res.status(201).json({
            success: true,
            message: "User registered. Please check your email for OTP.",
        });
    } catch (error) {
        logger.error(`Error in registerUser: ${error.message}`);
        res.status(500).json({ success: false, message: error.message || "Server Error" });
    }
};

export const verifyOtp = async (req, res) => {
    try {
        const { email, otp } = req.body;

        if (!email || !otp) {
            return res.status(400).json({ success: false, message: "Please provide email and OTP" });
        }

        const user = await User.findOne({ email });

        if (!user) {
            return res.status(404).json({ success: false, message: "User not found" });
        }

        if (user.isVerified) {
            return res.status(400).json({ success: false, message: "User already verified" });
        }

        if (user.otp !== otp) {
            return res.status(400).json({ success: false, message: "Invalid OTP" });
        }

        if (user.otpExpires < new Date()) {
            return res.status(400).json({ success: false, message: "OTP has expired" });
        }

        user.isVerified = true;
        user.otp = null;
        user.otpExpires = null;
        await user.save();

        const jwtSecret = process.env.JWT_SECRET || "fallback_secret_for_development";
        const sessionToken = jwt.sign({ id: user._id }, jwtSecret, {
            expiresIn: "7d",
        });

        res.status(200).json({
            success: true,
            message: "Email verified successfully",
            sessionToken,
            user: {
                id: user._id,
                name: user.name,
                email: user.email,
            },
        });
    } catch (error) {
        logger.error(`Error in verifyOtp: ${error.message}`);
        res.status(500).json({ success: false, message: error.message || "Server Error" });
    }
};

export const loginUser = async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({ success: false, message: "Please provide email and password" });
        }

        const user = await User.findOne({ email });

        if (!user) {
            return res.status(400).json({ success: false, message: "Invalid credentials" });
        }

        if (!user.isVerified) {
            return res.status(403).json({ success: false, message: "Please verify your email before logging in" });
        }

        const isMatch = await bcrypt.compare(password, user.password);

        if (!isMatch) {
            return res.status(400).json({ success: false, message: "Invalid credentials" });
        }

        const jwtSecret = process.env.JWT_SECRET || "fallback_secret_for_development";
        const sessionToken = jwt.sign({ id: user._id }, jwtSecret, {
            expiresIn: "7d",
        });

        res.status(200).json({
            success: true,
            message: "Logged in successfully",
            sessionToken,
            user: {
                id: user._id,
                name: user.name,
                email: user.email,
            },
        });
    } catch (error) {
        logger.error(`Error in loginUser: ${error.message}`);
        res.status(500).json({ success: false, message: error.message || "Server Error" });
    }
};

export const updateProfile = async (req, res) => {
    try {
        const { name, mobileNumber, password } = req.body;
        const user = await User.findById(req.user.id);

        if (!user) {
            return res.status(404).json({ success: false, message: "User not found" });
        }

        if (name) user.name = name;
        if (mobileNumber !== undefined) user.mobileNumber = mobileNumber;

        if (password) {
            user.password = await bcrypt.hash(password, 10);
        }

        await user.save();

        res.status(200).json({
            success: true,
            message: "Profile updated successfully",
            user: {
                id: user._id,
                name: user.name,
                email: user.email,
                mobileNumber: user.mobileNumber
            }
        });
    } catch (error) {
        logger.error(`Error in updateProfile: ${error.message}`);
        res.status(500).json({ success: false, message: error.message || "Server Error" });
    }
};

export const toggleAlert = async (req, res) => {
    try {
        const { ipoSlug, ipoName } = req.body;
        const userId = req.user.id;

        if (!ipoSlug || !ipoName) {
            return res.status(400).json({ success: false, message: "IPO details are required" });
        }

        const existingAlert = await Alert.findOne({ userId, ipoSlug });

        if (existingAlert) {
            await existingAlert.deleteOne();
            return res.status(200).json({ success: true, message: "Alert removed successfully", alertStatus: false });
        } else {
            await Alert.create({ userId, ipoSlug, ipoName });
            return res.status(201).json({ success: true, message: "Alert added successfully", alertStatus: true });
        }
    } catch (error) {
        logger.error(`Error in toggleAlert: ${error.message}`);
        res.status(500).json({ success: false, message: error.message || "Server Error" });
    }
};

export const getMyAlerts = async (req, res) => {
    try {
        const alerts = await Alert.find({ userId: req.user.id }).sort({ createdAt: -1 });
        res.status(200).json({ success: true, data: alerts });
    } catch (error) {
        logger.error(`Error in getMyAlerts: ${error.message}`);
        res.status(500).json({ success: false, message: error.message || "Server Error" });
    }
};
