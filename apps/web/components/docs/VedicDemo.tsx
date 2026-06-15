import { Fragment } from "react";
import {
  BODIES, nakshatra, varga,
  vimshottariDashas, vimshottariAt,
  yogasAt,
  type BodyId,
} from "caelus";
import { GLYPHS } from "caelus-wheel";
import {
  sampleEngine, SAMPLE, SAMPLE_JD, TARGET_JD, jdToDate,
} from "../../lib/sample-chart";
import { DocFigure, cell } from "./DocFigure";

const { lat, lon } = SAMPLE;
const SID = { zodiac: "sidereal:lahiri" } as const;
const sid = (b: BodyId) => sampleEngine.longitude(b, SAMPLE_JD, SID);

/** Each body's nakshatra (Lahiri), its pada and dasha lord, and its navamsa sign. */
export function NakshatraTable() {
  const rows = BODIES.flatMap((b) => {
    const l = sid(b);
    if (!Number.isFinite(l)) return [];
    const n = nakshatra(l);
    return [{ body: b, nak: n.name, pada: n.pada, lord: n.lord, d9: varga(l, 9).sign }];
  });
  return (
    <DocFigure caption={<>Sidereal (Lahiri). Each body&rsquo;s nakshatra and pada, the nakshatra&rsquo;s dasha lord, and its navamsa (D9) sign.</>}>
      <table className="mono" style={{ fontSize: "0.82rem", width: "auto" }}>
        <thead>
          <tr style={{ color: "var(--text-mute)" }}>
            <td style={cell} /><td style={cell}>nakshatra</td><td style={cell}>pada</td><td style={cell}>lord</td><td style={cell}>D9</td>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.body}>
              <td className="mute" style={cell}>{GLYPHS[r.body] ? `${GLYPHS[r.body]} ` : ""}{r.body}</td>
              <td style={cell}>{r.nak}</td>
              <td className="mute" style={cell}>p{r.pada}</td>
              <td className="mute" style={cell}>{r.lord}</td>
              <td className="mute" style={cell}>{r.d9}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </DocFigure>
  );
}

/** The Vimshottari mahadasha timeline, with the active maha expanded to antardashas. */
export function DashaTree() {
  const moon = sid("moon");
  const tl = vimshottariDashas(moon, SAMPLE_JD, 2);
  const active = vimshottariAt(sampleEngine, SAMPLE_JD, TARGET_JD);
  return (
    <DocFigure caption={<>Vimshottari dasha from the Moon in {active.moon_nakshatra} (pada {active.moon_pada}). The mahadasha periods over the 120-year cycle; the active one ({active.maha}) is expanded to its antardashas, with the running antar ({active.antar}) marked.</>}>
      <table className="mono" style={{ fontSize: "0.82rem", width: "auto" }}>
        <tbody>
          {tl.dashas.map((m) => {
            const mActive = m.lord === active.maha && m.start <= TARGET_JD && TARGET_JD < m.end;
            return (
              <Fragment key={m.lord}>
                <tr style={mActive ? { background: "var(--surface-2)" } : undefined}>
                  <td style={{ ...cell, color: mActive ? "var(--accent)" : "var(--text)", fontWeight: 600 }}>
                    {GLYPHS[m.lord] ?? ""} {m.lord}
                  </td>
                  <td className="mute" style={cell}>{jdToDate(m.start)} → {jdToDate(m.end)}</td>
                  <td className="mute" style={cell}>{mActive ? "mahadasha now" : ""}</td>
                </tr>
                {mActive && m.sub.map((s) => {
                  const sActive = s.lord === active.antar && s.start <= TARGET_JD && TARGET_JD < s.end;
                  return (
                    <tr key={`${m.lord}-${s.lord}`}>
                      <td style={{ ...cell, paddingLeft: "1.4rem", color: sActive ? "var(--accent)" : "var(--text-mute)" }}>
                        › {s.lord}
                      </td>
                      <td className="mute" style={cell}>{jdToDate(s.start)} → {jdToDate(s.end)}</td>
                      <td style={{ ...cell, color: "var(--accent)" }}>{sActive ? "antardasha now" : ""}</td>
                    </tr>
                  );
                })}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </DocFigure>
  );
}

/** The classical placement yogas present on the sample rasi chart. */
export function YogasList() {
  const ys = yogasAt(sampleEngine, SAMPLE_JD, lat, lon);
  return (
    <DocFigure caption={<>The placement yogas <code>yogasAt</code> detects on the sample rasi (D1) chart, judged from own-sign / exaltation and whole-sign houses.</>}>
      {ys.length === 0 ? (
        <p className="dim small" style={{ margin: 0 }}>No placement yogas on this chart.</p>
      ) : (
        <table className="mono" style={{ fontSize: "0.82rem", width: "auto" }}>
          <tbody>
            {ys.map((y) => (
              <tr key={y.yoga}>
                <td style={cell}>{y.yoga}</td>
                <td className="mute" style={cell}>{y.planets.map((p) => `${GLYPHS[p] ?? ""} ${p}`).join(", ")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </DocFigure>
  );
}
