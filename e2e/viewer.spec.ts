import { test, expect, type Page } from "@playwright/test";

// Load the app with a clean slate (no persisted layout/panel prefs).
async function openApp(page: Page) {
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.goto("/");
  await expect(page.locator(".card").first()).toBeVisible();
}

test.describe("cdk-visor", () => {
  test("loads the demo and shows the root level", async ({ page }) => {
    await openApp(page);
    await expect(page.locator(".brand")).toContainText("cdk-visor");
    await expect(page.locator(".card", { hasText: "ApiStack" })).toBeVisible();
    await expect(page.locator(".card", { hasText: "NetworkStack" })).toBeVisible();
    // Root inspector reports the rolled-up resource count.
    await expect(page.locator(".kv", { hasText: "Resources" })).toContainText("16");
  });

  test("drills from the root into a stack via breadcrumbs", async ({ page }) => {
    await openApp(page);
    await page.locator(".card", { hasText: "ApiStack" }).first().dblclick();
    await expect(page.locator(".breadcrumbs")).toContainText("ApiStack");
    await expect(page.locator(".card", { hasText: "OrderHandler" })).toBeVisible();

    // Breadcrumb navigates back up.
    await page.locator(".crumb", { hasText: "App" }).click();
    await expect(page.locator(".card", { hasText: "NetworkStack" })).toBeVisible();
  });

  test("inspects a resource's CloudFormation and relations", async ({ page }) => {
    await openApp(page);
    await page.locator(".card", { hasText: "ApiStack" }).first().dblclick();
    await page.locator(".card", { hasText: "OrderHandler" }).first().dblclick();
    await page.locator(".card", { hasText: "Resource" }).first().click();

    await page.locator(".tab", { hasText: "CloudFormation" }).click();
    await expect(page.locator("pre.code")).toContainText("AWS::Lambda::Function");

    await page.locator(".tab", { hasText: "Relations" }).click();
    // The handler references the table, bucket and its role.
    await expect(page.locator(".section-title", { hasText: "References" })).toBeVisible();
    await expect(page.locator(".insp-body")).toContainText("GetAtt");
  });

  test("search jumps to a construct", async ({ page }) => {
    await openApp(page);
    await page.keyboard.press("ControlOrMeta+k");
    await expect(page.locator(".search-box")).toBeVisible();
    await page.locator(".search-input").fill("bucket");
    await expect(page.locator(".search-result").first()).toContainText("Bucket");
    await page.keyboard.press("Enter");
    await expect(page.locator(".search-box")).toBeHidden();
    await expect(page.locator(".insp-head h2")).toContainText("Resource");
  });

  test("filters the construct tree", async ({ page }) => {
    await openApp(page);
    await page.locator(".tree-filter input").fill("table");
    // Matching nodes are highlighted; non-matching branches are pruned.
    await expect(page.locator(".tree-row.match").first()).toBeVisible();
    await expect(page.locator(".tree-row", { hasText: "AssetsBucket" })).toHaveCount(0);
  });

  test("renders the relationship graph across layouts", async ({ page }) => {
    await openApp(page);
    await page.locator(".card", { hasText: "ApiStack" }).first().dblclick();
    await page.locator(".view-toggle button", { hasText: "Graph" }).click();

    const svg = page.locator(".graph-svg");
    await expect(svg).toBeVisible();
    await expect(page.locator(".graph-node")).toHaveCount(4);
    await expect(page.locator(".graph-edge").first()).toBeVisible();

    for (const layout of ["force", "circular", "grid", "layered"]) {
      await page.selectOption(".graph-controls select", layout);
      await expect(page.locator(".graph-node")).toHaveCount(4);
    }

    // Selecting a node highlights its connected edges.
    await page.locator(".graph-node", { hasText: "OrderHandler" }).first().click();
    await expect(page.locator(".graph-edge.active").first()).toBeVisible();
  });

  test("reflects the current view in a shareable URL", async ({ page }) => {
    await openApp(page);
    await page.locator(".card", { hasText: "ApiStack" }).first().dblclick();
    await page.locator(".card", { hasText: "OrdersTable" }).first().click();

    await expect.poll(() => page.url()).toContain("s=ApiStack%2FOrdersTable");

    // Reloading the deep link restores the same selection.
    const url = page.url();
    await page.goto(url);
    await expect(page.locator(".insp-head .path")).toContainText("ApiStack/OrdersTable");
  });
});
