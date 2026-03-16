/**
 * Download Browser Content Preload Script
 *
 * Preload script for the download browser content view.
 * Captures page content on DOMContentLoaded and sends it to the main process
 * for scraping installation instructions from hoster pages (e.g., NexusMods).
 */

import { contextBridge, ipcRenderer } from 'electron';

// Page content interface
interface PageContent {
  url: string;
  html: string;
}

// Expose API for the main process to receive page content
contextBridge.exposeInMainWorld('scraper', {
  /**
   * Send page content to the main process
   * This is exposed but primarily used internally by this preload script
   */
  sendPageContent: (data: PageContent): void => {
    ipcRenderer.send('download-browser:page-content', data);
  },
});

/**
 * Capture and send page content when DOM is ready
 */
function capturePageContent(): void {
  const content: PageContent = {
    url: window.location.href,
    html: document.documentElement.outerHTML,
  };

  ipcRenderer.send('download-browser:page-content', content);
}

// Capture content on initial page load
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', capturePageContent, { once: true });
} else {
  // DOM already loaded (shouldn't normally happen with preload, but handle it)
  capturePageContent();
}

// Also capture on navigation (SPA-style navigations)
// This handles cases where the user navigates within the same window
window.addEventListener('load', () => {
  // Small delay to ensure dynamic content is loaded
  setTimeout(capturePageContent, 500);
});
