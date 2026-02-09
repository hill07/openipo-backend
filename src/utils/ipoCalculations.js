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
    if (Array.isArray(ipoDoc.reservations) && ipoDoc.reservations.length > 0) {
        // Priority: issueBreakdown.total.shares > issueSize.shares > Sum of Reservations
        const breakdownTotal = Number(ipoDoc.issueBreakdown?.total?.shares);
        const issueSizeTotal = Number(ipoDoc.issueSize?.shares);
        const sumReservations = ipoDoc.reservations.reduce((acc, r) => (r.enabled !== false ? acc + (Number(r.sharesOffered) || 0) : acc), 0);

        let totalResShares = breakdownTotal || issueSizeTotal || sumReservations;

        if (totalResShares > 0) {
            ipoDoc.reservations.forEach(r => {
                if (r.enabled !== false) {
                    const offered = Number(r.sharesOffered) || 0;
                    r.percentage = Number(((offered / totalResShares) * 100).toFixed(2));
                }
            });
        }
    }

    // 5. Subscription Times (Dynamic)
    if (ipoDoc.subscription && Array.isArray(ipoDoc.subscription.categories)) {

        let totalOffered = 0;
        let totalApplied = 0;
        // let totalAnchor = 0; // We might need this if we want to subtract from Total Offered globally?
        // User rule: Total subscription MUST be calculated exactly as: TOTAL = QIB + HNI + Retail + Employee + Shareholder + Policyholder
        // MarketMaker excluded. Anchor excluded.

        ipoDoc.subscription.categories.forEach(cat => {
            if (cat.enabled !== false) {
                // Skip Market Maker for Subscription Totals
                if (cat.category === 'MarketMaker') return;

                const offered = Number(cat.sharesOffered) || 0;
                const applied = Number(cat.appliedShares) || 0;
                let effectiveOffered = offered;

                // For QIB, subtract Anchor shares
                if (cat.category === 'QIB') {
                    // Find anchor shares from Reservations
                    const qibRes = ipoDoc.reservations?.find(r => r.category === 'QIB');
                    const anchor = Number(qibRes?.anchorShares) || 0;
                    effectiveOffered = Math.max(0, offered - anchor);
                    // totalAnchor += anchor;
                }

                // Times Calculation
                if (effectiveOffered > 0) {
                    cat.times = Number((applied / effectiveOffered).toFixed(2));
                } else {
                    cat.times = 0;
                }

                // Add to Totals (Using effective offered? "Total = QIB + ..." implied applied.
                // But for "Total Times", usually it is Total Applied / Total Effective Offered.
                // User said: "TOTAL subscription MUST be calculated exactly as: TOTAL = QIB + HNI + ..."
                // This likely means the *sum of components*.
                // And "MarketMaker excluded. Anchor excluded."
                // So Total Applied = Sum(Applied)
                // Total Offered = Sum(Effective Offered) [Offered - Anchor]

                totalOffered += effectiveOffered;
                totalApplied += applied;
            }
        });

        // Total
        let totalTimes = 0;
        if (totalOffered > 0) {
            totalTimes = Number((totalApplied / totalOffered).toFixed(2));
        }

        // Add totals to subscription object if it's a plain object
        ipoDoc.subscription.totalTimes = totalTimes;
        ipoDoc.subscription.totalOffered = totalOffered;
        ipoDoc.subscription.totalApplied = totalApplied;
    }

    return ipoDoc;
};
