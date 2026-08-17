import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Native module: load with Node's require, do not bundle.
  serverExternalPackages: ["better-sqlite3"],
  turbopack: {
    root: path.resolve(process.cwd()),
  },
};

export default nextConfig;
