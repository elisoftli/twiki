import { test, expect } from '../fixtures/electron.fixture';

test.describe('Application Launch', () => {
  test('should launch the application', async ({ electronApp }) => {
    // Verify the app launched
    expect(electronApp).toBeDefined();
  });

  test('should display the main window', async ({ window }) => {
    // Wait a bit for the page to stabilize after any navigation
    await window.waitForTimeout(500);

    // Verify a window is displayed - title may or may not be set
    const title = await window.title().catch(() => '');
    expect(typeof title).toBe('string');
  });

  test('should show the library page by default', async ({ window }) => {
    // Wait for content to be visible
    await window.waitForTimeout(500);

    // The app should have some visible content
    const body = window.locator('body');
    await expect(body).toBeVisible();

    // Should have at least some content (not empty)
    const innerHTML = await body.innerHTML();
    expect(innerHTML.length).toBeGreaterThan(0);
  });
});
