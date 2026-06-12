/**
 * caelus-birth — local birth time + place -> UT, correctly.
 *
 * caelus core takes UT. Real users enter local wall-clock time. The naive
 * conversion (`new Date(localString)`) uses the RUNTIME's timezone and
 * silently produces charts wrong by hours. This package resolves the IANA
 * zone from coordinates (offline), applies the historical tzdb rules via
 * the runtime's Intl database, and reports DST-transition edge cases
 * (ambiguous fall-back times, nonexistent spring-forward times) instead of
 * guessing silently.
 *
 * This package is allowed runtime dependencies (tz-lookup, luxon);
 * caelus core stays at zero.
 */
import tzLookup from "tz-lookup";
import { DateTime } from "luxon";
import { julianDay } from "caelus";
import type { Engine, Chart, HouseSystem } from "caelus";

export interface BirthInput {
  /** Local calendar date as the person would state it. */
  year: number;
  month: number;
  day: number;
  /** Local clock time (24h). */
  hour: number;
  minute: number;
  /** Latitude, north positive. */
  lat: number;
  /** Longitude, EAST positive (Americas are negative). */
  lon: number;
  /** Optional IANA zone override, e.g. "America/New_York". When omitted,
   *  resolved from coordinates (offline, via tz-lookup). */
  zone?: string;
}

export interface UTCandidate {
  jdUt: number;
  offsetMinutes: number;
  dst: boolean;
}

export interface UTResult {
  utc: {
    year: number; month: number; day: number;
    hour: number; minute: number; second: number;
  };
  /** Julian Day (UT) — pass straight to engine.chart()/position(). */
  jdUt: number;
  /** Resolved IANA zone id. */
  zone: string;
  /** Offset applied, minutes east of UTC. */
  offsetMinutes: number;
  dst: boolean;
  /**
   * "ok"          — the wall-clock time maps to exactly one instant.
   * "ambiguous"   — fall-back hour occurs twice; both candidates returned,
   *                 the EARLIER instant chosen.
   * "nonexistent" — spring-forward gap; shifted forward per tzdb
   *                 convention (e.g. 02:30 EST -> 03:30 EDT), flagged.
   */
  status: "ok" | "ambiguous" | "nonexistent";
  candidates?: UTCandidate[];
}

const MIN = 60_000;

/** Zone offset (minutes east of UTC) at a UTC instant. */
function offsetAt(ms: number, zone: string): number {
  return DateTime.fromMillis(ms, { zone }).offset;
}

function utcParts(ms: number) {
  const d = new Date(ms);
  return {
    year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate(),
    hour: d.getUTCHours(), minute: d.getUTCMinutes(), second: d.getUTCSeconds(),
  };
}

function toJdUt(ms: number): number {
  const u = utcParts(ms);
  return julianDay(u.year, u.month, u.day, u.hour, u.minute, u.second);
}

export function toUT(input: BirthInput): UTResult {
  const { year, month, day, hour, minute, lat, lon } = input;
  if (!(month >= 1 && month <= 12)) throw new Error(`Invalid month: ${month}`);
  if (!(day >= 1 && day <= 31)) throw new Error(`Invalid day: ${day}`);
  if (!(hour >= 0 && hour <= 23)) throw new Error(`Invalid hour: ${hour}`);
  if (!(minute >= 0 && minute <= 59)) throw new Error(`Invalid minute: ${minute}`);
  if (!(lat >= -90 && lat <= 90)) throw new Error(`Invalid latitude: ${lat}`);
  if (!(lon >= -180 && lon <= 180)) throw new Error(`Invalid longitude: ${lon}`);

  const zone = input.zone ?? tzLookup(lat, lon);
  if (!DateTime.utc().setZone(zone).isValid) {
    throw new Error(`Unknown IANA time zone: ${zone}`);
  }

  // Wall-clock time encoded as if it were UTC; candidate instants are
  // wallMs - offset for each plausible offset around that moment.
  const wallMs = DateTime.utc(year, month, day, hour, minute).toMillis();
  if (Number.isNaN(wallMs)) throw new Error(`Invalid date: ${year}-${month}-${day}`);

  // Offsets observed within a day either side cover any transition that
  // could make this wall time ambiguous or nonexistent (gaps/overlaps are
  // at most a few hours; offsets are bounded by ±14 h).
  const probed = [wallMs - 86_400_000, wallMs, wallMs + 86_400_000]
    .map((p) => offsetAt(p, zone));
  const offsets = [...new Set(probed)];

  // An offset is a valid reading iff applying it lands on an instant where
  // the zone actually uses that offset.
  const valid = offsets.filter((o) => offsetAt(wallMs - o * MIN, zone) === o);

  // Pre-standardization (LMT-era) offsets carry seconds, so offset minutes
  // can be fractional; round the conversion to whole milliseconds.
  const result = (msRaw: number, status: UTResult["status"]): UTResult => {
    const ms = Math.round(msRaw);
    const off = offsetAt(ms, zone);
    return {
      utc: utcParts(ms),
      jdUt: toJdUt(ms),
      zone,
      offsetMinutes: off,
      dst: DateTime.fromMillis(ms, { zone }).isInDST,
      status,
    };
  };

  if (valid.length === 1) return result(wallMs - valid[0] * MIN, "ok");

  if (valid.length >= 2) {
    // fall-back overlap: the same wall time happened twice
    const candidates: UTCandidate[] = valid
      .map((o) => Math.round(wallMs - o * MIN))
      .sort((a, b) => a - b)
      .map((ms) => ({
        jdUt: toJdUt(ms),
        offsetMinutes: offsetAt(ms, zone),
        dst: DateTime.fromMillis(ms, { zone }).isInDST,
      }));
    return { ...result(wallMs - Math.max(...valid) * MIN, "ambiguous"), candidates };
  }

  // spring-forward gap: shift forward per tzdb convention by applying the
  // offset in effect just before the gap (e.g. 02:30 EST -> 03:30 EDT)
  const offBefore = offsetAt(wallMs - 86_400_000, zone);
  return result(wallMs - offBefore * MIN, "nonexistent");
}

/** toUT + engine.chart in one call. */
export function localToChart(
  input: BirthInput,
  engine: Engine,
  houseSystem: HouseSystem = "placidus",
): UTResult & { chart: Chart } {
  const t = toUT(input);
  const { year, month, day, hour, minute, second } = t.utc;
  return {
    ...t,
    chart: engine.chart(
      year, month, day, hour, minute, second,
      input.lat, input.lon, houseSystem,
    ),
  };
}
