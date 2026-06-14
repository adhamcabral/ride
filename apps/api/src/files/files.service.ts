import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
  OnModuleDestroy,
  UnauthorizedException
} from '@nestjs/common';
import { execFile } from 'child_process';
import { createHash, createHmac, randomBytes, randomUUID, scryptSync, timingSafeEqual } from 'crypto';
import type { Express } from 'express';
import type {} from 'multer';
import { createReadStream, existsSync } from 'fs';
import { copyFile, link, mkdir, mkdtemp, readFile, readdir, rename, rm, stat, statfs, writeFile } from 'fs/promises';
import { lookup } from 'mime-types';
import { basename, dirname, extname, join, resolve } from 'path';
import { promisify } from 'util';
import { inflateRawSync } from 'zlib';
import {
  AdminStats,
  BackupScheduleSettings,
  DriveActivityEvent,
  DriveActivityType,
  DriveItem,
  DriveLibrary,
  DriveNotification,
  MaintenanceArtifact,
  MaintenanceOverview,
  SecurityDeviceGroup,
  ServerDirectoryListing,
  SessionMetadata,
  SharePermission,
  ShareRole,
  StorageAuditReport,
  StorageSummary,
  UserAccount
} from './drive.types';
import { DriveStore } from './drive.store';
import {
  AdminSetPasswordDto,
  CopyItemDto,
  CreateAccountDto,
  CreateFolderDto,
  ListFilesQueryDto,
  LoginDto,
  SaveBinaryContentDto,
  SaveTextContentDto,
  ShareItemAccessDto,
  FileAccessTicketDto,
  StorageAuditDto,
  SetupAccountDto,
  UpdateAccountDto,
  UpdateItemDto,
  UpdateProfileDto,
  UpdateSettingsDto
} from './dto';

/** Creates a salted password hash without storing recoverable credentials. */
function hashPassword(password: string): string {
  const salt = randomBytes(16).toString('hex');
  const key = scryptSync(password, salt, 64) as Buffer;
  return `${salt}:${key.toString('hex')}`;
}

/** Verifies a password against the stored salt:hash pair and fails closed on malformed data. */
function verifyPassword(password: string, stored: string): boolean {
  try {
    const [salt, hash] = stored.split(':');
    const key = scryptSync(password, salt, 64) as Buffer;
    return timingSafeEqual(Buffer.from(hash, 'hex'), key);
  } catch {
    return false;
  }
}

/** Stores session tokens as hashes so the database never contains bearer tokens directly. */
function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/** Encodes signed ticket payloads in a URL-safe format before HMAC signing. */
function base64UrlJson(value: unknown): string {
  return Buffer.from(JSON.stringify(value), 'utf8').toString('base64url');
}

/** Decodes ticket payloads defensively; invalid input is treated as an authentication miss. */
function jsonFromBase64Url<T>(value: string): T | null {
  try {
    return JSON.parse(Buffer.from(value, 'base64url').toString('utf8')) as T;
  } catch {
    return null;
  }
}

/** Scores common UTF-8/Latin-1 corruption patterns so filenames can be repaired safely. */
function mojibakeScore(value: string): number {
  const pairedLatin1Artifacts = value.match(/[ÃÂ][\u0080-\u00ff]/g)?.length ?? 0;
  const windowsArtifacts = value.match(/â[\u0080-\u00ff]{1,2}/g)?.length ?? 0;
  const replacementChars = value.match(/\uFFFD/g)?.length ?? 0;
  const looseArtifacts = value.match(/[ÃÂâ]/g)?.length ?? 0;
  return pairedLatin1Artifacts * 4 + windowsArtifacts * 4 + replacementChars * 10 + looseArtifacts;
}

/** Repairs the most common double-encoded names without repeatedly mutating valid Unicode. */
function repairMojibake(value: string): string {
  let current = value;

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const candidate = Buffer.from(current, 'latin1').toString('utf8');
    if (candidate.includes('\uFFFD')) break;
    if (mojibakeScore(candidate) >= mojibakeScore(current)) break;
    current = candidate;
  }

  return current.normalize('NFC');
}

/** Normalizes names shown to users while preserving meaningful Unicode characters. */
function sanitizeDisplayName(value: string): string {
  return repairMojibake(value).trim() || 'Sem nome';
}

