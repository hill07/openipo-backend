import IpoFull from '../models/IpoFull.js';
import { istDay } from './subscriptionRefresh.js';

/**
 * Catch IPOs that are showing wrong or missing figures to readers, before a reader
 * finds them.
 *
 * This exists because two open IPOs sat with no subscription data at all and nothing
 * announced it — the refresh quietly skipped them every 15 minutes because neither the
 * exchange nor our own records carried a denominator. The refresh reports said so, but
 * only in logs nobody reads.
 *
 * `problems` are reader-visible faults on a live issue. `warnings` are things worth
 * knowing that are not yet wrong on the page.
 */
export async function auditIpoData({ upcomingWithinDays = 2 } = {}) {
    const today = istDay();
    const docs = await IpoFull.find({ isDeleted: { $ne: true } });

    const problems = [];
    const warnings = [];
    let live = 0;

    for (const doc of docs) {
        const open = doc.dates?.open ? istDay(doc.dates.open) : null;
        const close = doc.dates?.close ? istDay(doc.dates.close) : null;
        const listing = doc.dates?.listing ? istDay(doc.dates.listing) : null;

        if (!open || !close) {
            // A record with no dates cannot be placed anywhere on the site.
            if (!listing || listing >= today) problems.push(`${doc.companyName}: missing open/close dates`);
            continue;
        }
        if (listing && today > listing) continue; // already listed; figures are final

        const daysToOpen = Math.round((new Date(open) - new Date(today)) / 86400000);
        const bidding = today >= open && today <= close;
        const awaitingListing = today > close;
        if (!bidding && !awaitingListing && daysToOpen > upcomingWithinDays) continue;

        live++;

        const cats = (doc.subscription?.categories || []).filter((c) => c.enabled !== false);
        const measurable = cats.some(
            (c) => (Number(c.sharesOffered) && Number(c.appliedShares)) || Number(c.timesReported)
        );
        const hasReservations = (doc.reservations || []).some(
            (r) => r.enabled !== false && Number(r.sharesOffered)
        );

        if ((bidding || awaitingListing) && !measurable) {
            problems.push(
                `${doc.companyName} (${doc.type}, ${bidding ? 'open' : 'closed, awaiting listing'}): no subscription figure`
            );
        }

        if (!hasReservations && !cats.some((c) => Number(c.sharesOffered))) {
            warnings.push(`${doc.companyName}: no reservation split from the prospectus`);
        }

        if (bidding && !Number(doc.priceBand?.max)) {
            problems.push(`${doc.companyName}: open for bidding with no price band`);
        }

        if (bidding && !Number(doc.lotSize)) {
            warnings.push(`${doc.companyName}: no lot size`);
        }
    }

    return { checked: docs.length, live, problems, warnings, healthy: problems.length === 0 };
}
