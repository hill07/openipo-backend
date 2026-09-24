import IpoFull from '../models/IpoFull.js';
import { istDay, nameKey } from './subscriptionRefresh.js';
import { fetchReport, stripHtml } from './reportFeed.js';

/** The public IPO list, used only to notice issues we are not carrying at all. */
const LIST_REPORT = 331;

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

        if (!hasReservations) {
            // The reservation split is set by the DRHP/RHP and varies by issue — employee
            // and shareholder quotas, loss-making issuers, SME structures. Without it the
            // denominator is derived from the exchange, which is an estimate.
            warnings.push(
                cats.some((c) => Number(c.sharesOffered))
                    ? `${doc.companyName}: offered quantities derived from the exchange, not the prospectus`
                    : `${doc.companyName}: no reservation split from the prospectus`
            );
        }

        if (bidding && !Number(doc.priceBand?.max)) {
            problems.push(`${doc.companyName}: open for bidding with no price band`);
        }

        if (bidding && !Number(doc.lotSize)) {
            warnings.push(`${doc.companyName}: no lot size`);
        }
    }

    // An IPO that is open in the market but absent from our database is invisible to
    // readers, and no refresh can fix it: the refresh only updates records that exist.
    // This is how a new issue announces itself.
    const missing = await findMissingIpos(docs);
    problems.push(...missing.open);
    warnings.push(...missing.upcoming);

    return { checked: docs.length, live, problems, warnings, healthy: problems.length === 0 };
}

async function findMissingIpos(docs) {
    const out = { open: [], upcoming: [] };
    let rows;
    try {
        rows = await fetchReport(LIST_REPORT);
    } catch (error) {
        out.upcoming.push(`could not check for new IPOs: ${error.message}`);
        return out;
    }

    const known = new Set(docs.map((d) => nameKey(d.companyName)));

    for (const row of rows) {
        const status = String(row['~ipo_status1'] || '').trim();
        if (!['O', 'U'].includes(status)) continue;

        const name = String(row['~ipo_name'] || '').trim();
        const key = nameKey(name);
        if (!key || known.has(key)) continue;
        // Names differ between sources, so accept a prefix match before calling it missing.
        if ([...known].some((k) => k.startsWith(key) || key.startsWith(k))) continue;

        const opens = String(row['~Srt_Open'] || '').slice(0, 10);
        const closes = stripHtml(row.Close);

        if (status === 'O') {
            out.open.push(`${name}: open in the market but missing from our database`);
            continue;
        }

        // An issue that opens within days needs adding now, not "soon" — escalate it so
        // the daily alert fires while there is still time to publish the page.
        const daysToOpen = opens
            ? Math.round((new Date(opens) - new Date(istDay())) / 86400000)
            : null;
        const line = `${name}: upcoming IPO not in our database (opens ${opens || 'TBA'}, closes ${closes || 'TBA'})`;
        if (daysToOpen !== null && daysToOpen <= 3) out.open.push(line);
        else out.upcoming.push(line);
    }
    return out;
}
