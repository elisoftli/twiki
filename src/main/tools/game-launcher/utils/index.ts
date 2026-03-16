/**
 * Game launcher utilities barrel export
 * Re-exports from consolidated steam.utils.ts and modify-launch-options.ts
 */

export {
  getSteamEnvironment,
  parseSteamData,
  modifySteamDataFile,
  killSteam,
  waitForSteamTermination,
  startSteam,
  getSteamInstallPath,
  getMostRecentUserId,
  type SteamConfigValue,
  type SteamEnvironment,
  type ModifySteamDataFileParams,
  type ModifySteamDataFileResult,
} from '../../../utils/steam.utils';

export {
  modifyGameLaunchOptions,
  type ModifyLaunchOptionsParams,
  type ModifyLaunchOptionsResult,
} from './modify-launch-options.utils';
