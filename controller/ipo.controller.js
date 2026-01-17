import IPO from "../models/ipo.model.js";
import IpoDetails from "../models/ipodetails.model.js";
import IpoReservation from "../models/ipodetailsreservation.model.js";
import IpoSubscription from "../models/iposubscription.model.js";
import IpoGmp from "../models/ipogmp.model.js";
import BasisOfAllotment from "../models/basisofallotment.model.js";
import { asyncHandler } from "../middleware/errorHandler.js";


const calculateStatus = (ipo) => {
  const start = ipo?.startDate ? new Date(ipo.startDate) : null;
  const end = ipo?.endDate ? new Date(ipo.endDate) : null;
  const today = new Date();

  // If missing dates, default upcoming
  if (!start || !end || isNaN(start.getTime()) || isNaN(end.getTime())) {
    return "Upcoming";
  }

  today.setHours(0, 0, 0, 0);
  start.setHours(0, 0, 0, 0);
  end.setHours(0, 0, 0, 0);

  if (today < start) return "Upcoming";
  if (today >= start && today <= end) return "Open";
  return "Closed";
};

/**
 * ✅ Normalize IPO object for frontend
 * attach dates: frontend uses ipo.dates.open etc.
 */
const normalizeIpoForFrontend = (ipo) => ({
  ...ipo,
  status: calculateStatus(ipo),
  dates: {
    open: ipo.startDate || "",
    close: ipo.endDate || "",
    allotment: ipo.allotmentDate || "",
    listing: ipo.listingDate || "",
  },
});

/**
 * ✅ GET all IPOs
 * Used for landing page list
 */
export const getAllIPOs = asyncHandler(async (req, res) => {
  const ipos = await IPO.find({}).sort({ createdAt: -1 }).lean();
  const normalized = ipos.map(normalizeIpoForFrontend);

  return res.json({
    success: true,
    data: normalized,
    pagination: {
      total: normalized.length,
      page: 1,
      limit: normalized.length,
    },
  });
});

/**
 * ✅ GET single IPO by slug (FULL SLUG PAGE DATA)
 * Returns ALL related collections
 */
export const getIPOBySlug = asyncHandler(async (req, res) => {
  const { slug } = req.params;

  const ipo = await IPO.findOne({ slug }).lean();
  if (!ipo) {
    return res.status(404).json({
      success: false,
      message: "IPO not found",
    });
  }

  // ✅ Fetch other collections in parallel
  const [details, reservation, subscription, gmp, basisOfAllotment] =
    await Promise.all([
      IpoDetails.findOne({ slug }).lean(),
      IpoReservation.findOne({ slug }).lean(),
      IpoSubscription.findOne({ slug }).lean(),
      IpoGmp.findOne({ slug }).lean(),
      BasisOfAllotment.findOne({ slug }).lean(),
    ]);

  return res.json({
    success: true,
    ipo: normalizeIpoForFrontend(ipo),

    // ✅ Safe fallbacks to prevent frontend crash
    details: details || {},
    reservation: reservation || { reservations: [] },
    subscription: subscription || { subscriptions: [] },
    gmp: gmp || { gmpHistory: [] },
    basisOfAllotment: basisOfAllotment || {},
  });
});

/**
 * ✅ Convenience endpoints
 * Later you can add real filters,
 * but for now safe so nothing breaks.
 */
export const getOpenIPOs = getAllIPOs;
export const getUpcomingIPOs = getAllIPOs;
export const getClosedIPOs = getAllIPOs;
export const getListedTodayIPOs = getAllIPOs;
