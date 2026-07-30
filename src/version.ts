// System Version & Release Tracker
export const CURRENT_APP_VERSION = "v2.8.5";
export const LAST_SYSTEM_BUILD_DATE = "2026-07-28";
export const TOTAL_FEATURE_UPDATES_COUNT = 29;

/**
 * Returns the effective application version string.
 * Automatically synced with system build releases.
 */
export function getAppVersion(_customVersion?: string): string {
  return CURRENT_APP_VERSION;
}

