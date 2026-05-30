import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  serverExternalPackages: ["better-sqlite3"],
  outputFileTracingRoot: __dirname,
  turbopack: {
    root: path.resolve(__dirname),
  },
};

export default nextConfig;
