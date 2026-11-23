import { existsSync } from "node:fs";
import { defineConfig } from "@playwright/test";

const chromeCandidates = [
  process.env.CHROME_PATH,
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium"
].filter(Boolean);
const systemBrowser = chromeCandidates.find(candidate => existsSync(candidate));

export default defineConfig({
  testDir: "./tests/e2e",
  globalTeardown: "./tests/e2e/global-teardown.js",
  fullyParallel: false,
  workers: 1,
  timeout: 90_000,
  expect: { timeout: 10_000 },
  reporter: "list",
  outputDir: "./artifacts/playwright-results",
  use: {
    baseURL: "http://127.0.0.1:4174",
    browserName: "chromium",
    headless: true,
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
    launchOptions: systemBrowser ? { executablePath: systemBrowser } : {},
    viewport: { width: 1366, height: 768 },
    trace: "off"
  },
  webServer: {
    command: "node tests/handler-server.js",
    url: "http://127.0.0.1:4174/operator",
    reuseExistingServer: false,
    timeout: 45_000,
    stdout: "pipe",
    stderr: "pipe"
  }
});
