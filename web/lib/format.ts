// Timestamp and text formatting helpers.

const UNITS: [
  limit: number,
  secs: number,
  name: Intl.RelativeTimeFormatUnit,
][] = [
  [60, 1, "second"],
  [3600, 60, "minute"],
  [86400, 3600, "hour"],
  [604800, 86400, "day"],
  [2629800, 604800, "week"],
  [31557600, 2629800, "month"],
  [Infinity, 31557600, "year"],
];

const relative = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });
const absolute = new Intl.DateTimeFormat(undefined, {
  dateStyle: "medium",
  timeStyle: "medium",
});

// "3 minutes ago". Falls back to the raw string if it isn't a parseable date —
// received_at comes from the phone as TEXT and is not guaranteed well-formed.
export function relativeTime(value: string | null): string {
  if (!value) return "—";
  const ms = Date.parse(value);
  if (Number.isNaN(ms)) return value;

  const deltaSecs = (ms - Date.now()) / 1000;
  const magnitude = Math.abs(deltaSecs);
  for (const [limit, secs, name] of UNITS) {
    if (magnitude < limit) {
      return relative.format(Math.round(deltaSecs / secs), name);
    }
  }
  return value;
}

export function absoluteTime(value: string | null): string {
  if (!value) return "";
  const ms = Date.parse(value);
  return Number.isNaN(ms) ? value : absolute.format(ms);
}
