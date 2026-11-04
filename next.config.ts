import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Cache Components prerender routes that do not touch request data.
  // This app is per-owner and reads the session on every page, so it stays dynamic.
  serverExternalPackages: [
    "@electric-sql/pglite",
    "@electric-sql/pglite-pgvector",
    "postgres",
  ],
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
