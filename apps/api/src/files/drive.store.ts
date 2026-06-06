import { existsSync, mkdirSync, renameSync } from 'fs';
import { DatabaseSync } from 'node:sqlite';
import { join } from 'path';
import {
  DriveActivityEvent,
  DriveItem,
  DriveLibrary,
  DriveNotification,
  DriveSession,
  SessionMetadata,
  SharePermission,
  ShareRole,
  UserAccount
} from './drive.types';

type Row = Record<string, unknown>;

/** Converts SQLite integer booleans back into domain booleans. */
function bool(value: unknown): boolean {
  return value === 1 || value === true;
}

/** Reads text defensively so malformed rows do not propagate unknown values. */
function text(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

/** Preserves nullable text columns without inventing empty strings. */
function nullableText(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

/** Converts SQLite numeric values while falling back to zero for missing legacy fields. */
function numberValue(value: unknown): number {
  return typeof value === 'number' ? value : Number(value ?? 0);
}

/** Parses session metadata from JSON and keeps only fields understood by the app. */
function sessionMetadata(value: unknown): SessionMetadata {
  if (typeof value !== 'string') return {};
  try {
    const parsed = JSON.parse(value);
    if (!parsed || typeof parsed !== 'object') return {};
    const metadata = parsed as SessionMetadata;
    return {
      ipAddress: nullableText(metadata.ipAddress),
      userAgent: nullableText(metadata.userAgent),
      browser: nullableText(metadata.browser),
      os: nullableText(metadata.os),
      deviceType: ['desktop', 'mobile', 'tablet', 'unknown'].includes(String(metadata.deviceType))
        ? (metadata.deviceType as SessionMetadata['deviceType'])
        : 'unknown',
      language: nullableText(metadata.language),
      country: nullableText(metadata.country),
      region: nullableText(metadata.region),
      city: nullableText(metadata.city),
      latitude: typeof metadata.latitude === 'number' ? metadata.latitude : null,
      longitude: typeof metadata.longitude === 'number' ? metadata.longitude : null,
      network: nullableText(metadata.network),
      isp: nullableText(metadata.isp),
      wifiSsid: nullableText(metadata.wifiSsid)
    };
  } catch {
    return {};
  }
}

/** Parses JSON arrays used by legacy string-list columns. */
function stringArray(value: unknown): string[] {
  if (typeof value !== 'string') return [];
  try {
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((entry): entry is string => typeof entry === 'string');
  } catch {
    return [];
  }
}

/** Parses role-based share permissions while dropping invalid entries. */
function sharePermissionArray(value: unknown): SharePermission[] {
  if (typeof value !== 'string') return [];
  try {
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((entry): entry is SharePermission => {
        return (
          entry &&
          typeof entry === 'object' &&
          typeof (entry as SharePermission).userId === 'string' &&
          ['reader', 'commenter', 'editor'].includes((entry as SharePermission).role)
        );
      })
      .map((entry) => ({ userId: entry.userId, role: entry.role }));
  } catch {
    return [];
  }
}

/** Parses item activity history and rejects entries without the required event shape. */
function activityArray(value: unknown): DriveActivityEvent[] {
  if (typeof value !== 'string') return [];
  try {
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((entry): entry is DriveActivityEvent => {
      return (
        entry &&
        typeof entry === 'object' &&
        typeof (entry as DriveActivityEvent).id === 'string' &&
        typeof (entry as DriveActivityEvent).type === 'string' &&
        typeof (entry as DriveActivityEvent).actorId === 'string' &&
        typeof (entry as DriveActivityEvent).createdAt === 'string' &&
        typeof (entry as DriveActivityEvent).itemId === 'string' &&
        typeof (entry as DriveActivityEvent).itemName === 'string' &&
        ['file', 'folder'].includes((entry as DriveActivityEvent).itemType)
      );
    });
  } catch {
    return [];
  }
}

/** Normalizes stored share roles and treats unknown values as restricted. */
function shareRole(value: unknown): ShareRole | null {
  return ['reader', 'commenter', 'editor'].includes(text(value)) ? (text(value) as ShareRole) : null;
}

export class DriveStore {
  private readonly db: DatabaseSync;

  /** Opens the SQLite database, migrating the old filename before schema initialization. */
  constructor(private readonly dataDir: string) {
    mkdirSync(this.dataDir, { recursive: true });
    this.migrateDatabaseFilename();
    this.db = new DatabaseSync(join(this.dataDir, 'ride.sqlite'));
    this.initialize();
  }

  /** Reads the active Ride library from the writable database. */
  readLibrary(): DriveLibrary | null {
    return this.readLibraryFromDb(this.db);
  }

  /** Reads a backup database without mutating or locking the active store. */
  readLibraryFrom(path: string): DriveLibrary | null {
    const db = new DatabaseSync(path, { readOnly: true });
    try {
      return this.readLibraryFromDb(db);
    } finally {
      db.close();
    }
  }

  /** Rehydrates normalized domain objects from SQLite tables and settings rows. */
  private readLibraryFromDb(db: DatabaseSync): DriveLibrary | null {
    const users = db
      .prepare('SELECT * FROM users ORDER BY createdAt ASC')
      .all()
      .map((row) => this.userFromRow(row));
    if (!users.length) return null;

    const items = db
      .prepare('SELECT * FROM items ORDER BY createdAt ASC')
      .all()
      .map((row) => this.itemFromRow(row));
    const sessions = db
      .prepare('SELECT * FROM sessions ORDER BY createdAt ASC')
      .all()
      .map((row) => this.sessionFromRow(row));
    const notifications = this.hasTable(db, 'notifications')
      ? db
          .prepare('SELECT * FROM notifications ORDER BY createdAt DESC')
          .all()
          .map((row) => this.notificationFromRow(row))
      : [];
    const trashRetentionDays = Number(this.setting('trashRetentionDays', db) ?? 30);

    return {
      users,
      items,
      sessions,
      notifications,
      trashRetentionDays: Number.isFinite(trashRetentionDays) ? trashRetentionDays : 30,
      backupSchedule: {
        enabled: this.setting('backupScheduleEnabled', db) === 'true',
        intervalHours: Number(this.setting('backupIntervalHours', db) ?? 24),
        retentionCount: Number(this.setting('backupRetentionCount', db) ?? 7),
        directory: this.setting('backupDirectory', db) ?? '',
        targetPaths: stringArray(this.setting('backupTargetPaths', db)),
        lastRunAt: this.setting('backupLastRunAt', db),
        lastStatus: this.backupStatus(this.setting('backupLastStatus', db)),
        lastError: this.setting('backupLastError', db)
      }
    };
  }

  /** Rewrites all domain tables in one transaction so the library snapshot stays consistent. */
  writeLibrary(library: DriveLibrary): void {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      this.db.exec('DELETE FROM notifications; DELETE FROM sessions; DELETE FROM items; DELETE FROM users; DELETE FROM settings;');

      const insertUser = this.db.prepare(
        `INSERT INTO users (
          id, name, email, role, storageQuotaBytes, avatarColor, avatarUrl, passwordHash, createdAt, updatedAt
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      );
      for (const user of library.users) {
        insertUser.run(
          user.id,
          user.name,
          user.email,
          user.role,
          user.storageQuotaBytes,
          user.avatarColor,
          user.avatarUrl ?? null,
          user.passwordHash ?? null,
          user.createdAt,
          user.updatedAt
        );
      }

      const insertItem = this.db.prepare(
        `INSERT INTO items (
          id, ownerId, name, type, parentId, mimeType, extension, storageKey, checksum, size, color,
          description, starred, trashed, spam, sharedToken, linkRole, sharedWith, sharePermissions, createdAt,
          updatedAt, updatedById, openedAt, openedById, deletedAt, activity
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      );
      for (const item of this.itemsInParentOrder(library.items)) {
        insertItem.run(
          item.id,
          item.ownerId,
          item.name,
          item.type,
          item.parentId,
          item.mimeType,
          item.extension,
          item.storageKey,
          item.checksum,
          item.size,
          item.color,
          item.description ?? null,
          item.starred ? 1 : 0,
          item.trashed ? 1 : 0,
          item.spam ? 1 : 0,
          item.sharedToken,
          item.linkRole,
          JSON.stringify(item.sharedWith ?? []),
          JSON.stringify(item.sharePermissions ?? []),
          item.createdAt,
          item.updatedAt,
          item.updatedById ?? null,
          item.openedAt ?? null,
          item.openedById ?? null,
          item.deletedAt,
          JSON.stringify(item.activity ?? [])
        );
      }

      const insertSession = this.db.prepare(
        'INSERT INTO sessions (tokenHash, userId, createdAt, lastSeenAt, expiresAt, metadata) VALUES (?, ?, ?, ?, ?, ?)'
      );
      for (const session of library.sessions) {
        insertSession.run(
          session.tokenHash,
          session.userId,
          session.createdAt,
          session.lastSeenAt ?? session.createdAt,
          session.expiresAt,
          JSON.stringify(session.metadata ?? {})
        );
      }

      const insertNotification = this.db.prepare(
        `INSERT INTO notifications (
          id, userId, type, title, message, itemId, actorId, readAt, createdAt
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      );
      for (const notification of library.notifications ?? []) {
        insertNotification.run(
          notification.id,
          notification.userId,
          notification.type,
          notification.title,
          notification.message,
          notification.itemId ?? null,
          notification.actorId ?? null,
          notification.readAt ?? null,
          notification.createdAt
        );
      }

      this.db
        .prepare('INSERT INTO settings (key, value) VALUES (?, ?)')
        .run('trashRetentionDays', String(library.trashRetentionDays ?? 30));
      const backupSchedule = library.backupSchedule;
      const insertSetting = this.db.prepare('INSERT INTO settings (key, value) VALUES (?, ?)');
      insertSetting.run('backupScheduleEnabled', String(backupSchedule?.enabled ?? false));
      insertSetting.run('backupIntervalHours', String(backupSchedule?.intervalHours ?? 24));
      insertSetting.run('backupRetentionCount', String(backupSchedule?.retentionCount ?? 7));
      insertSetting.run('backupDirectory', backupSchedule?.directory ?? '');
      insertSetting.run('backupTargetPaths', JSON.stringify(backupSchedule?.targetPaths ?? []));
      if (backupSchedule?.lastRunAt) insertSetting.run('backupLastRunAt', backupSchedule.lastRunAt);
      insertSetting.run('backupLastStatus', backupSchedule?.lastStatus ?? 'never');
      if (backupSchedule?.lastError) insertSetting.run('backupLastError', backupSchedule.lastError);
      this.db.exec('COMMIT');
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  }

  /** Closes the database handle during service shutdown. */
  close(): void {
    this.db.close();
  }

  /** Uses SQLite VACUUM INTO to create a consistent database backup file. */
  backupTo(destination: string): void {
    this.db.exec(`VACUUM INTO ${this.sqlString(destination)}`);
  }

  /** Creates the schema and applies additive migrations for existing installations. */
  private initialize(): void {
    this.db.exec(`
      PRAGMA journal_mode = WAL;
      PRAGMA synchronous = NORMAL;
      PRAGMA foreign_keys = ON;
      PRAGMA busy_timeout = 5000;

      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        email TEXT NOT NULL UNIQUE COLLATE NOCASE,
        role TEXT NOT NULL CHECK (role IN ('admin', 'user')),
        storageQuotaBytes INTEGER NOT NULL,
        avatarColor TEXT NOT NULL,
        avatarUrl TEXT,
        passwordHash TEXT,
        createdAt TEXT NOT NULL,
        updatedAt TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS items (
        id TEXT PRIMARY KEY,
        ownerId TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        type TEXT NOT NULL CHECK (type IN ('file', 'folder')),
        parentId TEXT REFERENCES items(id) ON DELETE CASCADE,
        mimeType TEXT,
        extension TEXT,
        storageKey TEXT,
        checksum TEXT,
        size INTEGER NOT NULL DEFAULT 0,
        color TEXT,
        description TEXT,
        starred INTEGER NOT NULL DEFAULT 0,
        trashed INTEGER NOT NULL DEFAULT 0,
        spam INTEGER NOT NULL DEFAULT 0,
        sharedToken TEXT UNIQUE,
        linkRole TEXT,
        sharedWith TEXT NOT NULL DEFAULT '[]',
        sharePermissions TEXT NOT NULL DEFAULT '[]',
        createdAt TEXT NOT NULL,
        updatedAt TEXT NOT NULL,
        updatedById TEXT,
        openedAt TEXT,
        openedById TEXT,
        deletedAt TEXT,
        activity TEXT NOT NULL DEFAULT '[]'
      );

      CREATE TABLE IF NOT EXISTS sessions (
        tokenHash TEXT PRIMARY KEY,
        userId TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        createdAt TEXT NOT NULL,
        lastSeenAt TEXT,
        metadata TEXT NOT NULL DEFAULT '{}',
        expiresAt INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS notifications (
        id TEXT PRIMARY KEY,
        userId TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        type TEXT NOT NULL,
        title TEXT NOT NULL,
        message TEXT NOT NULL,
        itemId TEXT,
        actorId TEXT,
        readAt TEXT,
        createdAt TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_items_owner_parent ON items(ownerId, parentId);
      CREATE INDEX IF NOT EXISTS idx_items_owner_flags ON items(ownerId, trashed, spam, starred);
      CREATE INDEX IF NOT EXISTS idx_items_shared_token ON items(sharedToken);
      CREATE INDEX IF NOT EXISTS idx_items_updated_at ON items(updatedAt);
      CREATE INDEX IF NOT EXISTS idx_items_name ON items(name COLLATE NOCASE);
      CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON sessions(expiresAt);
      CREATE INDEX IF NOT EXISTS idx_notifications_user_created ON notifications(userId, createdAt);
      CREATE INDEX IF NOT EXISTS idx_notifications_user_read ON notifications(userId, readAt);
    `);
    this.addColumnIfMissing('items', 'checksum', 'TEXT');
    this.addColumnIfMissing('items', 'sharePermissions', "TEXT NOT NULL DEFAULT '[]'");
    this.addColumnIfMissing('items', 'linkRole', 'TEXT');
    this.addColumnIfMissing('items', 'description', 'TEXT');
    this.addColumnIfMissing('items', 'activity', "TEXT NOT NULL DEFAULT '[]'");
    this.addColumnIfMissing('items', 'openedAt', 'TEXT');
    this.addColumnIfMissing('items', 'openedById', 'TEXT');
    this.addColumnIfMissing('sessions', 'lastSeenAt', 'TEXT');
    this.addColumnIfMissing('sessions', 'metadata', "TEXT NOT NULL DEFAULT '{}'");
  }

  /** Adds a column only when older local databases do not have it yet. */
  private addColumnIfMissing(table: string, column: string, definition: string): void {
    const columns = this.db.prepare(`PRAGMA table_info(${table})`).all();
    if (columns.some((row) => row.name === column)) return;
    this.db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }

  /** Escapes a string literal for SQLite commands that cannot use parameters. */
  private sqlString(value: string): string {
    return `'${value.replace(/'/g, "''")}'`;
  }

  /** Renames the old drive.sqlite database and sidecars to ride.sqlite on first startup. */
  private migrateDatabaseFilename(): void {
    const current = join(this.dataDir, 'ride.sqlite');
    const legacy = join(this.dataDir, 'drive.sqlite');
    if (existsSync(current) || !existsSync(legacy)) return;
    renameSync(legacy, current);
    for (const suffix of ['-wal', '-shm']) {
      const legacySidecar = `${legacy}${suffix}`;
      if (existsSync(legacySidecar)) renameSync(legacySidecar, `${current}${suffix}`);
    }
  }

  /** Reads one settings value from the key-value settings table. */
  private setting(key: string, db = this.db): string | null {
    const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
    return typeof row?.value === 'string' ? row.value : null;
  }

  /** Checks for optional tables when reading databases created by older versions. */
  private hasTable(db: DatabaseSync, name: string): boolean {
    const row = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?").get(name);
    return Boolean(row);
  }

  /** Normalizes persisted backup status to the current enum. */
  private backupStatus(value: string | null): 'never' | 'ok' | 'error' {
    return value === 'ok' || value === 'error' ? value : 'never';
  }

  /** Writes parents before descendants so self-referential foreign keys remain valid. */
  private itemsInParentOrder(items: DriveItem[]): DriveItem[] {
    const remaining = new Map(items.map((item) => [item.id, item]));
    const ordered: DriveItem[] = [];

    while (remaining.size) {
      const before = remaining.size;
      for (const item of Array.from(remaining.values())) {
        if (!item.parentId || !remaining.has(item.parentId)) {
          ordered.push(item);
          remaining.delete(item.id);
        }
      }

      if (remaining.size === before) {
        ordered.push(...remaining.values());
        break;
      }
    }

    return ordered;
  }

  /** Converts a users table row into the domain account shape. */
  private userFromRow(row: Row): UserAccount {
    return {
      id: text(row.id),
      name: text(row.name),
      email: text(row.email),
      role: text(row.role) === 'admin' ? 'admin' : 'user',
      storageQuotaBytes: numberValue(row.storageQuotaBytes),
      avatarColor: text(row.avatarColor),
      avatarUrl: nullableText(row.avatarUrl),
      passwordHash: nullableText(row.passwordHash) ?? undefined,
      createdAt: text(row.createdAt),
      updatedAt: text(row.updatedAt)
    };
  }

  /** Converts an items table row into the domain file/folder shape. */
  private itemFromRow(row: Row): DriveItem {
    return {
      id: text(row.id),
      ownerId: text(row.ownerId),
      name: text(row.name),
      type: text(row.type) === 'folder' ? 'folder' : 'file',
      parentId: nullableText(row.parentId),
      mimeType: nullableText(row.mimeType),
      extension: nullableText(row.extension),
      storageKey: nullableText(row.storageKey),
      checksum: nullableText(row.checksum),
      size: numberValue(row.size),
      color: nullableText(row.color),
      description: nullableText(row.description),
      starred: bool(row.starred),
      trashed: bool(row.trashed),
      spam: bool(row.spam),
      sharedToken: nullableText(row.sharedToken),
      linkRole: shareRole(row.linkRole),
      sharedWith: stringArray(row.sharedWith),
      sharePermissions: sharePermissionArray(row.sharePermissions),
      createdAt: text(row.createdAt),
      updatedAt: text(row.updatedAt),
      updatedById: nullableText(row.updatedById) ?? undefined,
      openedAt: nullableText(row.openedAt),
      openedById: nullableText(row.openedById),
      deletedAt: nullableText(row.deletedAt),
      activity: activityArray(row.activity)
    };
  }

  /** Converts a sessions table row into the domain session shape. */
  private sessionFromRow(row: Row): DriveSession {
    return {
      tokenHash: text(row.tokenHash),
      userId: text(row.userId),
      createdAt: text(row.createdAt),
      lastSeenAt: nullableText(row.lastSeenAt) ?? text(row.createdAt),
      metadata: sessionMetadata(row.metadata),
      expiresAt: numberValue(row.expiresAt)
    };
  }

  /** Converts a notifications table row while mapping unknown legacy types to share. */
  private notificationFromRow(row: Row): DriveNotification {
    const type = text(row.type);
    return {
      id: text(row.id),
      userId: text(row.userId),
      type: type === 'login' || type === 'backup' ? type : 'share',
      title: text(row.title),
      message: text(row.message),
      itemId: nullableText(row.itemId),
      actorId: nullableText(row.actorId),
      readAt: nullableText(row.readAt),
      createdAt: text(row.createdAt)
    };
  }
}
