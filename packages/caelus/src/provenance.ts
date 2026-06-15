/**
 * astroengine provenance -- what a chart is, and when and where it is anchored.
 *
 * A chart silently asserts "a real instant at a real place." That is wrong for
 * most interesting cases: forecasts, fictional or mythic subjects, archetypes,
 * counterfactuals, charts with only an approximate or relative time. This module
 * makes the chart's grounding first-class so the rest of the system can act on
 * it -- route generation (ephemeris vs the compiler's symbolic synthesis), frame
 * interpretation honestly, and degrade gracefully when no instant exists.
 *
 * It does not compute charts; it resolves a {@link TemporalAnchor} /
 * {@link SpatialAnchor} to a usable instant / place (or reports that none can be
 * derived, and why). Pure and deterministic.
 */

/** What a chart's subject *is* -- its epistemic / ontological status. */
export type Realm =
  | "observed" // a verified event the modeller witnessed or measured
  | "reported" // attested second-hand (a quoted birth time)
  | "planned" // a real future event chosen deliberately (electional)
  | "forecast" // a real future moment, predicted not chosen
  | "fictional" // a character or event in an invented world
  | "mythic" // a deity, legend, or sacred narrative
  | "counterfactual" // a real event, perturbed ("born an hour later")
  | "archetypal" // a pure symbol ("the chart of Aries")
  | "conceptual"; // an idea, organization, or abstraction

/** How a chart's time is known. */
export type TemporalAnchor =
  | { kind: "instant"; utc: string }
  | { kind: "range"; earliest: string; latest: string }
  | {
      kind: "relative";
      relation: "before" | "after" | "during";
      anchorId: string;
      offset?: string;
    }
  | { kind: "narrative"; calendar?: string; value: string; sequence?: number }
  | { kind: "symbolic"; rationale: string }
  | {
      kind: "none";
      reason: "atemporal" | "time_irrelevant" | "intentionally_unset";
    };

/** How a chart's place is known -- the spatial twin of {@link TemporalAnchor}. */
export type SpatialAnchor =
  | { kind: "geo"; lat: number; lonEast: number; altM?: number }
  | { kind: "named"; placeId: string }
  | { kind: "region"; lat: number; lonEast: number; radiusKm: number }
  | { kind: "relative"; relation: "near" | "at"; anchorId: string }
  | { kind: "fictional"; value: string }
  | { kind: "none"; reason: "heliocentric" | "atemporal" | "intentionally_unset" };

/** Resolved coordinates a chart can be computed at. */
export interface GeoPlace { lat: number; lonEast: number; altM?: number }

/** Lookups an anchor may need to resolve: prior instants/places for `relative`
 *  anchors, calendar resolvers for `narrative` times, a gazetteer for `named`
 *  places. All optional; an anchor that needs a missing one resolves to null. */
export interface AnchorRegistry {
  /** `anchorId` -> a resolved instant (UT Julian Day). */
  instants?: Record<string, number>;
  /** Calendar name -> `value` -> UT Julian Day (or null when unmappable). */
  calendars?: Record<string, (value: string) => number | null>;
  /** `anchorId` -> a resolved place. */
  places?: Record<string, GeoPlace>;
  /** Named-place resolver (e.g. the gazetteer). */
  gazetteer?: (placeId: string) => GeoPlace | null;
}

/** How trustworthy a resolved instant/place is for computation. */
export type Certainty = "exact" | "approximate" | "representative" | "none";

/** The outcome of resolving a {@link TemporalAnchor}. */
export interface ResolvedTime {
  /** A concrete UT Julian Day to compute with, or null when none can be derived. */
  jd: number | null;
  certainty: Certainty;
  /** Bounds in UT JD, for ranges (and relatives with a known reference). */
  earliest?: number;
  latest?: number;
  /** How `jd` was derived, or why it is null. */
  note?: string;
}

/** The outcome of resolving a {@link SpatialAnchor}. */
export interface ResolvedPlace {
  place: GeoPlace | null;
  certainty: Certainty;
  /** For a `region`, its radius in km. */
  radiusKm?: number;
  note?: string;
}

const JD_UNIX_EPOCH = 2440587.5; // JD of 1970-01-01T00:00:00Z

/** ISO-8601 timestamp -> UT Julian Day, or null when unparseable. */
export function isoToJd(iso: string): number | null {
  const ms = Date.parse(iso);
  return Number.isNaN(ms) ? null : JD_UNIX_EPOCH + ms / 86400000;
}

const UNIT_DAYS: Record<string, number> = {
  y: 365.2425, mo: 30.436875, w: 7, d: 1, h: 1 / 24, m: 1 / 1440, s: 1 / 86400,
};

/**
 * Parse a duration offset into days. Accepts a compact single unit
 * (`"3d"`, `"-2h"`, `"1.5y"`, `"6mo"`, `"90m"`) or an ISO-8601 duration
 * (`"P1Y2M10DT2H30M"`). Calendar units use mean lengths (year 365.2425 d,
 * month 30.436875 d). Returns `NaN` when unparseable.
 */
