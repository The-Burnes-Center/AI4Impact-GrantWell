/**
 * Journey 5: User Management loads and finds the test account. Needs the account's custom:role
 * to be ["Admin"] on dev (see README). Read-only: it never edits, resets or deletes a user.
 */
import { expect, test } from "../helpers/fixtures";
import { USER_EMAIL, appUrl } from "../helpers/config";

test("User Management lists users and finds the test account", async ({ page }) => {
  await page.goto(appUrl("/admin"));
  const tab = page.getByRole("tab", { name: "User Management" });
  await expect(tab, "User Management tab (is the test account an Admin on dev?)").toBeVisible();
  await tab.click();

  const panel = page.locator(".user-management-panel");
  await expect(panel.getByRole("heading", { name: "User Management" })).toBeVisible();
  await expect(panel.locator(".user-management-table tbody tr").first()).toBeVisible();

  await panel.getByRole("searchbox", { name: "Search users" }).fill(USER_EMAIL);
  await panel.getByRole("button", { name: "Search", exact: true }).click();
  await expect(panel.getByRole("status")).toHaveText(`1 user found for "${USER_EMAIL}".`);
  await expect(panel.locator(".user-management-table")).toContainText(USER_EMAIL);
  await expect(page.getByText("Failed to load users")).toHaveCount(0);
});
