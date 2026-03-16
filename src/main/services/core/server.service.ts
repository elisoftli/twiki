import { join } from 'path';
import electronServe from '../../electron-serve';
import { BrowserWindow } from 'electron';
import { is } from '@electron-toolkit/utils';

export class ServerService {
  private static server: (window: BrowserWindow, path?: string) => Promise<void>;

  public static async initServer(): Promise<void> {
    if (is.dev) {
      return;
    }
    this.server = electronServe({ directory: join(__dirname, '../renderer') });
  }

  public static async serveWindow(window: BrowserWindow, path = '/'): Promise<void> {
    if (is.dev) {
      // In dev mode, load from the SvelteKit dev server
      const rendererUrl = 'http://localhost:5173';
      window.loadURL(`${rendererUrl}${path}`).catch(() => {
        // Retry if the dev server isn't ready yet
        setTimeout(() => {
          this.serveWindow(window, path);
        }, 200);
      });
      return;
    }
    return this.server(window, path);
  }
}
