import {
  test as base,
  _electron as electron,
  type ElectronApplication,
  type Page,
} from '@playwright/test';
import path from 'path';

type ElectronFixtures = {
  electronApp: ElectronApplication;
  window: Page;
};

export const test = base.extend<ElectronFixtures>({
  electronApp: async ({}, use) => {
    // Launch Electron app from the built output
    const electronApp = await electron.launch({
      args: [path.join(__dirname, '../../out/main/index.js')],
      env: {
        ...process.env,
        NODE_ENV: 'test',
      },
    });

    await use(electronApp);
    await electronApp.close();
  },

  window: async ({ electronApp }, use) => {
    // Wait for the main window to be ready
    const window = await electronApp.firstWindow();

    // Wait for the page to fully load (including any initial navigation)
    await window.waitForLoadState('load');

    // Give the app time to initialize and complete any startup navigation
    await window.waitForTimeout(2000);

    // Wait for any additional navigation to complete
    await window.waitForLoadState('networkidle').catch(() => {
      // Ignore timeout - some pages don't reach network idle
    });

    await use(window);
  },
});

export { expect } from '@playwright/test';
