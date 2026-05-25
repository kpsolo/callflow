import { test, expect } from "@playwright/test";

test.describe("Call Flow Studio Simulator E2E Tests", () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to the app
    await page.goto("/");
    // Clear localStorage to ensure a clean empty slate
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    // Clear the default nodes so the empty welcome banner is triggered
    await page.evaluate(() => {
      if ((window as any).__flow_store__) {
        (window as any).__flow_store__.getState().clearFlow();
      }
    });
  });

  test("should render the empty canvas and load a sample flow", async ({ page }) => {
    // 1. Verify page title
    await expect(page).toHaveTitle(/Call Flow Studio/i);

    // 2. Check for empty state welcome banner
    const welcome = page.locator(".welcome");
    await expect(welcome).toBeVisible();
    await expect(welcome).toContainText("This canvas is empty.");

    // 3. Click the load sample flow CTA
    const loadSampleBtn = page.locator(".welcome-cta--primary");
    await expect(loadSampleBtn).toBeVisible();
    await loadSampleBtn.click();

    // 4. Verify that the welcome banner disappears (since nodes are loaded)
    await expect(welcome).not.toBeVisible();
  });

  test("should toggle the simulator panel and collapse it via the custom close button", async ({ page }) => {
    // 1. Load a sample flow to make sure everything works
    const loadSampleBtn = page.locator(".welcome-cta--primary");
    await expect(loadSampleBtn).toBeVisible();
    await loadSampleBtn.click();

    // 2. Toggle the simulator panel open via the main drawer button
    const simToggle = page.locator(".shell-simdrawer-toggle");
    await expect(simToggle).toBeVisible();
    await expect(simToggle).toHaveAttribute("aria-expanded", "false");
    await simToggle.click();
    await expect(simToggle).toHaveAttribute("aria-expanded", "true");

    // 3. Verify that the simulator close button is visible and active
    const closeBtn = page.locator(".simpanel-close-btn");
    await expect(closeBtn).toBeVisible();

    // 4. Click the custom close button to collapse the simulator drawer
    await closeBtn.click();

    // 5. Verify the simulator drawer is collapsed
    await expect(simToggle).toHaveAttribute("aria-expanded", "false");
    await expect(closeBtn).not.toBeVisible();
  });
});
