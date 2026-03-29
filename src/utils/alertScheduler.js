import cron from 'node-cron';
import IpoFull from '../models/IpoFull.js';
import Alert from '../models/Alert.js';
import User from '../models/User.js';
import sendEmail from './sendEmail.js';
import logger from './logger.js';

let isAlertSchedulerInitialized = false;

const sendAlertEmails = async () => {
  logger.info("Running IPO Alert Email Scheduler...");
  try {
    // Define a window for "today" + "tomorrow" based on server clock.
    // Previous logic used tomorrow@00:00 as the upper bound, which excluded
    // most "tomorrow" timestamps (e.g., tomorrow at 10:00).
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const startOfTomorrow = new Date(today);
    startOfTomorrow.setDate(startOfTomorrow.getDate() + 1);

    const endOfTomorrow = new Date(startOfTomorrow);
    endOfTomorrow.setHours(23, 59, 59, 999);

    // Find IPOs opening or closing around the current date. For simplicity, let's find IPOs opening or closing in the next 2 days or today.
    const ipos = await IpoFull.find({
      $or: [
        { 'dates.open': { $gte: today, $lte: endOfTomorrow } },
        { 'dates.close': { $gte: today, $lte: endOfTomorrow } }
      ]
    });

    if (ipos.length === 0) {
      logger.info("No IPOs opening or closing soon for alerts.");
      return;
    }

    for (const ipo of ipos) {
      let alertTypeStr = "";
      let actionText = "";

      const openDate = ipo.dates?.open ? new Date(ipo.dates.open) : null;
      const closeDate = ipo.dates?.close ? new Date(ipo.dates.close) : null;

      if (openDate && openDate.toDateString() === today.toDateString()) {
        alertTypeStr = "Opens Today!";
        actionText = "The subscription window is now open. Don't miss out!";
      } else if (openDate && openDate >= startOfTomorrow && openDate <= endOfTomorrow) {
        alertTypeStr = "Opens Tomorrow!";
        actionText = "Get ready! The subscription window opens tomorrow.";
      } else if (closeDate && closeDate.toDateString() === today.toDateString()) {
        alertTypeStr = "Closes Today!";
        actionText = "Last chance! The subscription window closes today.";
      } else if (closeDate && closeDate >= startOfTomorrow && closeDate <= endOfTomorrow) {
        alertTypeStr = "Closes Tomorrow!";
        actionText = "Warning! The subscription window closes tomorrow.";
      } else {
        continue; // Not matching our exact criteria
      }

      // Find all alerts for this IPO
      const alerts = await Alert.find({ ipoSlug: ipo.slug });

      for (const alert of alerts) {
        const user = await User.findById(alert.userId);
        if (!user) continue;

        // Stunning Email Template for Alert Me
        const emailHtml = `
  <div style="max-width: 600px; margin: auto; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f9fafb; border-radius: 12px; overflow: hidden; border: 1px solid #e2e8f0;">
    <div style="background: linear-gradient(135deg, #0ea5e9 0%, #3b82f6 100%); padding: 24px 20px; text-align: center;">
      <h1 style="color: #ffffff; margin: 0; font-size: 24px; font-weight: 700;">IPO Alert: ${ipo.companyName}</h1>
      <div style="display: inline-block; margin-top: 10px; background-color: rgba(255,255,255,0.2); padding: 5px 15px; border-radius: 20px; color: #fff; font-weight: bold; font-size: 14px;">
        ${alertTypeStr}
      </div>
    </div>
    <div style="padding: 24px 30px; background-color: #ffffff;">
      <p style="font-size: 16px; color: #475569; margin-bottom: 20px; line-height: 1.6;">
        Hi ${user.name},
      </p>
      <p style="font-size: 16px; color: #475569; margin-bottom: 24px; line-height: 1.6;">
        ${actionText} Here are the key details for the <strong>${ipo.companyName}</strong> IPO:
      </p>
      
      <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px; padding: 20px; margin-bottom: 24px;">
        <table style="width: 100%; border-collapse: collapse;">
          <tr>
            <td style="padding: 8px 0; border-bottom: 1px solid #e2e8f0; color: #64748b; font-size: 14px;">Open Date</td>
            <td style="padding: 8px 0; border-bottom: 1px solid #e2e8f0; color: #0f172a; font-weight: 600; font-size: 14px; text-align: right;">${ipo.dates.open ? new Date(ipo.dates.open).toLocaleDateString() : 'N/A'}</td>
          </tr>
          <tr>
            <td style="padding: 8px 0; border-bottom: 1px solid #e2e8f0; color: #64748b; font-size: 14px;">Close Date</td>
            <td style="padding: 8px 0; border-bottom: 1px solid #e2e8f0; color: #0f172a; font-weight: 600; font-size: 14px; text-align: right;">${ipo.dates.close ? new Date(ipo.dates.close).toLocaleDateString() : 'N/A'}</td>
          </tr>
          <tr>
            <td style="padding: 8px 0; border-bottom: 1px solid #e2e8f0; color: #64748b; font-size: 14px;">Price Band</td>
            <td style="padding: 8px 0; border-bottom: 1px solid #e2e8f0; color: #0f172a; font-weight: 600; font-size: 14px; text-align: right;">₹${ipo.priceBand?.min || ''} - ₹${ipo.priceBand?.max || ''}</td>
          </tr>
          <tr>
            <td style="padding: 8px 0; border-bottom: 1px solid #e2e8f0; color: #64748b; font-size: 14px;">Lot Size</td>
            <td style="padding: 8px 0; border-bottom: 1px solid #e2e8f0; color: #0f172a; font-weight: 600; font-size: 14px; text-align: right;">${ipo.lotSize || 'N/A'}</td>
          </tr>
          <tr>
            <td style="padding: 8px 0; color: #64748b; font-size: 14px;">Current GMP</td>
            <td style="padding: 8px 0; color: #16a34a; font-weight: 700; font-size: 16px; text-align: right;">₹${ipo.gmp?.current || 0}</td>
          </tr>
        </table>
      </div>

      <div style="text-align: center;">
         <a href="https://openipo.in/ipo/${ipo.slug}" style="display: inline-block; background-color: #0ea5e9; color: #ffffff; text-decoration: none; padding: 12px 24px; border-radius: 8px; font-weight: 600; font-size: 15px; transition: background-color 0.3s;">View Full Details</a>
      </div>
      
    </div>
    <div style="background-color: #f1f5f9; padding: 16px; text-align: center; font-size: 13px; color: #94a3b8; border-top: 1px solid #e2e8f0;">
      You are receiving this because you clicked "Alert Me" for this IPO on OpenIPO.<br/>
      &copy; ${new Date().getFullYear()} OpenIPO Dashboard. All rights reserved.
    </div>
  </div>
`;

        await sendEmail({
          to: user.email,
          subject: `${ipo.companyName} IPO ${alertTypeStr}`,
          text: `IPO Alert: ${ipo.companyName} ${alertTypeStr}. Current GMP: ₹${ipo.gmp?.current || 0}`,
          html: emailHtml,
        });
      }
    }
  } catch (error) {
    logger.error(`Error running alert scheduler: ${error.message}`);
  }
};

// Run every day at 09:00 AM
export const initAlertScheduler = () => {
  if (isAlertSchedulerInitialized) return;
  isAlertSchedulerInitialized = true;

  logger.info("Initializing node-cron for IPO alerts...");
  cron.schedule(
    '0 9 * * *',
    () => {
      // `sendAlertEmails` has its own try/catch, but we still call it async-safe.
      void sendAlertEmails();
    },
    {
      timezone: process.env.CRON_TIMEZONE || 'Asia/Kolkata',
    }
  );
};
