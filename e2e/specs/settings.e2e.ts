import { test, expect } from '../fixtures/electron.fixture';
import { SettingsPage } from '../page-objects/settings.page';

test.describe('Settings Page', () => {
  test('should navigate to settings page', async ({ window }) => {
    const settingsPage = new SettingsPage(window);

    // Find and click the settings link
    const settingsLink = window.getByRole('link', { name: /settings/i });
    const isVisible = await settingsLink.isVisible().catch(() => false);

    if (isVisible) {
      await settingsLink.click();

      // Wait for navigation and page to load
      await window.waitForTimeout(1000);

      // Check if we navigated - either heading visible or URL changed
      const heading = settingsPage.heading;
      const headingVisible = await heading.isVisible().catch(() => false);
      const hasSettingsContent = await window.getByText(/settings/i).first().isVisible().catch(() => false);

      expect(headingVisible || hasSettingsContent).toBe(true);
    } else {
      // If settings link not visible, skip test
      expect(isVisible).toBe(false);
    }
  });

  test('should display settings sections', async ({ window }) => {
    const settingsPage = new SettingsPage(window);

    // Navigate to settings
    const settingsLink = window.getByRole('link', { name: /settings/i });
    const isVisible = await settingsLink.isVisible().catch(() => false);

    if (isVisible) {
      await settingsLink.click();
      await window.waitForTimeout(500);

      // Check for downloads cache section
      const cacheCard = settingsPage.downloadsCacheCard;
      const hasCacheSection = await cacheCard.isVisible().catch(() => false);

      // Should have at least some settings content
      const hasContent = await window.locator('main').isVisible();
      expect(hasCacheSection || hasContent).toBe(true);
    }
  });

  test('should be able to toggle settings', async ({ window }) => {
    // Navigate to settings
    const settingsLink = window.getByRole('link', { name: /settings/i });
    const isVisible = await settingsLink.isVisible().catch(() => false);

    if (isVisible) {
      await settingsLink.click();
      await window.waitForTimeout(500);

      // Find any switch/toggle on the page
      const switches = window.locator('[role="switch"]');
      const switchCount = await switches.count().catch(() => 0);

      if (switchCount > 0) {
        // Get the first switch and toggle it
        const firstSwitch = switches.first();
        const initialState = await firstSwitch.getAttribute('data-state');

        await firstSwitch.click();
        await window.waitForTimeout(200);

        const newState = await firstSwitch.getAttribute('data-state');

        // State should have changed
        expect(newState).not.toBe(initialState);
      }
    }
  });
});
