import jwt from "jsonwebtoken";
import User from "../models/user.model.js";
import { asyncHandler } from "./errorHandler.js";

export const protect = asyncHandler(async (req, res, next) => {
  let token;

  if (req.headers.authorization && req.headers.authorization.startsWith("Bearer")) {
    token = req.headers.authorization.split(" ")[1];
  }

  if (!token) {
    return res.status(401).json({ message: "Not authorized, no token" });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || "your-secret-key");
    req.user = await User.findById(decoded.id).select("-passwordHash");
    
    if (!req.user || !req.user.isActive) {
      return res.status(401).json({ message: "User not found or inactive" });
    }
    
    next();
  } catch (error) {
    return res.status(401).json({ message: "Not authorized, token failed" });
  }
});

export const admin = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({ message: "Not authorized" });
  }
  
  if (req.user.role !== "admin") {
    return res.status(403).json({ message: "Access denied. Admin role required." });
  }
  
  next();
};