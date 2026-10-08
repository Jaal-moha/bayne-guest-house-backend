// Addis Ababa (UTC+3) local day → return day key and UTC bounds for that local day
export function getAddisDayContext(nowUtc = new Date()) {
  const offsetMin = 180; // UTC+3
  const offsetMs = offsetMin * 60 * 1000;
  const addisMs = nowUtc.getTime() + offsetMs;
  const addisNow = new Date(addisMs);
  const y = addisNow.getUTCFullYear();
  const m = addisNow.getUTCMonth();
  const d = addisNow.getUTCDate();
  const dayKey = `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  const dayStartUtc = new Date(Date.UTC(y, m, d) - offsetMs);
  const dayEndUtc = new Date(dayStartUtc.getTime() + 24 * 60 * 60 * 1000);
  return { dayKey, dayStartUtc, dayEndUtc, nowUtc };
}
