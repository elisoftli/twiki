import type { Page } from '@playwright/test';

export class SettingsPage {
  constructor(private page: Page) {}

  // Locators
  get heading() {
    return this.page.getByRole('heading', { name: /settings/i });
  }

  get autoApproveSwitch() {
    return this.page.locator('[data-testid="auto-approve-switch"]');
  }

  get builtInEditorSwitch() {
    return this.page.locator('[data-testid="built-in-editor-switch"]');
  }

  get autoExpandTweaksSwitch() {
    return this.page.locator('[data-testid="auto-expand-tweaks-switch"]');
  }

  get downloadsCacheCard() {
    return this.page.getByText(/downloads cache/i);
  }

  get clearCacheButton() {
    return this.page.getByRole('button', { name: /clear/i });
  }

  // Navigation
  async navigate() {
    // Click settings link in sidebar
    await this.page.getByRole('link', { name: /settings/i }).click();
    await this.heading.waitFor({ state: 'visible' });
  }

  // Actions
  async toggleAutoApprove() {
    await this.autoApproveSwitch.click();
  }

  async toggleBuiltInEditor() {
    await this.builtInEditorSwitch.click();
  }

  async clearCache() {
    await this.clearCacheButton.click();
  }
}
