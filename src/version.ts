// System Version & Release Tracker
export const CURRENT_APP_VERSION = "v2.8.4";
export const LAST_SYSTEM_BUILD_DATE = "2026-07-28";
export const TOTAL_FEATURE_UPDATES_COUNT = 28;

/**
 * Returns the effective application version string.
 * Automatically defaults to the dynamic system build version (v2.8.4)
 * if businessSettings is not specified or left as initial default (v1.0.0).
 */
export function getAppVersion(customVersion?: string): string {
  if (!customVersion || customVersion === 'v1.0.0') {
    return CURRENT_APP_VERSION;
  }
  return customVersion;
}
