import path from "node:path";
import type { NextConfig } from "next";

const API_ORIGIN = process.env.API_ORIGIN ?? "http://localhost:8000";

const nextConfig: NextConfig = {
  // A self-contained server for the Docker image (deploy/). API_ORIGIN is read at build time.
  output: "standalone",
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    root: path.join(__dirname),
    rules: {
      "*.css": { loaders: ["@tailwindcss/turbopack"], as: "*.css" },
    },
  },
  // Same-origin API: the browser only ever talks to this app, so the session cookie is
  // first-party and there is no CORS surface.
  async rewrites() {
    return [{ source: "/api/:path*", destination: `${API_ORIGIN}/api/:path*` }];
  },
  poweredByHeader: false,
};

export default nextConfig;
