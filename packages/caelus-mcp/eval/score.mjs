/**
 * Scoring for the MCP tool-selection eval.
 *
 * Given a fixture's `expect` block and an observed model decision
 * ({tool, args}), produce a per-fixture verdict: did the model pick the right
 * tool, are the args schema-valid, do the numeric args land inside tolerance,
 * and do the named semantic predicates (argChecks) hold.
 *
 * The argCheck predicates encode the D.1 pitfalls (UTC, east-positive lon,
 * orb range, exactly-one-target, range <= 50yr). They are pure functions of
 * the observed args plus the fixture prompt context, so score.mjs is usable
 * both for live model output and — in CI, with no model — to assert the
 * fixtures' own `expect.args` are self-consistent.
 */

// ---------------------------------------------------------------- argChecks
// Each predicate takes (args, fixture) and returns true/false/null.
// null = "not applicable to these args" (treated as a pass, excluded from the
// denominator in aggregate rates).

const isUtcString = (s) =>
  typeof s === "string" && /([zZ]|[+-]\d{2}:?\d{2})$/.test(s.trim());

// Pull the named latitude/longitude hint out of the fixture so a sign check
// knows which hemisphere the prompt intended.
function hemisphereOf(fixture) {
  const tags = fixture.tags ?? [];
  return {
    west: tags.includes("west-lon"),
    east: tags.includes("east-lon"),
    south: tags.includes("southern"),
  };
}

// Collect every {lat,lon,date} the args carry, including nested synastry a/b.
function collectCoords(args) {
  const out = [];
  const visit = (o) => {
    if (!o || typeof o !== "object") return;
    if ("lat" in o || "lon" in o || "date" in o) out.push(o);
    for (const v of Object.values(o)) if (v && typeof v === "object") visit(v);
  };
  visit(args);
  return out;
}

function numOf(v) {
  // args may be raw numbers (model output) or {approx,tol} (fixture expect)
  if (v && typeof v === "object" && "approx" in v) return v.approx;
  return typeof v === "number" ? v : undefined;
}

export const ARG_CHECKS = {
  date_is_utc(args) {
    const coords = collectCoords(args);
    const dates = [];
    for (const c of coords) {
      for (const k of ["date", "transit_date", "start", "end", "search_start", "search_end", "target_date"]) {
        if (typeof c[k] === "string" && c[k] !== "now") dates.push(c[k]);
      }
    }
    if (dates.length === 0) return null;
    return dates.every(isUtcString);
  },
  lon_sign_east(args, fixture) {
    const lons = collectCoords(args).map((c) => numOf(c.lon)).filter((x) => x !== undefined);
    if (lons.length === 0) return null;
    void fixture;
    return lons.every((x) => x >= 0);
  },
  lon_sign_west(args, fixture) {
    const lons = collectCoords(args).map((c) => numOf(c.lon)).filter((x) => x !== undefined);
    if (lons.length === 0) return null;
    void fixture;
    return lons.every((x) => x <= 0);
  },
  lat_sign_south(args) {
    const lats = collectCoords(args).map((c) => numOf(c.lat)).filter((x) => x !== undefined);
    if (lats.length === 0) return null;
    return lats.every((x) => x <= 0);
  },
  orb_in_range(args) {
    const orb = numOf(args.orb);
    if (orb === undefined) return null; // defaulted; the schema default is in range
    return orb >= 0.5 && orb <= 10;
  },
  step_in_range(args) {
    const s = numOf(args.step_minutes);
    if (s === undefined) return null;
    return s >= 5 && s <= 120;
  },
  window_in_range(args) {
    const a = numOf(args.window_start_hour);
    const b = numOf(args.window_end_hour);
    if (a === undefined && b === undefined) return null;
    const inRange = (x) => x === undefined || (x >= 0 && x <= 24);
    return inRange(a) && inRange(b) && (a === undefined || b === undefined || a <= b);
  },
  exactly_one_target(args) {
    const hasLon = args.target_lon !== undefined;
    const hasBody = args.target_body !== undefined;
    return hasLon !== hasBody;
  },
  exactly_one_date(args) {
    // rectification_grid: a single date field present, no range/transit dates.
    return args.date !== undefined && args.transit_date === undefined &&
      args.start === undefined && args.end === undefined;
  },
  range_le_50yr(args) {
    const start = collectCoords(args).map((c) => c.start).find(Boolean);
    const end = collectCoords(args).map((c) => c.end).find(Boolean);
    if (!start || !end) return null;
    const ms = new Date(end).getTime() - new Date(start).getTime();
    if (Number.isNaN(ms)) return null;
    return ms <= 50 * 366 * 86400000;
  },
  // returns: the search window must respect the tool's <= 2-year guard.
  return_window_le_2yr(args) {
    const { search_start, search_end } = args;
    if (!search_start || !search_end) return null;
    const ms = new Date(search_end).getTime() - new Date(search_start).getTime();
    if (Number.isNaN(ms)) return null;
    return ms <= 2 * 366 * 86400000;
  },
  // progressions: directing forward in time means target_date is on/after birth.
  target_after_natal(args) {
    const { date, target_date } = args;
    if (!date || !target_date) return null;
    const d0 = new Date(date).getTime();
    const d1 = new Date(target_date).getTime();
    if (Number.isNaN(d0) || Number.isNaN(d1)) return null;
    return d1 >= d0;
  },
  snake_case_body(args) {
    const bodies = [args.body, args.target_body].filter((b) => typeof b === "string");
    if (bodies.length === 0) return null;
    return bodies.every((b) => /^[a-z]+(_[a-z]+)*$/.test(b));
  },
  synastry_both_present(args) {
    return (
      args.a && typeof args.a === "object" &&
      args.b && typeof args.b === "object"
    );
  },
};

