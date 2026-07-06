/**
 * Format any ISO date string or timestamp to "Nov 2, 2000" style.
 * Uses local-date parsing to avoid UTC midnight off-by-one shifts.
 */
export function formatDate(isoOrTimestamp: string): string {
  const datePart = isoOrTimestamp.split('T')[0];
  const [y, m, d] = datePart.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}
