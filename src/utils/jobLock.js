/**
 * One refresh of a given kind at a time, per process.
 *
 * Both the in-process cron and the external scheduler's HTTP trigger can start the
 * same refresh. When they overlapped, two passes loaded the same documents and the
 * second save failed with "No matching document found for id ..." — a mongoose
 * version conflict — which aborted the whole run. The lock is shared by both callers
 * so whichever arrives second is skipped.
 *
 * A lock also EXPIRES. A run that hangs on an unresponsive upstream would otherwise
 * hold the lock for the life of the process, turning every later trigger into a 409
 * and silently freezing the data until someone redeployed.
 */
const STALE_AFTER_MS = 5 * 60 * 1000;

const running = new Map();

function heldSince(name) {
    const startedAt = running.get(name);
    if (!startedAt) return null;
    if (Date.now() - startedAt > STALE_AFTER_MS) {
        running.delete(name); // presumed dead; let a fresh run take over
        return null;
    }
    return startedAt;
}

export function isRunning(name) {
    return heldSince(name) !== null;
}

/**
 * @returns {Promise<{ skipped: true } | { skipped: false, result: any }>}
 */
export async function withJobLock(name, fn) {
    if (isRunning(name)) return { skipped: true };
    running.set(name, Date.now());
    try {
        return { skipped: false, result: await fn() };
    } finally {
        running.delete(name);
    }
}