// ---------------------------------------------------------------- tool match
export function toolMatches(expectTool, observedTool) {
  const accepted = Array.isArray(expectTool) ? expectTool : [expectTool];
  // null in the accepted set means "no tool call is acceptable here".
  if (observedTool == null) return accepted.includes(null);
  return accepted.includes(observedTool);
}

// ---------------------------------------------------------------- numeric args
// Compare observed numeric args against fixture expectations within tolerance.
// Strings (dates, enums) must match exactly when the fixture gives a concrete
// value; "now" is a sentinel that accepts an omitted/now date.
function compareArgs(expectArgs, observedArgs) {
  const mismatches = [];
  const walk = (exp, obs, path) => {
    for (const [k, ev] of Object.entries(exp ?? {})) {
      const ov = obs ? obs[k] : undefined;
      const p = path ? `${path}.${k}` : k;
      if (ev && typeof ev === "object" && "approx" in ev) {
        if (typeof ov !== "number" || Math.abs(ov - ev.approx) > ev.tol) {
          mismatches.push(`${p}: expected ~${ev.approx}±${ev.tol}, got ${JSON.stringify(ov)}`);
        }
      } else if (ev && typeof ev === "object") {
        if (!ov || typeof ov !== "object") mismatches.push(`${p}: expected object, got ${JSON.stringify(ov)}`);
        else walk(ev, ov, p);
      } else if (ev === "now") {
        // accept omitted date or any UTC string
        if (ov !== undefined && !(typeof ov === "string")) {
          mismatches.push(`${p}: expected now/omitted or ISO, got ${JSON.stringify(ov)}`);
        }
      } else {
        if (ov !== ev) mismatches.push(`${p}: expected ${JSON.stringify(ev)}, got ${JSON.stringify(ov)}`);
      }
    }
  };
  walk(expectArgs, observedArgs, "");
  return mismatches;
}

// ---------------------------------------------------------------- scoreOne
// observed: { tool: string|null, args: object } — the model's decision.
// schemaValid: boolean|null — supplied by the caller (ajv against listTools).
export function scoreFixture(fixture, observed, schemaValid = null) {
  const exp = fixture.expect;
  const tool_correct = toolMatches(exp.tool, observed.tool);

  // Arg comparison only meaningful when a tool was chosen and we have expect.args.
  const argMismatches =
    observed.tool && exp.args && Object.keys(exp.args).length
      ? compareArgs(exp.args, observed.args ?? {})
      : [];
  const args_correct = argMismatches.length === 0;

  const arg_checks = {};
  for (const name of exp.argChecks ?? []) {
    const fn = ARG_CHECKS[name];
    if (!fn) {
      arg_checks[name] = { pass: false, error: "unknown predicate" };
      continue;
    }
    const r = fn(observed.args ?? {}, fixture);
    arg_checks[name] = { pass: r === null ? true : r, applicable: r !== null };
  }

  return {
    id: fixture.id,
    tags: fixture.tags ?? [],
    tool_correct,
    schema_valid: schemaValid,
    args_correct,
    arg_mismatches: argMismatches,
    arg_checks,
  };
}

