/**
 * Optional geocoding entry point — `caelus-birth/geocode`.
 *
 * The core package is offline-pure; place-name search needs a network
 * service, so it lives behind this separate entry point. One adapter ships
 * (Open-Meteo: free, no key, attribution required — see README). Implement
 * `Geocoder` to plug in any other service.
 */

export interface GeocodeResult {
  /** Display name, e.g. "Tampa, Florida, United States". */
  name: string;
  lat: number;
  /** EAST positive. */
  lon: number;
  country?: string;
  admin1?: string;
  /** IANA zone as reported by the service; pass as `zone` to toUT to skip
   *  the coordinate lookup. */
  timezone?: string;
}

export interface Geocoder {
  search(query: string, limit?: number): Promise<GeocodeResult[]>;
}

interface OpenMeteoPlace {
  name: string;
  latitude: number;
  longitude: number;
  country?: string;
  admin1?: string;
  timezone?: string;
}

/** https://open-meteo.com/en/docs/geocoding-api — free, no API key. */
export const openMeteoGeocoder: Geocoder = {
  async search(query: string, limit = 5): Promise<GeocodeResult[]> {
    const url = "https://geocoding-api.open-meteo.com/v1/search?name="
      + encodeURIComponent(query) + `&count=${limit}&language=en&format=json`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`open-meteo geocoding failed: HTTP ${res.status}`);
    const data = (await res.json()) as { results?: OpenMeteoPlace[] };
    return (data.results ?? []).map((r) => ({
      name: [r.name, r.admin1, r.country].filter(Boolean).join(", "),
      lat: r.latitude,
      lon: r.longitude,
      country: r.country,
      admin1: r.admin1,
      timezone: r.timezone,
    }));
  },
};
