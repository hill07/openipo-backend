/**
 * Calculate IPO Status based on dates
 * @param {Object} dates - { open, close, allotment, listing }
 * @param {Date} now - Current date object (default new Date())
 * @returns {String} - UPCOMING | OPEN | CLOSED | ALLOTMENT | LISTED
 */
export const calculateIpoStatus = (dates, now = new Date()) => {
    if (!dates) return 'UPCOMING';

    const open = dates.open ? new Date(dates.open) : null;
    const close = dates.close ? new Date(dates.close) : null;
    const allotment = dates.allotment ? new Date(dates.allotment) : null;
    const listing = dates.listing ? new Date(dates.listing) : null;
    const today = now;

    if (listing && today >= listing) return 'LISTED';
    if (allotment && today >= allotment) return 'ALLOTMENT';
    if (close && today > close) return 'CLOSED';
    if (open && close && today >= open && today <= close) return 'OPEN';
    if (open && today < open) return 'UPCOMING';

    return 'UPCOMING';
};


/**
 * Compute Derived Fields for IPO Document
 * Modifies the ipoDoc in place or returns a new object
 * @param {Object} ipoDoc 
 */
export const computeDerivedFields = (ipoDoc) => {
    // 1. Status (if dates exist)
    if (ipoDoc.dates) {
        ipoDoc.status = calculateIpoStatus(ipoDoc.dates);
    }

    // 2. Min Investment
    const maxPrice = Number(ipoDoc.priceBand?.max);
    const lotSize = Number(ipoDoc.lotSize);

    if (!isNaN(maxPrice) && !isNaN(lotSize) && maxPrice > 0 && lotSize > 0) {
        ipoDoc.minInvestment = maxPrice * lotSize;
    }

    // 3. GMP Derived
    const gmpCurrent = Number(ipoDoc.gmp?.current || 0);

    if (ipoDoc.gmp) {
        if (!isNaN(maxPrice) && maxPrice > 0) {
            ipoDoc.gmp.percent = Number(((gmpCurrent / maxPrice) * 100).toFixed(2));
            ipoDoc.gmp.estListingPrice = maxPrice + gmpCurrent;
        } else {
            ipoDoc.gmp.percent = null;
            ipoDoc.gmp.estListingPrice = null;
        }
    }

    // 4. Reservation Percentages
    // Normalize percentages based on Total Shares offered in Reservations
    if (Array.isArray(ipoDoc.reservations) && ipoDoc.reservations.length > 0) {
        let totalResShares = ipoDoc.reservations.reduce((acc, r) => acc + (Number(r.sharesOffered) || 0), 0);

        if (totalResShares > 0) {
            ipoDoc.reservations.forEach(r => {
                const offered = Number(r.sharesOffered) || 0;
                r.percentage = Number(((offered / totalResShares) * 100).toFixed(2));
            });
        }
    }

    // 5. Subscription Summary
    if (ipoDoc.subscription && Array.isArray(ipoDoc.subscription.categories)) {

        const summary = {
            qib: 0, retail: 0, hni: 0, shni: 0, bhni: 0, emp: 0, total: 0
        };
        let totalOffered = 0;
        let totalApplied = 0;

        ipoDoc.subscription.categories.forEach(cat => {
            // Try to match sharesOffered from Reservations if specific category logic applies
            // (Skipped for now, assuming frontend or pre-calc handles exact sharesOffered)

            const offered = Number(cat.sharesOffered) || 0;
            const applied = Number(cat.sharesBid) || 0;

            // Recalculate Times if needed
            if (offered > 0) {
                cat.subscriptionTimes = Number((applied / offered).toFixed(2));
            } else {
                cat.subscriptionTimes = 0;
            }

            totalOffered += offered;
            totalApplied += applied;

            // Map to Summary fields
            const name = (cat.name || '').toLowerCase();
            const times = cat.subscriptionTimes || 0;

            if (name.includes('qib')) summary.qib = times;
            else if (name.includes('retail') || name.includes('individual')) summary.retail = times;
            else if (name.includes('employee') || name.includes('emp')) summary.emp = times;
            else if (name.includes('nii') || name.includes('hni')) {
                // Split logic
                if (name.includes('bhni') || name.includes('big')) summary.bhni = times;
                else if (name.includes('shni') || name.includes('small')) summary.shni = times;
                else summary.hni = times; // Generic HNI/NII maps to hni
            }
        });

        // Total
        let totalTimes = 0;
        if (totalOffered > 0) {
            totalTimes = Number((totalApplied / totalOffered).toFixed(2));
        }
        summary.total = totalTimes;

        ipoDoc.subscription.summary = summary;
    }

    return ipoDoc;
};
