/**
 * IPO Status Calculation Utility
 * All statuses are derived from dates - never hardcoded
 */

export function getIPOStatusFromDates(dates = {}) {
  const now = new Date();
  now.setHours(0, 0, 0, 0);

  const { open, close, allotment, listing } = dates;

  if (!open && !close) return 'Upcoming';

  const openDate = open ? new Date(open) : null;
  const closeDate = close ? new Date(close) : null;
  const allotmentDate = allotment ? new Date(allotment) : null;
  const listingDate = listing ? new Date(listing) : null;

  if (openDate) openDate.setHours(0, 0, 0, 0);
  if (closeDate) closeDate.setHours(0, 0, 0, 0);
  if (allotmentDate) allotmentDate.setHours(0, 0, 0, 0);
  if (listingDate) listingDate.setHours(0, 0, 0, 0);

  // Listed - after listing date
  if (listingDate && now >= listingDate) return 'Listed';

  // Allotted - after allotment but before listing
  if (allotmentDate && now >= allotmentDate && (!listingDate || now < listingDate)) {
    return 'Allotted';
  }

  // Closed - after close but before allotment
  if (closeDate && now > closeDate && (!allotmentDate || now < allotmentDate)) {
    return 'Closed';
  }

  // Open - between open and close (inclusive)
  if (openDate && closeDate && now >= openDate && now <= closeDate) {
    return 'Open';
  }

  // Upcoming - before open date
  if (openDate && now < openDate) return 'Upcoming';

  return 'Upcoming';
}

export function getDaysRemaining(dates = {}) {
  const now = new Date();
  now.setHours(0, 0, 0, 0);

  const { open, close, allotment, listing } = dates;
  const status = getIPOStatusFromDates(dates);

  const daysBetween = (future) => {
    const futureDate = new Date(future);
    futureDate.setHours(0, 0, 0, 0);
    const diff = futureDate - now;
    return Math.ceil(diff / (1000 * 60 * 60 * 24));
  };

  if (status === 'Upcoming' && open) {
    const d = daysBetween(open);
    if (d <= 0) return 'Opens today';
    if (d === 1) return 'Opens tomorrow';
    return `Opens in ${d} days`;
  }

  if (status === 'Open' && close) {
    const d = daysBetween(close);
    if (d <= 0) return 'Closes today';
    if (d === 1) return 'Closes tomorrow';
    return `${d} days left`;
  }

  if (status === 'Closed' && close) {
    return `Closed on ${new Date(close).toLocaleDateString('en-IN')}`;
  }

  if (status === 'Allotted') {
    return 'Allotment done';
  }

  if (status === 'Listed') {
    return 'Listed in market';
  }

  return status;
}

export function getStatusProgress(status) {
  const map = {
    Upcoming: 20,
    Open: 40,
    Closed: 60,
    Allotted: 80,
    Listed: 100
  };
  return map[status] || 20;
}

export function isToday(date) {
  if (!date) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const checkDate = new Date(date);
  checkDate.setHours(0, 0, 0, 0);
  return today.getTime() === checkDate.getTime();
}

export function isTomorrow(date) {
  if (!date) return false;
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(0, 0, 0, 0);
  const checkDate = new Date(date);
  checkDate.setHours(0, 0, 0, 0);
  return tomorrow.getTime() === checkDate.getTime();
}