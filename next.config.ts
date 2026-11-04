import type { NextConfig } from "next";
import { env } from "node:process";

const onRender = env.RENDER === "true" || Boolean(env.RENDER_SERVICE_ID) || Boolean(env.RENDER_EXTERNAL_URL);
if (!env.APP_MODE?.trim() && onRender && !env.DATABASE_URL?.trim()) {
  env.APP_MODE = "demo";
}

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
