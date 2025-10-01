// src/utils/timezone.js

/** =====================================================================
 *  Timezone & Business Week (Wed → Tue) helpers
 *  - Fuso oficial fixo: America/New_York
 *  - Semana de pagamento: Quarta 00:00 → Terça 23:59:59 (no fuso do negócio)
 *  - Todas as conversões são feitas no fuso do negócio.
 * ===================================================================== */

export const BUSINESS_TZ = 'America/New_York';        // fuso oficial do negócio
export const BUSINESS_WEEK_START_DOW = 3;             // 0=Dom ... 3=Quarta
export const DAY_MS = 24 * 60 * 60 * 1000;

/** Constrói uma Date (UTC) que representa o horário local do timezone informado. */
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

/** Meia-noite local (no fuso indicado) como Date em UTC. */
export function startOfDayInTZ(input, timeZone = BUSINESS_TZ) {
  const z = toZonedDate(input, timeZone);
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit'
  });
  const parts = fmt.formatToParts(z).reduce((acc, p) => (acc[p.type] = p.value, acc), {});
  return new Date(Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), 0, 0, 0, 0));
}

/** Fim do dia local (23:59:59.999) como Date em UTC. */
export function endOfDayInTZ(input, timeZone = BUSINESS_TZ) {
  const s = startOfDayInTZ(input, timeZone);
  return new Date(s.getTime() + DAY_MS - 1);
}

/** Soma dias preservando o componente UTC. */
export function addDaysUTC(date, days) {
  const d = new Date(date.getTime());
  d.setUTCDate(d.getUTCDate() + days);
  return d;
}

/** Início da semana do negócio (Quarta 00:00 local) em UTC. */
export function startOfBusinessWeekInTZ(
  input,
  timeZone = BUSINESS_TZ,
  weekStartDow = BUSINESS_WEEK_START_DOW
) {
  const sod = startOfDayInTZ(input, timeZone);
  const dow = sod.getUTCDay(); // 0..6 no "espelho" UTC da meia-noite local
  const delta = ((dow - weekStartDow + 7) % 7);
  return addDaysUTC(sod, -delta);
}

/** Fim da semana do negócio (Terça 23:59:59.999 local) em UTC. */
export function endOfBusinessWeekInTZ(input, timeZone = BUSINESS_TZ) {
  const start = startOfBusinessWeekInTZ(input, timeZone);
  const tuesday = addDaysUTC(start, 6);
  return endOfDayInTZ(tuesday, timeZone);
}

/** YYYY-MM-DD em UTC (sem horário). */
export function toISODateUTC(d) {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

/** Faixa (YYYY-MM-DD) da semana do negócio para a data de referência. */
export function weekRangeISO(input, timeZone = BUSINESS_TZ) {
  const start = startOfBusinessWeekInTZ(input, timeZone);
  const end = addDaysUTC(start, 6);
  return { startISO: toISODateUTC(start), endISO: toISODateUTC(end) };
}

/** Normaliza qualquer data para a data ISO do início da semana do negócio. */
export function normalizeWeekStartISO(input, timeZone = BUSINESS_TZ) {
  return weekRangeISO(input, timeZone).startISO;
}

/** Formata uma data (ou ISO) como “YYYY-MM-DD” no fuso do negócio. */
export function formatISOInBusinessTZ(input, timeZone = BUSINESS_TZ) {
  const d = startOfDayInTZ(input, timeZone);
  return toISODateUTC(d);
}

/** Label “YYYY-MM-DD → YYYY-MM-DD” (quarta → terça). */
export function weekLabel(input, timeZone = BUSINESS_TZ) {
  const { startISO, endISO } = weekRangeISO(input, timeZone);
  return `${startISO} → ${endISO}`;
}

/** Formata uma data em label amigável no fuso do negócio. */
export function formatDateInBusinessTZ(input, opts) {
  const d = input instanceof Date ? input : new Date(input);
  const f = new Intl.DateTimeFormat('en-US', {
    timeZone: BUSINESS_TZ,
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    ...(opts || {}),
  });
  return f.format(d);
}

/**
 * Retorna { start, end, key } da semana do negócio para a data.
 * key: "YYYY-Wxx" (semanas consecutivas com base em quartas).
 */
export function getBusinessPaymentWeek(input, timeZone = BUSINESS_TZ) {
  const start = startOfBusinessWeekInTZ(input, timeZone);
  const end = endOfBusinessWeekInTZ(input, timeZone);

  // Semana do ano baseada na nossa "quarta-feira como início de semana"
  const y = start.getUTCFullYear();
  const jan1 = new Date(Date.UTC(y, 0, 1));
  const firstWeekStart = startOfBusinessWeekInTZ(jan1, timeZone);
  const diffDays = Math.floor((start - firstWeekStart) / DAY_MS);
  const wk = Math.floor(diffDays / 7) + 1;
  const key = `${y}-W${String(wk).padStart(2, '0')}`;

  return { start, end, key };
}

/** Gera semanas ao redor de uma referência (ex.: −2…+2). */
export function buildWeeksAround(centerDate, before = 2, after = 2, timeZone = BUSINESS_TZ) {
  const centerStart = getBusinessPaymentWeek(centerDate, timeZone).start;
  const list = [];
  for (let i = -before; i <= after; i++) {
    const ref = addDaysUTC(centerStart, i * 7);
    list.push(getBusinessPaymentWeek(ref, timeZone));
  }
  return list;
}

/**
 * Checa se uma data cai dentro de [fromISO, toISO] usando limites do dia
 * no fuso do negócio (inclusive).
 */
export function withinBusinessTZ(dateLike, fromISO, toISO, timeZone = BUSINESS_TZ) {
  const t = toZonedDate(dateLike, timeZone).getTime();
  const fromMs = fromISO ? startOfDayInTZ(fromISO, timeZone).getTime() : -Infinity;
  const toMs = toISO ? endOfDayInTZ(toISO, timeZone).getTime() : Infinity;
  return t >= fromMs && t <= toMs;
}

/** Rótulo curto do range da semana: "MMM dd – MMM dd". */
export function weekLabelShort(input, timeZone = BUSINESS_TZ) {
  const { startISO, endISO } = weekRangeISO(input, timeZone);
  const s = new Date(`${startISO}T00:00:00Z`);
  const e = new Date(`${endISO}T00:00:00Z`);
  const sf = formatDateInBusinessTZ(s, { month: 'short', day: '2-digit' });
  const ef = formatDateInBusinessTZ(e, { month: 'short', day: '2-digit' });
  return `${sf} – ${ef}`;
}
