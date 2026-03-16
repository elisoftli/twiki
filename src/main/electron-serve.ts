import electron, { type BrowserWindow, type ProtocolRequest } from 'electron';
import { Stats } from 'fs';
import { stat } from 'fs/promises';
import path from 'path';

interface BaseElectronServeOptions {
  isCorsEnabled?: boolean;
  scheme?: string;
  hostname?: string;
  file?: string;
  partition?: string;
  directory: string;
}

const FILE_NOT_FOUND = -6;

const getPath = async (filePath: string, fileName?: string): Promise<string | void> => {
  let result: Stats;
  try {
    result = await stat(filePath);
  } catch {
    return;
  }
  if (result.isFile()) {
    return filePath;
  } else if (result.isDirectory() && fileName) {
    return getPath(path.join(filePath, `${fileName}.html`));
  }
};

export default function electronServe(options: BaseElectronServeOptions) {
  options = {
    ...options,
    isCorsEnabled: options.isCorsEnabled ?? true,
    scheme: options.scheme ?? 'app',
    hostname: options.hostname ?? '-',
    file: options.file ?? 'index',
  };

  if (!options.directory) {
    throw new Error('The `directory` option is required');
  }

  options.directory = path.resolve(electron.app.getAppPath(), options.directory);

  const handler = async (request: ProtocolRequest, callback: (response: { path?: string; error?: number }) => void): Promise<void> => {
    const indexPath = path.join(options.directory, `${options.file}.html`);
    const filePath = path.join(options.directory, decodeURIComponent(new URL(request.url).pathname));

    const relativePath = path.relative(options.directory, filePath);
    const isSafe = !relativePath.startsWith('..') && !path.isAbsolute(relativePath);

    if (!isSafe) {
      callback({ error: FILE_NOT_FOUND });
      return;
    }

    const finalPath = await getPath(filePath, options.file);
    const fileExtension = path.extname(filePath);

    if (!finalPath && fileExtension && fileExtension !== '.html' && fileExtension !== '.asar') {
      callback({ error: FILE_NOT_FOUND });
      return;
    }

    callback({
      path: finalPath || indexPath,
    });
  };

  electron.protocol.registerSchemesAsPrivileged([
    {
      scheme: options.scheme!,
      privileges: {
        standard: true,
        secure: true,
        allowServiceWorkers: true,
        supportFetchAPI: true,
        corsEnabled: options.isCorsEnabled,
      },
    },
  ]);

  electron.app.on('ready', () => {
    const session = options.partition
      ? electron.session.fromPartition(options.partition)
      : electron.session.defaultSession;

    session.protocol.registerFileProtocol(options.scheme!, handler);
  });

  return async (window: BrowserWindow, path = '/'): Promise<void> => {
    await window.loadURL(`${options.scheme}://${options.hostname}${path}`);
  };
}
