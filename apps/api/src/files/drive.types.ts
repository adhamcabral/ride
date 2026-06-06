export type DriveItemType = 'file' | 'folder';
export type AccountRole = 'admin' | 'user';
export type ShareRole = 'reader' | 'commenter' | 'editor';

export interface SharePermission {
  userId: string;
  role: ShareRole;
}

export type DriveActivityType =
  | 'created'
  | 'uploaded'
  | 'copied'
  | 'renamed'
  | 'moved'
  | 'description_changed'
  | 'edited'
  | 'access_changed'
  | 'trashed'
  | 'restored'
  | 'spam_changed'
  | 'starred'
  | 'unstarred'
  | 'color_changed';

export interface DriveActivityEvent {
  id: string;
  type: DriveActivityType;
  actorId: string;
  createdAt: string;
  itemId: string;
  itemName: string;
  itemType: DriveItemType;
  parentId: string | null;
  parentName: string;
  metadata?: Record<string, string | number | boolean | null>;
}

export interface UserAccount {
  id: string;
  name: string;
  email: string;
  role: AccountRole;
  storageQuotaBytes: number;
  avatarColor: string;
  avatarUrl?: string | null;
  passwordHash?: string;
  createdAt: string;
  updatedAt: string;
}

export interface DriveSession {
  tokenHash: string;
  userId: string;
  createdAt: string;
  lastSeenAt?: string;
  expiresAt: number;
  metadata?: SessionMetadata;
}

export type DriveNotificationType = 'share' | 'login' | 'backup';

export interface DriveNotification {
  id: string;
  userId: string;
  type: DriveNotificationType;
  title: string;
  message: string;
  itemId?: string | null;
  actorId?: string | null;
  readAt?: string | null;
  createdAt: string;
}

export interface SessionMetadata {
  ipAddress?: string | null;
  userAgent?: string | null;
  browser?: string | null;
  os?: string | null;
  deviceType?: 'desktop' | 'mobile' | 'tablet' | 'unknown';
  language?: string | null;
  country?: string | null;
  region?: string | null;
  city?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  network?: string | null;
  isp?: string | null;
  wifiSsid?: string | null;
}

export interface SecuritySession {
  id: string;
  userId: string;
  createdAt: string;
  lastSeenAt: string;
  expiresAt: number;
  active: boolean;
  current: boolean;
  ipAddress: string | null;
  userAgent: string | null;
  browser: string;
  os: string;
  deviceType: 'desktop' | 'mobile' | 'tablet' | 'unknown';
  language: string | null;
  country: string | null;
  region: string | null;
  city: string | null;
  latitude: number | null;
  longitude: number | null;
  network: string | null;
  isp: string | null;
  wifiSsid: string | null;
}

export interface SecurityDeviceGroup {
  id: string;
  label: string;
  os: string;
  browser: string;
  deviceType: 'desktop' | 'mobile' | 'tablet' | 'unknown';
  ipAddress: string | null;
  location: string;
  sessions: SecuritySession[];
}

export interface DriveItem {
  id: string;
  ownerId: string;
  name: string;
  type: DriveItemType;
  parentId: string | null;
  mimeType: string | null;
  extension: string | null;
  storageKey: string | null;
  checksum: string | null;
  size: number;
  color: string | null;
  description: string | null;
  starred: boolean;
  trashed: boolean;
  spam: boolean;
  sharedToken: string | null;
  linkRole: ShareRole | null;
  sharedWith: string[];
  sharePermissions: SharePermission[];
  createdAt: string;
  updatedAt: string;
  updatedById?: string;
  openedAt: string | null;
  openedById?: string | null;
  deletedAt: string | null;
  activity: DriveActivityEvent[];
  /** Computed on read for items inside a shared folder — never persisted */
  sharedByAncestor?: boolean;
  /** Computed on read for trashed items — never persisted */
  daysUntilDeletion?: number;
}

export interface DriveLibrary {
  users: UserAccount[];
  items: DriveItem[];
  sessions: DriveSession[];
  notifications?: DriveNotification[];
  trashRetentionDays?: number;
  backupSchedule?: BackupScheduleSettings;
}

export interface StorageSummary {
  userId: string;
  usedBytes: number;
  totalBytes: number;
  fileCount: number;
  folderCount: number;
  categories: Array<{
    id: 'pdfs' | 'sheets' | 'docs' | 'archives' | 'images' | 'videos' | 'trash' | 'other';
    label: string;
    bytes: number;
    count: number;
  }>;
}

export interface AdminStats {
  users: number;
  admins: number;
  files: number;
  folders: number;
  sharedItems: number;
  trashedItems: number;
  spamItems: number;
  atRiskItems?: number;
  activeSessions?: number;
  accountsWithoutPassword?: number;
  usedBytes: number;
  quotaBytes: number;
  jobs: Array<{
    id: string;
    name: string;
    status: 'healthy' | 'idle' | 'warning';
    queued: number;
    completed: number;
  }>;
}

export interface StorageAuditReport {
  checkedFiles: number;
  missingObjects: Array<{ itemId: string; name: string; storageKey: string }>;
  orphanObjects: string[];
  checksumMismatches: Array<{ itemId: string; name: string; expected: string | null; actual: string }>;
  sizeMismatches: Array<{ itemId: string; name: string; expected: number; actual: number }>;
  repairedChecksums: number;
  repairedSizes: number;
  removedOrphans: number;
}

export interface MaintenanceArtifact {
  id: string;
  path: string;
  bytes: number;
  createdAt: string;
}

export interface MaintenanceOverview {
  backupDirectory: string;
  backups: MaintenanceArtifact[];
}

export interface ServerDirectoryEntry {
  name: string;
  path: string;
}

export interface ServerDirectoryListing {
  path: string;
  parentPath: string | null;
  directories: ServerDirectoryEntry[];
}

export interface BackupScheduleSettings {
  enabled: boolean;
  intervalHours: number;
  retentionCount: number;
  directory: string;
  targetPaths: string[];
  lastRunAt: string | null;
  lastStatus: 'never' | 'ok' | 'error';
  lastError: string | null;
}
