import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // One static page: `next build` writes plain HTML, CSS and JS to out/. No server, no backend calls.
  output: "export",
  // In production the landing page shares an address with the Veridoc app, which also serves its
  // files from /_next/. The Docker build sets LANDING_ASSET_PREFIX=/_landing so the two never
  // collide (Caddy strips the prefix again). Local builds leave it unset.
  assetPrefix: process.env.LANDING_ASSET_PREFIX || undefined,
  turbopack: { root: path.join(__dirname) },
  poweredByHeader: false,
};

export default nextConfig;
