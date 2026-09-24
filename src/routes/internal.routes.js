import crypto from 'crypto';
import express from 'express';
import { refreshSubscriptions } from '../utils/subscriptionRefresh.js';
import { refreshGmp } from '../utils/gmpRefresh.js';
import { discoverIpos } from '../utils/ipoDiscovery.js';
import { auditIpoData } from '../utils/subscriptionAudit.js';
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

/** Last completed run of each job, so a fire-and-forget trigger can be checked later. */
const lastRun = {};

const JOBS = {
    subscription: () => refreshSubscriptions({ apply: true }),
    gmp: () => refreshGmp({ apply: true }),
    // Publishes IPOs that exist in the market but not in our database. Without it the
    // refresh jobs have nothing to update and a new issue never appears on the site.
    discover: () => discoverIpos({ apply: true }),
    // Everything a live IPO page shows, in one call. Each half takes its own lock, so
    // a scheduled subscription run already in flight is skipped rather than duplicated.
    all: async () => {
        const subscription = await withJobLock('subscription', () => refreshSubscriptions({ apply: true }));
        const gmp = await withJobLock('gmp', () => refreshGmp({ apply: true }));
        return { combined: { subscription, gmp } };
    },
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
    if (job === 'all') {
        const part = (name, run) =>
            run.skipped
                ? `${name} skipped (already running)`
                : `${name} updated ${run.result.report.updated.length}`;
        return `${part('subscription', report.combined.subscription)}, ${part('gmp', report.combined.gmp)}`;
    }
    if (job === 'discover') {
        const names = report.created.map((c) => c.name).join('; ');
        return `published ${report.created.length}${names ? ` (${names})` : ''}, ${report.drifted.length} drifted, ${report.skipped.length} skipped`;
    }
    if (job === 'gmp') {
        return `updated ${report.updated.length}, unchanged ${report.unchanged.length}, no quote ${report.noQuote.length}`;
    }
    return `updated ${report.updated.length}, unchanged ${report.unchanged.length}, errors ${report.errors.length}`;
}

router.all('/refresh/:job', async (req, res) => {
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

    // ?wait=1 holds the connection until the job finishes and returns the summary.
    // It is for a person running this by hand: a full pass takes 15-20s, well past a
    // scheduler's response timeout, which is why the default answers immediately.
    const wait = ['1', 'true', 'yes'].includes(String(req.query.wait || '').toLowerCase());

    const finish = (run) => {
        const seconds = Math.round((Date.now() - startedAt) / 1000);
        if (run.skipped) {
            logger.info(`[refresh:${job}] skipped — already running`);
            return { ok: false, job, skipped: true, reason: 'already running', seconds };
        }
        const report = run.result.report || run.result;
        const summary = summarize(job, report);
        logger.info(`[refresh:${job}] done in ${seconds}s — ${summary}`);
        for (const d of report.drifted || []) logger.warn(`[refresh:${job}] ${d}`);

        const result = { ok: true, job, seconds, summary, details: details(job, report) };
        lastRun[job] = { ...result, finishedAt: new Date().toISOString() };
        return result;
    };

    if (wait) {
        try {
            return res.json(finish(await withJobLock(job, JOBS[job])));
        } catch (error) {
            logger.error(`[refresh:${job}] failed: ${error.message}`);
            return res.status(500).json({ ok: false, job, error: error.message });
        }
    }

    // Answer first, work after: the scheduler only needs to know we accepted it.
    res.status(202).json({ ok: true, job, started: true, tip: 'add ?wait=1 to get the result inline' });

    withJobLock(job, JOBS[job])
        .then(finish)
        .catch((error) => {
            logger.error(`[refresh:${job}] failed: ${error.message}`);
            lastRun[job] = { ok: false, job, error: error.message, finishedAt: new Date().toISOString() };
        });
});

/** The per-IPO lines behind the one-line summary. */
function details(job, report) {
    if (job === 'all') {
        return {
            subscription: report.combined.subscription.skipped
                ? 'skipped'
                : details('subscription', report.combined.subscription.result.report),
            gmp: report.combined.gmp.skipped
                ? 'skipped'
                : details('gmp', report.combined.gmp.result.report),
        };
    }
    if (job === 'discover') {
        return { published: report.created.map((c) => `${c.name} (${c.type}, opens ${c.opens})`), drifted: report.drifted };
    }
    if (job === 'gmp') {
        return { updated: report.updated.map((u) => `${u.name}: ₹${u.from} -> ₹${u.to}`), noQuote: report.noQuote.length };
    }
    return {
        updated: report.updated.map((u) => `${u.name}: ${Number(u.total).toFixed(2)}x`),
        unchanged: report.unchanged.length,
        errors: report.errors,
    };
}

/** What happened on the last run of each job, for checking after a fire-and-forget call. */
router.get('/status', (req, res) => {
    const provided = req.get('x-refresh-token') || req.query.token;
    if (!tokenMatches(provided)) return res.status(401).json({ ok: false, error: 'unauthorized' });
    return res.json({ ok: true, running: Object.keys(JOBS).filter(isRunning), lastRun });
});

/**
 * Data health check. Answers 409 when a live IPO is showing nothing to readers or is
 * missing a price band, so an external scheduler's "notify on failure" becomes a real
 * alert instead of a fault sitting in a log nobody reads.
 */
router.all('/audit', async (req, res) => {
    const provided = req.get('x-refresh-token') || req.query.token;
    if (!tokenMatches(provided)) return res.status(401).json({ ok: false, error: 'unauthorized' });

    try {
        const result = await auditIpoData();
        for (const p of result.problems) logger.warn(`[audit] ${p}`);
        return res.status(result.healthy ? 200 : 409).json(result);
    } catch (error) {
        logger.error(`[audit] failed: ${error.message}`);
        return res.status(500).json({ ok: false, error: error.message });
    }
});

/**
 * Cheap liveness ping, useful as a keep-alive target. Answers any method: an
 * external scheduler set to POST would otherwise get a confusing 404 from a
 * GET-only route, which looks like a failed deploy rather than a wrong verb.
 */
router.all('/ping', (_req, res) => res.json({ ok: true, at: new Date().toISOString() }));

export default router;
