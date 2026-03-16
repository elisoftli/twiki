/**
 * Client-side tools for the Mastra agent
 * All tools execute locally on the client machine
 */

// IO Tools
export {
  readFileTool,
  readFileAroundPatternTool,
  listDirectoryContentsTool,
  createFileTool,
  moveCopyFileOrDirectoryTool,
  editFileTool,
  extractArchiveTool,
  createArchiveTool,
  downloadFileTool,
} from './io';

// System Tools
export {
  setProcessAffinityTool,
  setFileAttributesTool,
  readEditRegistryTool,
} from './system';

// Game Launcher Tools
export { modifyGameLaunchOptionsTool } from './game-launcher';

// User Interaction Tools
export { getUserInputTool } from './user-interaction';

// Graphics Mods Tools
export { installReshadeTool } from './graphics-mods';

// Re-export types
export type { BaseToolOutput, ModifyOperation } from './types';

/**
 * All client tools as an object for passing to agent.stream()
 * Keys must match the tool IDs exactly
 */
import * as ioTools from './io';
import * as systemTools from './system';
import * as gameLauncherTools from './game-launcher';
import * as userInteractionTools from './user-interaction';
import * as graphicsModsTools from './graphics-mods';

export const toolRegistry = {
  // IO Tools
  'read-file-tool': ioTools.readFileTool,
  'read-file-around-pattern-tool': ioTools.readFileAroundPatternTool,
  'list-directory-contents-tool': ioTools.listDirectoryContentsTool,
  'create-file-tool': ioTools.createFileTool,
  'move-copy-file-or-directory-tool': ioTools.moveCopyFileOrDirectoryTool,
  'edit-file-tool': ioTools.editFileTool,
  'extract-archive-tool': ioTools.extractArchiveTool,
  'create-archive-tool': ioTools.createArchiveTool,
  'download-file-tool': ioTools.downloadFileTool,
  // System Tools
  'set-process-affinity-tool': systemTools.setProcessAffinityTool,
  'set-file-attributes-tool': systemTools.setFileAttributesTool,
  'read-edit-registry-tool': systemTools.readEditRegistryTool,
  // Game Launcher Tools
  'modify-game-launch-options-tool': gameLauncherTools.modifyGameLaunchOptionsTool,
  // User Interaction Tools
  'get-user-input-tool': userInteractionTools.getUserInputTool,
  // Graphics Mods Tools
  'install-reshade-tool': graphicsModsTools.installReshadeTool,
};
