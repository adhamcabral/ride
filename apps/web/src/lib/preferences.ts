export type DriveDensity = 'low' | 'medium' | 'high';
export type DriveStartPage = 'personal' | 'drive';
export type DrivePdfOpening = 'preview' | 'tab';

export type DrivePreferences = {
  density: DriveDensity;
  startPage: DriveStartPage;
  pdfOpening: DrivePdfOpening;
  showQuickAccess: boolean;
  showActivity: boolean;
  emailNotifications: boolean;
  browserNotifications: boolean;
  officePreview: boolean;
  usageReports: boolean;
};

export const defaultDrivePreferences: DrivePreferences = {
  density: 'low',
  startPage: 'personal',
  pdfOpening: 'preview',
  showQuickAccess: true,
  showActivity: true,
  emailNotifications: false,
  browserNotifications: false,
  officePreview: true,
  usageReports: false
};

const legacyPreferenceKey = 'ride:preferences';

export function drivePreferenceStorageKey(accountId = '') {
  return `ride:preferences:${accountId || 'default'}`;
}

export function normalizeDensity(value: unknown): DriveDensity {
  if (value === 'low' || value === 'medium' || value === 'high') return value;
  if (value === 'compact') return 'high';
  if (value === 'spacious') return 'low';
  return defaultDrivePreferences.density;
}

export function normalizeStartPage(value: unknown): DriveStartPage {
  if (value === 'personal' || value === 'drive') return value;
  if (value === 'home') return 'drive';
  return defaultDrivePreferences.startPage;
}

export function normalizePdfOpening(value: unknown): DrivePdfOpening {
  return value === 'tab' ? 'tab' : 'preview';
}

function storageForSession() {
  if (typeof sessionStorage === 'undefined') return null;
  return sessionStorage;
}

function readRawPreferences(accountId = '') {
  const storage = storageForSession();
  if (!storage) return null;
  return (
    storage.getItem(drivePreferenceStorageKey(accountId)) ??
    (typeof localStorage === 'undefined' ? null : localStorage.getItem(legacyPreferenceKey))
  );
}

export function readDrivePreferences(accountId = ''): DrivePreferences {
  const raw = readRawPreferences(accountId);
  if (!raw) return { ...defaultDrivePreferences };

  try {
    const stored = JSON.parse(raw) as Partial<Record<keyof DrivePreferences, unknown>>;
    return {
      density: normalizeDensity(stored.density),
      startPage: normalizeStartPage(stored.startPage),
      pdfOpening: normalizePdfOpening(stored.pdfOpening),
      showQuickAccess:
        typeof stored.showQuickAccess === 'boolean'
          ? stored.showQuickAccess
          : defaultDrivePreferences.showQuickAccess,
      showActivity:
        typeof stored.showActivity === 'boolean' ? stored.showActivity : defaultDrivePreferences.showActivity,
      emailNotifications:
        typeof stored.emailNotifications === 'boolean'
          ? stored.emailNotifications
          : defaultDrivePreferences.emailNotifications,
      browserNotifications:
        typeof stored.browserNotifications === 'boolean'
          ? stored.browserNotifications
          : defaultDrivePreferences.browserNotifications,
      officePreview:
        typeof stored.officePreview === 'boolean' ? stored.officePreview : defaultDrivePreferences.officePreview,
      usageReports:
        typeof stored.usageReports === 'boolean' ? stored.usageReports : defaultDrivePreferences.usageReports
    };
  } catch {
    return { ...defaultDrivePreferences };
  }
}

export function writeDrivePreferences(accountId: string, preferences: DrivePreferences) {
  const storage = storageForSession();
  if (!storage) return;
  storage.setItem(drivePreferenceStorageKey(accountId), JSON.stringify(preferences));
}
