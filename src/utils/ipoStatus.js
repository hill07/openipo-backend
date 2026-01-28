export function getIPOStatus(startDate, endDate) {
  if (!startDate || !endDate) return "Unknown";

  const today = new Date();
  const s = new Date(startDate);
  const e = new Date(endDate);

  e.setHours(23, 59, 59, 999);

  if (today < s) return "Upcoming";
  if (today >= s && today <= e) return "Open";
  return "Closed";
}
