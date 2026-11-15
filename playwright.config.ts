import { defineConfig, devices } from "@playwright/test";

// QA against the production build served by PocketBase (same as the home server).
// qa/run.sh restores a freshly seeded DB and starts the server before this runs.
export default defineConfig({
  testDir: "qa",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  globalSetup: "./qa/global-setup.ts",
  use: {
    baseURL: process.env.QA_URL ?? "http://127.0.0.1:8090",
    trace: "retain-on-failure",
    locale: "ko-KR",
    timezoneId: "Asia/Bangkok",
  },
  projects: [
    { name: "iphone", use: { ...devices["iPhone 12 Mini"] } },
    { name: "android", use: { ...devices["Pixel 7"] } },
  ],
});
