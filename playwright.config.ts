import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "e2e",
  timeout: 60_000,
  use: {
    baseURL: "http://127.0.0.1:3000",
    ...devices["Desktop Chrome"],
  },
  webServer: {
    command: "rm -rf .data/demo-e2e && npm run start",
    url: "http://127.0.0.1:3000/login",
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      APP_MODE: "demo",
      AI_PROVIDER: "mock",
      INLINE_WORKER: "true",
      PGLITE_DIR: ".data/demo-e2e",
    },
  },
});
