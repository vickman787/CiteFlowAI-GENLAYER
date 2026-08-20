import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Keep `next build` from corrupting a concurrently running dev server's
  // route manifest. Both commands otherwise write to `.next`.
  distDir: process.env.NODE_ENV === "development" ? ".next-dev" : ".next",
};

export default nextConfig;
