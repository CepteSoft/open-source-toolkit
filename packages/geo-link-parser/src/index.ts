/**
 * Parses real-world location shares into a routable destination string.
 *
 * Supported inputs: WhatsApp share links, Google Maps short links
 * (`goo.gl`, `maps.app.goo.gl` — resolved by following redirects),
 * `maps?q=` / `maps/search/?query=`, `/place/…/@lat,lng`, `ll=`,
 * `data=!3dLAT!4dLNG` params, and bare `lat,lng` text.
 *
 * Output: `"lat,lng"` | free-text address (usable as a geocoding/Distance
 * Matrix destination) | `null`.
 */

const LAT_MIN = -90;
const LAT_MAX = 90;
const LNG_MIN = -180;
const LNG_MAX = 180;

/** Whether a latitude/longitude pair is within valid WGS84 bounds. */
export function isValidLatLng(lat: number, lng: number): boolean {
  return (
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    lat >= LAT_MIN &&
    lat <= LAT_MAX &&
    lng >= LNG_MIN &&
    lng <= LNG_MAX
  );
}

/** Builds a `"lat,lng"` string; `null` when out of bounds. */
function toCoordString(lat: number, lng: number): string | null {
  return isValidLatLng(lat, lng) ? `${lat},${lng}` : null;
}

/** Finds the first valid `lat,lng` pair anywhere in the text (last-resort). */
function findCoordsInString(raw: string): string | null {
  const match = raw.match(/(-?\d{1,2}\.\d+),(-?\d{1,3}\.\d+)/);
  if (!match) return null;
  return toCoordString(parseFloat(match[1]!), parseFloat(match[2]!));
}

/** `data=!3dLAT!4dLNG`-style Google Maps data parameter. */
function findCoordsInDataParam(raw: string): string | null {
  const match = raw.match(/!3d(-?\d+\.?\d*)!4d(-?\d+\.?\d*)/);
  if (!match) return null;
  return toCoordString(parseFloat(match[1]!), parseFloat(match[2]!));
}

const DEFAULT_SHORT_LINK_HOSTS = ["maps.app.goo.gl", "goo.gl"];

const DEFAULT_USER_AGENTS = [
  // desktop first; some redirect targets only expose coords to mobile UAs
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Linux; Android 10) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36",
];

/** Minimal structural subset of `fetch` needed for redirect resolution. */
export type FetchLike = (
  url: string,
  init: { redirect: "follow"; headers: Record<string, string> }
) => Promise<{ url: string }>;

export type GeoLinkOptions = {
  /** HTTP implementation used to resolve short links. Default: `globalThis.fetch`. */
  fetch?: FetchLike;
  /** Hosts treated as redirect-only short links. Default: goo.gl domains. */
  shortLinkHosts?: readonly string[];
  /** User-Agents tried in order when resolving short links. */
  userAgents?: readonly string[];
};

function isShortLink(url: string | null, hosts: ReadonlySet<string>): boolean {
  if (!url?.trim()) return false;
  try {
    const u = new URL(url.trim());
    return hosts.has(u.hostname);
  } catch {
    return false;
  }
}

/** Follows a short link's redirects and returns the final URL, or `null`. */
async function resolveShortLink(
  shortUrl: string,
  fetchImpl: FetchLike,
  userAgents: readonly string[]
): Promise<string | null> {
  const tryFetch = async (userAgent: string): Promise<string | null> => {
    try {
      const res = await fetchImpl(shortUrl.trim(), {
        redirect: "follow",
        headers: {
          "User-Agent": userAgent,
          Accept: "text/html,application/xhtml+xml",
        },
      });
      const final = res.url?.trim();
      if (!final || final === shortUrl.trim()) return null;
      return final;
    } catch {
      return null;
    }
  };

  let final: string | null = null;
  for (const [i, ua] of userAgents.entries()) {
    const resolved = await tryFetch(ua);
    if (i === 0) {
      final = resolved;
      if (resolved && parseLocationLink(resolved)) return resolved;
    } else if (resolved) {
      return resolved;
    }
  }
  return final;
}

/**
 * Extracts a destination from a single URL or text string (synchronous — no
 * short-link resolution; use {@link normalizeLocation} for that).
 *
 * Precedence: path `@lat,lng` → `data=!3d!4d` → path `lat,lng` → `ll=` →
 * `q`/`query` (coords or address text) → hash → whole text (decoded).
 */
