import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  transpilePackages: ["@forklab/engine"],
  turbopack: { root: path.join(__dirname, "..") },
  serverExternalPackages: ["mongodb"],
};

export default nextConfig;
