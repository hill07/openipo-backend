import cron from 'node-cron';
import { refreshSubscriptions } from './subscriptionRefresh.js';
import logger from './logger.js';

let initialized = false;

/**
 * Pull live subscription figures from the NSE while issues are open.
 *
 * Bidding runs 10:00–17:00 IST, and the exchange republishes its counts every few
 * minutes, so every 15 minutes across that window (plus a 19:00 catch-up for the
 * end-of-day consolidated numbers) keeps the site current without hammering NSE.
 * When nothing is open the run is nearly free: one request that returns an empty
 * list of active issues.
 *
 * Set SUBSCRIPTION_REFRESH=off to disable, or SUBSCRIPTION_REFRESH_CRON to override
 * the schedule.
 */
const DEFAULT_CRON = '*/15 10-17 * * *';
const CATCHUP_CRON = '0 19 * * *';

async function runOnce(label) {
    try {
        const { report } = await refreshSubscriptions({ apply: true });
        if (report.updated.length) {
            logger.info(
                `[subscription:${label}] updated ${report.updated.length}/${report.activeIssues} live issues: ${report.updated
                    .map((u) => `${u.name} ${u.total}x`)
                    .join('; ')}`
            );
        } else {
            logger.info(
                `[subscription:${label}] no changes (${report.activeIssues} active issues on NSE)`
            );
        }
        for (const err of report.errors) logger.warn(`[subscription:${label}] ${err}`);
    } catch (error) {
        // A failed refresh must never take the API process down with it.
        logger.error(`[subscription:${label}] refresh failed: ${error.message}`);
    }
}

export const initSubscriptionScheduler = () => {
    if (initialized) return;
    if (String(process.env.SUBSCRIPTION_REFRESH || '').toLowerCase() === 'off') {
        logger.info('Subscription refresh is disabled (SUBSCRIPTION_REFRESH=off).');
        return;
    }
    initialized = true;

    const timezone = process.env.CRON_TIMEZONE || 'Asia/Kolkata';
    const schedule = process.env.SUBSCRIPTION_REFRESH_CRON || DEFAULT_CRON;

    logger.info(`Initializing NSE subscription refresh (${schedule}, ${timezone}).`);
    cron.schedule(schedule, () => void runOnce('live'), { timezone });
    cron.schedule(CATCHUP_CRON, () => void runOnce('eod'), { timezone });
};
