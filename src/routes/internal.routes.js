import crypto from 'crypto';
import express from 'express';
import { refreshSubscriptions } from '../utils/subscriptionRefresh.js';
import { refreshGmp } from '../utils/gmpRefresh.js';
import { isRunning, withJobLock } from '../utils/jobLock.js';
import logger from '../utils/logger.js';

/**
 * Trigger endpoint for an external scheduler (cron-job.org).
 *
 * Render's free tier sleeps after ~15 minutes idle, and a sleeping process runs no
 * in-process cron — so the evening subscription catch-up and the late GMP runs were
 * silently skipped. An outside request both wakes the service and does the work.
 *
 * Two behaviours matter for a free external scheduler:
 *
 *  - It answers 202 immediately and does the refresh in the background. A cold start
 *    plus a full NSE pass takes far longer than cron-job.org's response timeout;
 *    waiting for the result would make every run look "failed" even when it worked.
 *  - Overlapping runs are refused with 409 rather than queued, so a slow run cannot
 *    be lapped by the next tick and write the same documents twice.
 */
const router = express.Router();

const JOBS = {
    subscription: () => refreshSubscriptions({ apply: true }),
    gmp: () => refreshGmp({ apply: true }),
};

/** Constant-time compare so the token cannot be guessed a character at a time. */
function tokenMatches(provided) {
    const expected = process.env.REFRESH_TOKEN || '';
    if (!expected || !provided) return false;
    const a = Buffer.from(String(provided));
    const b = Buffer.from(expected);
    return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function summarize(job, report) {
    if (job === 'gmp') {
        return `updated ${report.updated.length}, unchanged ${report.unchanged.length}, no quote ${report.noQuote.length}`;
    }
    return `updated ${report.updated.length}, unchanged ${report.unchanged.length}, errors ${report.errors.length}`;
}

router.all('/refresh/:job', (req, res) => {
    const { job } = req.params;

    if (!process.env.REFRESH_TOKEN) {
        return res.status(503).json({ ok: false, error: 'REFRESH_TOKEN is not configured' });
    }

    const provided = req.get('x-refresh-token') || req.query.token;
    if (!tokenMatches(provided)) {
        logger.warn(`[refresh] rejected unauthorized call to ${job} from ${req.ip}`);
        return res.status(401).json({ ok: false, error: 'unauthorized' });
    }

    if (!JOBS[job]) {
        return res.status(404).json({ ok: false, error: `unknown job "${job}"`, jobs: Object.keys(JOBS) });
    }

    if (isRunning(job)) {
        return res.status(409).json({ ok: false, job, error: 'already running' });
    }

    const startedAt = Date.now();

    // Answer first, work after: the scheduler only needs to know we accepted it.
    res.status(202).json({ ok: true, job, started: true });

    withJobLock(job, JOBS[job])
        .then((run) => {
            if (run.skipped) return logger.info(`[refresh:${job}] skipped — already running`);
            logger.info(
                `[refresh:${job}] done in ${Math.round((Date.now() - startedAt) / 1000)}s — ${summarize(job, run.result.report)}`
            );
        })
        .catch((error) => {
            logger.error(`[refresh:${job}] failed: ${error.message}`);
        });
});

/**
 * Cheap liveness ping, useful as a keep-alive target. Answers any method: an
 * external scheduler set to POST would otherwise get a confusing 404 from a
 * GET-only route, which looks like a failed deploy rather than a wrong verb.
 */
router.all('/ping', (_req, res) => res.json({ ok: true, at: new Date().toISOString() }));

export default router;