export function parseOffset(offset: string): number {
  const s = offset.trim();
  if (/^[+-]?P/i.test(s)) {
    const m = s.match(
      /^([+-]?)P(?:(\d+(?:\.\d+)?)Y)?(?:(\d+(?:\.\d+)?)M)?(?:(\d+(?:\.\d+)?)W)?(?:(\d+(?:\.\d+)?)D)?(?:T(?:(\d+(?:\.\d+)?)H)?(?:(\d+(?:\.\d+)?)M)?(?:(\d+(?:\.\d+)?)S)?)?$/i,
    );
    if (!m || s.replace(/^[+-]/, "") === "P") return NaN;
    const [, sign, y, mo, w, d, h, mi, sec] = m;
    const n = (v: string | undefined): number => (v ? parseFloat(v) : 0);
    const days = n(y) * UNIT_DAYS.y + n(mo) * UNIT_DAYS.mo + n(w) * UNIT_DAYS.w
      + n(d) + n(h) / 24 + n(mi) / 1440 + n(sec) / 86400;
    return sign === "-" ? -days : days;
  }
  const m = s.match(/^([+-]?\d*\.?\d+)\s*(mo|[ywdhms])$/i);
  if (!m) return NaN;
  return parseFloat(m[1]) * UNIT_DAYS[m[2].toLowerCase()];
}

/**
 * Resolve a {@link TemporalAnchor} to a usable instant, using `registry` for
 * relative references and narrative calendars. The result always reports its
 * {@link Certainty}; `jd` is null exactly when no instant can be derived
 * (`symbolic`, `none`, an unknown reference, or an unmappable calendar).
 */
export function resolveTime(
  anchor: TemporalAnchor, registry: AnchorRegistry = {},
): ResolvedTime {
  switch (anchor.kind) {
    case "instant": {
      const jd = isoToJd(anchor.utc);
      return jd === null
        ? { jd: null, certainty: "none", note: `unparseable utc ${anchor.utc}` }
        : { jd, certainty: "exact" };
    }
    case "range": {
      const e = isoToJd(anchor.earliest); const l = isoToJd(anchor.latest);
      if (e === null || l === null) {
        return { jd: null, certainty: "none", note: "unparseable range bound" };
      }
      const [lo, hi] = e <= l ? [e, l] : [l, e];
      return {
        jd: (lo + hi) / 2, certainty: "representative", earliest: lo, latest: hi,
        note: "midpoint of the range",
      };
    }
    case "relative": {
      const base = registry.instants?.[anchor.anchorId];
      if (base === undefined) {
        return { jd: null, certainty: "none", note: `unknown anchor ${anchor.anchorId}` };
      }
      if (anchor.relation === "during") {
        return { jd: base, certainty: "representative", note: `during ${anchor.anchorId}` };
      }
      if (anchor.offset === undefined) {
        return {
          jd: base, certainty: "approximate",
          note: `${anchor.relation} ${anchor.anchorId} with no offset; using the reference instant`,
        };
      }
      const off = parseOffset(anchor.offset);
      if (Number.isNaN(off)) {
        return { jd: null, certainty: "none", note: `unparseable offset ${anchor.offset}` };
      }
      const jd = anchor.relation === "before" ? base - off : base + off;
      return { jd, certainty: "approximate", note: `${anchor.offset} ${anchor.relation} ${anchor.anchorId}` };
    }
    case "narrative": {
      const resolver = anchor.calendar ? registry.calendars?.[anchor.calendar] : undefined;
      if (!resolver) {
        return {
          jd: null, certainty: "none",
          note: `no resolver for calendar ${anchor.calendar ?? "(unspecified)"}`
            + (anchor.sequence !== undefined ? `; sequence ${anchor.sequence}` : ""),
        };
      }
      const jd = resolver(anchor.value);
      return jd === null
        ? { jd: null, certainty: "none", note: `calendar ${anchor.calendar} could not map ${anchor.value}` }
        : { jd, certainty: "approximate", note: `${anchor.calendar}: ${anchor.value}` };
    }
    case "symbolic":
      return { jd: null, certainty: "none", note: anchor.rationale };
    case "none":
      return { jd: null, certainty: "none", note: anchor.reason };
  }
}

/**
 * Resolve a {@link SpatialAnchor} to coordinates, using `registry` for relative
 * references and the gazetteer for named places. `place` is null when no
 * coordinates can be derived (`fictional`, `none`, an unknown reference).
 */
export function resolvePlace(
  anchor: SpatialAnchor, registry: AnchorRegistry = {},
): ResolvedPlace {
  switch (anchor.kind) {
    case "geo":
      return {
        place: { lat: anchor.lat, lonEast: anchor.lonEast, altM: anchor.altM },
        certainty: "exact",
      };
    case "named": {
      const place = registry.gazetteer?.(anchor.placeId) ?? null;
      return place
        ? { place, certainty: "approximate", note: `gazetteer: ${anchor.placeId}` }
        : { place: null, certainty: "none", note: `unknown place ${anchor.placeId}` };
    }
    case "region":
      return {
        place: { lat: anchor.lat, lonEast: anchor.lonEast }, certainty: "representative",
        radiusKm: anchor.radiusKm, note: `centre of a ${anchor.radiusKm} km region`,
      };
    case "relative": {
      const place = registry.places?.[anchor.anchorId] ?? null;
      return place
        ? { place, certainty: "approximate", note: `${anchor.relation} ${anchor.anchorId}` }
        : { place: null, certainty: "none", note: `unknown place anchor ${anchor.anchorId}` };
    }
    case "fictional":
      return { place: null, certainty: "none", note: anchor.value };
    case "none":
      return { place: null, certainty: "none", note: anchor.reason };
  }
}

/** Realms whose charts come from a time + place (the ephemeris path). The rest
 *  (`archetypal`, `conceptual`, `mythic`) are better generated from constraints
 *  via the compiler, since they have no instant to compute from. */
export const TIME_ANCHORED_REALMS: ReadonlySet<Realm> = new Set<Realm>([
  "observed", "reported", "planned", "forecast", "counterfactual",
]);

/** Whether a realm is normally grounded in an instant (ephemeris) rather than
 *  synthesized from symbolic constraints. */
export function isTimeAnchored(realm: Realm): boolean {
  return TIME_ANCHORED_REALMS.has(realm);
}
