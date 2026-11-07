import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // One static page: `next build` writes plain HTML, CSS and JS to out/. No server, no backend calls.
  output: "export",
  turbopack: { root: path.join(__dirname) },
  poweredByHeader: false,
};

export default nextConfig;
