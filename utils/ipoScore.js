/**
 * IPO Score Calculation (0-10)
 * Transparent scoring based on multiple factors
 */

export function calculateIPOScore(ipo) {
  let score = 0;
  const factors = {
    gmp: 0,
    subscription: 0,
    financials: 0,
    risk: 0
  };

  // GMP Score (0-3 points)
  if (ipo.gmp?.current) {
    const priceBand = ipo.pricing?.priceBand;
    if (priceBand) {
      // Extract upper price from band (e.g., "₹100-110" -> 110)
      const match = priceBand.match(/₹?\s*(\d+)\s*-\s*(\d+)/);
      if (match) {
        const upperPrice = parseFloat(match[2]);
        const gmpPercent = (ipo.gmp.current / upperPrice) * 100;
        
        if (gmpPercent >= 50) factors.gmp = 3;
        else if (gmpPercent >= 30) factors.gmp = 2.5;
        else if (gmpPercent >= 20) factors.gmp = 2;
        else if (gmpPercent >= 10) factors.gmp = 1.5;
        else if (gmpPercent >= 5) factors.gmp = 1;
        else if (gmpPercent > 0) factors.gmp = 0.5;
      }
    }
  }

  // Subscription Score (0-3 points)
  if (ipo.subscription?.categories) {
    const { qib, nii, retail } = ipo.subscription.categories;
    const totalSubscription = (qib || 0) + (nii || 0) + (retail || 0);
    const avgSubscription = totalSubscription / 3;
    
    if (avgSubscription >= 100) factors.subscription = 3;
    else if (avgSubscription >= 50) factors.subscription = 2.5;
    else if (avgSubscription >= 30) factors.subscription = 2;
    else if (avgSubscription >= 15) factors.subscription = 1.5;
    else if (avgSubscription >= 5) factors.subscription = 1;
    else if (avgSubscription >= 1) factors.subscription = 0.5;
  }

  // Financials Score (0-3 points)
  if (ipo.financials && ipo.financials.length >= 2) {
    const sorted = [...ipo.financials].sort((a, b) => parseInt(b.year) - parseInt(a.year));
    const latest = sorted[0];
    const previous = sorted[1];
    
    if (latest.revenue && previous.revenue && latest.profit && previous.profit) {
      const revenueGrowth = ((latest.revenue - previous.revenue) / previous.revenue) * 100;
      const profitGrowth = ((latest.profit - previous.profit) / previous.profit) * 100;
      
      // Revenue growth score (1.5 points max)
      if (revenueGrowth >= 30) factors.financials += 1.5;
      else if (revenueGrowth >= 20) factors.financials += 1;
      else if (revenueGrowth >= 10) factors.financials += 0.5;
      else if (revenueGrowth < 0) factors.financials -= 0.5;
      
      // Profit growth score (1.5 points max)
      if (profitGrowth >= 30) factors.financials += 1.5;
      else if (profitGrowth >= 20) factors.financials += 1;
      else if (profitGrowth >= 10) factors.financials += 0.5;
      else if (profitGrowth < 0) factors.financials -= 0.5;
    }
  }

  // Risk Deduction (0-1 point deduction)
  if (ipo.company?.risks && ipo.company.risks.length > 0) {
    factors.risk = Math.min(ipo.company.risks.length * 0.2, 1);
  }

  score = factors.gmp + factors.subscription + factors.financials - factors.risk;
  
  // Clamp between 0-10
  score = Math.max(0, Math.min(10, score));
  
  return {
    score: parseFloat(score.toFixed(1)),
    factors,
    breakdown: {
      gmp: `${factors.gmp.toFixed(1)}/3`,
      subscription: `${factors.subscription.toFixed(1)}/3`,
      financials: `${factors.financials.toFixed(1)}/3`,
      risk: `-${factors.risk.toFixed(1)}`
    }
  };
}

export function getScoreLabel(score) {
  if (score >= 8) return { label: 'Excellent', color: '#16a34a' };
  if (score >= 6) return { label: 'Good', color: '#22c55e' };
  if (score >= 4) return { label: 'Average', color: '#eab308' };
  if (score >= 2) return { label: 'Below Average', color: '#f59e0b' };
  return { label: 'Poor', color: '#ef4444' };
}