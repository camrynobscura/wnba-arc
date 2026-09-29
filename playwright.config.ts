import { defineConfig, devices } from "@playwright/test";

/**
 * End-to-end tests (e2e/): the production build, served by `vite preview` with Netlify's headers, in Chromium,
 * Firefox and WebKit. The API is answered from recorded responses (e2e/fixtures), so no API, database or network
 * is needed.
 */
export default defineConfig({
  testDir: "e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : [["list"]],
  use: {
    baseURL: "http://localhost:4173",
    trace: "retain-on-failure",
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "firefox", use: { ...devices["Desktop Firefox"] } },
    { name: "webkit", use: { ...devices["Desktop Safari"] } },
  ],
  webServer: {
    command: "npm run build && npm run preview -- --port 4173 --strictPort",
    url: "http://localhost:4173",
    // An empty VITE_API_BASE means the same-origin /api, which the tests answer; a .env naming the live API
    // would otherwise be built in.
    env: { VITE_API_BASE: "" },
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
