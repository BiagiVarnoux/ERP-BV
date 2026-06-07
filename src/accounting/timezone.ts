// src/accounting/timezone.ts
// Single source of truth for the app timezone. Import from here, never hardcode the string.

export const APP_TIMEZONE = 'America/La_Paz'; // UTC-4

/** Returns { year, month (1-12), day } in the app timezone. */
export function nowInAppTZ(): { year: number; month: number; day: number } {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: APP_TIMEZONE,
    year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date());
  const get = (t: string) => parseInt(parts.find(p => p.type === t)?.value ?? '0', 10);
  return { year: get('year'), month: get('month'), day: get('day') };
}

/** Returns today's date as YYYY-MM-DD in the app timezone. */
export function todayISO(): string {
  return new Date().toLocaleDateString('sv-SE', { timeZone: APP_TIMEZONE });
}
