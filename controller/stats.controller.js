import IPO from "../models/ipo.model.js";
import ListingHistory from "../models/listingHistory.model.js";
import { asyncHandler } from "../middleware/errorHandler.js";
import { getIPOStatusFromDates } from "../utils/ipoStatus.js";
import { isToday } from "../utils/ipoStatus.js";

export const getDashboardStats = asyncHandler(async (req, res) => {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  
  // Get all active IPOs
  const allIPOs = await IPO.find({ "meta.isActive": true }).lean();
  
  // Today's highlights
  const today = {
    open: [],
    closing: [],
    allotment: [],
    listing: []
  };

  allIPOs.forEach(ipo => {
    const dates = ipo.dates || {};
    
    if (isToday(dates.open)) today.open.push(ipo);
    if (isToday(dates.close)) today.closing.push(ipo);
    if (isToday(dates.allotment)) today.allotment.push(ipo);
    if (isToday(dates.listing)) today.listing.push(ipo);
  });

  // Count by status
  let openCount = 0;
  let upcomingCount = 0;
  let closedCount = 0;
  let allottedCount = 0;
  let listedCount = 0;

  allIPOs.forEach(ipo => {
    const status = getIPOStatusFromDates(ipo.dates || {});
    switch (status) {
      case "Open": openCount++; break;
      case "Upcoming": upcomingCount++; break;
      case "Closed": closedCount++; break;
      case "Allotted": allottedCount++; break;
      case "Listed": listedCount++; break;
    }
  });

  // Count by IPO type
  const mainboardCount = allIPOs.filter(i => i.ipoType === "Mainboard").length;
  const smeCount = allIPOs.filter(i => i.ipoType === "SME").length;

  // Total listed companies (all-time)
  const totalListed = await ListingHistory.distinct("ipoId");
  const listedTodayCount = today.listing.length;

  res.json({
    today: {
      open: {
        count: today.open.length,
        companies: today.open.slice(0, 3).map(i => ({
          name: i.companyName,
          slug: i.slug
        }))
      },
      closing: {
        count: today.closing.length,
        companies: today.closing.slice(0, 3).map(i => ({
          name: i.companyName,
          slug: i.slug
        }))
      },
      allotment: {
        count: today.allotment.length,
        companies: today.allotment.slice(0, 3).map(i => ({
          name: i.companyName,
          slug: i.slug
        }))
      },
      listing: {
        count: today.listing.length,
        companies: today.listing.slice(0, 3).map(i => ({
          name: i.companyName,
          slug: i.slug
        }))
      }
    },
    stats: {
      totalIPOs: allIPOs.length,
      totalListedCompanies: totalListed.length,
      totalMainboard: mainboardCount,
      totalSME: smeCount,
      openIPO: openCount,
      upcomingIPO: upcomingCount,
      closedIPO: closedCount,
      listedToday: listedTodayCount
    }
  });
});