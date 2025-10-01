// src/utils/timezone.js
export const BUSINESS_TZ = 'America/New_York';        // fuso oficial do negócio
export const BUSINESS_WEEK_START_DOW = 3;             // 0=Dom ... 3=Quarta

export function toZonedDate(input, timeZone = BUSINESS_TZ) {
  const d = input instanceof Date ? input : new Date(input);
  if (Number.isNaN(d.getTime())) return new Date(NaN);

  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hourCycle: 'h23',
  });
  const parts = fmt.formatToParts(d).reduce((acc, p) => (acc[p.type] = p.value, acc), {});
  const year = Number(parts.year), month = Number(parts.month), day = Number(parts.day);
  const hour = Number(parts.hour), minute = Number(parts.minute), second = Number(parts.second);
  return new Date(Date.UTC(year, month - 1, day, hour, minute, second, 0));
}

export function startOfDayInTZ(input, timeZone = BUSINESS_TZ) {
  const z = toZonedDate(input, timeZone);
  const fmt = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' });
  const parts = fmt.formatToParts(z).reduce((acc, p) => (acc[p.type] = p.value, acc), {});
  return new Date(Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), 0, 0, 0, 0));
}

export function addDaysUTC(date, days) {
  const d = new Date(date.getTime());
  d.setUTCDate(d.getUTCDate() + days);
  return d;
}

export function startOfBusinessWeekInTZ(input, timeZone = BUSINESS_TZ, weekStartDow = BUSINESS_WEEK_START_DOW) {
  const sod = startOfDayInTZ(input, timeZone);
  const dow = sod.getUTCDay();
  const delta = ((dow - weekStartDow + 7) % 7);
  return addDaysUTC(sod, -delta);
}

export function toISODateUTC(d) {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

export function weekRangeISO(input, timeZone = BUSINESS_TZ) {
  const start = startOfBusinessWeekInTZ(input, timeZone);
  const end = addDaysUTC(start, 6);
  return { startISO: toISODateUTC(start), endISO: toISODateUTC(end) };
}

export function normalizeWeekStartISO(input, timeZone = BUSINESS_TZ) {
  return weekRangeISO(input, timeZone).startISO;
}

// Formata uma data (ou string ISO) no fuso do negócio em “YYYY-MM-DD”
export function formatISOInBusinessTZ(input, timeZone = BUSINESS_TZ) {
  const d = startOfDayInTZ(input, timeZone);
  return toISODateUTC(d);
}

// Label padrão “YYYY-MM-DD → YYYY-MM-DD”
export function weekLabel(input, timeZone = BUSINESS_TZ) {
  const { startISO, endISO } = weekRangeISO(input, timeZone);
  return `${startISO} → ${endISO}`;
}
