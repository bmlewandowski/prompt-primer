import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Transpile the local workspace package so Next.js handles its ESM output
  transpilePackages: ["@prompt-primer/compiler"],
  devIndicators: false,
};

export default nextConfig;
