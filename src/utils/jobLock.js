/**
 * One refresh of a given kind at a time, per process.
 *
 * Both the in-process cron and the external scheduler's HTTP trigger can start the
 * same refresh. When they overlapped, two passes loaded the same documents and the
 * second save failed with "No matching document found for id ..." — a mongoose
 * version conflict — which aborted the whole run. The lock is shared by both callers
 * so whichever arrives second is simply skipped.
 */
const running = new Set();

export function isRunning(name) {
    return running.has(name);
}

/**
 * @returns {Promise<{ skipped: true } | { skipped: false, result: any }>}
 */
export async function withJobLock(name, fn) {
    if (running.has(name)) return { skipped: true };
    running.add(name);
    try {
        return { skipped: false, result: await fn() };
    } finally {
        running.delete(name);
    }
}