export function parseLocationLink(urlString: string): string | null {
  const raw = urlString.trim();
  if (!raw) return null;

  try {
    const url = new URL(raw);

    // 1) Path: @lat,lng or @lat,lng,zoom (Google Maps place/share)
    const atMatch = url.pathname.match(/@(-?\d+\.?\d*),(-?\d+\.?\d*)/);
    if (atMatch) {
      const out = toCoordString(parseFloat(atMatch[1]!), parseFloat(atMatch[2]!));
      if (out) return out;
    }

    // 2) Query: data=!…!3dLAT!4dLNG (common on the first short-link redirect)
    const data = url.searchParams.get("data");
    if (data) {
      const fromData = findCoordsInDataParam(data);
      if (fromData) return fromData;
    }

    // 3) Path: lat,lng anywhere (e.g. /place/…/39.75,30.49)
    const pathCoordMatch = url.pathname.match(/(-?\d{1,2}\.\d+),(-?\d{1,3}\.\d+)/);
    if (pathCoordMatch) {
      const out = toCoordString(parseFloat(pathCoordMatch[1]!), parseFloat(pathCoordMatch[2]!));
      if (out) return out;
    }

    // 4) Query: ll=lat,lng
    const ll = url.searchParams.get("ll");
    if (ll) {
      const parts = ll.split(",").map((s) => s.trim());
      if (parts.length >= 2) {
        const out = toCoordString(parseFloat(parts[0]!), parseFloat(parts[1]!));
        if (out) return out;
      }
    }

    // 5) Query: q= or query= (coords "39.75,30.49" or an address)
    const q = url.searchParams.get("q") ?? url.searchParams.get("query") ?? "";
    const decoded = decodeURIComponent(q).trim();
    if (decoded) {
      const parts = decoded.split(",").map((s) => s.trim());
      if (parts.length >= 2) {
        const out = toCoordString(parseFloat(parts[0]!), parseFloat(parts[1]!));
        if (out) return out;
      }
      return decoded;
    }

    // 6) Hash: #lat,lng or #@lat,lng
    if (url.hash) {
      const hashMatch = url.hash.match(/[@#]?(-?\d+\.?\d*),(-?\d+\.?\d*)/);
      if (hashMatch) {
        const out = toCoordString(parseFloat(hashMatch[1]!), parseFloat(hashMatch[2]!));
        if (out) return out;
      }
    }

    // 7) Whole URL (decoded): lat,lng or !3d!4d
    const fromRaw = findCoordsInString(raw);
    if (fromRaw) return fromRaw;
    try {
      const decodedRaw = decodeURIComponent(raw);
      const fromDecoded = findCoordsInString(decodedRaw) ?? findCoordsInDataParam(decodedRaw);
      if (fromDecoded) return fromDecoded;
    } catch {
      // ignore decode errors
    }
    return findCoordsInDataParam(raw);
  } catch {
    // not a URL — scan the bare text
    const fromRaw = findCoordsInString(raw);
    if (fromRaw) return fromRaw;
    try {
      const decodedRaw = decodeURIComponent(raw);
      return findCoordsInString(decodedRaw) ?? findCoordsInDataParam(decodedRaw);
    } catch {
      return null;
    }
  }
}

export type NormalizeLocationInput = {
  /** A shared link or free text possibly containing a location. */
  link: string | null;
  /** Known coordinates (e.g. from your database) — they win over the link. */
  latitude?: number | string | null;
  longitude?: number | string | null;
};

/**
 * Resolves a location record to a destination string.
 * Precedence: stored latitude/longitude → link (short links are resolved via
 * HTTP first) → parse.
 *
 * @returns `"lat,lng"` | address text | `null`
 */
export async function normalizeLocation(
  input: NormalizeLocationInput,
  options: GeoLinkOptions = {}
): Promise<string | null> {
  const { link, latitude, longitude } = input;
  const {
    fetch: fetchImpl = globalThis.fetch as unknown as FetchLike,
    shortLinkHosts = DEFAULT_SHORT_LINK_HOSTS,
    userAgents = DEFAULT_USER_AGENTS,
  } = options;

  const fromKnown = toCoordString(
    latitude != null ? parseFloat(String(latitude)) : NaN,
    longitude != null ? parseFloat(String(longitude)) : NaN
  );
  if (fromKnown) return fromKnown;

  const rawLink = link?.trim();
  if (!rawLink) return null;

  const hosts = new Set(shortLinkHosts);
  const urlToParse = isShortLink(rawLink, hosts)
    ? await resolveShortLink(rawLink, fetchImpl, userAgents)
    : rawLink;
  if (!urlToParse) return null;

  return parseLocationLink(urlToParse);
}
