import { mkdirSync } from "node:fs";
import { test, expect } from "@playwright/test";

const viewports = [
  { name: "1920x1080", width: 1920, height: 1080 },
  { name: "1366x768", width: 1366, height: 768 },
  { name: "1280x720", width: 1280, height: 720 },
  { name: "768x1024", width: 768, height: 1024 },
  { name: "390x844", width: 390, height: 844 },
  { name: "360x800", width: 360, height: 800 }
];

async function setSensor(page, label, value) {
  await page.getByRole("slider", { name: label }).evaluate((input, nextValue) => {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;
    setter.call(input, String(nextValue));
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  }, value);
}

async function noDocumentOverflow(page) {
  return page.evaluate(() => ({
    horizontal: document.documentElement.scrollWidth <= window.innerWidth,
    vertical: document.documentElement.scrollHeight <= window.innerHeight,
    viewport: [window.innerWidth, window.innerHeight],
    document: [document.documentElement.scrollWidth, document.documentElement.scrollHeight]
  }));
}

test("operator, audience sessions, scene sync, feedback, and six viewport layouts", async ({ page, request }) => {
  mkdirSync("artifacts/ui-validation", { recursive: true });
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.goto("/operator");
  await page.getByLabel("Operator access token").fill("theva-e2e-operator-token");
  await page.getByRole("button", { name: "Connect", exact: true }).click();
  await expect(page.getByText("Operator connection")).toBeVisible();
  let failedOneRenewal = false;
  await page.route("**/api/operator-lock", async route => {
    const body = route.request().postDataJSON();
    if (body.action === "renew" && !failedOneRenewal) {
      failedOneRenewal = true;
      return route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: "Operator lock service unavailable." }) });
    }
    return route.continue();
  });
  const operatorStatus = page.locator(".operator-access-card > .operator-access-row small").first();
  await expect(operatorStatus).toHaveText(/Reconnecting to the operator lock/, { timeout: 15_000 });
  await expect(operatorStatus).toHaveText("This browser owns the control lock.", { timeout: 5_000 });
  await expect(page.getByRole("slider", { name: "Rainfall" })).toBeEnabled();
  expect(failedOneRenewal).toBe(true);
  await page.unroute("**/api/operator-lock");
  await expect(page.locator(".operator-metrics .risk-level")).toHaveText("Safe");
  await page.getByLabel("Operating mode").selectOption("hardware");
  await expect(page.locator(".operator-metrics .risk-level")).toHaveText("Unavailable");
  await expect(page.getByText("HARDWARE INPUT UNAVAILABLE")).toBeVisible();
  await page.getByLabel("Operating mode").selectOption("auto");
  await expect(page.locator(".operator-metrics .risk-level")).toHaveText("Safe");

  const sceneControls = page.getByRole("group", { name: "Choose hillside scene view" });
  const scenes = [
    { label: "Panorama", path: "panorama" },
    { label: "Hillside home", path: "hillside_home" },
    { label: "Slope detail", path: "slope_detail" },
    { label: "Soil close-up", path: "soil_closeup" }
  ];
  const stateScenes = ["safe", "watch", "high", "evacuation"];

  await expect(page.locator(".operator-metrics .risk-level")).toHaveText("Safe");
  for (const scene of scenes) {
    await sceneControls.getByRole("button", { name: scene.label }).click();
    await expect(page.locator(".hill-visual-image")).toHaveAttribute("src", `/images/safe/safe_${scene.path}.jpg`);
    await expect.poll(() => page.locator(".hill-visual-image").evaluate(img => img.naturalWidth), { message: `${stateScenes[0]} scene ${scene.path} should render at native resolution` }).toBeGreaterThanOrEqual(1600);
  }

  await setSensor(page, "Rainfall", 35);
  await expect(page.locator(".operator-metrics .risk-level")).toHaveText("Watch");
  await expect(page.locator(".hill-risk-state")).toHaveText("Watch");
  for (const scene of scenes) {
    await sceneControls.getByRole("button", { name: scene.label }).click();
    await expect(page.locator(".hill-visual-image")).toHaveAttribute("src", `/images/watch/watch_${scene.path}.jpg`);
    await expect.poll(() => page.locator(".hill-visual-image").evaluate(img => img.naturalWidth), { message: `Watch scene ${scene.path} should render at native resolution` }).toBeGreaterThanOrEqual(1600);
  }

  await setSensor(page, "Soil moisture", 60);
  await setSensor(page, "Ground movement", 60);
  await expect(page.locator(".operator-metrics .risk-level")).toHaveText("High");
  for (const scene of scenes) {
    await sceneControls.getByRole("button", { name: scene.label }).click();
    await expect(page.locator(".hill-visual-image")).toHaveAttribute("src", `/images/high/high_${scene.path}.jpg`);
    await expect.poll(() => page.locator(".hill-visual-image").evaluate(img => img.naturalWidth), { message: `High scene ${scene.path} should render at native resolution` }).toBeGreaterThanOrEqual(1600);
  }

  await setSensor(page, "Rainfall", 80);
  await setSensor(page, "Soil moisture", 80);
  await expect(page.locator(".operator-metrics .risk-level")).toHaveText("Evacuation");
  for (const scene of scenes) {
    await sceneControls.getByRole("button", { name: scene.label }).click();
    await expect(page.locator(".hill-visual-image")).toHaveAttribute("src", `/images/evacuation/evacuation_${scene.path}.jpg`);
    await expect.poll(() => page.locator(".hill-visual-image").evaluate(img => img.naturalWidth), { message: `Evacuation scene ${scene.path} should render at native resolution` }).toBeGreaterThanOrEqual(1600);
  }

  const riskBeforeSceneChange = await page.locator(".operator-metrics .risk-level").innerText();
  await sceneControls.getByRole("button", { name: "Slope detail" }).click();
  await expect(page.locator(".operator-metrics .risk-level")).toHaveText(riskBeforeSceneChange);
  await expect(page.locator(".scene-current")).toHaveText("Slope detail");

  await page.getByRole("button", { name: "Start session", exact: true }).click();
  await expect(page.getByRole("img", { name: "QR code for the active audience session" })).toBeVisible();
  const firstAudienceUrl = await page.getByLabel("Audience session link").inputValue();
  const audienceUrl = new URL(firstAudienceUrl);
  const firstToken = new URLSearchParams(audienceUrl.hash.slice(1)).get("session");
  expect(firstToken).toMatch(/^[a-zA-Z0-9_-]{40,}$/);

  const audiencePage = await page.context().newPage();
  await audiencePage.goto(firstAudienceUrl);
  await expect(audiencePage.locator(".audience-risk h2")).toHaveText("Evacuation");
  await expect(audiencePage.locator(".audience-hill .scene-current")).toHaveText("Slope detail");
  await expect(audiencePage.getByRole("img", { name: "QR code for the active audience session" })).toHaveCount(0);
  const expiryBeforeRefresh = (await (await request.post("/api/audience-session", { data: { action: "validate", token: firstToken } })).json()).expiresAt;
  await audiencePage.reload();
  await expect(audiencePage.locator(".audience-risk h2")).toHaveText("Evacuation");
  const expiryAfterRefresh = (await (await request.post("/api/audience-session", { data: { action: "validate", token: firstToken } })).json()).expiresAt;
  expect(expiryAfterRefresh).toBe(expiryBeforeRefresh);

  await setSensor(page, "Rainfall", 35);
  await setSensor(page, "Soil moisture", 0);
  await setSensor(page, "Ground movement", 0);
  await expect(page.locator(".operator-metrics .risk-level")).toHaveText("Watch");
  await page.getByRole("group", { name: "Choose hillside scene view" }).getByRole("button", { name: "Soil close-up" }).click();
  await expect(audiencePage.locator(".audience-risk h2")).toHaveText("Watch", { timeout: 10_000 });
  await expect(audiencePage.locator(".audience-hill .scene-current")).toHaveText("Soil close-up", { timeout: 10_000 });

  await audiencePage.route("**/api/audience-session", route => route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: "Audience session service unavailable." }) }));
  await expect(audiencePage.locator(".audience-session-meta")).toContainText("offline", { timeout: 10_000 });
  await expect(audiencePage.locator(".audience-risk h2")).toHaveText("Watch");
  await audiencePage.unroute("**/api/audience-session");
  await audiencePage.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(audiencePage.locator(".audience-session-meta")).toContainText("Cloud connected", { timeout: 10_000 });

  await audiencePage.getByRole("button", { name: "Share feedback" }).click();
  await audiencePage.getByRole("button", { name: "4", exact: true }).click();
  await audiencePage.getByLabel("Any suggestions? (optional)").fill("Clear and easy to follow.");
  await audiencePage.getByRole("button", { name: "Submit feedback" }).click();
  await expect(audiencePage.getByRole("heading", { name: "Thank you!" })).toBeVisible();
  await page.getByRole("button", { name: "Feedback" }).click();
  await expect(page.getByText("Clear and easy to follow.")).toBeVisible();

  await page.getByRole("button", { name: "Operator console" }).click();
  for (const viewport of viewports) {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    if (viewport.width <= 650) await page.getByRole("tab", { name: "Monitor" }).click();
    await page.screenshot({ path: `artifacts/ui-validation/operator-${viewport.name}-monitor.png` });
    const monitorOverflow = await noDocumentOverflow(page);
    expect(monitorOverflow.horizontal, `operator monitor horizontal overflow at ${viewport.name}: ${JSON.stringify(monitorOverflow)}`).toBe(true);
    expect(monitorOverflow.vertical, `operator monitor vertical overflow at ${viewport.name}: ${JSON.stringify(monitorOverflow)}`).toBe(true);
    if (viewport.width <= 650) {
      await page.getByRole("tab", { name: "Inputs" }).click();
      await page.screenshot({ path: `artifacts/ui-validation/operator-${viewport.name}-inputs.png` });
      await expect(page.getByRole("slider", { name: "Rainfall" })).toBeVisible();
      await expect(page.getByRole("button", { name: "Simulate sensor fault" }).first()).toBeVisible();
      const controlOverflow = await noDocumentOverflow(page);
      expect(controlOverflow.horizontal, `operator controls horizontal overflow at ${viewport.name}: ${JSON.stringify(controlOverflow)}`).toBe(true);
      expect(controlOverflow.vertical, `operator controls vertical overflow at ${viewport.name}: ${JSON.stringify(controlOverflow)}`).toBe(true);
      await page.getByRole("tab", { name: "Session" }).click();
      await page.screenshot({ path: `artifacts/ui-validation/operator-${viewport.name}-session.png` });
      await expect(page.getByRole("button", { name: "Replace link", exact: true })).toBeVisible();
      await expect(page.getByRole("img", { name: "QR code for the active audience session" })).toBeVisible();
      const sessionOverflow = await noDocumentOverflow(page);
      expect(sessionOverflow.horizontal, `operator session horizontal overflow at ${viewport.name}: ${JSON.stringify(sessionOverflow)}`).toBe(true);
      expect(sessionOverflow.vertical, `operator session vertical overflow at ${viewport.name}: ${JSON.stringify(sessionOverflow)}`).toBe(true);
      await page.getByRole("tab", { name: "Monitor" }).click();
    }
    if (viewport.width >= 1280) {
      expect(monitorOverflow.vertical, `operator desktop vertical overflow at ${viewport.name}: ${JSON.stringify(monitorOverflow)}`).toBe(true);
      await expect(page.getByRole("slider", { name: "Rainfall" })).toBeVisible();
      await expect(page.getByRole("button", { name: "Replace link", exact: true })).toBeVisible();
    }
  }

  await page.setViewportSize({ width: 1366, height: 768 });
  await page.getByRole("button", { name: "Replace link", exact: true }).click();
  await expect(page.getByRole("img", { name: "QR code for the active audience session" })).toBeVisible();
  const replacementUrl = await page.getByLabel("Audience session link").inputValue();
  const replacementToken = new URLSearchParams(new URL(replacementUrl).hash.slice(1)).get("session");
  const revokedResponse = await request.post("/api/audience-session", { data: { action: "validate", token: firstToken } });
  expect(revokedResponse.status()).toBe(401);
  await audiencePage.reload();
  await expect(audiencePage.locator(".welcome-page")).toBeVisible();
  await audiencePage.goto(replacementUrl);
  await expect(audiencePage.locator(".audience-risk h2")).toHaveText("Watch");

  for (const viewport of viewports) {
    await audiencePage.setViewportSize({ width: viewport.width, height: viewport.height });
    await expect(audiencePage.locator(".audience-risk h2")).toBeVisible();
    await expect(audiencePage.locator(".audience-hill .hill-visual-image")).toBeVisible();
    await expect(audiencePage.locator(".audience-summary .audience-sensor")).toHaveCount(3);
    await expect(audiencePage.locator(".audience-hill .hill-explanation")).toBeVisible();
    await audiencePage.screenshot({ path: `artifacts/ui-validation/audience-${viewport.name}.png` });
    const overflow = await noDocumentOverflow(audiencePage);
    expect(overflow.horizontal, `audience horizontal overflow at ${viewport.name}: ${JSON.stringify(overflow)}`).toBe(true);
    expect(overflow.vertical, `audience vertical overflow at ${viewport.name}: ${JSON.stringify(overflow)}`).toBe(true);
  }

  await page.getByRole("button", { name: "End", exact: true }).click();
  await audiencePage.reload();
  await expect(audiencePage.locator(".welcome-page")).toBeVisible();

  await page.getByRole("button", { name: "Start session", exact: true }).click();
  const expiringUrl = await page.getByLabel("Audience session link").inputValue();
  await audiencePage.goto(expiringUrl);
  await expect(audiencePage.locator(".audience-risk h2")).toHaveText("Watch");
  await request.get("/__test/advance?seconds=421");
  await audiencePage.reload();
  await expect(audiencePage.locator(".welcome-page")).toBeVisible();
});
