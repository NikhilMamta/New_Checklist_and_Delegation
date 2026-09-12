/**
 * Timezone and Date utilities for Indian Standard Time (IST - Asia/Kolkata / UTC+05:30)
 * 
 * Note on project database convention:
 * In this project, Supabase/PostgreSQL timestamps and defaults (such as delegation_done.created_at)
 * store the clock time already in Indian Standard Time (e.g. 13:12:00 for 1:12 PM).
 * PostgREST serializes these timestamps with a +00:00 or Z suffix.
 * To prevent double-offsetting (+5:30 on top of existing IST), direct ISO component extraction
 * is used for ISO strings, while Intl.DateTimeFormat is used for native Date instances.
 */

export function parseToValidDate(input) {
  if (!input) return null;
  if (input instanceof Date) return isNaN(input.getTime()) ? null : input;
  if (typeof input !== "string") return null;
  const s = input.trim();
  if (!s) return null;

  // 1. DD/MM/YYYY or DD/MM/YYYY HH:mm:ss
  const ddmmyyyyMatch = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?$/);
  if (ddmmyyyyMatch) {
    const [, d, m, y, h = "0", min = "0", sec = "0"] = ddmmyyyyMatch;
    const iso = `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}T${h.padStart(2, "0")}:${min.padStart(2, "0")}:${sec.padStart(2, "0")}+05:30`;
    const dt = new Date(iso);
    return isNaN(dt.getTime()) ? null : dt;
  }

  // 2. YYYY-MM-DD
  const ymdMatch = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (ymdMatch) {
    const iso = `${s}T00:00:00+05:30`;
    const dt = new Date(iso);
    return isNaN(dt.getTime()) ? null : dt;
  }

  // 3. Google Sheets Date(y,m,d)
  const gsMatch = s.match(/Date\((\d+),(\d+),(\d+)\)/);
  if (gsMatch) {
    const [, y, m, d] = gsMatch;
    const dt = new Date(Number(y), Number(m), Number(d));
    return isNaN(dt.getTime()) ? null : dt;
  }

  // 4. ISO without timezone offset e.g. 2026-09-12 14:30:00 or 2026-09-12T14:30:00
  const noTzMatch = s.match(/^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2}(?::\d{2})?)(?:\.\d+)?$/);
  if (noTzMatch) {
    const dt = new Date(`${noTzMatch[1]}T${noTzMatch[2]}+05:30`);
    return isNaN(dt.getTime()) ? null : dt;
  }

  // 5. Standard ISO
  const dt = new Date(s);
  return isNaN(dt.getTime()) ? null : dt;
}

/**
 * Formats a Date, timestamp, or string into DD/MM/YYYY HH:mm:ss strictly in Indian Standard Time (Asia/Kolkata).
 * Handles Supabase ISO strings where clock digits are already in IST.
 */
export function formatToISTDateTime(dateInput) {
  if (!dateInput) return "—";

  // If already DD/MM/YYYY HH:mm:ss
  if (typeof dateInput === "string" && /^\d{2}\/\d{2}\/\d{4}\s+\d{2}:\d{2}:\d{2}$/.test(dateInput.trim())) {
    return dateInput.trim();
  }

  // If already DD/MM/YYYY
  if (typeof dateInput === "string" && /^\d{2}\/\d{2}\/\d{4}$/.test(dateInput.trim())) {
    return `${dateInput.trim()} 00:00:00`;
  }

  // If string contains ISO date and time (Supabase timestamps with IST clock digits)
  if (typeof dateInput === "string") {
    const s = dateInput.trim();
    const isoMatch = s.match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2}):(\d{2})/);
    if (isoMatch) {
      const [, y, m, d, hh, mm, ss] = isoMatch;
      return `${d}/${m}/${y} ${hh}:${mm}:${ss}`;
    }

    const ymdMatch = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (ymdMatch) {
      const [, y, m, d] = ymdMatch;
      return `${d}/${m}/${y} 00:00:00`;
    }
  }

  // For Date objects
  if (dateInput instanceof Date && !isNaN(dateInput.getTime())) {
    const formatter = new Intl.DateTimeFormat("en-GB", {
      timeZone: "Asia/Kolkata",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false
    });
    const parts = formatter.formatToParts(dateInput);
    const get = (t) => parts.find(p => p.type === t)?.value;
    return `${get("day")}/${get("month")}/${get("year")} ${get("hour")}:${get("minute")}:${get("second")}`;
  }

  return String(dateInput);
}

/**
 * Formats a Date, timestamp, or string into DD/MM/YYYY strictly in Indian Standard Time (Asia/Kolkata).
 */
export function formatToISTDate(dateInput) {
  if (!dateInput) return "—";

  if (typeof dateInput === "string") {
    const s = dateInput.trim();
    if (/^\d{2}\/\d{2}\/\d{4}$/.test(s)) return s;
    const ymdMatch = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (ymdMatch) {
      const [, y, m, d] = ymdMatch;
      return `${d}/${m}/${y}`;
    }
    const ddmmyyyyMatch = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
    if (ddmmyyyyMatch) {
      const [, d, m, y] = ddmmyyyyMatch;
      return `${d.padStart(2, '0')}/${m.padStart(2, '0')}/${y}`;
    }
  }

  const date = parseToValidDate(dateInput);
  if (!date) return typeof dateInput === "string" ? dateInput : "—";

  const formatter = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  });
  const parts = formatter.formatToParts(date);
  const get = (t) => parts.find(p => p.type === t)?.value;
  return `${get("day")}/${get("month")}/${get("year")}`;
}

/**
 * Smart formatter: if input only has date part, formats DD/MM/YYYY. If it has time part, formats DD/MM/YYYY HH:mm:ss in IST.
 */
export function formatToISTDisplay(dateInput) {
  if (!dateInput) return "—";
  if (typeof dateInput === "string") {
    const s = dateInput.trim();
    if (/^\d{2}\/\d{2}\/\d{4}$/.test(s)) return s;
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
      const [y, m, d] = s.split("-");
      return `${d}/${m}/${y}`;
    }
  }
  return formatToISTDateTime(dateInput);
}

/**
 * Returns current timestamp formatted as ISO string in IST (+05:30).
 * Matches the codebase-wide convention for storing timestamps in Supabase.
 */
export function getNowISTISOString() {
  return new Date(new Date().getTime() + (330 * 60000)).toISOString().replace('Z', '+05:30');
}

/**
 * Ensures date input string from date picker (YYYY-MM-DD) or other sources is normalized into valid ISO for DB.
 */
export function ensureISTISO(dateStr) {
  if (!dateStr) return null;
  if (typeof dateStr === "string" && /^\d{4}-\d{2}-\d{2}$/.test(dateStr.trim())) {
    // Treat date picker value as start of day in IST
    return `${dateStr.trim()}T00:00:00+05:30`;
  }
  const d = parseToValidDate(dateStr);
  return d ? d.toISOString() : null;
}
