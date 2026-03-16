export interface UpdaterStatus {
  isCheckingForUpdates: boolean;
  isDownloadingUpdate: boolean;
  isUpdateReadyToInstall: boolean;
  isError: boolean;
  errorMessage: string | null;
  /** Release notes/changelog in markdown format (if available) */
  releaseNotes: string | null;
  /** Version string of the available update */
  updateVersion: string | null;
}
