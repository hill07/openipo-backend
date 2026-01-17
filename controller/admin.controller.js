import IPO from "../models/ipo.model.js";
import { asyncHandler } from "../middleware/errorHandler.js";
import { getIPOStatusFromDates } from "../utils/ipoStatus.js";

export const createIPO = asyncHandler(async (req, res) => {
  const ipoData = req.body;

  // Generate slug if not provided
  if (!ipoData.slug && ipoData.companyName) {
    ipoData.slug = ipoData.companyName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "");
  }

  // Set metadata
  ipoData.meta = {
    ...ipoData.meta,
    lastUpdated: new Date(),
    isActive: true
  };

  const ipo = await IPO.create(ipoData);

  res.status(201).json({
    message: "IPO created successfully",
    data: ipo
  });
});

export const updateIPO = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const updateData = { ...req.body };

  // Handle meta object separately to avoid conflicts
  // If meta is provided, extract it and merge with lastUpdated
  if (updateData.meta) {
    const metaData = updateData.meta;
    delete updateData.meta; // Remove meta from updateData to avoid conflict
    
    // Set each meta field individually using dot notation
    Object.keys(metaData).forEach(key => {
      updateData[`meta.${key}`] = metaData[key];
    });
  }

  // Always update last updated timestamp
  updateData["meta.lastUpdated"] = new Date();

  const ipo = await IPO.findByIdAndUpdate(
    id,
    { $set: updateData },
    { new: true, runValidators: true }
  );

  if (!ipo) {
    return res.status(404).json({ message: "IPO not found" });
  }

  res.json({
    message: "IPO updated successfully",
    data: ipo
  });
});

export const deleteIPO = asyncHandler(async (req, res) => {
  const { id } = req.params;

  // Soft delete by setting isActive to false
  const ipo = await IPO.findByIdAndUpdate(
    id,
    { $set: { "meta.isActive": false } },
    { new: true }
  );

  if (!ipo) {
    return res.status(404).json({ message: "IPO not found" });
  }

  res.json({
    message: "IPO deleted successfully"
  });
});

// Get all IPOs for admin (including inactive)
export const getAllIPOsAdmin = asyncHandler(async (req, res) => {
  const ipos = await IPO.find()
    .sort({ createdAt: -1 })
    .lean();
  
  // Add derived status
  const iposWithStatus = ipos.map(ipo => ({
    ...ipo,
    status: getIPOStatusFromDates(ipo.dates || {})
  }));
  
  res.json({ data: iposWithStatus });
});

// Get single IPO for admin
export const getIPOAdmin = asyncHandler(async (req, res) => {
  const { id } = req.params;
  
  const ipo = await IPO.findById(id).lean();
  
  if (!ipo) {
    return res.status(404).json({ message: "IPO not found" });
  }
  
  res.json(ipo);
});

// Get admin dashboard stats
export const getAdminDashboard = asyncHandler(async (req, res) => {
  const allIPOs = await IPO.find().lean();
  
  // Count by status
  let openCount = 0;
  let upcomingCount = 0;
  let closedCount = 0;
  
  allIPOs.forEach(ipo => {
    const status = getIPOStatusFromDates(ipo.dates || {});
    switch (status) {
      case "Open": openCount++; break;
      case "Upcoming": upcomingCount++; break;
      case "Closed": closedCount++; break;
    }
  });
  
  // Recently updated (last 7 days)
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  
  const recentlyUpdated = await IPO.find({
    "meta.lastUpdated": { $gte: sevenDaysAgo }
  })
    .sort({ "meta.lastUpdated": -1 })
    .limit(10)
    .select("companyName slug meta.lastUpdated")
    .lean();
  
  res.json({
    counts: {
      total: allIPOs.length,
      open: openCount,
      upcoming: upcomingCount,
      closed: closedCount
    },
    recentlyUpdated
  });
});