import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV !== "production";

// Content-Security-Policy. Each directive is scoped to the origins the app
// actually talks to:
//   • connect-src: Supabase (REST + wss realtime), plus the Nominatim/Overpass
//     geocoding fetches. ORS routing is proxied through /api/route, so the
//     browser never contacts it directly.
//   • img-src: map tiles (Carto / ArcGIS) and avatars come from many hosts/CDNs,
//     so any https image is allowed (plus data:/blob: for previews + tile cache).
//   • style-src + script-src need 'unsafe-inline' (Leaflet injects inline styles
//     on its divIcon markers; Next emits inline bootstrap). 'unsafe-eval' is added
//     ONLY in dev, where React Fast Refresh needs it — production stays without.
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://nominatim.openstreetmap.org https://overpass-api.de",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
].join("; ");

// Security response headers applied to every route.
const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  // Clickjacking: don't allow the app to be framed by other origins.
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  // Stop browsers from MIME-sniffing a response away from its declared type.
  { key: "X-Content-Type-Options", value: "nosniff" },
  // Don't leak full URLs (which can carry ?pin= / ?route= ids) to third parties.
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // Only the features the app actually uses (geolocation for "Near Me").
  { key: "Permissions-Policy", value: "geolocation=(self), camera=(), microphone=(), payment=()" },
  // Force HTTPS for two years (Vercel already serves HTTPS-only).
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
];

const nextConfig: NextConfig = {
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