// ---------------------------------------------------------------- aggregate
export function aggregate(results) {
  const n = results.length;
  const rate = (pred) => {
    const applicable = results.filter(pred.applicable);
    if (applicable.length === 0) return null;
    return applicable.filter(pred.pass).length / applicable.length;
  };
  const toolAcc = results.filter((r) => r.tool_correct).length / (n || 1);
  const schemaApplicable = results.filter((r) => r.schema_valid !== null);
  const schemaRate = schemaApplicable.length
    ? schemaApplicable.filter((r) => r.schema_valid).length / schemaApplicable.length
    : null;
  const argsApplicable = results.filter((r) => r.tool_correct);
  const argsRate = argsApplicable.length
    ? argsApplicable.filter((r) => r.args_correct).length / argsApplicable.length
    : null;

  // Per-predicate pass rates (only applicable cases count).
  const predNames = new Set();
  for (const r of results) for (const k of Object.keys(r.arg_checks)) predNames.add(k);
  const predicates = {};
  for (const name of predNames) {
    const applicable = results.filter((r) => r.arg_checks[name]?.applicable);
    predicates[name] = applicable.length
      ? { applicable: applicable.length, passed: applicable.filter((r) => r.arg_checks[name].pass).length }
      : { applicable: 0, passed: 0 };
  }

  // Per-tag tool-selection accuracy.
  const tagSet = new Set();
  for (const r of results) for (const t of r.tags) tagSet.add(t);
  const byTag = {};
  for (const tag of tagSet) {
    const tagged = results.filter((r) => r.tags.includes(tag));
    byTag[tag] = { n: tagged.length, tool_correct: tagged.filter((r) => r.tool_correct).length };
  }

  return {
    n,
    tool_selection_accuracy: toolAcc,
    schema_valid_rate: schemaRate,
    args_correct_rate: argsRate,
    predicates,
    by_tag: byTag,
  };
}

export function renderMarkdown(agg, results) {
  const pct = (x) => (x === null ? "n/a" : `${(x * 100).toFixed(1)}%`);
  const lines = [];
  lines.push("# MCP tool-selection eval report", "");
  lines.push(`- fixtures: **${agg.n}**`);
  lines.push(`- tool-selection accuracy: **${pct(agg.tool_selection_accuracy)}**`);
  lines.push(`- schema-valid rate: **${pct(agg.schema_valid_rate)}**`);
  lines.push(`- args-correct rate (of correct-tool cases): **${pct(agg.args_correct_rate)}**`, "");
  lines.push("## Semantic predicates (applicable cases only)", "");
  lines.push("| predicate | passed / applicable |");
  lines.push("|---|---|");
  for (const [name, p] of Object.entries(agg.predicates)) {
    lines.push(`| ${name} | ${p.passed} / ${p.applicable} |`);
  }
  lines.push("", "## By tag (tool-selection)", "");
  lines.push("| tag | correct / n |");
  lines.push("|---|---|");
  for (const [tag, p] of Object.entries(agg.by_tag).sort()) {
    lines.push(`| ${tag} | ${p.tool_correct} / ${p.n} |`);
  }
  const fails = results.filter((r) => !r.tool_correct || !r.args_correct);
  if (fails.length) {
    lines.push("", "## Failures", "");
    for (const r of fails) {
      const why = [];
      if (!r.tool_correct) why.push("wrong tool");
      if (!r.args_correct) why.push(`args: ${r.arg_mismatches.join("; ")}`);
      lines.push(`- **${r.id}** — ${why.join(" | ")}`);
    }
  }
  lines.push("");
  return lines.join("\n");
}
