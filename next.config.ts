import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  // This project lives in a folder next to another lockfile; pin tracing to the
  // project root so builds are deterministic.
  outputFileTracingRoot: path.join(__dirname),
};

export default nextConfig;