/** Converts uploaded names into safe single-path filenames without losing the readable label. */
function sanitizeUploadedFilename(value: string): string {
  return basename(sanitizeDisplayName(value)).replace(/[\\/:*?"<>|]/g, '-').trim() || 'arquivo';
}

const DEFAULT_ADMIN_ID = 'admin';
const DEFAULT_QUOTA_BYTES = 15 * 1024 * 1024 * 1024;
const DEFAULT_TRASH_RETENTION_DAYS = 30;
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const FILE_ACCESS_TICKET_TTL_MS = 5 * 60 * 1000;
const OFFICE_ACCESS_TICKET_TTL_MS = 12 * 60 * 60 * 1000;
const GB = 1024 * 1024 * 1024;
const DEFAULT_MIN_FREE_BYTES = 512 * 1024 * 1024;
const DEFAULT_OFFICE_CALLBACK_MAX_BYTES = 256 * 1024 * 1024;
const MAX_SEARCH_TEXT_FILE_BYTES = 16 * 1024 * 1024;
const MAX_SEARCH_OFFICE_FILE_BYTES = 64 * 1024 * 1024;
const MAX_SEARCH_EXTRACTED_TEXT = 8 * 1024 * 1024;
const MAX_DESCRIPTION_LENGTH = 25000;
const MAX_ACTIVITY_EVENTS_PER_ITEM = 80;
const MAX_NOTIFICATIONS_PER_USER = 200;
const MAX_ACTIVITY_TEXT_LENGTH = 180;
const DEFAULT_PDF_RENDER_DPI = 120;
const DEFAULT_PDF_RENDER_MAX_BUFFER_MB = 64;
const DEFAULT_BACKUP_INTERVAL_HOURS = 24;
const DEFAULT_BACKUP_RETENTION_COUNT = 7;
const BACKUP_SCHEDULER_INTERVAL_MS = 60 * 1000;
const execFileAsync = promisify(execFile);
type SafeUserAccount = Omit<UserAccount, 'passwordHash'>;
type StorageCategoryId = StorageSummary['categories'][number]['id'];
type SettingsResponse = {
  trashRetentionDays: number;
  backupSchedule: BackupScheduleSettings;
};
type AccountDeletionResult = { ok: true; setupRequired: boolean; deletedAccountId?: string };
type BackupArchiveCompression = 'xz' | 'gzip';
type FileAccessScope = FileAccessTicketDto['scope'] | 'office-download' | 'office-callback';
type FileAccessTicketPayload = {
  v: 1;
  sub: string;
  item: string;
  scope: FileAccessScope;
  exp: number;
  nonce: string;
};
type BackupArchiveManifest = {
  format: 'ride-full-backup' | 'newdrive-full-backup';
  version: 1;
  id: string;
  kind: 'manual' | 'auto';
  createdAt: string;
  database: 'ride.sqlite' | 'drive.sqlite';
  objectDirectory: 'objects';
  userCount: number;
  itemCount: number;
  sessionCount: number;
  objects: Array<{ storageKey: string; bytes: number; sha256?: string | null }>;
};
type OfficeDocumentType = 'word' | 'cell' | 'slide';
type OfficeMode = 'view' | 'edit';
type OfficeEditorConfigResponse = {
  enabled: boolean;
  documentServerUrl: string | null;
  reason?: string;
  config?: Record<string, unknown>;
};

const STORAGE_CATEGORIES: Array<{ id: StorageCategoryId; label: string }> = [
  { id: 'pdfs', label: 'PDFs' },
  { id: 'sheets', label: 'Planilhas' },
  { id: 'docs', label: 'Docs/Txts' },
  { id: 'archives', label: 'Zips' },
  { id: 'images', label: 'Imagens' },
  { id: 'videos', label: 'Vídeos' },
  { id: 'trash', label: 'Lixeira' },
  { id: 'other', label: 'Outros' }
];

@Injectable()
export class FilesService implements OnModuleDestroy {
  private readonly dataDir: string;
  private readonly filesDir: string;
  private readonly tempDir: string;
  private readonly backupsDir: string;
  private readonly legacyBackupsDir: string;
  private readonly pdfCacheDir: string;
  private readonly metadataPath: string;
  private readonly store: DriveStore;
  private mutationQueue = Promise.resolve();
  private readonly pdfToolChecks = new Map<string, Promise<void>>();
  private readonly pdfPageRenders = new Map<string, Promise<Buffer>>();
  private backupScheduler: NodeJS.Timeout | null = null;

  /** Resolves all storage paths from the API working directory and starts maintenance timers. */
  constructor() {
    this.dataDir = join(process.cwd(), process.env.STORAGE_DIR ?? 'data');
    this.filesDir = join(this.dataDir, 'objects');
    this.tempDir = join(this.dataDir, 'tmp');
    this.legacyBackupsDir = join(this.dataDir, 'backups');
    this.backupsDir = resolve(
      process.env.RIDE_BACKUP_CONTAINER_DIR?.trim() ||
        (existsSync('/backups') ? '/backups' : process.env.RIDE_BACKUP_DIR?.trim()) ||
        this.legacyBackupsDir
    );
    this.pdfCacheDir = join(this.dataDir, 'pdf-cache');
    this.metadataPath = join(this.dataDir, 'metadata.json');
    this.store = new DriveStore(this.dataDir);
    this.startBackupScheduler();
  }

  /** Stops background work and closes SQLite cleanly when Nest shuts the module down. */
  onModuleDestroy(): void {
    if (this.backupScheduler) clearInterval(this.backupScheduler);
    this.store.close();
  }

  /** Prefer stored MIME metadata, but fall back to extension lookup for old or generic uploads. */
  private resolveMimeType(fileName: string, mimeType?: string | null): string {
    const stored = mimeType?.trim();
    if (stored && stored !== 'application/octet-stream') return stored;
    return lookup(fileName) || stored || 'application/octet-stream';
  }

  // ── Auth ─────────────────────────────────────────────────────────────────

  /** Authenticates a user, records the session metadata, and notifies admins about the login. */
  async login(dto: LoginDto, metadata: SessionMetadata = {}): Promise<{ token: string; user: SafeUserAccount }> {
    return this.withMutation(async () => {
      const library = await this.readLibrary();
      const user = library.users.find((u) => u.email.toLowerCase() === dto.email.trim().toLowerCase());
      if (!user) throw new UnauthorizedException('Credenciais inválidas.');
      if (!user.passwordHash)
        throw new UnauthorizedException('Senha não configurada. Peça ao administrador para definir sua senha.');
      if (!verifyPassword(dto.password, user.passwordHash))
        throw new UnauthorizedException('Credenciais inválidas.');

      const token = this.createSession(library, user.id, metadata);
      this.notifyAdmins(library, {
        type: 'login',
        title: 'Novo login no Ride',
        message: `${this.userDisplayName(user)} entrou no Ride.`,
        actorId: user.id
      });
      await this.writeLibrary(library);
      return { token, user: this.safeUser(user) };
    });
  }

  /** Reports whether the project still needs the first administrator account. */
  async setupStatus(): Promise<{ setupRequired: boolean }> {
    const library = await this.readLibrary();
    return { setupRequired: !library.users.some((user) => user.role === 'admin') };
  }

  /** Returns safe account display data for the login screen without revealing whether passwords exist. */
  async lookupLoginAccount(email: string): Promise<Pick<SafeUserAccount, 'name' | 'email' | 'avatarColor' | 'avatarUrl'> | null> {
    const library = await this.readLibrary();
    const user = library.users.find((current) => current.email.toLowerCase() === email.trim().toLowerCase());
    if (!user) return null;
    const safe = this.safeUser(user);
    return {
      name: safe.name,
      email: safe.email,
      avatarColor: safe.avatarColor,
      avatarUrl: safe.avatarUrl
    };
  }

  /** Creates the first admin account only while the installation has no administrator. */
  async setupFirstAccount(
    dto: SetupAccountDto,
    metadata: SessionMetadata = {}
  ): Promise<{ token: string; user: SafeUserAccount }> {
    return this.withMutation(async () => {
      const library = await this.readLibrary();
      const hasAdmin = library.users.some((user) => user.role === 'admin');
      if (hasAdmin) throw new BadRequestException('O Ride já possui uma conta inicial.');
      if (library.users.length > 0) {
        throw new BadRequestException('Existem contas sem administrador. Faça um backup e corrija o banco manualmente.');
      }

      const now = new Date().toISOString();
      const user: UserAccount = {
        id: randomUUID(),
        name: dto.name.trim(),
        email: dto.email.trim().toLowerCase(),
        role: 'admin',
        storageQuotaBytes: DEFAULT_QUOTA_BYTES,
        avatarColor: this.pickAvatarColor(0),
        avatarUrl: null,
        passwordHash: hashPassword(dto.password),
        createdAt: now,
        updatedAt: now
      };

      library.users.push(user);
      await this.writeLibrary(library);

      const token = this.createSession(library, user.id, metadata);
      await this.writeLibrary(library);
      return { token, user: this.safeUser(user) };
    });
  }

  /** Revokes the current bearer token without touching other active sessions. */
  async logout(token: string): Promise<void> {
    await this.withMutation(async () => {
      const library = await this.readLibrary();
      const tokenHash = hashToken(token);
      library.sessions = library.sessions.filter((session) => session.tokenHash !== tokenHash);
      await this.writeLibrary(library);
    });
  }

  /** Validates a session token, refreshes its last-seen timestamp, and expires stale sessions. */
  async validateSession(token: string): Promise<string | null> {
    return this.withMutation(async () => {
      const library = await this.readLibrary();
      const tokenHash = hashToken(token);
      const now = Date.now();
      const before = library.sessions.length;
      library.sessions = library.sessions.filter(
        (session) => session.expiresAt > now && library.users.some((user) => user.id === session.userId)
      );
      const session = library.sessions.find((current) => current.tokenHash === tokenHash);
      let shouldWrite = library.sessions.length !== before;
      if (session) {
        const lastSeenMs = Date.parse(session.lastSeenAt ?? session.createdAt);
        if (Number.isNaN(lastSeenMs) || now - lastSeenMs > 60_000) {
          session.lastSeenAt = new Date(now).toISOString();
          shouldWrite = true;
        }
      }
      if (shouldWrite) await this.writeLibrary(library);
      if (!session) return null;
      return session.userId;
    });
  }

  /** Groups active and expired sessions into device buckets for the security settings screen. */
  async listSecuritySessions(userId: string, token: string): Promise<SecurityDeviceGroup[]> {
    const library = await this.readLibrary();
    this.findUser(library, userId);
    const currentTokenHash = token ? hashToken(token) : '';
    const now = Date.now();
    const sessions = library.sessions
      .filter((session) => session.userId === userId)
      .sort((a, b) => (b.lastSeenAt ?? b.createdAt).localeCompare(a.lastSeenAt ?? a.createdAt));

    const groups = new Map<string, SecurityDeviceGroup>();
    for (const session of sessions) {
      const metadata = this.normalizeSessionMetadata(session.metadata);
      const browser = metadata.browser || 'Navegador desconhecido';
      const os = metadata.os || 'Dispositivo desconhecido';
      const deviceType = metadata.deviceType || 'unknown';
      const ipAddress = metadata.ipAddress || null;
      const groupKey = `${deviceType}|${os}|${browser}|${ipAddress ?? ''}|${metadata.userAgent ?? ''}`;
      const location = [metadata.city, metadata.region, metadata.country].filter(Boolean).join(', ') || 'Localização indisponível';
      const entry = {
        id: session.tokenHash,
        userId: session.userId,
        createdAt: session.createdAt,
        lastSeenAt: session.lastSeenAt ?? session.createdAt,
        expiresAt: session.expiresAt,
        active: session.expiresAt > now,
        current: session.tokenHash === currentTokenHash,
        ipAddress,
        userAgent: metadata.userAgent || null,
        browser,
        os,
        deviceType,
        language: metadata.language || null,
        country: metadata.country || null,
        region: metadata.region || null,
        city: metadata.city || null,
        latitude: metadata.latitude ?? null,
        longitude: metadata.longitude ?? null,
        network: metadata.network || null,
        isp: metadata.isp || null,
        wifiSsid: metadata.wifiSsid || null
      };

      const existing = groups.get(groupKey);
      if (existing) {
        existing.sessions.push(entry);
        continue;
      }
      groups.set(groupKey, {
        id: groupKey,
        label: this.deviceGroupLabel(deviceType, os),
        os,
        browser,
        deviceType,
        ipAddress,
        location,
        sessions: [entry]
      });
    }

    return Array.from(groups.values()).sort(
      (a, b) => (b.sessions[0]?.lastSeenAt ?? '').localeCompare(a.sessions[0]?.lastSeenAt ?? '')
    );
  }

  /** Lets a user revoke one of their own sessions or lets admins revoke any session. */
  async revokeSecuritySession(userId: string, sessionId: string): Promise<{ ok: true }> {
    return this.withMutation(async () => {
      const library = await this.readLibrary();
      this.findUser(library, userId);
      const before = library.sessions.length;
      library.sessions = library.sessions.filter(
        (session) => !(session.userId === userId && session.tokenHash === sessionId)
      );
      if (library.sessions.length === before) throw new NotFoundException('Sessão não encontrada.');
      await this.writeLibrary(library);
      return { ok: true };
    });
  }

  /** Returns the authenticated account with sensitive fields removed. */
  async getMe(userId: string): Promise<SafeUserAccount> {
    const library = await this.readLibrary();
    const user = this.findUser(library, userId);
    return this.safeUser(user);
  }

  /** Updates profile fields while keeping avatar data and display names normalized. */
  async updateProfile(userId: string, dto: UpdateProfileDto): Promise<SafeUserAccount> {
    return this.withMutation(async () => {
      const library = await this.readLibrary();
      const user = this.findUser(library, userId);

      if (dto.name) user.name = dto.name.trim();
      if (dto.avatarColor) user.avatarColor = dto.avatarColor;
      if (dto.avatarUrl !== undefined) user.avatarUrl = dto.avatarUrl || null;

      if (dto.email) {
        const taken = library.users.some(
          (u) => u.id !== userId && u.email.toLowerCase() === dto.email!.trim().toLowerCase()
        );
        if (taken) throw new BadRequestException('Este e-mail já está em uso.');
        user.email = dto.email.trim().toLowerCase();
      }

      if (dto.newPassword) {
        if (user.passwordHash) {
          if (!dto.currentPassword)
            throw new BadRequestException('Senha atual obrigatória para alterar a senha.');
          if (!verifyPassword(dto.currentPassword, user.passwordHash))
            throw new BadRequestException('Senha atual incorreta.');
        }
        user.passwordHash = hashPassword(dto.newPassword);
      }

      user.updatedAt = new Date().toISOString();
      await this.writeLibrary(library);
      return this.safeUser(user);
    });
  }

  /** Deletes the current account after password confirmation and resets setup if it was the last admin. */
  async deleteAccount(userId: string, password: string): Promise<AccountDeletionResult> {
    return this.withMutation(async () => {
      const library = await this.readLibrary();
      const user = this.findUser(library, userId);
      if (!user.passwordHash || !verifyPassword(password, user.passwordHash)) {
        throw new UnauthorizedException('Senha incorreta.');
      }

      await this.removeUserFromLibrary(library, userId);
      if (!library.users.length) {
        await this.resetProjectData(library);
        await this.writeLibrary(library);
        return { ok: true, setupRequired: true, deletedAccountId: userId };
      }
      await this.writeLibrary(library);
      return { ok: true, setupRequired: false, deletedAccountId: userId };
    });
  }

  /** Allows admins to set or reset another account's password without exposing the previous hash. */
  async adminSetPassword(
    requesterId: string,
    targetId: string,
    dto: AdminSetPasswordDto
  ): Promise<{ ok: true }> {
    return this.withMutation(async () => {
      const library = await this.readLibrary();
      this.assertAdmin(library, requesterId);
      const user = this.findUser(library, targetId);
      user.passwordHash = hashPassword(dto.password);
      user.updatedAt = new Date().toISOString();
      await this.writeLibrary(library);
      return { ok: true };
    });
  }

  // ── Settings ─────────────────────────────────────────────────────────────

  /** Loads admin-controlled retention and backup settings. */
  async getSettings(requesterId: string): Promise<SettingsResponse> {
    const library = await this.readLibrary();
    this.assertAdmin(library, requesterId);
    return this.settingsResponse(library);
  }

  /** Saves admin settings with bounds checks before pruning old backup artifacts. */
  async updateSettings(requesterId: string, dto: UpdateSettingsDto): Promise<SettingsResponse> {
    return this.withMutation(async () => {
      const library = await this.readLibrary();
      this.assertAdmin(library, requesterId);
      if (dto.trashRetentionDays !== undefined)
        library.trashRetentionDays = Math.max(1, dto.trashRetentionDays);
      const currentSchedule = this.normalizeBackupSchedule(library.backupSchedule);
      library.backupSchedule = {
        ...currentSchedule,
        enabled: dto.backupScheduleEnabled !== undefined ? dto.backupScheduleEnabled : currentSchedule.enabled,
        intervalHours:
          dto.backupIntervalHours !== undefined
            ? Math.max(1, Math.min(24 * 30, dto.backupIntervalHours))
            : currentSchedule.intervalHours,
        retentionCount:
          dto.backupRetentionCount !== undefined
            ? Math.max(1, Math.min(365, dto.backupRetentionCount))
            : currentSchedule.retentionCount,
        directory:
          dto.backupDirectory !== undefined
            ? this.normalizeBackupDirectory(dto.backupDirectory)
            : currentSchedule.directory,
        targetPaths:
          dto.backupTargetPaths !== undefined
            ? this.normalizeBackupTargetPaths(
                dto.backupTargetPaths,
                dto.backupDirectory !== undefined
                  ? this.normalizeBackupDirectory(dto.backupDirectory)
                  : currentSchedule.directory
              )
            : currentSchedule.targetPaths
      };
      await this.writeLibrary(library);
      await this.pruneBackups(library.backupSchedule.retentionCount, library.backupSchedule);
      return this.settingsResponse(library);
    });
  }

  /** Lists every account for admin views without password hashes. */
  async accounts(requesterId: string): Promise<SafeUserAccount[]> {
    const library = await this.readLibrary();
    this.findUser(library, requesterId);
    return library.users.sort((a, b) => a.name.localeCompare(b.name)).map((user) => this.safeUser(user));
  }

  /** Promotes a user only when recovery is safe because no admin account exists. */
  async promoteAdminRecovery(email: string): Promise<SafeUserAccount> {
    return this.withMutation(async () => {
      const library = await this.readLibrary();
      if (library.users.some((user) => user.role === 'admin')) {
        throw new BadRequestException('Já existe uma conta administradora.');
      }
      const normalizedEmail = email.trim().toLowerCase();
      const user = library.users.find((current) => current.email.toLowerCase() === normalizedEmail);
      if (!user) throw new NotFoundException('Conta não encontrada.');
      user.role = 'admin';
      user.updatedAt = new Date().toISOString();
      await this.writeLibrary(library);
      return this.safeUser(user);
    });
  }

  /** Builds the admin dashboard numbers from active files, quotas, risks, and background jobs. */
  async adminStats(requesterId: string): Promise<AdminStats> {
    const library = await this.readLibrary();
    this.assertAdmin(library, requesterId);
    const activeItems = library.items.filter((item) => !item.trashed && !item.spam);
    const storedFiles = library.items.filter((item) => item.type === 'file');
    const usedBytes = this.sumFileSizes(storedFiles);
    const quotaBytes = library.users.reduce((total, user) => total + user.storageQuotaBytes, 0);
    const activeSessions = library.sessions.filter(
      (session) =>
        session.expiresAt > Date.now() && library.users.some((user) => user.id === session.userId)
    ).length;
    const trashedOrSpamIds = new Set(
      library.items.filter((item) => item.trashed || item.spam).map((item) => item.id)
    );

    return {
      users: library.users.length,
      admins: library.users.filter((user) => user.role === 'admin').length,
      files: activeItems.filter((item) => item.type === 'file').length,
      folders: activeItems.filter((item) => item.type === 'folder').length,
      sharedItems: activeItems.filter((item) => item.linkRole || item.sharedWith.length > 0).length,
      trashedItems: library.items.filter((item) => item.trashed).length,
      spamItems: library.items.filter((item) => item.spam).length,
      atRiskItems: trashedOrSpamIds.size,
      activeSessions,
      accountsWithoutPassword: library.users.filter((user) => !user.passwordHash).length,
      usedBytes,
      quotaBytes,
      jobs: [
        {
          id: 'uploads',
          name: 'Upload e organização',
          status: 'healthy',
          queued: 0,
          completed: activeItems.filter((item) => item.type === 'file').length
        },
        {
          id: 'indexing',
          name: 'Indexação de pesquisa',
          status: 'healthy',
          queued: 0,
          completed: activeItems.length
        },
        {
          id: 'sharing',
          name: 'Links compartilhados',
          status: activeItems.some((item) => item.linkRole) ? 'healthy' : 'idle',
          queued: 0,
          completed: activeItems.filter((item) => item.linkRole).length
        },
        {
          id: 'trash-cleanup',
          name: 'Limpeza de lixeira',
          status: trashedOrSpamIds.size ? 'warning' : 'idle',
          queued: trashedOrSpamIds.size,
          completed: 0
        }
      ]
    };
  }

  /** Creates a full manual backup and records the result for scheduling and notifications. */
  async backupDatabase(requesterId: string): Promise<MaintenanceArtifact> {
    return this.withMutation(async () => {
      const library = await this.readLibrary();
      this.assertAdmin(library, requesterId);
      const schedule = this.normalizeBackupSchedule(library.backupSchedule);

      try {
        const artifact = await this.createDatabaseBackup('manual', library, schedule);
        library.backupSchedule = {
          ...schedule,
          lastRunAt: artifact.createdAt,
          lastStatus: 'ok',
          lastError: null
        };
        this.notifyAdmins(library, {
          type: 'backup',
          title: 'Backup concluído',
          message: `Backup manual efetuado por ${this.userLabel(library, requesterId)}.`,
          actorId: requesterId
        });
        await this.writeLibrary(library);
        await this.pruneBackups(library.backupSchedule.retentionCount, library.backupSchedule);
        return artifact;
      } catch (error) {
        library.backupSchedule = {
          ...schedule,
          lastStatus: 'error',
          lastError: error instanceof Error ? error.message : 'Falha ao criar backup.'
        };
        await this.writeLibrary(library);
        throw error;
      }
    });
  }

  /** Returns backup storage metadata and the recent full-backup artifacts. */
  async maintenanceOverview(requesterId: string): Promise<MaintenanceOverview> {
    const library = await this.readLibrary();
    this.assertAdmin(library, requesterId);
    await this.ensureStorage();
    return {
      backupDirectory: this.normalizeBackupSchedule(library.backupSchedule).directory,
      backups: await this.listBackupArtifacts(this.normalizeBackupSchedule(library.backupSchedule))
    };
  }

  /** Returns notifications visible to the user, with admins seeing operational events too. */
  async notifications(requesterId: string): Promise<DriveNotification[]> {
    const library = await this.readLibrary();
    const requester = this.findUser(library, requesterId);
    return (library.notifications ?? [])
      .filter((notification) => notification.userId === requesterId)
      .filter((notification) => requester.role === 'admin' || notification.type === 'share')
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  /** Marks all visible notifications as read for the current user. */
  async markNotificationsRead(requesterId: string): Promise<{ ok: true }> {
    return this.withMutation(async () => {
      const library = await this.readLibrary();
      this.findUser(library, requesterId);
      const now = new Date().toISOString();
      library.notifications = (library.notifications ?? []).map((notification) =>
        notification.userId === requesterId && !notification.readAt ? { ...notification, readAt: now } : notification
      );
      await this.writeLibrary(library);
      return { ok: true };
    });
  }

  /** Removes the current user's visible notifications without touching other users' history. */
  async clearNotifications(requesterId: string): Promise<{ ok: true }> {
    return this.withMutation(async () => {
      const library = await this.readLibrary();
      this.findUser(library, requesterId);
      library.notifications = (library.notifications ?? []).filter((notification) => notification.userId !== requesterId);
      await this.writeLibrary(library);
      return { ok: true };
    });
  }

  /** Lets admins browse server directories for selecting a backup target path. */
  async browseServerDirectories(requesterId: string, pathInput?: string): Promise<ServerDirectoryListing> {
    const library = await this.readLibrary();
    this.assertAdmin(library, requesterId);

    const requestedPath = resolve((pathInput || this.backupsDir).trim() || this.backupsDir);
    const requestedInfo = await stat(requestedPath).catch(() => null);
    const directoryPath = requestedInfo?.isDirectory() ? requestedPath : dirname(requestedPath);
    const info = await stat(directoryPath).catch(() => null);
    if (!info?.isDirectory()) throw new BadRequestException('Diretório do servidor não encontrado.');

    let entries;
    try {
      entries = await readdir(directoryPath, { withFileTypes: true });
    } catch {
      throw new BadRequestException('Sem permissão para listar este diretório do servidor.');
    }

    const parentPath = dirname(directoryPath);
    return {
      path: directoryPath,
      parentPath: parentPath === directoryPath ? null : parentPath,
      directories: entries
        .filter((entry) => entry.isDirectory())
        .map((entry) => ({
          name: entry.name,
          path: join(directoryPath, entry.name)
        }))
        .sort((a, b) => a.name.localeCompare(b.name))
    };
  }

  /** Deletes all copies of a backup artifact across the primary and legacy backup locations. */
  async deleteDatabaseBackup(requesterId: string, id: string): Promise<{ ok: true }> {
    return this.withMutation(async () => {
      const library = await this.readLibrary();
      this.assertAdmin(library, requesterId);
      const artifacts = await this.findBackupArtifacts(this.normalizeBackupSchedule(library.backupSchedule), id);
      if (!artifacts.length) throw new NotFoundException('Backup não encontrado.');
      await Promise.all(artifacts.map((artifact) => rm(artifact.path, { force: true })));
      return { ok: true };
    });
  }

  /** Restores a known backup artifact after verifying it belongs to the configured backup set. */
  async restoreDatabaseBackup(requesterId: string, id: string): Promise<{ ok: true }> {
    return this.withMutation(async () => {
      const current = await this.readLibrary();
      this.assertAdmin(current, requesterId);
      const artifact = await this.findArtifact(id, this.normalizeBackupSchedule(current.backupSchedule));
      await this.restoreFullBackupArchive(artifact.path);
      return { ok: true };
    });
  }

  /** Restores an uploaded backup archive and always cleans up the temporary upload. */
  async restoreUploadedBackup(requesterId: string, file: Express.Multer.File): Promise<{ ok: true }> {
    return this.withMutation(async () => {
      const current = await this.readLibrary();
      this.assertAdmin(current, requesterId);
      if (!file) throw new BadRequestException('Arquivo de backup não enviado.');
      await this.ensureStorage();
      const temporaryPath = join(
        this.tempDir,
        `${Date.now()}-${randomBytes(4).toString('hex')}-${sanitizeUploadedFilename(file.originalname || 'backup.tar.xz')}`
      );
      try {
        await this.persistUploadedFile(file, temporaryPath);
        await this.restoreFullBackupArchive(temporaryPath);
        return { ok: true };
      } finally {
        await rm(temporaryPath, { force: true }).catch(() => undefined);
        await this.cleanupUploadedTemp(file).catch(() => undefined);
      }
    });
  }

  /** Audits storage consistency and optionally repairs metadata or removes orphaned objects. */
  async auditStorage(requesterId: string, dto: StorageAuditDto = {}): Promise<StorageAuditReport> {
    return this.withMutation(async () => {
      const library = await this.readLibrary();
      this.assertAdmin(library, requesterId);
      await this.ensureStorage();

      const objectNames = await this.objectNames();
      const referenced = new Set(
        library.items
          .filter((item) => item.type === 'file' && item.storageKey)
          .map((item) => item.storageKey as string)
      );
      const report: StorageAuditReport = {
        checkedFiles: 0,
        missingObjects: [],
        orphanObjects: objectNames.filter((name) => !referenced.has(name)),
        checksumMismatches: [],
        sizeMismatches: [],
        repairedChecksums: 0,
        repairedSizes: 0,
        removedOrphans: 0
      };

      for (const item of library.items.filter((entry) => entry.type === 'file' && entry.storageKey)) {
        const storageKey = item.storageKey as string;
        const path = join(this.filesDir, storageKey);
        try {
          const info = await stat(path);
          if (!info.isFile()) throw new Error('not-a-file');
          report.checkedFiles += 1;

          if (info.size !== item.size) {
            report.sizeMismatches.push({
              itemId: item.id,
              name: item.name,
              expected: item.size,
              actual: info.size
            });
            if (dto.repair) {
              item.size = info.size;
              report.repairedSizes += 1;
            }
          }

          const actual = await this.sha256File(path);
          if (!item.checksum) {
            if (dto.repair) {
              item.checksum = actual;
              report.repairedChecksums += 1;
            }
          } else if (item.checksum !== actual) {
            report.checksumMismatches.push({
              itemId: item.id,
              name: item.name,
              expected: item.checksum,
              actual
            });
          }
        } catch {
          report.missingObjects.push({ itemId: item.id, name: item.name, storageKey });
        }
      }

      if (dto.removeOrphans) {
        for (const orphan of report.orphanObjects) {
          await rm(join(this.filesDir, orphan), { force: true });
          report.removedOrphans += 1;
        }
      }

      if (dto.repair || dto.removeOrphans) await this.writeLibrary(library);
      return report;
    });
  }

  /** Creates a user account with normalized identity fields, quota, role, and optional password. */
  async createAccount(requesterId: string, dto: CreateAccountDto): Promise<SafeUserAccount> {
    return this.withMutation(async () => {
      const library = await this.readLibrary();
      this.assertAdmin(library, requesterId);
      const email = dto.email.trim().toLowerCase();
      if (library.users.some((user) => user.email.toLowerCase() === email)) {
        throw new BadRequestException('Já existe uma conta com esse e-mail.');
      }

      const now = new Date().toISOString();
      const user: UserAccount = {
        id: randomUUID(),
        name: dto.name.trim(),
        email,
        role: dto.role ?? 'user',
        storageQuotaBytes: (dto.storageQuotaGb ?? 15) * GB,
        avatarColor: this.pickAvatarColor(library.users.length),
        avatarUrl: null,
        passwordHash: dto.password ? hashPassword(dto.password) : undefined,
        createdAt: now,
        updatedAt: now
      };

      library.users.push(user);
      await this.writeLibrary(library);
      return this.safeUser(user);
    });
  }

  /** Updates account details while protecting the last admin from accidental demotion. */
  async updateAccount(requesterId: string, id: string, dto: UpdateAccountDto): Promise<SafeUserAccount> {
    return this.withMutation(async () => {
      const library = await this.readLibrary();
      this.assertAdmin(library, requesterId);
      const user = this.findUser(library, id);

      if (dto.email) {
        const email = dto.email.trim().toLowerCase();
        if (library.users.some((current) => current.id !== id && current.email.toLowerCase() === email)) {
          throw new BadRequestException('Já existe uma conta com esse e-mail.');
        }
        user.email = email;
      }

      if (dto.name) user.name = dto.name.trim();
      if (dto.role) {
        if (
          user.role === 'admin' &&
          dto.role !== 'admin' &&
          library.users.filter((current) => current.role === 'admin').length <= 1
        ) {
          throw new BadRequestException('Não é possível remover o último administrador.');
        }
        user.role = dto.role;
      }
      if (dto.storageQuotaGb) user.storageQuotaBytes = dto.storageQuotaGb * GB;
      user.updatedAt = new Date().toISOString();

      await this.writeLibrary(library);
      return this.safeUser(user);
    });
  }

  /** Deletes an account from the admin panel and returns whether setup must run again. */
  async deleteAdminAccount(requesterId: string, id: string): Promise<AccountDeletionResult> {
    return this.withMutation(async () => {
      const library = await this.readLibrary();
      this.assertAdmin(library, requesterId);
      const user = this.findUser(library, id);

      if (requesterId === id) {
        throw new BadRequestException('Você não pode excluir a própria conta por aqui.');
      }
      if (user.role === 'admin' && library.users.filter((current) => current.role === 'admin').length <= 1) {
        throw new BadRequestException('Não é possível excluir o último administrador.');
      }

      await this.removeUserFromLibrary(library, id);
      if (!library.users.length) {
        await this.resetProjectData(library);
        await this.writeLibrary(library);
        return { ok: true, setupRequired: true, deletedAccountId: id };
      }
      await this.writeLibrary(library);
      return { ok: true, setupRequired: false, deletedAccountId: id };
    });
  }

  /** Lists files for a section, applying ownership, sharing, search, retention, and folder-size projections. */
  async list(requesterId: string, query: ListFilesQueryDto): Promise<DriveItem[]> {
    const library = await this.readLibrary();
    const ownerId = this.resolvePersonalOwner(library, requesterId, query.ownerId);
    const parentId = this.normalizeParent(query.parentId);
    const section = query.section ?? (query.starred ? 'starred' : query.trashed ? 'trash' : 'drive');
    const search = query.q?.trim().toLowerCase();
    const advancedSearch = this.hasAdvancedSearch(query);
    const deep = Boolean(query.deep);
    const descendantIds = deep && parentId ? new Set(this.collectDescendantIds(library, parentId)) : null;
    const retentionDays = library.trashRetentionDays ?? DEFAULT_TRASH_RETENTION_DAYS;
    const retentionMs = retentionDays * 24 * 60 * 60 * 1000;
    const now = Date.now();
    const normalSearchRanks = new Map<string, number>();

    // Expired trash is pruned during list reads so cleanup does not require a separate worker.
    const expiredIds = library.items
      .filter(
        (item) => item.trashed && item.deletedAt && now - new Date(item.deletedAt).getTime() > retentionMs
      )
      .map((item) => item.id);

    if (expiredIds.length) {
      await this.withMutation(async () => {
        const fresh = await this.readLibrary();
        const freshRetentionDays = fresh.trashRetentionDays ?? DEFAULT_TRASH_RETENTION_DAYS;
        const freshRetentionMs = freshRetentionDays * 24 * 60 * 60 * 1000;
        const freshNow = Date.now();
        const freshExpiredIds = fresh.items
          .filter(
            (item) =>
              item.trashed &&
              item.deletedAt &&
              freshNow - new Date(item.deletedAt).getTime() > freshRetentionMs
          )
          .map((item) => item.id);
        const toRemove = freshExpiredIds.flatMap((id) => {
          const item = fresh.items.find((i) => i.id === id);
          return item ? this.collectDescendantIds(fresh, id).concat(id) : [id];
        });
        const uniqueIds = [...new Set(toRemove)];
        const removed = fresh.items.filter((i) => uniqueIds.includes(i.id));
        fresh.items = fresh.items.filter((i) => !uniqueIds.includes(i.id));
        await Promise.allSettled(
          removed
            .filter((i) => i.type === 'file' && i.storageKey)
            .map((i) => rm(join(this.filesDir, i.storageKey!), { force: true }))
        );
        await this.writeLibrary(fresh);
      });
      return this.list(requesterId, query);
    }

    const baseItems = library.items.filter((item) =>
      advancedSearch
        ? this.matchesSection(library, item, ownerId, 'recent', null, undefined, false, null)
        : this.matchesSection(library, item, ownerId, section, parentId, search, deep, descendantIds)
    );
    const filteredItems = advancedSearch
      ? await this.applyAdvancedSearchFilters(library, baseItems, ownerId, query)
      : search
        ? (await this.applyNormalSearchFilters(baseItems, search, normalSearchRanks))
        : baseItems;

    const results = filteredItems
      .sort((a, b) => {
        if (!advancedSearch && search) {
          const rankDiff = (normalSearchRanks.get(a.id) ?? 99) - (normalSearchRanks.get(b.id) ?? 99);
          if (rankDiff !== 0) return rankDiff;
          return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
        }
        if (!advancedSearch && section === 'storage') return b.size - a.size;
        if (advancedSearch || ['recent', 'activity'].includes(section)) {
          return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
        }
        if (a.type !== b.type) return a.type === 'folder' ? -1 : 1;
        return b.updatedAt.localeCompare(a.updatedAt);
      })
      .map((item) => ({
        ...item,
        daysUntilDeletion:
          item.trashed && item.deletedAt
            ? Math.max(
                0,
                Math.ceil((retentionMs - (now - new Date(item.deletedAt).getTime())) / (24 * 60 * 60 * 1000))
              )
            : undefined
      }));
    return this.withComputedFolderSizes(library, results);
  }

  /** Lists folders the requester can use as destinations, respecting owner and sharing boundaries. */
  async folders(requesterId: string, ownerIdInput?: string): Promise<DriveItem[]> {
    const library = await this.readLibrary();
    const ownerId = ownerIdInput || requesterId;
    this.findUser(library, ownerId);
    const folders = library.items
      .filter(
        (item) =>
          item.type === 'folder' &&
          !item.trashed &&
          !item.spam &&
          (item.ownerId === ownerId ||
            (ownerId === requesterId && Boolean(this.shareRoleForItem(library, requesterId, item))) ||
            (ownerId !== requesterId && this.shareRoleForItem(library, requesterId, item) === 'editor'))
      )
      .sort((a, b) => a.name.localeCompare(b.name));
    return this.withComputedFolderSizes(library, folders);
  }

  /** Loads one item after enforcing the requester's access to it. */
  async get(requesterId: string, id: string): Promise<DriveItem> {
    const library = await this.readLibrary();
    const item = library.items.find((current) => current.id === id);
    if (!item) throw new NotFoundException('Item não encontrado.');
    this.assertItemAccess(library, requesterId, item);
    return this.withComputedFolderSizes(library, [item])[0];
  }

  /** Updates recent/opened metadata without changing file contents or permissions. */
  async markOpened(requesterId: string, id: string): Promise<DriveItem> {
    return this.withMutation(async () => {
      const library = await this.readLibrary();
      const item = library.items.find((current) => current.id === id);
      if (!item) throw new NotFoundException('Item não encontrado.');
      this.assertItemAccess(library, requesterId, item);
      item.openedAt = new Date().toISOString();
      item.openedById = requesterId;
      await this.writeLibrary(library);
      return this.withComputedFolderSizes(library, [item])[0];
    });
  }

  /** Builds a clickable ancestry path for folders and files the requester can see. */
  async breadcrumbs(requesterId: string, id?: string | null): Promise<DriveItem[]> {
    if (!id || id === 'root') return [];
    const library = await this.readLibrary();
    const path: DriveItem[] = [];
    let current = library.items.find((item) => item.id === id);
    if (current) this.assertItemAccess(library, requesterId, current);

    while (current) {
      path.unshift(current);
      current = current.parentId ? library.items.find((item) => item.id === current?.parentId) : undefined;
    }

    return this.withComputedFolderSizes(library, path);
  }

  /** Creates a folder under a writable parent while avoiding sibling name collisions. */
  async createFolder(requesterId: string, dto: CreateFolderDto): Promise<DriveItem> {
    return this.withMutation(async () => {
      const library = await this.readLibrary();
      const parentId = this.normalizeParent(dto.parentId);
      const ownerId = this.resolveCreateOwner(library, requesterId, parentId, dto.ownerId);
      const now = new Date().toISOString();
      const item: DriveItem = {
        id: randomUUID(),
        ownerId,
        name: this.uniqueSiblingName(library, dto.name.trim(), 'folder', ownerId, parentId),
        type: 'folder',
        parentId,
        mimeType: null,
        extension: null,
        storageKey: null,
        checksum: null,
        size: 0,
        color: dto.color ?? '#e8f0fe',
        description: null,
        starred: false,
        trashed: false,
        spam: false,
        sharedToken: null,
        linkRole: null,
        sharedWith: [],
        sharePermissions: [],
        createdAt: now,
        updatedAt: now,
        updatedById: requesterId,
        openedAt: null,
        openedById: null,
        deletedAt: null,
        activity: []
      };

      library.items.push(item);
      this.appendActivity(library, item, 'created', requesterId, { parentId, parentName: this.folderActivityName(library, parentId) }, now);
      await this.writeLibrary(library);
      return this.withComputedFolderSizes(library, [item])[0];
    });
  }

  /** Stores an uploaded object, validates quota and disk space, and creates the file item. */
  async upload(
    requesterId: string,
    file: Express.Multer.File,
    parentIdInput?: string | null,
    ownerIdInput?: string
  ): Promise<DriveItem> {
    if (!file) throw new BadRequestException('Arquivo obrigatório.');
    await this.ensureStorage();
    let objectPath: string | null = null;

    try {
      return await this.withMutation(async () => {
        const library = await this.readLibrary();
        const parentId = this.normalizeParent(parentIdInput);
        const ownerId = this.resolveCreateOwner(library, requesterId, parentId, ownerIdInput);
        this.assertQuota(library, ownerId, file.size);

        const now = new Date().toISOString();
        const safeName = sanitizeUploadedFilename(file.originalname);
        const displayName = this.uniqueSiblingName(library, safeName, 'file', ownerId, parentId);
        const extension = extname(safeName).replace('.', '').toLowerCase() || null;
        const storageKey = `${randomUUID()}${extension ? `.${extension}` : ''}`;
        objectPath = join(this.filesDir, storageKey);

        await this.assertDiskHasSpace(file.size);
        await this.persistUploadedFile(file, objectPath);
        const checksum = await this.sha256File(objectPath);

        const item: DriveItem = {
          id: randomUUID(),
          ownerId,
          name: displayName,
          type: 'file',
          parentId,
          mimeType: this.resolveMimeType(safeName, file.mimetype),
          extension,
          storageKey,
          checksum,
          size: file.size,
          color: null,
          description: null,
          starred: false,
          trashed: false,
          spam: false,
          sharedToken: null,
          linkRole: null,
          sharedWith: [],
          sharePermissions: [],
          createdAt: now,
          updatedAt: now,
          updatedById: requesterId,
          openedAt: null,
          openedById: null,
          deletedAt: null,
          activity: []
        };

        library.items.push(item);
        this.appendActivity(
          library,
          item,
          'uploaded',
          requesterId,
          { parentId, parentName: this.folderActivityName(library, parentId) },
          now
        );
        await this.writeLibrary(library);
        return item;
      });
    } catch (error) {
      if (objectPath) await rm(objectPath, { force: true }).catch(() => undefined);
      await this.cleanupUploadedTemp(file);
      throw error;
    }
  }

  /** Applies metadata changes, moves, trash/spam state, sharing-safe ownership, and activity events. */
  async update(requesterId: string, id: string, dto: UpdateItemDto): Promise<DriveItem> {
    return this.withMutation(async () => {
      const library = await this.readLibrary();
      const item = library.items.find((current) => current.id === id);
      if (!item) throw new NotFoundException('Item não encontrado.');
      this.assertItemEditor(library, requesterId, item);

      const previousName = item.name;
      const previousParentId = item.parentId;
      const previousDescription = item.description ?? null;
      const previousStarred = item.starred;
      const previousColor = item.color;
      const previousTrashed = item.trashed;
      const previousSpam = item.spam;
      let nextParentId = item.parentId;
      let shouldNormalizeName = false;

      if (dto.parentId !== undefined) {
        nextParentId = this.normalizeParent(dto.parentId);
        if (nextParentId === item.id)
          throw new BadRequestException('Uma pasta não pode ser movida para ela mesma.');
        if (
          item.type === 'folder' &&
          nextParentId &&
          this.collectDescendantIds(library, item.id).includes(nextParentId)
        ) {
          throw new BadRequestException('Uma pasta não pode ser movida para dentro de suas subpastas.');
        }
        this.assertParentWritable(library, requesterId, nextParentId, item.ownerId);
        shouldNormalizeName = true;
      }

      const requestedName = dto.name !== undefined ? dto.name.trim() : item.name;
      if (dto.name !== undefined) shouldNormalizeName = true;
      if (dto.trashed === false) shouldNormalizeName = true;
      if (shouldNormalizeName) {
        if (!requestedName.trim()) throw new BadRequestException('Nome do item é obrigatório.');
        item.name = this.uniqueSiblingName(
          library,
          requestedName,
          item.type,
          item.ownerId,
          nextParentId,
          item.id
        );
        item.parentId = nextParentId;
      }
      const nextDescription = this.normalizeDescription(dto.description);
      if (nextDescription !== undefined) item.description = nextDescription;
      if (dto.starred !== undefined) item.starred = dto.starred;
      if (dto.color !== undefined) item.color = dto.color;
      if (dto.sharedWith !== undefined) {
        this.assertItemOwner(library, requesterId, item);
        item.sharedWith = dto.sharedWith;
        item.sharePermissions = this.mergeSharePermissions(item.sharePermissions, dto.sharedWith);
      }
      if (dto.spam !== undefined) this.applySpamState(library, item, dto.spam, requesterId);
      if (dto.trashed !== undefined) this.applyTrashState(library, item, dto.trashed, requesterId);
      const now = new Date().toISOString();
      item.updatedAt = now;
      item.updatedById = requesterId;

      if (previousName !== item.name) {
        this.appendActivity(library, item, 'renamed', requesterId, { oldName: previousName, newName: item.name }, now);
      }
      if (previousParentId !== item.parentId) {
        this.appendActivity(
          library,
          item,
          'moved',
          requesterId,
          {
            oldParentId: previousParentId,
            newParentId: item.parentId,
            oldParentName: this.folderActivityName(library, previousParentId),
            newParentName: this.folderActivityName(library, item.parentId)
          },
          now
        );
      }
      if (previousDescription !== (item.description ?? null)) {
        this.appendActivity(
          library,
          item,
          'description_changed',
          requesterId,
          { action: item.description ? (previousDescription ? 'updated' : 'added') : 'removed' },
          now
        );
      }
      if (previousStarred !== item.starred) {
        this.appendActivity(library, item, item.starred ? 'starred' : 'unstarred', requesterId, {}, now);
      }
      if (previousColor !== item.color) {
        this.appendActivity(library, item, 'color_changed', requesterId, {}, now);
      }
      if (previousSpam !== item.spam) {
        this.appendActivity(library, item, 'spam_changed', requesterId, { spam: item.spam }, now);
      }
      if (previousTrashed !== item.trashed) {
        this.appendActivity(library, item, item.trashed ? 'trashed' : 'restored', requesterId, {}, now);
      }

      await this.writeLibrary(library);
      return this.withComputedFolderSizes(library, [item])[0];
    });
  }

  /** Copies a file or folder tree into a writable destination with fresh object references. */
  async copy(requesterId: string, id: string, dto: CopyItemDto): Promise<DriveItem> {
    await this.ensureStorage();
    return this.withMutation(async () => {
      const library = await this.readLibrary();
      const source = library.items.find((current) => current.id === id);
      if (!source) throw new NotFoundException('Item não encontrado.');
      this.assertItemOwner(library, requesterId, source);
      if (source.trashed || source.spam) {
        throw new BadRequestException('Itens na lixeira ou spam não podem ser copiados.');
      }

      const parentId = this.normalizeParent(dto.parentId);
      this.assertParentExists(library, parentId, source.ownerId);

      const idsToCopy =
        source.type === 'folder' ? this.collectDescendantIds(library, source.id).concat(source.id) : [source.id];
      const sourceItems = idsToCopy
        .map((itemId) => library.items.find((item) => item.id === itemId))
        .filter((item): item is DriveItem => {
          return item !== undefined && !item.trashed && !item.spam;
        });
      const incomingSize = sourceItems
        .filter((item) => item.type === 'file')
        .reduce((total, item) => total + item.size, 0);
      this.assertQuota(library, source.ownerId, incomingSize);

      const now = new Date().toISOString();
      const idMap = new Map<string, string>();
      sourceItems.forEach((item) => idMap.set(item.id, randomUUID()));
      const rootName = this.uniqueSiblingName(library, source.name, source.type, source.ownerId, parentId);
      const created: DriveItem[] = [];

      for (const item of sourceItems) {
        const newId = idMap.get(item.id) as string;
        const newParentId = item.id === source.id ? parentId : idMap.get(item.parentId ?? '') ?? parentId;
        let storageKey = item.storageKey;
        let checksum = item.checksum;

        if (item.type === 'file' && item.storageKey) {
          const extension = item.extension || extname(item.name).replace('.', '').toLowerCase() || null;
          storageKey = `${randomUUID()}${extension ? `.${extension}` : ''}`;
          const destination = join(this.filesDir, storageKey);
          await this.assertDiskHasSpace(item.size);
          await copyFile(join(this.filesDir, item.storageKey), destination);
          checksum = item.checksum ?? (await this.sha256File(destination));
        }

        created.push({
          ...item,
          id: newId,
          name: item.id === source.id ? rootName : item.name,
          parentId: newParentId,
          storageKey,
          checksum,
          starred: false,
          trashed: false,
          spam: false,
          sharedToken: null,
          linkRole: null,
          sharedWith: [],
          sharePermissions: [],
          description: item.description ?? null,
          createdAt: now,
          updatedAt: now,
          updatedById: requesterId,
          openedAt: null,
          openedById: null,
          deletedAt: null,
          activity: []
        });
      }

      library.items.push(...created);
      const copiedSourceById = new Map<string, DriveItem>();
      for (const sourceItem of sourceItems) {
        const copiedId = idMap.get(sourceItem.id);
        if (copiedId) copiedSourceById.set(copiedId, sourceItem);
      }
      for (const item of created) {
        const sourceItem = copiedSourceById.get(item.id);
        this.appendActivity(
          library,
          item,
          'copied',
          requesterId,
          {
            sourceId: sourceItem?.id ?? null,
            sourceParentId: sourceItem?.parentId ?? null,
            sourceParentName: this.folderActivityName(library, sourceItem?.parentId ?? null),
            newParentId: item.parentId,
            newParentName: this.folderActivityName(library, item.parentId)
          },
          now
        );
      }
      await this.writeLibrary(library);
      const copied = created.find((item) => item.id === idMap.get(source.id)) as DriveItem;
      return this.withComputedFolderSizes(library, [copied])[0];
    });
  }

  /** Replaces text-file contents while preserving the item identity and recording an edit event. */
  async saveTextContent(requesterId: string, id: string, dto: SaveTextContentDto): Promise<DriveItem> {
    return this.withMutation(async () => {
      const library = await this.readLibrary();
      const item = library.items.find((current) => current.id === id);
      if (!item) throw new NotFoundException('Item não encontrado.');
      this.assertItemEditor(library, requesterId, item);
      this.assertTextEditable(item);
      if (!item.storageKey) throw new BadRequestException('Arquivo sem conteúdo armazenado.');

      const content = dto.content ?? '';
      const buffer = Buffer.from(content, 'utf8');
      this.assertQuotaDelta(library, item.ownerId, item.size, buffer.length);

      await this.assertDiskHasSpace(Math.max(0, buffer.length - item.size));
      const destination = join(this.filesDir, item.storageKey);
      const tempPath = join(this.tempDir, `${randomUUID()}.text-save`);
      await writeFile(tempPath, buffer);
      await rename(tempPath, destination);
      item.size = buffer.length;
      item.checksum = createHash('sha256').update(buffer).digest('hex');
      item.mimeType = item.mimeType?.startsWith('text/') ? item.mimeType : lookup(item.name) || 'text/plain';
      const now = new Date().toISOString();
      item.updatedAt = now;
      item.updatedById = requesterId;
      this.appendActivity(library, item, 'edited', requesterId, { size: item.size }, now);

      await this.writeLibrary(library);
      return item;
    });
  }

  /** Replaces binary contents from a base64 payload for app/editor integrations. */
  async saveBinaryContent(requesterId: string, id: string, dto: SaveBinaryContentDto): Promise<DriveItem> {
    return this.withMutation(async () => {
      const library = await this.readLibrary();
      const item = library.items.find((current) => current.id === id);
      if (!item) throw new NotFoundException('Item não encontrado.');
      this.assertItemEditor(library, requesterId, item);
      this.assertOfficeEditable(item);
      if (!item.storageKey) throw new BadRequestException('Arquivo sem conteúdo armazenado.');

      const buffer = Buffer.from(dto.contentBase64 ?? '', 'base64');
      this.assertQuotaDelta(library, item.ownerId, item.size, buffer.length);

      await this.assertDiskHasSpace(Math.max(0, buffer.length - item.size));
      const destination = join(this.filesDir, item.storageKey);
      const tempPath = join(this.tempDir, `${randomUUID()}.office-save`);
      await writeFile(tempPath, buffer);
      await rename(tempPath, destination);
      item.size = buffer.length;
      item.checksum = createHash('sha256').update(buffer).digest('hex');
      item.mimeType = this.resolveMimeType(item.name, dto.mimeType || item.mimeType);
      const now = new Date().toISOString();
      item.updatedAt = now;
      item.updatedById = requesterId;
      this.appendActivity(library, item, 'edited', requesterId, { size: item.size }, now);

      await this.writeLibrary(library);
      return item;
    });
  }

  /** Issues a short-lived signed ticket for previews, downloads, PDF pages, or Office callbacks. */
  async createFileAccessTicket(
    requesterId: string,
    id: string,
    scope: FileAccessScope
  ): Promise<{ ticket: string; expiresAt: number }> {
    const library = await this.readLibrary();
    const item = library.items.find((current) => current.id === id);
    if (!item) throw new NotFoundException('Item não encontrado.');
    this.assertItemAccess(library, requesterId, item);

    const expiresAt = Date.now() + this.fileAccessTicketTtl(scope);
    const payload: FileAccessTicketPayload = {
      v: 1,
      sub: requesterId,
      item: id,
      scope,
      exp: expiresAt,
      nonce: randomBytes(12).toString('hex')
    };
    const encoded = base64UrlJson(payload);
    return { ticket: `${encoded}.${this.signFileAccessTicket(encoded)}`, expiresAt };
  }

  /** Validates a signed file-access ticket against item, scope, expiration, and access rights. */
  async validateFileAccessTicket(ticket: string, id: string, scope: FileAccessScope): Promise<string | null> {
    const [encoded, signature] = String(ticket || '').split('.');
    if (!encoded || !signature || !this.verifyFileAccessTicketSignature(encoded, signature)) return null;

    const payload = jsonFromBase64Url<FileAccessTicketPayload>(encoded);
    if (
      !payload ||
      payload.v !== 1 ||
      payload.item !== id ||
      payload.scope !== scope ||
      typeof payload.sub !== 'string' ||
      typeof payload.exp !== 'number' ||
      payload.exp < Date.now()
    ) {
      return null;
    }

    const library = await this.readLibrary();
    const item = library.items.find((current) => current.id === id);
    if (!item || !library.users.some((user) => user.id === payload.sub)) return null;

    try {
      if (scope === 'office-callback') this.assertItemEditor(library, payload.sub, item);
      else this.assertItemAccess(library, payload.sub, item);
      return payload.sub;
    } catch {
      return null;
    }
  }

  /** Builds the ONLYOFFICE editor configuration for a private file session. */
  async getOfficeConfig(
    requesterId: string,
    id: string,
    options: { fileUrl: string; callbackUrl: string; mode?: OfficeMode }
  ): Promise<OfficeEditorConfigResponse> {
    const documentServerUrl = this.onlyOfficeDocumentServerUrl();
    if (!documentServerUrl) {
      return {
        enabled: false,
        documentServerUrl: null,
        reason: 'Configure ONLYOFFICE_DOCUMENT_SERVER_URL para habilitar o editor Office.'
      };
    }

    const library = await this.readLibrary();
    const item = library.items.find((current) => current.id === id);
    if (!item) throw new NotFoundException('Item não encontrado.');
    this.assertItemAccess(library, requesterId, item);
    this.assertOfficeEditable(item);
    const user = this.findUser(library, requesterId);
    const canEdit = options.mode === 'edit' && (item.ownerId === requesterId || this.shareRoleForItem(library, requesterId, item) === 'editor');

    return {
      enabled: true,
      documentServerUrl,
      config: this.officeEditorConfig(item, {
        fileUrl: options.fileUrl,
        callbackUrl: options.callbackUrl,
        mode: canEdit ? 'edit' : 'view',
        userId: user.id,
        userName: user.name
      })
    };
  }

  /** Accepts ONLYOFFICE save callbacks and writes the downloaded document back into storage. */
  async handleOfficeCallback(requesterId: string, id: string, payload: any): Promise<{ error: number }> {
    const status = Number(payload?.status);
    if (status !== 2 && status !== 6) return { error: 0 };
    const url = typeof payload?.url === 'string' ? payload.url : '';
    if (!url) return { error: 1 };

    try {
      await this.saveOfficeCallbackContent({
        itemId: id,
        url,
        updatedById: requesterId,
        assertWritable: (library, item) => this.assertItemEditor(library, requesterId, item)
      });
      return { error: 0 };
    } catch {
      return { error: 1 };
    }
  }

  /** Moves an item to trash or deletes it permanently, including descendants and stored objects. */
  async remove(requesterId: string, id: string, hard = false): Promise<{ ok: true }> {
    return this.withMutation(async () => {
      const library = await this.readLibrary();
      const item = library.items.find((current) => current.id === id);
      if (!item) throw new NotFoundException('Item não encontrado.');
      if (hard) this.assertItemOwner(library, requesterId, item);
      else this.assertItemEditor(library, requesterId, item);

      if (!hard) {
        this.applyTrashState(library, item, true, requesterId);
        this.appendActivity(library, item, 'trashed', requesterId, {}, new Date().toISOString());
        await this.writeLibrary(library);
        return { ok: true };
      }

      const idsToDelete = this.collectDescendantIds(library, item.id).concat(item.id);
      const removed = library.items.filter((current) => idsToDelete.includes(current.id));
      library.items = library.items.filter((current) => !idsToDelete.includes(current.id));

      await Promise.all(
        removed
          .filter((current) => current.type === 'file' && current.storageKey)
          .map((current) => rm(join(this.filesDir, current.storageKey as string), { force: true }))
      );

      await this.writeLibrary(library);
      return { ok: true };
    });
  }

  /** Enables link sharing and returns a URL based on the public application origin. */
  async share(requesterId: string, id: string): Promise<{ token: string; url: string }> {
    return this.withMutation(async () => {
      const library = await this.readLibrary();
      const item = library.items.find((current) => current.id === id);
      if (!item) throw new NotFoundException('Item não encontrado.');
      this.assertItemOwner(library, requesterId, item);

      const previousToken = item.sharedToken;
      item.sharedToken = previousToken ?? randomBytes(18).toString('hex');
      if (!previousToken) {
        const now = new Date().toISOString();
        item.updatedAt = now;
        item.updatedById = requesterId;
        this.appendActivity(
          library,
          item,
          'access_changed',
          requesterId,
          {
            linkRole: item.linkRole,
            accessAction: 'permissions_changed'
          },
          now
        );
      }
      await this.writeLibrary(library);

      const appUrl = process.env.PUBLIC_APP_URL ?? 'http://localhost:5173';
      return { token: item.sharedToken, url: `${appUrl}/share/${item.sharedToken}` };
    });
  }

  /** Updates direct user permissions and optional link access for one item. */
  async shareAccess(requesterId: string, id: string, dto: ShareItemAccessDto): Promise<DriveItem> {
    return this.withMutation(async () => {
      const library = await this.readLibrary();
      const item = library.items.find((current) => current.id === id);
      if (!item) throw new NotFoundException('Item não encontrado.');
      this.assertItemOwner(library, requesterId, item);
      const previousLinkRole = item.linkRole;
      const previousPermissionIds = new Set(
        (item.sharePermissions?.length ? item.sharePermissions.map((permission) => permission.userId) : item.sharedWith ?? [])
      );
      const previousDirectShares = previousPermissionIds.size;
      const nextPermissions = this.normalizeSharePermissions(library, item, dto.users ?? []);
      item.sharePermissions = nextPermissions;
      item.sharedWith = nextPermissions.map((permission) => permission.userId);
      item.linkRole = this.normalizeLinkRole(dto.linkRole);
      if (item.linkRole && !item.sharedToken) item.sharedToken = randomBytes(18).toString('hex');
      const hasPreviousAccess = Boolean(previousLinkRole) || previousDirectShares > 0;
      const hasNextAccess = Boolean(item.linkRole) || nextPermissions.length > 0;
      const now = new Date().toISOString();
      item.updatedAt = now;
      item.updatedById = requesterId;
      this.appendActivity(
        library,
        item,
        'access_changed',
        requesterId,
        {
          previousDirectShares,
          directShares: nextPermissions.length,
          previousLinkRole,
          linkRole: item.linkRole,
          accessAction: !hasNextAccess ? 'restricted' : hasPreviousAccess ? 'permissions_changed' : 'shared'
        },
        now
      );
      for (const permission of nextPermissions) {
        if (permission.userId === requesterId || previousPermissionIds.has(permission.userId)) continue;
        this.addNotification(library, {
          userId: permission.userId,
          type: 'share',
          title: 'Novo item compartilhado',
          message: `${this.userLabel(library, requesterId)} adicionou ${item.name}.`,
          itemId: item.id,
          actorId: requesterId,
          createdAt: now
        });
      }
      await this.writeLibrary(library);
      return this.withComputedFolderSizes(library, [item])[0];
    });
  }

  /** Disables public link access while keeping explicit user permissions intact. */
  async unshare(requesterId: string, id: string): Promise<DriveItem> {
    return this.withMutation(async () => {
      const library = await this.readLibrary();
      const item = library.items.find((current) => current.id === id);
      if (!item) throw new NotFoundException('Item não encontrado.');
      this.assertItemOwner(library, requesterId, item);
      item.sharedToken = null;
      item.linkRole = null;
      item.sharedWith = [];
      item.sharePermissions = [];
      const now = new Date().toISOString();
      item.updatedAt = now;
      item.updatedById = requesterId;
      this.appendActivity(library, item, 'access_changed', requesterId, { directShares: 0, linkRole: null }, now);
      await this.writeLibrary(library);
      return this.withComputedFolderSizes(library, [item])[0];
    });
  }

  /** Resolves the shared root represented by a public token. */
  async getShared(token: string): Promise<DriveItem> {
    const library = await this.readLibrary();
    const item = library.items.find(
      (current) => current.sharedToken === token && current.linkRole && !current.trashed && !current.spam
    );
    if (!item) throw new NotFoundException('Compartilhamento não encontrado.');
    return this.withComputedFolderSizes(library, [item])[0];
  }

  /** Lists visible children below a shared folder token. */
  async getSharedChildren(
    token: string,
    parentIdInput?: string | null,
    q?: string | null,
    deep = false
  ): Promise<DriveItem[]> {
    const library = await this.readLibrary();
    const root = this.sharedRootForToken(library, token, true);
    const parentId = this.normalizeParent(parentIdInput) ?? root.id;
    const parent = library.items.find((item) => item.id === parentId && item.type === 'folder' && !item.trashed && !item.spam);
    if (!parent || !this.isWithinSharedRoot(library, root, parent)) {
      throw new ForbiddenException('Você não tem permissão para acessar esta pasta.');
    }
    const search = q?.trim().toLowerCase();
    const descendantIds = deep ? new Set(this.collectDescendantIds(library, parent.id)) : null;
    const children = library.items
      .filter((item) => {
        if (item.trashed || item.spam) return false;
        if (deep ? !descendantIds?.has(item.id) : item.parentId !== parent.id) return false;
        return search ? item.name.toLowerCase().includes(search) : true;
      })
      .sort((a, b) => {
        if (a.type !== b.type) return a.type === 'folder' ? -1 : 1;
        return a.name.localeCompare(b.name);
      });
    return this.withComputedFolderSizes(library, children);
  }

  /** Creates a folder through a shared editable folder link. */
  async createSharedFolder(token: string, dto: CreateFolderDto): Promise<DriveItem> {
    return this.withMutation(async () => {
      if (!dto.name?.trim()) throw new BadRequestException('Nome da pasta é obrigatório.');
      const library = await this.readLibrary();
      const root = this.sharedRootForToken(library, token, true);
      this.assertSharedEditor(root);
      const parentId = this.normalizeParent(dto.parentId) ?? root.id;
      const parent = this.assertSharedParent(library, root, parentId);
      const now = new Date().toISOString();
      const item: DriveItem = {
        id: randomUUID(),
        ownerId: root.ownerId,
        name: this.uniqueSiblingName(library, dto.name.trim(), 'folder', root.ownerId, parent.id),
        type: 'folder',
        parentId: parent.id,
        mimeType: null,
        extension: null,
        storageKey: null,
        checksum: null,
        size: 0,
        color: dto.color ?? '#e8f0fe',
        description: null,
        starred: false,
        trashed: false,
        spam: false,
        sharedToken: null,
        linkRole: null,
        sharedWith: [],
        sharePermissions: [],
        createdAt: now,
        updatedAt: now,
        updatedById: root.ownerId,
        openedAt: null,
        openedById: null,
        deletedAt: null,
        activity: []
      };
      library.items.push(item);
      this.appendActivity(
        library,
        item,
        'created',
        root.ownerId,
        { parentId: parent.id, parentName: parent.name },
        now
      );
      await this.writeLibrary(library);
      return this.withComputedFolderSizes(library, [item])[0];
    });
  }

  /** Uploads a file into a writable shared folder while charging quota to the original owner. */
  async uploadShared(token: string, file: Express.Multer.File, parentIdInput?: string | null): Promise<DriveItem> {
    if (!file) throw new BadRequestException('Arquivo obrigatório.');
    await this.ensureStorage();
    let objectPath: string | null = null;

    try {
      return await this.withMutation(async () => {
        const library = await this.readLibrary();
        const root = this.sharedRootForToken(library, token, true);
        this.assertSharedEditor(root);
        const parentId = this.normalizeParent(parentIdInput) ?? root.id;
        const parent = this.assertSharedParent(library, root, parentId);
        this.assertQuota(library, root.ownerId, file.size);

        const now = new Date().toISOString();
        const safeName = sanitizeUploadedFilename(file.originalname);
        const displayName = this.uniqueSiblingName(library, safeName, 'file', root.ownerId, parent.id);
        const extension = extname(safeName).replace('.', '').toLowerCase() || null;
        const storageKey = `${randomUUID()}${extension ? `.${extension}` : ''}`;
        objectPath = join(this.filesDir, storageKey);

        await this.assertDiskHasSpace(file.size);
        await this.persistUploadedFile(file, objectPath);
        const checksum = await this.sha256File(objectPath);

        const item: DriveItem = {
          id: randomUUID(),
          ownerId: root.ownerId,
          name: displayName,
          type: 'file',
          parentId: parent.id,
          mimeType: this.resolveMimeType(safeName, file.mimetype),
          extension,
          storageKey,
          checksum,
          size: file.size,
          color: null,
          description: null,
          starred: false,
          trashed: false,
          spam: false,
          sharedToken: null,
          linkRole: null,
          sharedWith: [],
          sharePermissions: [],
          createdAt: now,
          updatedAt: now,
          updatedById: root.ownerId,
          openedAt: null,
          openedById: null,
          deletedAt: null,
          activity: []
        };

        library.items.push(item);
        this.appendActivity(
          library,
          item,
          'uploaded',
          root.ownerId,
          { parentId: parent.id, parentName: parent.name },
          now
        );
        await this.writeLibrary(library);
        return this.withComputedFolderSizes(library, [item])[0];
      });
    } catch (error) {
      if (objectPath) await rm(objectPath, { force: true }).catch(() => null);
      throw error;
    }
  }

  /** Renames or moves a shared item within the boundaries of the shared root. */
  async updateSharedItem(token: string, id: string, dto: UpdateItemDto): Promise<DriveItem> {
    return this.withMutation(async () => {
      const library = await this.readLibrary();
      const root = this.sharedRootForToken(library, token);
      this.assertSharedEditor(root);
      const item = library.items.find((current) => current.id === id && !current.trashed && !current.spam);
      if (!item || !this.isWithinSharedRoot(library, root, item)) {
        throw new NotFoundException('Item não encontrado.');
      }

      const now = new Date().toISOString();
      const previousName = item.name;
      const previousParentId = item.parentId;
      const previousDescription = item.description ?? null;
      if (dto.name !== undefined) {
        if (!dto.name.trim()) throw new BadRequestException('Nome do item é obrigatório.');
        item.name = this.uniqueSiblingName(
          library,
          sanitizeDisplayName(dto.name.trim()),
          item.type,
          item.ownerId,
          item.parentId,
          item.id
        );
      }
      if (dto.parentId !== undefined) {
        const nextParent = this.normalizeParent(dto.parentId) ?? root.id;
        if (item.id === root.id) throw new BadRequestException('A pasta compartilhada não pode ser movida pelo link.');
        const parent = this.assertSharedParent(library, root, nextParent);
        if (item.type === 'folder' && this.collectDescendantIds(library, item.id).includes(parent.id)) {
          throw new BadRequestException('Não é possível mover uma pasta para dentro dela mesma.');
        }
        item.parentId = parent.id;
      }
      const nextDescription = this.normalizeDescription(dto.description);
      if (nextDescription !== undefined) item.description = nextDescription;
      item.updatedAt = now;
      item.updatedById = root.ownerId;

      if (previousName !== item.name) {
        this.appendActivity(library, item, 'renamed', root.ownerId, { oldName: previousName, newName: item.name }, now);
      }
      if (previousParentId !== item.parentId) {
        this.appendActivity(
          library,
          item,
          'moved',
          root.ownerId,
          {
            oldParentId: previousParentId,
            newParentId: item.parentId,
            oldParentName: this.folderActivityName(library, previousParentId),
            newParentName: this.folderActivityName(library, item.parentId)
          },
          now
        );
      }
      if (previousDescription !== (item.description ?? null)) {
        this.appendActivity(
          library,
          item,
          'description_changed',
          root.ownerId,
          { action: item.description ? (previousDescription ? 'updated' : 'added') : 'removed' },
          now
        );
      }
      await this.writeLibrary(library);
      return this.withComputedFolderSizes(library, [item])[0];
    });
  }

  /** Deletes an item reachable through an editable shared link. */
  async deleteSharedItem(token: string, id: string): Promise<{ ok: true }> {
    return this.withMutation(async () => {
      const library = await this.readLibrary();
      const root = this.sharedRootForToken(library, token);
      this.assertSharedEditor(root);
      const item = library.items.find((current) => current.id === id && !current.trashed && !current.spam);
      if (!item || item.id === root.id || !this.isWithinSharedRoot(library, root, item)) {
        throw new NotFoundException('Item não encontrado.');
      }
      this.applyTrashState(library, item, true, root.ownerId);
      this.appendActivity(library, item, 'trashed', root.ownerId, {}, new Date().toISOString());
      await this.writeLibrary(library);
      return { ok: true };
    });
  }

  /** Saves text content through a shared editable link. */
  async saveSharedTextContent(token: string, id: string, dto: SaveTextContentDto): Promise<DriveItem> {
    return this.withMutation(async () => {
      const library = await this.readLibrary();
      const root = this.sharedRootForToken(library, token);
      this.assertSharedEditor(root);
      const item = library.items.find((current) => current.id === id && !current.trashed && !current.spam);
      if (!item || !this.isWithinSharedRoot(library, root, item)) {
        throw new NotFoundException('Item não encontrado.');
      }
      this.assertTextEditable(item);
      if (!item.storageKey) throw new BadRequestException('Arquivo sem conteúdo armazenado.');

      const content = dto.content ?? '';
      const buffer = Buffer.from(content, 'utf8');
      this.assertQuotaDelta(library, item.ownerId, item.size, buffer.length);

      await this.assertDiskHasSpace(Math.max(0, buffer.length - item.size));
      const destination = join(this.filesDir, item.storageKey);
      const tempPath = join(this.tempDir, `${randomUUID()}.text-save`);
      await writeFile(tempPath, buffer);
      await rename(tempPath, destination);
      item.size = buffer.length;
      item.checksum = createHash('sha256').update(buffer).digest('hex');
      item.mimeType = item.mimeType?.startsWith('text/') ? item.mimeType : lookup(item.name) || 'text/plain';
      const now = new Date().toISOString();
      item.updatedAt = now;
      item.updatedById = root.ownerId;
      this.appendActivity(library, item, 'edited', root.ownerId, { size: item.size }, now);

      await this.writeLibrary(library);
      return item;
    });
  }

  /** Saves binary content through a shared editable link. */
  async saveSharedBinaryContent(token: string, id: string, dto: SaveBinaryContentDto): Promise<DriveItem> {
    return this.withMutation(async () => {
      const library = await this.readLibrary();
      const root = this.sharedRootForToken(library, token);
      this.assertSharedEditor(root);
      const item = library.items.find((current) => current.id === id && !current.trashed && !current.spam);
      if (!item || !this.isWithinSharedRoot(library, root, item)) {
        throw new NotFoundException('Item não encontrado.');
      }
      this.assertOfficeEditable(item);
      if (!item.storageKey) throw new BadRequestException('Arquivo sem conteúdo armazenado.');

      const buffer = Buffer.from(dto.contentBase64 ?? '', 'base64');
      this.assertQuotaDelta(library, item.ownerId, item.size, buffer.length);

      await this.assertDiskHasSpace(Math.max(0, buffer.length - item.size));
      const destination = join(this.filesDir, item.storageKey);
      const tempPath = join(this.tempDir, `${randomUUID()}.office-save`);
      await writeFile(tempPath, buffer);
      await rename(tempPath, destination);
      item.size = buffer.length;
      item.checksum = createHash('sha256').update(buffer).digest('hex');
      item.mimeType = this.resolveMimeType(item.name, dto.mimeType || item.mimeType);
      const now = new Date().toISOString();
      item.updatedAt = now;
      item.updatedById = root.ownerId;
      this.appendActivity(library, item, 'edited', root.ownerId, { size: item.size }, now);

      await this.writeLibrary(library);
      return item;
    });
  }

  /** Builds an ONLYOFFICE configuration for public shared-link editing. */
  async getSharedOfficeConfig(
    token: string,
    id: string,
    options: { fileUrl: string; callbackUrl: string; mode?: OfficeMode }
  ): Promise<OfficeEditorConfigResponse> {
    const documentServerUrl = this.onlyOfficeDocumentServerUrl();
    if (!documentServerUrl) {
      return {
        enabled: false,
        documentServerUrl: null,
        reason: 'Configure ONLYOFFICE_DOCUMENT_SERVER_URL para habilitar o editor Office.'
      };
    }

    const library = await this.readLibrary();
    const root = this.sharedRootForToken(library, token);
    const item = library.items.find((current) => current.id === id && !current.trashed && !current.spam);
    if (!item || !this.isWithinSharedRoot(library, root, item)) {
      throw new NotFoundException('Item não encontrado.');
    }
    this.assertOfficeEditable(item);
    const canEdit = options.mode === 'edit' && root.linkRole === 'editor';

    return {
      enabled: true,
      documentServerUrl,
      config: this.officeEditorConfig(item, {
        fileUrl: options.fileUrl,
        callbackUrl: options.callbackUrl,
        mode: canEdit ? 'edit' : 'view',
        userId: `public-${token.slice(0, 10)}`,
        userName: 'Visitante'
      })
    };
  }

  /** Handles ONLYOFFICE callbacks for shared-link editor sessions. */
  async handleSharedOfficeCallback(token: string, id: string, payload: any): Promise<{ error: number }> {
    const status = Number(payload?.status);
    if (status !== 2 && status !== 6) return { error: 0 };
    const url = typeof payload?.url === 'string' ? payload.url : '';
    if (!url) return { error: 1 };

    try {
      await this.saveOfficeCallbackContent({
        itemId: id,
        url,
        updatedById: null,
        assertWritable: (library, item) => {
          const root = this.sharedRootForToken(library, token);
          this.assertSharedEditor(root);
          if (!this.isWithinSharedRoot(library, root, item)) {
            throw new NotFoundException('Item não encontrado.');
          }
        }
      });
      return { error: 0 };
    } catch {
      return { error: 1 };
    }
  }

  /** Resolves the private download target after enforcing file access. */
  async getDownload(requesterId: string, id: string): Promise<{ item: DriveItem; path: string }> {
    const item = await this.get(requesterId, id);
    return this.downloadTarget(item);
  }

  /** Reads PDF page count and dimensions without exposing the source file path. */
  async getPdfInfo(
    requesterId: string,
    id: string
  ): Promise<{ pages: number; width: number | null; height: number | null }> {
    const { item, path } = await this.getDownload(requesterId, id);
    this.assertPdf(item);

    try {
      await this.ensurePdfTool('pdfinfo');
      const { stdout } = await execFileAsync('pdfinfo', [path], {
        encoding: 'utf8',
        maxBuffer: 512 * 1024
      });
      const pages = Number(/^Pages:\s+(\d+)/m.exec(stdout)?.[1] ?? 1);
      const sizeMatch = /^Page size:\s+([\d.]+)\s+x\s+([\d.]+)\s+pts/m.exec(stdout);
      return {
        pages: Number.isFinite(pages) && pages > 0 ? pages : 1,
        width: sizeMatch ? Number(sizeMatch[1]) : null,
        height: sizeMatch ? Number(sizeMatch[2]) : null
      };
    } catch {
      throw new InternalServerErrorException('Não foi possível ler as informações do PDF.');
    }
  }

  /** Renders a single private PDF page as an image buffer for lightweight previews. */
  async renderPdfPage(requesterId: string, id: string, pageInput: string): Promise<Buffer> {
    const { item, path } = await this.getDownload(requesterId, id);
    this.assertPdf(item);

    const page = Number(pageInput);
    if (!Number.isInteger(page) || page < 1) throw new BadRequestException('Página inválida.');
    return this.pdfPage(item, path, page);
  }

  /** Reads PDF metadata for a file exposed through a shared link. */
  async getSharedPdfInfo(
    token: string,
    id: string
  ): Promise<{ pages: number; width: number | null; height: number | null }> {
    const { item, path } = await this.getSharedDownload(token, id);
    this.assertPdf(item);

    try {
      await this.ensurePdfTool('pdfinfo');
      const { stdout } = await execFileAsync('pdfinfo', [path], {
        encoding: 'utf8',
        maxBuffer: 512 * 1024
      });
      const pages = Number(/^Pages:\s+(\d+)/m.exec(stdout)?.[1] ?? 1);
      const sizeMatch = /^Page size:\s+([\d.]+)\s+x\s+([\d.]+)\s+pts/m.exec(stdout);
      return {
        pages: Number.isFinite(pages) && pages > 0 ? pages : 1,
        width: sizeMatch ? Number(sizeMatch[1]) : null,
        height: sizeMatch ? Number(sizeMatch[2]) : null
      };
    } catch {
      throw new InternalServerErrorException('Não foi possível ler as informações do PDF.');
    }
  }

  /** Renders a PDF page through a shared link after validating the token scope. */
  async renderSharedPdfPage(token: string, id: string, pageInput: string): Promise<Buffer> {
    const { item, path } = await this.getSharedDownload(token, id);
    this.assertPdf(item);

    const page = Number(pageInput);
    if (!Number.isInteger(page) || page < 1) throw new BadRequestException('Página inválida.');
    return this.pdfPage(item, path, page);
  }

  private pdfDpi(): number {
    const value = Number(process.env.PDF_RENDER_DPI ?? DEFAULT_PDF_RENDER_DPI);
    if (!Number.isFinite(value)) return DEFAULT_PDF_RENDER_DPI;
    return Math.min(180, Math.max(72, Math.round(value)));
  }

  private pdfBufferLimit(): number {
    const value = Number(process.env.PDF_RENDER_MAX_BUFFER_MB ?? DEFAULT_PDF_RENDER_MAX_BUFFER_MB);
    if (!Number.isFinite(value)) return DEFAULT_PDF_RENDER_MAX_BUFFER_MB * 1024 * 1024;
    return Math.min(256, Math.max(16, Math.round(value))) * 1024 * 1024;
  }

  private pdfCacheKey(item: DriveItem, page: number, dpi: number): string {
    return createHash('sha256')
      .update([item.id, item.checksum ?? '', item.updatedAt, item.size, page, dpi].join('|'))
      .digest('hex');
  }

  private async pdfPage(item: DriveItem, path: string, page: number): Promise<Buffer> {
    const dpi = this.pdfDpi();
    const key = this.pdfCacheKey(item, page, dpi);
    const cachePath = join(this.pdfCacheDir, `${key}.png`);
    const cached = await readFile(cachePath).catch(() => null);
    if (cached) return cached;

    const current = this.pdfPageRenders.get(key);
    if (current) return current;

    const render = this.renderPdf(path, page, dpi)
      .then(async (buffer) => {
        await mkdir(this.pdfCacheDir, { recursive: true });
        await writeFile(cachePath, buffer).catch(() => undefined);
        return buffer;
      })
      .finally(() => {
        this.pdfPageRenders.delete(key);
      });

    this.pdfPageRenders.set(key, render);
    return render;
  }

  private async renderPdf(path: string, page: number, dpi: number): Promise<Buffer> {
    try {
      await this.ensurePdfTool('pdftocairo');
      const { stdout } = await execFileAsync(
        'pdftocairo',
        ['-png', '-singlefile', '-f', String(page), '-l', String(page), '-r', String(dpi), path, '-'],
        { encoding: 'buffer', maxBuffer: this.pdfBufferLimit() }
      );
      return Buffer.from(stdout as Buffer);
    } catch {
      throw new InternalServerErrorException('Não foi possível renderizar a página do PDF.');
    }
  }

  /** Resolves a download target for the shared root or one of its descendants. */
  async getSharedDownload(token: string, itemId?: string): Promise<{ item: DriveItem; path: string }> {
    const library = await this.readLibrary();
    const root = this.sharedRootForToken(library, token);
    const item = itemId
      ? library.items.find((current) => current.id === itemId && !current.trashed && !current.spam)
      : root;
    if (!item || !this.isWithinSharedRoot(library, root, item)) {
      throw new ForbiddenException('Você não tem permissão para acessar este item.');
    }
    return this.downloadTarget(item);
  }

  /** Rejects non-PDF items before invoking external PDF tools. */
  private assertPdf(item: DriveItem) {
    const extension = item.extension?.toLowerCase();
    if (item.type !== 'file' || (item.mimeType !== 'application/pdf' && extension !== 'pdf')) {
      throw new BadRequestException('Item não é um PDF.');
    }
  }

  /** Limits inline text editing to formats that can be safely rewritten as UTF-8 text. */
  private assertTextEditable(item: DriveItem) {
    const extension = item.extension?.toLowerCase();
    const editableExtensions = [
      'txt',
      'md',
      'log',
      'csv',
      'json',
      'xml',
      'html',
      'css',
      'js',
      'ts',
      'svelte',
      'env',
      'ini',
      'yml',
      'yaml'
    ];
    if (
      item.type !== 'file' ||
      (!item.mimeType?.startsWith('text/') && !editableExtensions.includes(extension ?? ''))
    ) {
      throw new BadRequestException('Este arquivo não pode ser editado como texto.');
    }
  }

  /** Ensures ONLYOFFICE only receives document formats it can edit reliably. */
  private assertOfficeEditable(item: DriveItem): void {
    if (item.type !== 'file' || !item.storageKey) {
      throw new BadRequestException('Item não é um arquivo Office.');
    }
    if (!this.officeDocumentType(item)) {
      throw new BadRequestException('Este formato não é compatível com o editor Office.');
    }
  }

  /** Maps file extensions and MIME hints to ONLYOFFICE document families. */
  private officeDocumentType(item: DriveItem): OfficeDocumentType | null {
    const extension = (item.extension || extname(item.name).replace('.', '')).toLowerCase();
    const mime = (item.mimeType ?? '').toLowerCase();
    if (
      [
        'doc',
        'docx',
        'docm',
        'dot',
        'dotx',
        'odt',
        'ott',
        'rtf',
        'fodt',
        'html',
        'htm'
      ].includes(extension) ||
      mime.includes('word') ||
      mime.includes('opendocument.text') ||
      mime.includes('vnd.google-apps.document')
    ) {
      return 'word';
    }
    if (
      ['xls', 'xlsx', 'xlsm', 'xlsb', 'xlt', 'xltx', 'ods', 'ots', 'fods', 'csv'].includes(extension) ||
      mime.includes('spreadsheet') ||
      mime.includes('excel') ||
      mime.includes('vnd.google-apps.spreadsheet')
    ) {
      return 'cell';
    }
    if (
      ['ppt', 'pptx', 'pptm', 'pps', 'ppsx', 'pot', 'potx', 'odp', 'otp', 'fodp'].includes(extension) ||
      mime.includes('presentation') ||
      mime.includes('powerpoint') ||
      mime.includes('vnd.google-apps.presentation')
    ) {
      return 'slide';
    }
    return null;
  }

  /** Reads and normalizes the browser-facing ONLYOFFICE server URL. */
  private onlyOfficeDocumentServerUrl(): string | null {
    const value = process.env.ONLYOFFICE_DOCUMENT_SERVER_URL?.trim().replace(/\/+$/, '');
    return value || null;
  }

  /** Centralizes the ticket secret so all generated file URLs share one signing key. */
  private fileAccessTicketSecret(): string {
    return (
      process.env.RIDE_ACCESS_TICKET_SECRET?.trim() ||
      process.env.ONLYOFFICE_JWT_SECRET?.trim() ||
      'ride-dev-ticket-secret'
    );
  }

  /** Gives Office callbacks longer ticket lifetimes than previews and downloads. */
  private fileAccessTicketTtl(scope: FileAccessScope): number {
    return scope === 'office-download' || scope === 'office-callback'
      ? OFFICE_ACCESS_TICKET_TTL_MS
      : FILE_ACCESS_TICKET_TTL_MS;
  }

  /** Signs file-access payloads with HMAC so URLs do not require session cookies. */
  private signFileAccessTicket(encodedPayload: string): string {
    return createHmac('sha256', this.fileAccessTicketSecret()).update(encodedPayload).digest('base64url');
  }

  /** Verifies ticket signatures with timing-safe comparison to avoid oracle leaks. */
  private verifyFileAccessTicketSignature(encodedPayload: string, signature: string): boolean {
    const expected = this.signFileAccessTicket(encodedPayload);
    const actualBuffer = Buffer.from(signature);
    const expectedBuffer = Buffer.from(expected);
    return actualBuffer.length === expectedBuffer.length && timingSafeEqual(actualBuffer, expectedBuffer);
  }

  /** Enables ONLYOFFICE JWT only when explicitly configured. */
  private onlyOfficeJwtEnabled(): boolean {
    return process.env.ONLYOFFICE_JWT_ENABLED === 'true';
  }

  /** Reads the ONLYOFFICE JWT secret used to sign editor configuration. */
  private onlyOfficeJwtSecret(): string {
    return process.env.ONLYOFFICE_JWT_SECRET?.trim() || 'ride-dev-secret';
  }

  /** Produces the compact JWT format expected by ONLYOFFICE document server. */
  private signOnlyOfficeConfig(config: Record<string, unknown>): string {
    const header = { alg: 'HS256', typ: 'JWT' };
    const payload = {
      ...config,
      iat: Math.floor(Date.now() / 1000)
    };
    const encodedHeader = base64UrlJson(header);
    const encodedPayload = base64UrlJson(payload);
    const signature = createHmac('sha256', this.onlyOfficeJwtSecret())
      .update(`${encodedHeader}.${encodedPayload}`)
      .digest('base64url');
    return `${encodedHeader}.${encodedPayload}.${signature}`;
  }

  /** Builds the complete ONLYOFFICE config while hiding Ride-specific storage paths. */
  private officeEditorConfig(
    item: DriveItem,
    options: {
      fileUrl: string;
      callbackUrl: string;
      mode: OfficeMode;
      userId: string;
      userName: string;
    }
  ): Record<string, unknown> {
    const extension = (item.extension || extname(item.name).replace('.', '') || 'docx').toLowerCase();
    const documentType = this.officeDocumentType(item) ?? 'word';
    const canEdit = options.mode === 'edit';
    const config: Record<string, unknown> = {
      documentType,
      width: '100%',
      height: '100%',
      document: {
        fileType: extension,
        key: this.officeDocumentKey(item),
        title: item.name,
        url: options.fileUrl,
        permissions: {
          chat: false,
          comment: canEdit,
          copy: true,
          download: true,
          edit: canEdit,
          fillForms: canEdit,
          modifyContentControl: canEdit,
          modifyFilter: canEdit,
          print: true,
          review: canEdit
        }
      },
      editorConfig: {
        callbackUrl: options.callbackUrl,
        lang: 'pt-BR',
        mode: options.mode,
        user: {
          id: options.userId,
          name: options.userName
        },
        customization: {
          autosave: true,
          compactToolbar: false,
          forcesave: true,
          hideRightMenu: false,
          toolbarNoTabs: false
        }
      }
    };
    return this.onlyOfficeJwtEnabled() ? { ...config, token: this.signOnlyOfficeConfig(config) } : config;
  }

  /** Creates a stable editor cache key that changes when the file content changes. */
  private officeDocumentKey(item: DriveItem): string {
    return createHash('sha256')
      .update([item.id, item.checksum ?? '', item.updatedAt, item.size].join(':'))
      .digest('hex');
  }

  /** Bounds callback downloads so a compromised editor cannot stream unbounded data. */
  private officeCallbackMaxBytes(): number {
    const configured = Number(process.env.OFFICE_CALLBACK_MAX_BYTES ?? DEFAULT_OFFICE_CALLBACK_MAX_BYTES);
    return Number.isFinite(configured) && configured > 0 ? configured : DEFAULT_OFFICE_CALLBACK_MAX_BYTES;
  }

  /** Builds the callback host allow-list from defaults, env, and the configured document server. */
  private officeCallbackAllowedHosts(): Set<string> {
    const hosts = new Set(['onlyoffice', 'ride-onlyoffice', 'api', 'ride-api', 'localhost', '127.0.0.1', '::1']);
    const configured = process.env.ONLYOFFICE_CALLBACK_ALLOWED_HOSTS ?? '';
    for (const host of configured.split(',').map((value) => value.trim()).filter(Boolean)) {
      hosts.add(host);
    }
    const documentServerUrl = this.onlyOfficeDocumentServerUrl();
    if (documentServerUrl) {
      try {
        hosts.add(new URL(documentServerUrl).hostname);
      } catch {
        // Invalid document-server URLs are handled when the editor config is requested.
      }
    }
    return hosts;
  }

  /** Blocks callback URLs outside the configured ONLYOFFICE/API trust boundary. */
  private assertOfficeCallbackUrlAllowed(value: string): void {
    let parsed: URL;
    try {
      parsed = new URL(value);
    } catch {
      throw new BadRequestException('URL de retorno do ONLYOFFICE inválida.');
    }
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      throw new BadRequestException('URL de retorno do ONLYOFFICE inválida.');
    }
    if (!this.officeCallbackAllowedHosts().has(parsed.hostname)) {
      throw new BadRequestException('Host de retorno do ONLYOFFICE não permitido.');
    }
  }

  /** Reads callback downloads incrementally while enforcing the same byte limit throughout. */
  private async readOfficeCallbackBuffer(response: Response): Promise<Buffer> {
    const limit = this.officeCallbackMaxBytes();
    const contentLength = Number(response.headers.get('content-length') ?? 0);
    if (contentLength > limit) throw new BadRequestException('Arquivo editado excede o limite permitido.');
    if (!response.body) return Buffer.alloc(0);

    const chunks: Buffer[] = [];
    let total = 0;
    for await (const chunk of response.body as unknown as AsyncIterable<Uint8Array>) {
      const buffer = Buffer.from(chunk);
      total += buffer.length;
      if (total > limit) throw new BadRequestException('Arquivo editado excede o limite permitido.');
      chunks.push(buffer);
    }
    return Buffer.concat(chunks, total);
  }

  /** Downloads edited Office content, rewrites the object atomically, and records an edit event. */
  private async saveOfficeCallbackContent(options: {
    itemId: string;
    url: string;
    updatedById: string | null;
    assertWritable: (library: DriveLibrary, item: DriveItem) => void;
  }): Promise<DriveItem> {
    await this.ensureStorage();
    return this.withMutation(async () => {
      const library = await this.readLibrary();
      const item = library.items.find((current) => current.id === options.itemId && !current.trashed && !current.spam);
      if (!item) throw new NotFoundException('Item não encontrado.');
      options.assertWritable(library, item);
      this.assertOfficeEditable(item);

      this.assertOfficeCallbackUrlAllowed(options.url);
      const response = await fetch(options.url);
      if (!response.ok) throw new BadRequestException('Não foi possível baixar o arquivo editado.');
      const buffer = await this.readOfficeCallbackBuffer(response);
      this.assertQuotaDelta(library, item.ownerId, item.size, buffer.length);
      await this.assertDiskHasSpace(Math.max(0, buffer.length - item.size));

      const destination = join(this.filesDir, item.storageKey as string);
      const tempPath = join(this.tempDir, `${randomUUID()}.office-save`);
      await writeFile(tempPath, buffer);
      await rename(tempPath, destination);
      item.size = buffer.length;
      item.checksum = createHash('sha256').update(buffer).digest('hex');
      item.mimeType = lookup(item.name) || item.mimeType || 'application/octet-stream';
      const now = new Date().toISOString();
      const actorId = options.updatedById ?? item.ownerId;
      item.updatedAt = now;
      item.updatedById = actorId;
      this.appendActivity(library, item, 'edited', actorId, { size: item.size }, now);

      await this.writeLibrary(library);
      return item;
    });
  }

  /** Resolves the stored object path for file downloads and rejects folders early. */
  private async downloadTarget(item: DriveItem): Promise<{ item: DriveItem; path: string }> {
    if (item.type !== 'file' || !item.storageKey) throw new BadRequestException('Item não é um arquivo.');
    const path = join(this.filesDir, item.storageKey);
    await stat(path);
    return { item, path };
  }

  createReadStream(path: string, options?: Parameters<typeof createReadStream>[1]) {
    return createReadStream(path, options);
  }

  /** Streams file content into SHA-256 so large objects do not need to be buffered. */
  private async sha256File(path: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const hash = createHash('sha256');
      const stream = createReadStream(path);
      stream.on('data', (chunk) => hash.update(chunk));
      stream.on('error', reject);
      stream.on('end', () => resolve(hash.digest('hex')));
    });
  }

  /** Lists stored object names for audits while tolerating a missing storage directory. */
  private async objectNames(): Promise<string[]> {
    try {
      const entries = await readdir(this.filesDir, { withFileTypes: true });
      return entries.filter((entry) => entry.isFile()).map((entry) => entry.name);
    } catch {
      return [];
    }
  }

  /** Refuses writes that would violate the configured free-space reserve. */
  private async assertDiskHasSpace(incomingBytes: number): Promise<void> {
    const stats = await statfs(this.dataDir);
    const available = Number(stats.bavail) * Number(stats.bsize);
    const reserve = this.minFreeBytes();
    if (available - Math.max(0, incomingBytes) < reserve) {
      throw new BadRequestException(
        `Espaço em disco insuficiente. Mantenha pelo menos ${this.formatBytes(reserve)} livres.`
      );
    }
  }

  /** Reads the free-space reserve from env with a conservative local default. */
  private minFreeBytes(): number {
    const configured = Number(process.env.RIDE_MIN_FREE_BYTES ?? DEFAULT_MIN_FREE_BYTES);
    return Number.isFinite(configured) && configured > 0 ? configured : DEFAULT_MIN_FREE_BYTES;
  }

  private formatBytes(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    const units = ['KB', 'MB', 'GB', 'TB'];
    let value = bytes / 1024;
    let index = 0;
    while (value >= 1024 && index < units.length - 1) {
      value /= 1024;
      index += 1;
    }
    return `${value.toFixed(value >= 10 ? 0 : 1)} ${units[index]}`;
  }

  /** Converts the library settings into the admin API response shape. */
  private settingsResponse(library: DriveLibrary): SettingsResponse {
    return {
      trashRetentionDays: library.trashRetentionDays ?? DEFAULT_TRASH_RETENTION_DAYS,
      backupSchedule: this.normalizeBackupSchedule(library.backupSchedule)
    };
  }

  /** Applies Ride's default backup cadence and retention when old metadata lacks those fields. */
  private normalizeBackupSchedule(input?: Partial<BackupScheduleSettings>): BackupScheduleSettings {
    return this.normalizeSchedule(input, DEFAULT_BACKUP_INTERVAL_HOURS, DEFAULT_BACKUP_RETENTION_COUNT);
  }

  /** Normalizes schedule values from persisted JSON or admin input into bounded integers and paths. */
  private normalizeSchedule(
    input: Partial<BackupScheduleSettings> | undefined,
    defaultIntervalHours: number,
    defaultRetentionCount: number
  ): BackupScheduleSettings {
    const intervalHours = Number(input?.intervalHours ?? defaultIntervalHours);
    const retentionCount = Number(input?.retentionCount ?? defaultRetentionCount);
    const lastStatus =
      input?.lastStatus === 'ok' || input?.lastStatus === 'error' ? input.lastStatus : 'never';
    const directory = this.normalizeBackupDirectory(input?.directory);

    return {
      enabled: input?.enabled ?? false,
      intervalHours: Number.isFinite(intervalHours)
        ? Math.max(1, Math.min(24 * 30, Math.floor(intervalHours)))
        : defaultIntervalHours,
      retentionCount: Number.isFinite(retentionCount)
        ? Math.max(1, Math.min(365, Math.floor(retentionCount)))
        : defaultRetentionCount,
      directory,
      targetPaths: this.normalizeBackupTargetPaths(input?.targetPaths ?? [], directory),
      lastRunAt: input?.lastRunAt ?? null,
      lastStatus,
      lastError: input?.lastError ?? null
    };
  }

  /** Resolves the primary backup directory, falling back to the original local data path. */
  private normalizeBackupDirectory(path?: string | null): string {
    const value = typeof path === 'string' ? path.trim() : '';
    const normalized = resolve(value || this.backupsDir);
    const configuredHostDirectory = process.env.RIDE_BACKUP_DIR?.trim();
    if (normalized === resolve(this.legacyBackupsDir)) return resolve(this.backupsDir);
    if (configuredHostDirectory && normalized === resolve(configuredHostDirectory)) return resolve(this.backupsDir);
    return normalized;
  }

  /** Normalizes mirror paths and removes duplicates of primary or legacy backup directories. */
  private normalizeBackupTargetPaths(paths: string[], backupDirectory = this.backupsDir): string[] {
    const primaryDirectory = resolve(backupDirectory);
    const defaultDirectory = resolve(this.backupsDir);
    const legacyDirectory = resolve(this.legacyBackupsDir);
    const normalized = paths
      .map((path) => (typeof path === 'string' ? path.trim() : ''))
      .filter(Boolean)
      .map((path) => resolve(path));
    return Array.from(new Set(normalized)).filter(
      (path) => path !== primaryDirectory && path !== defaultDirectory && path !== legacyDirectory
    );
  }

  /** Starts the lightweight scheduler once per process for automatic full backups. */
  private startBackupScheduler(): void {
    if (this.backupScheduler) return;
    this.backupScheduler = setInterval(
      () => void this.runScheduledBackupIfDue(),
      BACKUP_SCHEDULER_INTERVAL_MS
    );
    this.backupScheduler.unref?.();
    void this.runScheduledBackupIfDue();
  }

  /** Checks persisted backup state and performs an automatic backup only when due. */
  private async runScheduledBackupIfDue(): Promise<void> {
    await this.withMutation(async () => {
      const library = await this.readLibrary();
      if (!library.users.length) return;

      const backupChanged = await this.runScheduledDatabaseBackup(library);
      if (backupChanged) await this.writeLibrary(library);
    });
  }

  /** Runs the automatic backup mutation and records success or failure back into settings. */
  private async runScheduledDatabaseBackup(library: DriveLibrary): Promise<boolean> {
    const schedule = this.normalizeBackupSchedule(library.backupSchedule);
    library.backupSchedule = schedule;
    if (!this.scheduleDue(schedule)) return false;

    try {
      const artifact = await this.createDatabaseBackup('auto', library, schedule);
      library.backupSchedule = {
        ...schedule,
        lastRunAt: artifact.createdAt,
        lastStatus: 'ok',
        lastError: null
      };
      this.notifyAdmins(library, {
        type: 'backup',
        title: 'Backup concluído',
        message: 'Backup automático efetuado pelo Ride.',
        createdAt: artifact.createdAt
      });
      await this.pruneBackups(schedule.retentionCount, schedule);
    } catch (error) {
      library.backupSchedule = {
        ...schedule,
        lastStatus: 'error',
        lastError: error instanceof Error ? error.message : 'Falha no backup automático.'
      };
    }
    return true;
  }

  /** Decides whether enough time has elapsed since the last automatic backup. */
  private scheduleDue(schedule: BackupScheduleSettings): boolean {
    if (!schedule.enabled) return false;
    const lastRunMs = schedule.lastRunAt ? new Date(schedule.lastRunAt).getTime() : 0;
    const intervalMs = schedule.intervalHours * 60 * 60 * 1000;
    return !Number.isFinite(lastRunMs) || lastRunMs <= 0 || Date.now() - lastRunMs >= intervalMs;
  }

  /** Creates a complete archive containing SQLite metadata, stored objects, and a manifest. */
  private async createDatabaseBackup(
    kind: 'manual' | 'auto',
    library: DriveLibrary,
    schedule: BackupScheduleSettings
  ): Promise<MaintenanceArtifact> {
    await this.ensureStorage();
    const backupDirectory = this.normalizeBackupDirectory(schedule.directory);
    await mkdir(backupDirectory, { recursive: true });

    const createdAt = new Date().toISOString();
    const id = `${kind}-${this.artifactId(createdAt)}-${randomBytes(3).toString('hex')}`;
    const archivePath = join(backupDirectory, `ride-full-${id}.tar.gz`);
    const stagingDir = await mkdtemp(join(this.tempDir, 'backup-build-'));
    const stagingObjectsDir = join(stagingDir, 'objects');
    await mkdir(stagingObjectsDir, { recursive: true });

    this.store.backupTo(join(stagingDir, 'ride.sqlite'));
    const referencedObjects = this.libraryStorageKeys(library);
    const checksumByStorageKey = new Map(
      library.items
        .filter((item) => item.type === 'file' && item.storageKey && item.checksum)
        .map((item) => [item.storageKey as string, item.checksum as string])
    );
    const manifestObjects: BackupArchiveManifest['objects'] = [];

    try {
      for (let index = 0; index < referencedObjects.length; index += 1) {
        const storageKey = referencedObjects[index];
        if (basename(storageKey) !== storageKey) throw new BadRequestException('Backup contém chave inválida.');
        const source = join(this.filesDir, storageKey);
        const destination = join(stagingObjectsDir, storageKey);
        const info = await stat(source).catch(() => null);
        if (!info?.isFile()) throw new BadRequestException(`Backup incompleto: objeto ausente ${storageKey}.`);
        await this.linkBackupObject(source, destination);
        manifestObjects.push({
          storageKey,
          bytes: info.size,
          sha256: checksumByStorageKey.get(storageKey) ?? null
        });
        if (index > 0 && index % 100 === 0) await this.yieldToEventLoop();
      }

      const manifest: BackupArchiveManifest = {
        format: 'ride-full-backup',
        version: 1,
        id,
        kind,
        createdAt,
        database: 'ride.sqlite',
        objectDirectory: 'objects',
        userCount: library.users.length,
        itemCount: library.items.length,
        sessionCount: library.sessions.length,
        objects: manifestObjects
      };
      await writeFile(join(stagingDir, 'manifest.json'), JSON.stringify(manifest, null, 2), 'utf8');
      await this.createLightweightTarArchive(stagingDir, archivePath);
      await this.mirrorBackupArchive(archivePath, schedule);
      const info = await stat(archivePath);
      return { id, path: archivePath, bytes: info.size, createdAt };
    } finally {
      await rm(stagingDir, { recursive: true, force: true }).catch(() => undefined);
    }
  }

  /** Copies the primary archive to configured mirror targets after the main backup succeeds. */
  private async mirrorBackupArchive(archivePath: string, schedule: BackupScheduleSettings): Promise<void> {
    const filename = basename(archivePath);
    for (const directory of schedule.targetPaths) {
      await mkdir(directory, { recursive: true });
      await copyFile(archivePath, join(directory, filename));
    }
  }

  /** Hard-links objects when possible and falls back to copying across filesystems. */
  private async linkBackupObject(source: string, destination: string): Promise<void> {
    try {
      await link(source, destination);
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code !== 'EXDEV' && code !== 'EPERM' && code !== 'EACCES') throw error;
      await copyFile(source, destination);
    }
  }

  /** Uses the system tar implementation to build archives without pulling files into JS memory. */
  private async createLightweightTarArchive(stagingDir: string, archivePath: string): Promise<void> {
    const tarArgs = [
      '-cf',
      archivePath,
      '--use-compress-program=gzip -1',
      '-C',
      stagingDir,
      '.'
    ];
    try {
      await execFileAsync('nice', ['-n', '19', 'tar', ...tarArgs], { maxBuffer: 1024 * 1024 });
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code !== 'ENOENT') throw error;
      await execFileAsync('tar', tarArgs, { maxBuffer: 1024 * 1024 });
    }
  }

  /** Gives Node a scheduling break during large backup/audit loops. */
  private async yieldToEventLoop(): Promise<void> {
    await new Promise<void>((resolve) => setImmediate(resolve));
  }

  /** Deletes older backup artifacts independently in every known backup directory. */
  private async pruneBackups(retentionCount: number, schedule: BackupScheduleSettings): Promise<void> {
    const keep = Math.max(1, Math.min(365, Math.floor(retentionCount)));
    await Promise.all(
      this.backupDirectories(schedule).map(async (directory) => {
        const backups = await this.listArtifacts(directory, Number.POSITIVE_INFINITY);
        await Promise.all(backups.slice(keep).map((backup) => rm(backup.path, { force: true })));
      })
    );
  }

  /** Finds one backup artifact by id or returns a consistent not-found error. */
  private async findArtifact(id: string, schedule?: BackupScheduleSettings): Promise<MaintenanceArtifact> {
    const artifacts = await this.findBackupArtifacts(schedule ?? this.normalizeBackupSchedule(), id);
    const artifact = artifacts[0];
    if (!artifact) throw new NotFoundException('Backup não encontrado.');
    return artifact;
  }

  /** Finds all copies of a backup id across primary, legacy, and mirror directories. */
  private async findBackupArtifacts(
    schedule: BackupScheduleSettings,
    id: string
  ): Promise<MaintenanceArtifact[]> {
    if (!/^[a-z0-9_.-]+$/i.test(id)) throw new NotFoundException('Backup não encontrado.');
    const artifacts = await this.listBackupArtifacts(schedule, Number.POSITIVE_INFINITY);
    return artifacts.filter((entry) => entry.id === id);
  }

  /** Restores a full backup only after extracting, validating, and verifying all referenced objects. */
  private async restoreFullBackupArchive(archivePath: string): Promise<void> {
    await this.ensureStorage();
    const stagingDir = await mkdtemp(join(this.tempDir, 'backup-restore-'));
    try {
      const compression = await this.inspectBackupArchive(archivePath);
      const extractFlag = compression === 'xz' ? '-xJf' : '-xzf';
      await execFileAsync('tar', [extractFlag, archivePath, '-C', stagingDir], {
        maxBuffer: 50 * 1024 * 1024
      });
      const manifest = await this.readBackupManifest(stagingDir);
      const restored = this.store.readLibraryFrom(join(stagingDir, manifest.database));
      if (!restored) throw new BadRequestException('Backup inválido ou vazio.');

      await this.verifyBackupObjects(restored, stagingDir, manifest);
      await rm(this.filesDir, { recursive: true, force: true });
      await mkdir(this.filesDir, { recursive: true });
      await this.copyRestoredObjects(restored, stagingDir);
      await this.writeLibrary(restored);
    } finally {
      await rm(stagingDir, { recursive: true, force: true }).catch(() => undefined);
    }
  }

  /** Detects supported archive compression and rejects unsafe tar entries before restore. */
  private async inspectBackupArchive(archivePath: string): Promise<BackupArchiveCompression> {
    const attempts: Array<{ compression: BackupArchiveCompression; flag: '-tJf' | '-tzf' }> = [
      { compression: 'xz', flag: '-tJf' },
      { compression: 'gzip', flag: '-tzf' }
    ];

    for (const attempt of attempts) {
      try {
        const { stdout } = await execFileAsync('tar', [attempt.flag, archivePath], {
          maxBuffer: 50 * 1024 * 1024
        });
        this.validateBackupArchiveEntries(stdout.split('\n').filter(Boolean));
        return attempt.compression;
      } catch {
        // Try the next compression format.
      }
    }

    throw new BadRequestException('Backup inválido. Use um arquivo .tar.xz ou .tar.gz criado pelo Ride.');
  }

  /** Prevents absolute paths or parent traversal from escaping the restore staging directory. */
  private validateBackupArchiveEntries(entries: string[]): void {
    for (const entry of entries) {
      const clean = entry.replace(/^\.\//, '');
      if (!clean) continue;
      if (entry.startsWith('/') || clean.split('/').includes('..')) {
        throw new BadRequestException('Backup contém caminhos inseguros.');
      }
    }
  }

  /** Reads the backup manifest and accepts legacy names only where compatibility is intentional. */
  private async readBackupManifest(stagingDir: string): Promise<BackupArchiveManifest> {
    try {
      const manifest = JSON.parse(await readFile(join(stagingDir, 'manifest.json'), 'utf8'));
      if (
        !['ride-full-backup', 'newdrive-full-backup'].includes(manifest?.format) ||
        manifest.version !== 1 ||
        !['ride.sqlite', 'drive.sqlite'].includes(manifest.database) ||
        manifest.objectDirectory !== 'objects' ||
        !Array.isArray(manifest.objects)
      ) {
        throw new Error('invalid-manifest');
      }
      return manifest as BackupArchiveManifest;
    } catch {
      throw new BadRequestException('Manifesto de backup ausente ou inválido.');
    }
  }

  /** Confirms every object referenced by restored metadata exists and matches manifest checks. */
  private async verifyBackupObjects(
    library: DriveLibrary,
    stagingDir: string,
    manifest: BackupArchiveManifest
  ): Promise<void> {
    const manifestObjects = new Map(manifest.objects.map((object) => [object.storageKey, object]));
    const storageKeys = this.libraryStorageKeys(library);

    for (const storageKey of storageKeys) {
      if (basename(storageKey) !== storageKey) throw new BadRequestException('Backup contém chave inválida.');
      const source = join(stagingDir, manifest.objectDirectory, storageKey);
      const info = await stat(source).catch(() => null);
      if (!info?.isFile()) throw new BadRequestException(`Backup incompleto: objeto ausente ${storageKey}.`);
      const objectManifest = manifestObjects.get(storageKey);
      if (objectManifest) {
        if (objectManifest.bytes !== info.size) {
          throw new BadRequestException(`Backup corrompido: tamanho divergente em ${storageKey}.`);
        }
        if (objectManifest.sha256) {
          const actualSha256 = await this.sha256File(source);
          if (objectManifest.sha256 !== actualSha256) {
            throw new BadRequestException(`Backup corrompido: hash divergente em ${storageKey}.`);
          }
        }
      }
    }
  }

  /** Copies verified objects from the restore staging area into active storage. */
  private async copyRestoredObjects(library: DriveLibrary, stagingDir: string): Promise<void> {
    for (const storageKey of this.libraryStorageKeys(library)) {
      await copyFile(join(stagingDir, 'objects', storageKey), join(this.filesDir, storageKey));
    }
  }

  /** Returns the unique object keys that are still referenced by file items. */
  private libraryStorageKeys(library: DriveLibrary): string[] {
    return Array.from(
      new Set(
        library.items
          .filter((item) => item.type === 'file' && item.storageKey)
          .map((item) => item.storageKey as string)
      )
    );
  }

  /** Converts timestamps into filesystem-safe artifact id segments. */
  private artifactId(value = new Date().toISOString()): string {
    return value.replace(/[:.]/g, '-');
  }

  /** Lists backup archive files in one directory and derives metadata from filename and stat data. */
  private async listArtifacts(
    directory: string,
    limit = 12
  ): Promise<MaintenanceArtifact[]> {
    try {
      const entries = await readdir(directory, { withFileTypes: true });
      const artifacts = await Promise.all(
        entries
          .filter((entry) => entry.isFile() && /^(ride|drive)-full-.+\.tar\.(xz|gz)$/.test(entry.name))
          .map(async (entry) => {
            const path = join(directory, entry.name);
            const info = await stat(path);
            return {
              id: entry.name.replace(/^(ride|drive)-full-/, '').replace(/\.tar\.(xz|gz)$/, ''),
              path,
              bytes: info.size,
              createdAt: info.mtime.toISOString()
            };
          })
      );
      const sorted = artifacts.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      return Number.isFinite(limit) ? sorted.slice(0, limit) : sorted;
    } catch {
      return [];
    }
  }

  /** Merges artifacts from all backup locations by id, preferring the newest visible copy. */
  private async listBackupArtifacts(
    schedule: BackupScheduleSettings,
    limit = 12
  ): Promise<MaintenanceArtifact[]> {
    const byId = new Map<string, MaintenanceArtifact>();
    for (const directory of this.backupDirectories(schedule)) {
      const artifacts = await this.listArtifacts(directory, Number.POSITIVE_INFINITY);
      for (const artifact of artifacts) {
        if (!byId.has(artifact.id)) byId.set(artifact.id, artifact);
      }
    }
    const sorted = Array.from(byId.values()).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return Number.isFinite(limit) ? sorted.slice(0, limit) : sorted;
  }

  /** Includes the new primary directory and the legacy directory so old backups remain visible. */
  private backupDirectories(schedule: BackupScheduleSettings): string[] {
    return Array.from(
      new Set([
        this.normalizeBackupDirectory(schedule.directory),
        this.backupsDir,
        this.legacyBackupsDir,
        ...schedule.targetPaths
      ])
    );
  }

  /** Moves multer disk uploads when possible and copies memory uploads when needed. */
  private async persistUploadedFile(file: Express.Multer.File, destination: string): Promise<void> {
    const diskPath = (file as Express.Multer.File & { path?: string }).path;
    if (diskPath) {
      try {
        await rename(diskPath, destination);
      } catch (error) {
        const code = (error as NodeJS.ErrnoException).code;
        if (code !== 'EXDEV') throw error;
        await copyFile(diskPath, destination);
        await rm(diskPath, { force: true });
      }
      return;
    }

    if (file.buffer) {
      await writeFile(destination, file.buffer);
      return;
    }

    throw new BadRequestException('Upload inválido.');
  }

  /** Removes temporary multer files after failed uploads. */
  private async cleanupUploadedTemp(file: Express.Multer.File): Promise<void> {
    const diskPath = (file as Express.Multer.File & { path?: string }).path;
    if (diskPath) await rm(diskPath, { force: true }).catch(() => undefined);
  }

  /** Lazily verifies external PDF tools once per process and shares in-flight checks. */
  private async ensurePdfTool(tool: 'pdfinfo' | 'pdftocairo' | 'pdftotext'): Promise<void> {
    let check = this.pdfToolChecks.get(tool);
    if (!check) {
      check = execFileAsync(tool, ['-v'], { maxBuffer: 64 * 1024 })
        .then(() => undefined)
        .catch(() => {
          throw new InternalServerErrorException(
            `Preview de PDF indisponível: instale o pacote poppler-utils para habilitar ${tool}.`
          );
        });
      this.pdfToolChecks.set(tool, check);
    }
    await check;
  }

  async summary(requesterId: string, ownerIdInput?: string): Promise<StorageSummary> {
    const library = await this.readLibrary();
    const ownerId = this.resolvePersonalOwner(library, requesterId, ownerIdInput);
    const user = this.findUser(library, ownerId);
    const ownedItems = library.items.filter((item) => item.ownerId === ownerId);
    const files = this.storedFilesForOwner(library, ownerId);
    const categoryMap = new Map(
      STORAGE_CATEGORIES.map((category) => [category.id, { ...category, bytes: 0, count: 0 }])
    );
    for (const file of files) {
      const category = categoryMap.get(this.storageCategoryFor(file));
      if (!category) continue;
      category.bytes += file.size;
      category.count += 1;
    }

    return {
      userId: ownerId,
      usedBytes: this.sumFileSizes(files),
      totalBytes: user.storageQuotaBytes,
      fileCount: files.length,
      folderCount: ownedItems.filter((item) => item.type === 'folder').length,
      categories: STORAGE_CATEGORIES.map((category) => categoryMap.get(category.id)!).filter(
        (category) => category.count > 0
      )
    };
  }

  /** Maps files into the storage categories used by the UI summary. */
  private storageCategoryFor(item: DriveItem): StorageCategoryId {
    if (item.trashed) return 'trash';
    const mime = item.mimeType ?? '';
    const ext = (item.extension ?? '').toLowerCase();
    if (mime.includes('pdf') || ext === 'pdf') return 'pdfs';
    if (mime.includes('spreadsheet') || ['xls', 'xlsx', 'csv', 'ods'].includes(ext)) return 'sheets';
    if (
      mime.includes('wordprocessingml') ||
      mime.includes('msword') ||
      mime.startsWith('text/') ||
      ['doc', 'docx', 'odt', 'txt', 'rtf', 'md'].includes(ext)
    )
      return 'docs';
    if (['zip', 'rar', '7z', 'tar', 'gz', 'bz2'].includes(ext)) return 'archives';
    if (
      mime.startsWith('image/') ||
      ['jpg', 'jpeg', 'jpe', 'jfif', 'pjpeg', 'pjp', 'png', 'gif', 'webp', 'bmp', 'dib', 'svg', 'svgz', 'tif', 'tiff', 'ico', 'heic', 'heif', 'avif'].includes(ext)
    )
      return 'images';
    if (mime.startsWith('video/')) return 'videos';
    return 'other';
  }

  /** Evaluates whether an item belongs to the requested navigation section. */
  private matchesSection(
    library: DriveLibrary,
    item: DriveItem,
    ownerId: string,
    section: NonNullable<ListFilesQueryDto['section']>,
    parentId: string | null,
    search?: string,
    deep = false,
    descendantIds: Set<string> | null = null
  ): boolean {
    const ownsItem = item.ownerId === ownerId;
    const directShareRole = this.directShareRole(item, ownerId);
    const inheritedShareRole = this.shareRoleForItem(library, ownerId, item);
    const sharedWithUser = Boolean(inheritedShareRole);
    const accessible = ownsItem || sharedWithUser;
    if (!accessible) return false;

    if (section === 'trash') return ownsItem && item.trashed;
    if (section === 'spam') return ownsItem && item.spam && !item.trashed;
    if (item.trashed || item.spam) return false;
    if (section === 'starred') return accessible && item.starred;
    if (section === 'recent' || section === 'activity') return accessible;
    if (section === 'storage') return ownsItem && item.type === 'file';
    if ((section === 'shared-with-me' || section === 'shared-drives') && deep) {
      if (ownsItem || !sharedWithUser) return false;
      return parentId ? Boolean(descendantIds?.has(item.id)) : Boolean(directShareRole);
    }
    if (section === 'shared-with-me' || section === 'shared-drives') {
      if (ownsItem || !sharedWithUser) return false;
      return parentId ? item.parentId === parentId : Boolean(directShareRole);
    }
    if (section === 'workspace') return ownsItem && item.type === 'folder';
    if (search) return accessible;
    if (deep && section === 'drive') return ownsItem && (parentId ? Boolean(descendantIds?.has(item.id)) : true);
    if (section === 'drive' && parentId && sharedWithUser) return item.parentId === parentId;
    return ownsItem && item.parentId === parentId;
  }

  /** Runs normal search with exact-name results ranked ahead of content matches. */
  private async applyNormalSearchFilters(
    source: DriveItem[],
    search: string,
    rankLookup: Map<string, number>
  ): Promise<DriveItem[]> {
    const normalizedSearch = this.normalizeSearchText(search);
    const results: DriveItem[] = [];

    for (const item of source) {
      const nameRank = this.nameSearchRank(item, normalizedSearch);
      if (nameRank !== null) {
        rankLookup.set(item.id, nameRank);
        results.push(item);
        continue;
      }
      if (item.type === 'file' && (await this.itemContainsSearchText(item, search))) {
        rankLookup.set(item.id, 3);
        results.push(item);
      }
    }

    return results;
  }

  /** Scores name matches so exact and prefix hits sort before looser title matches. */
  private nameSearchRank(item: DriveItem, normalizedSearch: string): number | null {
    const normalizedName = this.normalizeSearchText(item.name);
    const extension = item.extension ? `.${item.extension}` : extname(item.name);
    const normalizedStem = extension && item.name.toLowerCase().endsWith(extension.toLowerCase())
      ? this.normalizeSearchText(item.name.slice(0, -extension.length))
      : normalizedName;
    if (normalizedName === normalizedSearch || normalizedStem === normalizedSearch) return 0;
    if (normalizedName.startsWith(normalizedSearch) || normalizedStem.startsWith(normalizedSearch)) return 1;
    if (normalizedName.includes(normalizedSearch)) return 2;
    return null;
  }

  /** Detects whether the request should use advanced filters instead of section browsing. */
  private hasAdvancedSearch(query: ListFilesQueryDto): boolean {
    return Boolean(
      query.advanced ||
        (query.itemType && query.itemType !== 'any') ||
        query.advancedOwnerId ||
        query.name?.trim() ||
        query.content?.trim() ||
        (query.location && query.location !== 'any') ||
        query.modifiedAfter ||
        query.modifiedBefore ||
        query.sharedWith?.trim()
    );
  }

  /** Applies advanced search filters across ownership, location, content, dates, and sharing. */
  private async applyAdvancedSearchFilters(
    library: DriveLibrary,
    source: DriveItem[],
    ownerId: string,
    query: ListFilesQueryDto
  ): Promise<DriveItem[]> {
    const nameSearch = query.name?.trim().toLocaleLowerCase('pt-BR') ?? '';
    const contentSearch = query.content?.trim() ?? '';
    const sharedWithSearch = query.sharedWith?.trim().toLocaleLowerCase('pt-BR') ?? '';
    const modifiedAfter = this.parseSearchDate(query.modifiedAfter, false);
    const modifiedBefore = this.parseSearchDate(query.modifiedBefore, true);
    const locationFolderId = this.normalizeParent(query.locationFolderId);
    const locationDescendants =
      query.location === 'folder' && locationFolderId
        ? new Set(this.collectDescendantIds(library, locationFolderId))
        : null;
    const filtered: DriveItem[] = [];

    for (const item of source) {
      if (query.itemType && query.itemType !== 'any' && !this.matchesAdvancedItemType(item, query.itemType)) continue;
      if (query.advancedOwnerId && item.ownerId !== query.advancedOwnerId) continue;
      if (nameSearch && !item.name.toLocaleLowerCase('pt-BR').includes(nameSearch)) continue;
      if (modifiedAfter && new Date(item.updatedAt).getTime() < modifiedAfter.getTime()) continue;
      if (modifiedBefore && new Date(item.updatedAt).getTime() > modifiedBefore.getTime()) continue;
      if (!this.matchesAdvancedLocation(library, item, ownerId, query.location, locationFolderId, locationDescendants)) {
        continue;
      }
      if (sharedWithSearch && !this.matchesSharedWith(library, item, sharedWithSearch)) continue;
      if (contentSearch && !(await this.itemContainsSearchText(item, contentSearch))) continue;
      filtered.push(item);
    }

    return filtered;
  }

  /** Matches Drive-like advanced type buckets against Ride file metadata. */
  private matchesAdvancedItemType(item: DriveItem, itemType: NonNullable<ListFilesQueryDto['itemType']>): boolean {
    if (itemType === 'folder') return item.type === 'folder';
    if (item.type !== 'file') return false;
    if (itemType === 'slides') {
      const ext = (item.extension ?? '').toLowerCase();
      const mime = item.mimeType ?? '';
      return ['ppt', 'pptx', 'pptm', 'pps', 'ppsx', 'odp'].includes(ext) || mime.includes('presentation');
    }
    return this.storageCategoryFor(item) === itemType;
  }

  /** Restricts advanced search to global sections or a specific folder subtree. */
  private matchesAdvancedLocation(
    library: DriveLibrary,
    item: DriveItem,
    ownerId: string,
    location: ListFilesQueryDto['location'],
    locationFolderId: string | null,
    locationDescendants: Set<string> | null
  ): boolean {
    if (!location || location === 'any') return true;
    const ownsItem = item.ownerId === ownerId;
    const sharedWithUser = Boolean(this.shareRoleForItem(library, ownerId, item));
    if (location === 'drive') return ownsItem;
    if (location === 'shared') return !ownsItem && sharedWithUser;
    if (location === 'folder') {
      if (!locationFolderId) return true;
      return item.id === locationFolderId || Boolean(locationDescendants?.has(item.id));
    }
    return true;
  }

  /** Checks whether an item was shared with a user whose name or email matches the query. */
  private matchesSharedWith(library: DriveLibrary, item: DriveItem, search: string): boolean {
    const users = [...item.sharedWith, ...item.sharePermissions.map((permission) => permission.userId)]
      .map((userId) => library.users.find((user) => user.id === userId))
      .filter((user): user is UserAccount => Boolean(user));
    return users.some((user) =>
      `${user.name} ${user.email}`.toLocaleLowerCase('pt-BR').includes(search)
    );
  }

  /** Parses date filters and optionally expands the end date to the end of that day. */
  private parseSearchDate(value: string | undefined, endOfDay: boolean): Date | null {
    if (!value) return null;
    const parsed = new Date(`${value}T${endOfDay ? '23:59:59.999' : '00:00:00.000'}`);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  /** Checks searchable file content without failing the whole search on one bad file. */
  private async itemContainsSearchText(item: DriveItem, search: string): Promise<boolean> {
    if (item.type !== 'file' || !item.storageKey) return false;
    const text = await this.extractSearchText(item);
    if (!text) return false;
    const haystack = this.normalizeSearchText(text);
    const words = this.normalizeSearchText(search)
      .split(/\s+/)
      .map((word) => word.trim())
      .filter(Boolean);
    return words.length > 0 && words.every((word) => haystack.includes(word));
  }

  /** Extracts normalized text from supported stored file types for content search. */
  private async extractSearchText(item: DriveItem): Promise<string> {
    const path = join(this.filesDir, item.storageKey!);
    const ext = (item.extension || extname(item.name).replace('.', '')).toLowerCase();
    const mime = (item.mimeType ?? '').toLowerCase();
    try {
      const info = await stat(path);
      if (mime.includes('pdf') || ext === 'pdf') return this.extractPdfSearchText(path);
      if (this.isOfficeSearchFile(ext, mime)) {
        if (info.size > MAX_SEARCH_OFFICE_FILE_BYTES) return '';
        return this.extractOfficeSearchText(await readFile(path), ext);
      }
      if (mime.startsWith('text/') || ['txt', 'md', 'csv', 'json', 'xml', 'html', 'rtf', 'log'].includes(ext)) {
        if (info.size > MAX_SEARCH_TEXT_FILE_BYTES) return '';
        return (await readFile(path, 'utf8')).slice(0, MAX_SEARCH_EXTRACTED_TEXT);
      }
    } catch {
      return '';
    }
    return '';
  }

  /** Uses pdftotext for PDF content search while bounding output size. */
  private async extractPdfSearchText(path: string): Promise<string> {
    try {
      await this.ensurePdfTool('pdftotext');
      const { stdout } = await execFileAsync('pdftotext', [path, '-'], {
        timeout: 15000,
        maxBuffer: MAX_SEARCH_EXTRACTED_TEXT
      });
      return stdout;
    } catch {
      return '';
    }
  }

  /** Identifies Office-like documents whose zipped XML can be searched locally. */
  private isOfficeSearchFile(ext: string, mime: string): boolean {
    return (
      ['docx', 'dotx', 'xlsx', 'xlsm', 'xltx', 'xltm', 'pptx', 'pptm'].includes(ext) ||
      mime.includes('wordprocessingml') ||
      mime.includes('spreadsheetml') ||
      mime.includes('presentationml')
    );
  }

  /** Extracts readable strings from Office ZIP/XML containers without needing ONLYOFFICE. */
  private extractOfficeSearchText(buffer: Buffer, ext: string): string {
    const chunks: string[] = [];
    const entries = this.officeZipEntries(buffer);
    for (const entry of entries) {
      if (chunks.join(' ').length >= MAX_SEARCH_EXTRACTED_TEXT) break;
      if (!this.isSearchableOfficeEntry(entry.name, ext)) continue;
      try {
        const localHeaderOffset = entry.localHeaderOffset;
        if (buffer.readUInt32LE(localHeaderOffset) !== 0x04034b50) continue;
        const fileNameLength = buffer.readUInt16LE(localHeaderOffset + 26);
        const extraLength = buffer.readUInt16LE(localHeaderOffset + 28);
        const dataStart = localHeaderOffset + 30 + fileNameLength + extraLength;
        const dataEnd = dataStart + entry.compressedSize;
        if (!entry.compressedSize || dataEnd > buffer.length) continue;
        const payload = buffer.subarray(dataStart, dataEnd);
        const textBuffer = entry.method === 0 ? payload : entry.method === 8 ? inflateRawSync(payload) : null;
        if (textBuffer) chunks.push(this.xmlToSearchText(textBuffer.toString('utf8')));
      } catch {
        // Ignore a single corrupt ZIP entry and keep scanning the rest.
      }
    }
    if (chunks.length) return chunks.join(' ').slice(0, MAX_SEARCH_EXTRACTED_TEXT);

    let offset = 0;
    while (offset + 30 < buffer.length && chunks.join(' ').length < MAX_SEARCH_EXTRACTED_TEXT) {
      if (buffer.readUInt32LE(offset) !== 0x04034b50) {
        offset += 1;
        continue;
      }

      const method = buffer.readUInt16LE(offset + 8);
      const compressedSize = buffer.readUInt32LE(offset + 18);
      const fileNameLength = buffer.readUInt16LE(offset + 26);
      const extraLength = buffer.readUInt16LE(offset + 28);
      const nameStart = offset + 30;
      const dataStart = nameStart + fileNameLength + extraLength;
      const dataEnd = dataStart + compressedSize;
      if (!compressedSize || dataEnd > buffer.length) {
        offset = dataStart;
        continue;
      }

      const name = buffer.subarray(nameStart, nameStart + fileNameLength).toString('utf8');
      if (this.isSearchableOfficeEntry(name, ext)) {
        try {
          const payload = buffer.subarray(dataStart, dataEnd);
          const textBuffer = method === 0 ? payload : method === 8 ? inflateRawSync(payload) : null;
          if (textBuffer) chunks.push(this.xmlToSearchText(textBuffer.toString('utf8')));
        } catch {
          // Ignore a single corrupt ZIP entry and keep scanning the rest.
        }
      }
      offset = dataEnd;
    }
    return chunks.join(' ').slice(0, MAX_SEARCH_EXTRACTED_TEXT);
  }

  /** Parses ZIP central directory entries needed for lightweight Office text extraction. */
  private officeZipEntries(buffer: Buffer): Array<{
    name: string;
    method: number;
    compressedSize: number;
    localHeaderOffset: number;
  }> {
    const entries: Array<{ name: string; method: number; compressedSize: number; localHeaderOffset: number }> = [];
    const eocdSearchStart = Math.max(0, buffer.length - 66000);
    let eocdOffset = -1;
    for (let offset = buffer.length - 22; offset >= eocdSearchStart; offset -= 1) {
      if (buffer.readUInt32LE(offset) === 0x06054b50) {
        eocdOffset = offset;
        break;
      }
    }
    if (eocdOffset < 0 || eocdOffset + 22 > buffer.length) return entries;

    const centralDirectorySize = buffer.readUInt32LE(eocdOffset + 12);
    const centralDirectoryOffset = buffer.readUInt32LE(eocdOffset + 16);
    const centralDirectoryEnd = Math.min(buffer.length, centralDirectoryOffset + centralDirectorySize);
    let offset = centralDirectoryOffset;

    while (offset + 46 <= centralDirectoryEnd && buffer.readUInt32LE(offset) === 0x02014b50) {
      const method = buffer.readUInt16LE(offset + 10);
      const compressedSize = buffer.readUInt32LE(offset + 20);
      const fileNameLength = buffer.readUInt16LE(offset + 28);
      const extraLength = buffer.readUInt16LE(offset + 30);
      const commentLength = buffer.readUInt16LE(offset + 32);
      const localHeaderOffset = buffer.readUInt32LE(offset + 42);
      const nameStart = offset + 46;
      const nameEnd = nameStart + fileNameLength;
      if (nameEnd > buffer.length) break;
      entries.push({
        name: buffer.subarray(nameStart, nameEnd).toString('utf8'),
        method,
        compressedSize,
        localHeaderOffset
      });
      offset = nameEnd + extraLength + commentLength;
    }

    return entries;
  }

  /** Keeps only document XML entries likely to contain user-authored text. */
  private isSearchableOfficeEntry(name: string, ext: string): boolean {
    if (!name.endsWith('.xml')) return false;
    if (ext.startsWith('doc')) return /^word\/(document|header\d*|footer\d*|footnotes|endnotes)\.xml$/.test(name);
    if (ext.startsWith('xls')) return /^xl\/(sharedStrings|worksheets\/sheet\d+)\.xml$/.test(name);
    if (ext.startsWith('ppt')) return /^ppt\/slides\/slide\d+\.xml$/.test(name);
    return /^(word|xl|ppt)\//.test(name);
  }

  /** Strips XML markup and entities into text suitable for search indexing. */
  private xmlToSearchText(value: string): string {
    return value
      .replace(/<[^>]+>/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&apos;/g, "'")
      .replace(/\s+/g, ' ');
  }

  /** Collapses extracted text to a lower-case searchable string with bounded length. */
  private normalizeSearchText(value: string): string {
    return value
      .normalize('NFD')
      .replace(/\p{Diacritic}/gu, '')
      .toLocaleLowerCase('pt-BR');
  }

  /** Converts API root sentinels into the null parent representation used in storage. */
  private normalizeParent(parentId?: string | null): string | null {
    return !parentId || parentId === 'root' ? null : parentId;
  }

  /** Resolves an optional owner id and guarantees the account exists. */
  private resolveOwner(library: DriveLibrary, ownerId?: string | null): string {
    const id = ownerId || library.users[0]?.id || DEFAULT_ADMIN_ID;
    this.findUser(library, id);
    return id;
  }

  /** Fetches a user or throws a consistent not-found error. */
  private findUser(library: DriveLibrary, id: string): UserAccount {
    const user = library.users.find((current) => current.id === id);
    if (!user) throw new NotFoundException('Conta não encontrada.');
    return user;
  }

  /** Returns the best human label for a user in activity and notification text. */
  private userDisplayName(user: UserAccount): string {
    return user.name?.trim() || user.email;
  }

  /** Resolves optional user ids into safe labels for audit messages. */
  private userLabel(library: DriveLibrary, userId?: string | null): string {
    if (!userId) return 'Ride';
    const user = library.users.find((current) => current.id === userId);
    return user ? this.userDisplayName(user) : 'Ride';
  }

  /** Adds one notification while keeping each user's history bounded. */
  private addNotification(
    library: DriveLibrary,
    input: Omit<DriveNotification, 'id' | 'readAt' | 'createdAt'> & { createdAt?: string; readAt?: string | null }
  ): void {
    if (!library.users.some((user) => user.id === input.userId)) return;
    const createdAt = input.createdAt || new Date().toISOString();
    const notification: DriveNotification = {
      id: randomUUID(),
      readAt: input.readAt ?? null,
      ...input,
      createdAt
    };
    const notifications = library.notifications ?? [];
    notifications.unshift(notification);
    library.notifications = notifications
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .filter((current, index, all) => {
        const beforeForUser = all.slice(0, index).filter((candidate) => candidate.userId === current.userId).length;
        return beforeForUser < MAX_NOTIFICATIONS_PER_USER;
      });
  }

  /** Fan-outs operational notifications to admins except an optional excluded actor. */
  private notifyAdmins(
    library: DriveLibrary,
    input: Omit<DriveNotification, 'id' | 'userId' | 'readAt' | 'createdAt'> & {
      createdAt?: string;
      excludeUserIds?: string[];
      readAt?: string | null;
    }
  ): void {
    const excluded = new Set(input.excludeUserIds ?? []);
    for (const user of library.users) {
      if (user.role !== 'admin' || excluded.has(user.id)) continue;
      this.addNotification(library, {
        userId: user.id,
        type: input.type,
        title: input.title,
        message: input.message,
        itemId: input.itemId ?? null,
        actorId: input.actorId ?? null,
        readAt: input.readAt ?? null,
        createdAt: input.createdAt
      });
    }
  }

  /** Removes password hashes before any account object leaves the service. */
  private safeUser(user: UserAccount): SafeUserAccount {
    const { passwordHash: _passwordHash, ...safe } = user;
    return safe;
  }

  /** Creates a bearer token and persists only its hash plus normalized device metadata. */
  private createSession(library: DriveLibrary, userId: string, metadata: SessionMetadata = {}): string {
    const token = randomBytes(32).toString('hex');
    const now = Date.now();
    library.sessions = library.sessions.filter(
      (session) => session.expiresAt > now && library.users.some((user) => user.id === session.userId)
    );
    const normalizedMetadata = this.normalizeSessionMetadata(metadata);
    library.sessions.push({
      tokenHash: hashToken(token),
      userId,
      createdAt: new Date(now).toISOString(),
      lastSeenAt: new Date(now).toISOString(),
      metadata: normalizedMetadata,
      expiresAt: now + SESSION_TTL_MS
    });
    return token;
  }

  /** Removes all sessions for an account that is being deleted or reset. */
  private revokeUserSessions(library: DriveLibrary, userId: string): void {
    library.sessions = library.sessions.filter((session) => session.userId !== userId);
  }

  /** Removes a user and cleans up their owned files, shares, sessions, and notifications. */
  private async removeUserFromLibrary(library: DriveLibrary, userId: string): Promise<void> {
    const ownedItemIds = new Set(library.items.filter((item) => item.ownerId === userId).map((item) => item.id));
    for (const itemId of Array.from(ownedItemIds)) {
      for (const descendantId of this.collectDescendantIds(library, itemId)) ownedItemIds.add(descendantId);
    }
    const removedItems = library.items.filter((item) => ownedItemIds.has(item.id));
    library.users = library.users.filter((user) => user.id !== userId);
    library.items = library.items.filter((item) => !ownedItemIds.has(item.id));
    library.items.forEach((item) => {
      if (item.parentId && ownedItemIds.has(item.parentId)) item.parentId = null;
      item.sharedWith = item.sharedWith.filter((id) => id !== userId);
      item.sharePermissions = item.sharePermissions.filter((permission) => permission.userId !== userId);
      item.activity = item.activity.filter((event) => event.actorId !== userId);
      if (item.updatedById === userId) item.updatedById = undefined;
      if (item.openedById === userId) {
        item.openedById = null;
        item.openedAt = null;
      }
    });

    await Promise.allSettled(
      removedItems
        .filter((item) => item.type === 'file' && item.storageKey)
        .map((item) => rm(join(this.filesDir, item.storageKey as string), { force: true }))
    );
    this.revokeUserSessions(library, userId);
  }

  /** Wipes project data after the last account is removed so setup can start from zero. */
  private async resetProjectData(library: DriveLibrary): Promise<void> {
    const schedule = this.normalizeBackupSchedule(library.backupSchedule);
    await this.deleteBackupArtifacts(schedule);
    await Promise.allSettled([
      rm(this.filesDir, { recursive: true, force: true }),
      rm(this.tempDir, { recursive: true, force: true }),
      rm(this.metadataPath, { force: true })
    ]);
    await this.ensureStorage();
    await mkdir(this.backupsDir, { recursive: true });

    library.users = [];
    library.items = [];
    library.sessions = [];
    library.notifications = [];
    library.trashRetentionDays = DEFAULT_TRASH_RETENTION_DAYS;
    library.backupSchedule = this.normalizeBackupSchedule();
  }

  /** Deletes every known backup artifact during a full project reset. */
  private async deleteBackupArtifacts(schedule: BackupScheduleSettings): Promise<void> {
    await Promise.allSettled(
      this.backupDirectories(schedule).map(async (directory) => {
        const artifacts = await this.listArtifacts(directory, Number.POSITIVE_INFINITY);
        await Promise.allSettled(artifacts.map((artifact) => rm(artifact.path, { force: true })));
      })
    );
  }

  /** Normalizes client-provided session metadata and infers missing device details. */
  private normalizeSessionMetadata(metadata: SessionMetadata = {}): Required<SessionMetadata> {
    const inferred = this.inferUserAgent(metadata.userAgent ?? '');
    const deviceType = metadata.deviceType ?? inferred.deviceType;
    return {
      ipAddress: metadata.ipAddress || null,
      userAgent: metadata.userAgent || null,
      browser: metadata.browser || inferred.browser,
      os: metadata.os || inferred.os,
      deviceType,
      language: metadata.language || null,
      country: metadata.country || null,
      region: metadata.region || null,
      city: metadata.city || null,
      latitude: typeof metadata.latitude === 'number' ? metadata.latitude : null,
      longitude: typeof metadata.longitude === 'number' ? metadata.longitude : null,
      network: metadata.network || null,
      isp: metadata.isp || null,
      wifiSsid: metadata.wifiSsid || null
    };
  }

  /** Extracts coarse browser, OS, and device type from a user-agent string. */
  private inferUserAgent(userAgent: string): Pick<Required<SessionMetadata>, 'browser' | 'os' | 'deviceType'> {
    const ua = userAgent.toLowerCase();
    let browser = 'Navegador desconhecido';
    if (ua.includes('edg/')) browser = 'Microsoft Edge';
    else if (ua.includes('opr/') || ua.includes('opera')) browser = 'Opera';
    else if (ua.includes('firefox/')) browser = 'Firefox';
    else if (ua.includes('chrome/') || ua.includes('chromium/')) browser = 'Chrome';
    else if (ua.includes('safari/')) browser = 'Safari';

    let os = 'Dispositivo desconhecido';
    if (ua.includes('windows')) os = 'Windows';
    else if (ua.includes('android')) os = 'Android';
    else if (ua.includes('iphone') || ua.includes('ipad') || ua.includes('ios')) os = 'iOS';
    else if (ua.includes('mac os') || ua.includes('macintosh')) os = 'macOS';
    else if (ua.includes('linux')) os = 'Linux';

    let deviceType: Required<SessionMetadata>['deviceType'] = 'desktop';
    if (ua.includes('ipad') || ua.includes('tablet')) deviceType = 'tablet';
    else if (ua.includes('mobile') || ua.includes('android') || ua.includes('iphone')) deviceType = 'mobile';
    else if (!userAgent) deviceType = 'unknown';

    return { browser, os, deviceType };
  }

  /** Builds the grouped device label shown in security settings. */
  private deviceGroupLabel(deviceType: Required<SessionMetadata>['deviceType'], os: string): string {
    if (deviceType === 'mobile') return `Sessões em smartphones ${os}`;
    if (deviceType === 'tablet') return `Sessões em tablets ${os}`;
    if (deviceType === 'desktop') return `Sessões em computadores ${os}`;
    return `Sessões em ${os}`;
  }

  /** Returns the requester only if they are an administrator. */
  private assertAdmin(library: DriveLibrary, requesterId: string): UserAccount {
    const user = this.findUser(library, requesterId);
    if (user.role !== 'admin') throw new ForbiddenException('Acesso restrito a administradores.');
    return user;
  }

  /** Prevents normal users from browsing another user's personal space. */
  private resolvePersonalOwner(library: DriveLibrary, requesterId: string, ownerId?: string | null): string {
    const id = ownerId || requesterId;
    this.findUser(library, id);
    if (id !== requesterId) {
      throw new ForbiddenException('Você não tem permissão para acessar esta conta.');
    }
    return id;
  }

  /** Allows owners and explicitly shared users to read an item. */
  private assertItemAccess(library: DriveLibrary, requesterId: string, item: DriveItem): void {
    const canAccess = item.ownerId === requesterId || Boolean(this.shareRoleForItem(library, requesterId, item));
    if (!canAccess) throw new ForbiddenException('Você não tem permissão para acessar este item.');
  }

  /** Allows owners and editor-level shares to modify an item. */
  private assertItemEditor(library: DriveLibrary, requesterId: string, item: DriveItem): void {
    this.findUser(library, requesterId);
    if (item.ownerId === requesterId) return;
    if (this.shareRoleForItem(library, requesterId, item) === 'editor') return;
    throw new ForbiddenException('Você não tem permissão para alterar este item.');
  }

  /** Restricts ownership-only operations such as hard delete and sharing changes. */
  private assertItemOwner(library: DriveLibrary, requesterId: string, item: DriveItem): void {
    this.findUser(library, requesterId);
    if (item.ownerId !== requesterId) {
      throw new ForbiddenException('Você não tem permissão para alterar este item.');
    }
  }

  /** Chooses the owner for new items based on parent ownership, requester role, and admin overrides. */
  private resolveCreateOwner(
    library: DriveLibrary,
    requesterId: string,
    parentId: string | null,
    ownerId?: string | null
  ): string {
    if (!parentId) return this.resolvePersonalOwner(library, requesterId, ownerId);
    const parent = this.assertParentWritable(library, requesterId, parentId);
    if (!parent) throw new BadRequestException('Pasta de destino inválida.');
    return parent.ownerId;
  }

  /** Verifies that a destination folder exists and can receive writes for the target owner. */
  private assertParentWritable(
    library: DriveLibrary,
    requesterId: string,
    parentId: string | null,
    expectedOwnerId?: string
  ): DriveItem | null {
    if (!parentId) return null;
    const parent = library.items.find(
      (item) =>
        item.id === parentId &&
        item.type === 'folder' &&
        !item.trashed &&
        !item.spam &&
        (!expectedOwnerId || item.ownerId === expectedOwnerId)
    );
    if (!parent) throw new BadRequestException('Pasta de destino inválida.');
    this.assertItemEditor(library, requesterId, parent);
    return parent;
  }

  /** Ensures a parent folder belongs to the expected owner before creating or copying. */
  private assertParentExists(library: DriveLibrary, parentId: string | null, ownerId: string): void {
    if (!parentId) return;
    const parent = library.items.find(
      (item) =>
        item.id === parentId &&
        item.ownerId === ownerId &&
        item.type === 'folder' &&
        !item.trashed &&
        !item.spam
    );
    if (!parent) throw new BadRequestException('Pasta de destino inválida.');
  }

  /** Reads direct permissions from the modern role list with legacy sharedWith fallback. */
  private directShareRole(item: DriveItem, userId: string): ShareRole | null {
    const direct = item.sharePermissions?.find((permission) => permission.userId === userId)?.role;
    if (direct) return direct;
    return item.sharedWith.includes(userId) ? 'reader' : null;
  }

  /** Resolves inherited share access by walking from the item up through its ancestors. */
  private shareRoleForItem(library: DriveLibrary, userId: string, item: DriveItem): ShareRole | null {
    let current: DriveItem | undefined = item;
    while (current) {
      const direct = this.directShareRole(current, userId);
      if (direct) return direct;
      current = current.parentId ? library.items.find((candidate) => candidate.id === current?.parentId) : undefined;
    }
    return null;
  }

  /** Validates share targets and removes duplicates before saving permissions. */
  private normalizeSharePermissions(
    library: DriveLibrary,
    item: DriveItem,
    permissions: Array<{ userId: string; role: ShareRole }>
  ): SharePermission[] {
    const result = new Map<string, ShareRole>();
    for (const permission of permissions) {
      if (!permission?.userId || permission.userId === item.ownerId) continue;
      this.findUser(library, permission.userId);
      const role: ShareRole = ['reader', 'commenter', 'editor'].includes(permission.role)
        ? permission.role
        : 'reader';
      result.set(permission.userId, role);
    }
    return Array.from(result, ([userId, role]) => ({ userId, role }));
  }

  /** Preserves existing roles while upgrading legacy sharedWith ids into viewer permissions. */
  private mergeSharePermissions(current: SharePermission[] = [], sharedWith: string[]): SharePermission[] {
    const next = new Map(current.map((permission) => [permission.userId, permission.role]));
    for (const userId of sharedWith) {
      if (!next.has(userId)) next.set(userId, 'reader');
    }
    return Array.from(next, ([userId, role]) => ({ userId, role }));
  }

  /** Accepts only link roles that are meaningful for public sharing. */
  private normalizeLinkRole(role?: ShareRole | null): ShareRole | null {
    return role && ['reader', 'commenter', 'editor'].includes(role) ? role : null;
  }

  /** Resolves a public share token and optionally requires it to point to a folder. */
  private sharedRootForToken(library: DriveLibrary, token: string, requireFolder = false): DriveItem {
    const root = library.items.find(
      (current) =>
        current.sharedToken === token &&
        current.linkRole &&
        !current.trashed &&
        !current.spam &&
        (!requireFolder || current.type === 'folder')
    );
    if (!root) throw new NotFoundException('Compartilhamento não encontrado.');
    return root;
  }

  /** Blocks write operations through shared links that are view-only. */
  private assertSharedEditor(root: DriveItem): void {
    if (root.linkRole === 'editor') return;
    throw new ForbiddenException('Este link não permite alterações.');
  }

  /** Ensures shared-link writes stay under the shared folder root. */
  private assertSharedParent(library: DriveLibrary, root: DriveItem, parentId: string): DriveItem {
    const parent = library.items.find(
      (item) => item.id === parentId && item.type === 'folder' && !item.trashed && !item.spam
    );
    if (!parent || !this.isWithinSharedRoot(library, root, parent)) {
      throw new BadRequestException('Pasta de destino inválida.');
    }
    return parent;
  }

  /** Checks ancestry to keep shared-link reads and writes inside the shared subtree. */
  private isWithinSharedRoot(library: DriveLibrary, root: DriveItem, item: DriveItem): boolean {
    let current: DriveItem | undefined = item;
    const seen = new Set<string>();
    while (current && !seen.has(current.id)) {
      if (current.id === root.id) return true;
      seen.add(current.id);
      current = current.parentId ? library.items.find((candidate) => candidate.id === current?.parentId) : undefined;
    }
    return false;
  }

  /** Rejects writes that would exceed the owner's storage quota. */
  private assertQuota(library: DriveLibrary, ownerId: string, incomingSize: number): void {
    const user = this.findUser(library, ownerId);
    const used = this.sumFileSizes(this.storedFilesForOwner(library, ownerId));

    if (used + incomingSize > user.storageQuotaBytes) {
      throw new BadRequestException('Cota de armazenamento insuficiente para este usuário.');
    }
  }

  /** Checks quota when replacing an existing object by charging only the size increase. */
  private assertQuotaDelta(
    library: DriveLibrary,
    ownerId: string,
    currentSize: number,
    nextSize: number
  ): void {
    const user = this.findUser(library, ownerId);
    const used = this.sumFileSizes(this.storedFilesForOwner(library, ownerId));

    if (used - currentSize + nextSize > user.storageQuotaBytes) {
      throw new BadRequestException('Cota de armazenamento insuficiente para este usuário.');
    }
  }

  /** Returns active stored files that count against one owner's quota. */
  private storedFilesForOwner(library: DriveLibrary, ownerId: string): DriveItem[] {
    return library.items.filter((item) => item.ownerId === ownerId && item.type === 'file');
  }

  /** Sums file sizes with a single implementation for quota and storage summaries. */
  private sumFileSizes(items: DriveItem[]): number {
    return items.reduce((total, item) => total + item.size, 0);
  }

  /** Normalizes optional descriptions and enforces the maximum activity-safe length. */
  private normalizeDescription(value: string | null | undefined): string | null | undefined {
    if (value === undefined) return undefined;
    const normalized = String(value ?? '')
      .replace(/\r\n?/g, '\n')
      .slice(0, MAX_DESCRIPTION_LENGTH)
      .trim();
    return normalized || null;
  }

  /** Converts activity metadata values into compact serializable primitives. */
  private activityText(value: unknown): string | number | boolean | null {
    if (value === null || value === undefined) return null;
    if (typeof value === 'number' || typeof value === 'boolean') return value;
    return String(value).slice(0, MAX_ACTIVITY_TEXT_LENGTH);
  }

  /** Sanitizes activity metadata so event history stays bounded and JSON-safe. */
  private activityMetadata(input: Record<string, unknown> = {}): NonNullable<DriveActivityEvent['metadata']> {
    return Object.fromEntries(
      Object.entries(input).map(([key, value]) => [key, this.activityText(value)])
    );
  }

  /** Returns the display name used in move/create activity messages. */
  private folderActivityName(library: DriveLibrary, parentId: string | null): string {
    if (!parentId) return 'Meu Ride';
    return library.items.find((item) => item.id === parentId)?.name ?? 'Meu Ride';
  }

  /** Appends a per-item activity event and trims the history to the configured limit. */
  private appendActivity(
    library: DriveLibrary,
    item: DriveItem,
    type: DriveActivityType,
    actorId: string,
    metadata: Record<string, unknown> = {},
    createdAt = new Date().toISOString()
  ): void {
    const event: DriveActivityEvent = {
      id: randomUUID(),
      type,
      actorId,
      createdAt,
      itemId: item.id,
      itemName: item.name,
      itemType: item.type,
      parentId: item.parentId,
      parentName: this.folderActivityName(library, item.parentId),
      metadata: this.activityMetadata(metadata)
    };
    item.activity = [event, ...(item.activity ?? [])].slice(0, MAX_ACTIVITY_EVENTS_PER_ITEM);
  }

  /** Computes recursive folder sizes from file leaves up to their ancestors. */
  private folderSizeMap(library: DriveLibrary): Map<string, number> {
    const childrenByParent = new Map<string, DriveItem[]>();
    for (const item of library.items) {
      if (!item.parentId) continue;
      const siblings = childrenByParent.get(item.parentId) ?? [];
      siblings.push(item);
      childrenByParent.set(item.parentId, siblings);
    }

    const memo = new Map<string, number>();
    const visiting = new Set<string>();
    const sizeFor = (folderId: string): number => {
      if (memo.has(folderId)) return memo.get(folderId) ?? 0;
      if (visiting.has(folderId)) return 0;
      visiting.add(folderId);
      const total = (childrenByParent.get(folderId) ?? []).reduce((sum, child) => {
        return sum + (child.type === 'folder' ? sizeFor(child.id) : child.size);
      }, 0);
      visiting.delete(folderId);
      memo.set(folderId, total);
      return total;
    };

    for (const folder of library.items.filter((item) => item.type === 'folder')) sizeFor(folder.id);
    return memo;
  }

  /** Returns cloned items with computed folder sizes and inherited-share markers. */
  private withComputedFolderSizes(library: DriveLibrary, items: DriveItem[]): DriveItem[] {
    const sizes = this.folderSizeMap(library);
    return items.map((item) =>
      item.type === 'folder'
        ? { ...item, size: sizes.get(item.id) ?? 0, sharedByAncestor: this.hasSharedAncestor(library, item) }
        : item
    );
  }

  /** Marks descendants of shared folders so the UI can show inherited sharing correctly. */
  private hasSharedAncestor(library: DriveLibrary, item: DriveItem): boolean {
    const seen = new Set<string>();
    let current = item.parentId ? library.items.find((candidate) => candidate.id === item.parentId) : undefined;
    while (current && !seen.has(current.id)) {
      if (current.linkRole || current.sharedWith.length || current.sharePermissions?.length) {
        return true;
      }
      seen.add(current.id);
      current = current.parentId ? library.items.find((candidate) => candidate.id === current?.parentId) : undefined;
    }
    return false;
  }

  /** Produces a Drive-style unique name within one parent without renaming unrelated siblings. */
  private uniqueSiblingName(
    library: DriveLibrary,
    desiredName: string,
    type: DriveItem['type'],
    ownerId: string,
    parentId: string | null,
    excludeId?: string
  ): string {
    const extension = type === 'file' ? extname(desiredName) : '';
    const stem = extension ? desiredName.slice(0, -extension.length) : desiredName;
    const siblingNames = new Set(
      library.items
        .filter(
          (item) =>
            item.id !== excludeId &&
            item.ownerId === ownerId &&
            item.parentId === parentId &&
            item.type === type &&
            !item.trashed &&
            !item.spam
        )
        .map((item) => item.name)
    );

    let candidate = desiredName;
    let counter = 1;
    while (siblingNames.has(candidate)) {
      candidate = `${stem} (${counter})${extension}`;
      counter += 1;
    }
    return candidate;
  }

  /** Applies trash or restore state to an item and all descendants consistently. */
  private applyTrashState(
    library: DriveLibrary,
    item: DriveItem,
    trashed: boolean,
    updatedById: string
  ): void {
    const now = new Date().toISOString();
    const ids =
      item.type === 'folder' ? this.collectDescendantIds(library, item.id).concat(item.id) : [item.id];
    library.items.forEach((current) => {
      if (ids.includes(current.id)) {
        current.trashed = trashed;
        current.deletedAt = trashed ? now : null;
        current.updatedAt = now;
        current.updatedById = updatedById;
      }
    });
  }

  /** Applies spam state to an item subtree while updating audit timestamps. */
  private applySpamState(library: DriveLibrary, item: DriveItem, spam: boolean, updatedById: string): void {
    const now = new Date().toISOString();
    const ids =
      item.type === 'folder' ? this.collectDescendantIds(library, item.id).concat(item.id) : [item.id];
    library.items.forEach((current) => {
      if (ids.includes(current.id)) {
        current.spam = spam;
        current.updatedAt = now;
        current.updatedById = updatedById;
      }
    });
  }

  /** Collects descendant ids breadth-first for folder moves, copies, trash, and hard deletes. */
  private collectDescendantIds(library: DriveLibrary, folderId: string): string[] {
    const children = library.items.filter((item) => item.parentId === folderId);
    return children.flatMap((child) => [child.id, ...this.collectDescendantIds(library, child.id)]);
  }

  /** Reads the library from SQLite or migrates legacy JSON metadata when present. */
  private async readLibrary(): Promise<DriveLibrary> {
    await this.ensureStorage();
    const stored = this.store.readLibrary();
    if (stored) return this.migrateLibrary(stored);

    try {
      const content = await readFile(this.metadataPath, 'utf8');
      const migrated = this.migrateLibrary(JSON.parse(content) as Partial<DriveLibrary>);
      await this.writeLibrary(migrated);
      return migrated;
    } catch {
      // No legacy JSON metadata exists yet, or it cannot be parsed. Start from an empty setup.
    }

    const empty = this.migrateLibrary({ users: [], items: [] });
    await this.writeLibrary(empty);
    return empty;
  }

  /** Fills missing fields from older metadata versions without dropping user data. */
  private migrateLibrary(input: Partial<DriveLibrary>): DriveLibrary {
    const now = new Date().toISOString();
    const users = Array.isArray(input.users)
      ? input.users.map((u) => ({
          ...u,
          avatarUrl: u.avatarUrl ?? null,
          // migrate existing admin accounts that pre-date the auth system
          passwordHash: u.passwordHash ?? (u.role === 'admin' ? hashPassword('drive2024') : undefined)
        }))
      : [
          {
            id: DEFAULT_ADMIN_ID,
            name: 'Administrador',
            email: 'admin@ride.local',
            role: 'admin' as const,
            storageQuotaBytes: DEFAULT_QUOTA_BYTES,
            avatarColor: '#1a73e8',
            avatarUrl: null,
            passwordHash: hashPassword('drive2024'),
            createdAt: now,
            updatedAt: now
          }
        ];

    const items = (input.items ?? []).map((item) => ({
      ...item,
      name: sanitizeDisplayName(item.name ?? ''),
      ownerId: item.ownerId ?? users[0]?.id ?? DEFAULT_ADMIN_ID,
      updatedById: item.updatedById ?? item.ownerId ?? users[0]?.id ?? DEFAULT_ADMIN_ID,
      checksum: item.checksum ?? null,
      description: this.normalizeDescription(item.description) ?? null,
      openedAt: item.openedAt ?? null,
      openedById: item.openedById ?? null,
      spam: item.spam ?? false,
      linkRole: item.linkRole ?? null,
      sharedWith: item.sharedWith ?? [],
      sharePermissions:
        item.sharePermissions?.length
          ? item.sharePermissions
          : (item.sharedWith ?? []).map((userId) => ({ userId, role: 'reader' as const })),
      activity: Array.isArray(item.activity)
        ? item.activity.slice(0, MAX_ACTIVITY_EVENTS_PER_ITEM)
        : []
    })) as DriveItem[];

    const userIds = new Set(users.map((user) => user.id));
    const nowMs = Date.now();
    const sessions = (input.sessions ?? [])
      .filter(
        (session) =>
          typeof session.tokenHash === 'string' &&
          typeof session.userId === 'string' &&
          typeof session.expiresAt === 'number' &&
          session.expiresAt > nowMs &&
          userIds.has(session.userId)
      )
      .map((session) => ({
        tokenHash: session.tokenHash,
        userId: session.userId,
        createdAt: session.createdAt,
        lastSeenAt: session.lastSeenAt ?? session.createdAt,
        expiresAt: session.expiresAt,
        metadata: this.normalizeSessionMetadata(session.metadata)
      }));

    const notifications = (input.notifications ?? [])
      .filter(
        (notification) =>
          typeof notification.id === 'string' &&
          typeof notification.userId === 'string' &&
          userIds.has(notification.userId) &&
          ['share', 'login', 'backup'].includes(notification.type) &&
          typeof notification.title === 'string' &&
          typeof notification.message === 'string' &&
          typeof notification.createdAt === 'string'
      )
      .map((notification) => ({
        id: notification.id,
        userId: notification.userId,
        type: notification.type,
        title: notification.title,
        message: notification.message,
        itemId: notification.itemId ?? null,
        actorId: notification.actorId ?? null,
        readAt: notification.readAt ?? null,
        createdAt: notification.createdAt
      }))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .filter((notification, index, all) => {
        const beforeForUser = all.slice(0, index).filter((candidate) => candidate.userId === notification.userId).length;
        return beforeForUser < MAX_NOTIFICATIONS_PER_USER;
      });

    return {
      users,
      items,
      sessions,
      notifications,
      trashRetentionDays: input.trashRetentionDays ?? DEFAULT_TRASH_RETENTION_DAYS,
      backupSchedule: this.normalizeBackupSchedule(input.backupSchedule)
    };
  }

  /** Persists the full library through the SQLite store after migration normalization. */
  private async writeLibrary(library: DriveLibrary): Promise<void> {
    await this.ensureStorage();
    this.store.writeLibrary(this.migrateLibrary(library));
  }

  /** Ensures object, temp, and backup directories exist before filesystem mutations. */
  private async ensureStorage(): Promise<void> {
    await mkdir(this.filesDir, { recursive: true });
    await mkdir(this.tempDir, { recursive: true });
    await mkdir(this.backupsDir, { recursive: true });
  }

  private async withMutation<T>(operation: () => Promise<T>): Promise<T> {
    const run = this.mutationQueue.then(operation, operation);
    this.mutationQueue = run.then(
      () => undefined,
      () => undefined
    );
    return run;
  }

  /** Assigns deterministic fallback avatar colors for migrated or first-run users. */
  private pickAvatarColor(index: number): string {
    return ['#1a73e8', '#188038', '#d93025', '#f9ab00', '#9334e6', '#00796b'][index % 6];
  }
}
