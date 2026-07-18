/** Core-only embedded dataset: the planetary, lunar, Pluto, Chiron, and
 *  nutation series a natal/transit chart needs -- nothing else. Unlike
 *  `data-embedded`, this excludes the HYG-derived fixed-star catalog
 *  (CC BY-SA 4.0) and the d3-celestial-derived constellation figures
 *  (BSD-3), so a bundle built from this entry ships MIT-licensed data only.
 *  Star-anchored ayanamsas and SkyView overlays need `data-embedded`.
 *  The precise moon tier is intentionally NOT here (729 KB); fetch it lazily
 *  and pass via { ...coreData, moonCheb } if wanted. */
import mercury from "../data/vsop87d_mercury.embedded.json" with { type: "json" };
import venus from "../data/vsop87d_venus.embedded.json" with { type: "json" };
import earth from "../data/vsop87d_earth.embedded.json" with { type: "json" };
import mars from "../data/vsop87d_mars.embedded.json" with { type: "json" };
import jupiter from "../data/vsop87d_jupiter.embedded.json" with { type: "json" };
import saturn from "../data/vsop87d_saturn.embedded.json" with { type: "json" };
import uranus from "../data/vsop87d_uranus.embedded.json" with { type: "json" };
import neptune from "../data/vsop87d_neptune.embedded.json" with { type: "json" };
import nutation from "../data/nutation_iau1980.json" with { type: "json" };
import moonMeeus from "../data/moon_meeus47.json" with { type: "json" };
import pluto from "../data/pluto_meeus37.json" with { type: "json" };
import chiron from "../data/chiron_cheb.json" with { type: "json" };
import type { EngineData } from "./core.js";

export const coreData: EngineData = {
  vsop: { mercury, venus, earth, mars, jupiter, saturn, uranus, neptune },
  nutation, moonMeeus, pluto, chiron,
} as EngineData;
