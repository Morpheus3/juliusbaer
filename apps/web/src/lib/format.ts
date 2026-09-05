const usdCompact = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  notation: 'compact',
  maximumFractionDigits: 1,
});

export const fmtUsdCompact = (n: number): string => usdCompact.format(n);

export const fmtDate = (iso: string): string =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });

export const fmtDateTime = (iso: string): string =>
  new Date(iso).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' });
