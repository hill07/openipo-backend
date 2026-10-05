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

        // 2b. Application limits per category.
        //
        // SEBI defines the buckets by application VALUE, not by lot count: retail is
        // capped at Rs 2 lakh, the small-NII band runs from there to Rs 10 lakh, and
        // big-NII starts above that. The lot count follows from the issue's own lot size
        // and cut-off price, so this is arithmetic rather than data — yet nothing
        // computed it and the field was only ever filled in by hand, which is why most
        // records had no lot ladder at all.
        const perLot = maxPrice * lotSize;
        const RETAIL_CAP = 200000;
        const SNII_CAP = 1000000;

        const retailMax = Math.floor(RETAIL_CAP / perLot);
        const sniiMax = Math.floor(SNII_CAP / perLot);

        // An SME lot can exceed Rs 2 lakh outright, leaving no retail band at all.
        if (retailMax >= 1) {
            ipoDoc.limits = {
                retail: { minLots: 1, maxLots: retailMax },
                shni: { minLots: retailMax + 1, maxLots: Math.max(sniiMax, retailMax + 1) },
                // The big-NII band has no upper limit beyond the issue itself.
                bhni: { minLots: Math.max(sniiMax, retailMax + 1) + 1, maxLots: 0 },
            };
        }
    }

    // 3. GMP Derived
    // Handled by virtuals in the schema for backend, but we keep it here for any manual usage?
    // Actually, if we remove it from schema, we don't need to compute it here in place.
    // However, if we want to return it in the object before saving, we can.
    // The user said "i want this only nothing else" in the schema.

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

                // sNII / bNII are a breakdown of NII; counting them as well would
                // double the non-institutional portion in every total.
                if (cat.parent) {
                    const offered = Number(cat.sharesOffered) || 0;
                    cat.times = offered > 0 ? Number(((Number(cat.appliedShares) || 0) / offered).toFixed(2)) : 0;
                    return;
                }

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

                // Only categories with a denominator contribute to the overall ratio.
                if (effectiveOffered > 0) {
                    totalOffered += effectiveOffered;
                    totalApplied += applied;
                }
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
