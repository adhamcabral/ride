import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  HttpCode,
  HttpException,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  Req,
  Res,
  StreamableFile,
  UploadedFile,
  UseGuards,
  UseInterceptors
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Request, Response } from 'express';
import { lookup } from 'mime-types';
import { AuthGuard } from './auth.guard';
import { DriveAccountsService } from './drive-accounts.service';
import { DriveAdminService } from './drive-admin.service';
import { DriveAuthService } from './drive-auth.service';
import { DriveItemsService } from './drive-items.service';
import type { SessionMetadata } from './drive.types';
import {
  AdminSetPasswordDto,
  CopyItemDto,
  CreateAccountDto,
  CreateFolderDto,
  DeleteAccountDto,
  FileAccessTicketDto,
  ListFilesQueryDto,
  LoginDto,
  LoginLookupDto,
  SaveBinaryContentDto,
  SaveTextContentDto,
  ShareItemAccessDto,
  SetupAccountDto,
  StorageAuditDto,
  UpdateAccountDto,
  UpdateItemDto,
  UpdateProfileDto,
  UpdateSettingsDto,
  UploadFileDto
} from './dto';

type AuthRequest = Request & { userId: string };
type MimeSubject = { name: string; mimeType: string | null };

function apiBaseUrl(req: Request): string {
  return (process.env.PUBLIC_API_URL ?? `${req.protocol}://${req.get('host')}/api`).replace(/\/+$/, '');
}

function firstHeaderValue(value: string | string[] | undefined): string | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

function resolvedContentType(item: MimeSubject): string {
  const stored = item.mimeType?.trim();
  if (stored && stored !== 'application/octet-stream') return stored;
  return lookup(item.name) || stored || 'application/octet-stream';
}

function requestSessionMetadata(req: Request): SessionMetadata {
  const forwardedFor = firstHeaderValue(req.headers['x-forwarded-for']);
  const ipAddress =
    forwardedFor?.split(',')[0]?.trim() ||
    firstHeaderValue(req.headers['x-real-ip']) ||
    req.ip ||
    req.socket.remoteAddress ||
    null;
  return {
    ipAddress,
    userAgent: firstHeaderValue(req.headers['user-agent']),
    language: firstHeaderValue(req.headers['accept-language']),
    country: firstHeaderValue(req.headers['cf-ipcountry']),
    region: firstHeaderValue(req.headers['x-vercel-ip-country-region']),
    city: firstHeaderValue(req.headers['x-vercel-ip-city'])
  };
}

function isPrivateIp(value?: string | null): boolean {
  if (!value) return true;
  const ip = value.replace(/^::ffff:/, '');
  return (
    ip === '::1' ||
    ip === '127.0.0.1' ||
    ip === 'localhost' ||
    ip.startsWith('10.') ||
    ip.startsWith('192.168.') ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(ip) ||
    ip.startsWith('fe80:') ||
    ip.startsWith('fc') ||
    ip.startsWith('fd')
  );
}

function bodySessionMetadata(value: unknown): SessionMetadata {
  if (!value || typeof value !== 'object') return {};
  const input = value as Record<string, unknown>;
  const text = (key: string) => (typeof input[key] === 'string' ? (input[key] as string) : null);
  const number = (key: string) => (typeof input[key] === 'number' ? (input[key] as number) : null);
  return {
    ipAddress: text('ipAddress'),
    userAgent: text('userAgent'),
    browser: text('browser'),
    os: text('os'),
    deviceType: ['desktop', 'mobile', 'tablet', 'unknown'].includes(String(input.deviceType))
      ? (input.deviceType as SessionMetadata['deviceType'])
      : undefined,
    language: text('language'),
    country: text('country'),
    region: text('region'),
    city: text('city'),
    latitude: number('latitude'),
    longitude: number('longitude'),
    network: text('network'),
    isp: text('isp'),
    wifiSsid: text('wifiSsid')
  };
}

function mergeSessionMetadata(requestMetadata: SessionMetadata, clientMetadata: SessionMetadata): SessionMetadata {
  const useClientIp = clientMetadata.ipAddress && isPrivateIp(requestMetadata.ipAddress) && !isPrivateIp(clientMetadata.ipAddress);
  return {
    ...clientMetadata,
    ...requestMetadata,
    ipAddress: useClientIp ? clientMetadata.ipAddress : requestMetadata.ipAddress || clientMetadata.ipAddress || null,
    country: clientMetadata.country || requestMetadata.country || null,
    region: clientMetadata.region || requestMetadata.region || null,
    city: clientMetadata.city || requestMetadata.city || null,
    latitude: clientMetadata.latitude ?? requestMetadata.latitude ?? null,
    longitude: clientMetadata.longitude ?? requestMetadata.longitude ?? null,
    network: clientMetadata.network || requestMetadata.network || null,
    isp: clientMetadata.isp || requestMetadata.isp || null,
    wifiSsid: clientMetadata.wifiSsid || requestMetadata.wifiSsid || null
  };
}

@Controller()
export class FilesController {
  private readonly rateLimitBuckets = new Map<string, { count: number; resetAt: number }>();

  constructor(
    private readonly auth: DriveAuthService,
    private readonly items: DriveItemsService,
    private readonly accountsService: DriveAccountsService,
    private readonly admin: DriveAdminService
  ) {}

  private checkRateLimit(req: Request, action: string, limit: number, windowMs: number, discriminator = ''): void {
    const metadata = requestSessionMetadata(req);
    const key = [action, metadata.ipAddress ?? 'unknown', discriminator.trim().toLowerCase()].join(':');
    const now = Date.now();
    const current = this.rateLimitBuckets.get(key);
    if (!current || current.resetAt <= now) {
      this.rateLimitBuckets.set(key, { count: 1, resetAt: now + windowMs });
      return;
    }
    current.count += 1;
    if (current.count > limit) {
      throw new HttpException('Muitas tentativas. Aguarde alguns minutos e tente novamente.', HttpStatus.TOO_MANY_REQUESTS);
    }
  }

  private async validateDownloadTicket(ticket: string | undefined, id: string): Promise<string | null> {
    if (!ticket) return null;
    return (
      (await this.items.validateFileAccessTicket(ticket, id, 'download')) ??
      (await this.items.validateFileAccessTicket(ticket, id, 'office-download'))
    );
  }

  // ── Public ───────────────────────────────────────────────────────────────

  @Get('health')
  health() {
    return { ok: true, service: 'ride-api', version: '1.0.0' };
  }

  @Post('auth/login')
  login(@Req() req: Request, @Body() dto: LoginDto) {
    this.checkRateLimit(req, 'login', 10, 5 * 60 * 1000, dto.email);
    return this.auth.login(
      dto,
      mergeSessionMetadata(requestSessionMetadata(req), bodySessionMetadata(dto.sessionMetadata))
    );
  }

  @Post('auth/lookup')
  lookupLoginAccount(@Req() req: Request, @Body() dto: LoginLookupDto) {
    this.checkRateLimit(req, 'lookup', 30, 5 * 60 * 1000, dto.email);
    return this.auth.lookupLoginAccount(dto.email);
  }

  @Get('auth/setup')
  setupStatus() {
    return this.auth.setupStatus();
  }

  @Post('auth/setup')
  setupFirstAccount(@Req() req: Request, @Body() dto: SetupAccountDto) {
    this.checkRateLimit(req, 'setup', 5, 10 * 60 * 1000, dto.email);
    return this.auth.setupFirstAccount(
      dto,
      mergeSessionMetadata(requestSessionMetadata(req), bodySessionMetadata(dto.sessionMetadata))
    );
  }

  @Post('auth/logout')
  @UseGuards(AuthGuard)
  async logout(@Req() req: AuthRequest) {
    const token = req.headers.authorization?.replace(/^Bearer\s+/i, '') ?? '';
    await this.auth.logout(token);
    return { ok: true };
  }

  @Get('auth/me')
  @UseGuards(AuthGuard)
  me(@Req() req: AuthRequest) {
    return this.auth.getMe(req.userId);
  }

  @Get('auth/sessions')
  @UseGuards(AuthGuard)
  sessions(@Req() req: AuthRequest) {
    const token = req.headers.authorization?.replace(/^Bearer\s+/i, '') ?? '';
    return this.auth.listSecuritySessions(req.userId, token);
  }

  @Delete('auth/sessions/:id')
  @UseGuards(AuthGuard)
  revokeSession(@Req() req: AuthRequest, @Param('id') id: string) {
    return this.auth.revokeSecuritySession(req.userId, id);
  }

  // ── Profile ──────────────────────────────────────────────────────────────

  @Patch('profile')
  @UseGuards(AuthGuard)
  updateProfile(@Req() req: AuthRequest, @Body() dto: UpdateProfileDto) {
    return this.auth.updateProfile(req.userId, dto);
  }

  @Delete('profile')
  @UseGuards(AuthGuard)
  deleteAccount(@Req() req: AuthRequest, @Body() dto: DeleteAccountDto) {
    return this.auth.deleteAccount(req.userId, dto.password);
  }

  @Get('notifications')
  @UseGuards(AuthGuard)
  notifications(@Req() req: AuthRequest) {
    return this.auth.notifications(req.userId);
  }

  @Post('notifications/read')
  @UseGuards(AuthGuard)
  markNotificationsRead(@Req() req: AuthRequest) {
    return this.auth.markNotificationsRead(req.userId);
  }

  @Delete('notifications')
  @UseGuards(AuthGuard)
  clearNotifications(@Req() req: AuthRequest) {
    return this.auth.clearNotifications(req.userId);
  }

  // ── Library ──────────────────────────────────────────────────────────────

  @Get('library')
  @UseGuards(AuthGuard)
  list(@Req() req: AuthRequest, @Query() query: ListFilesQueryDto) {
    return this.items.list(req.userId, query);
  }

  @Get('storage/summary')
  @UseGuards(AuthGuard)
  summary(@Req() req: AuthRequest, @Query('ownerId') ownerId?: string) {
    return this.items.summary(req.userId, ownerId);
  }

  @Get('folders')
  @UseGuards(AuthGuard)
  folders(@Req() req: AuthRequest, @Query('ownerId') ownerId?: string) {
    return this.items.folders(req.userId, ownerId);
  }

  @Post('files/:id/access-ticket')
  @UseGuards(AuthGuard)
  accessTicket(@Req() req: AuthRequest, @Param('id') id: string, @Body() dto: FileAccessTicketDto) {
    return this.items.createFileAccessTicket(req.userId, id, dto.scope);
  }

  @Get('files/:id/preview')
  async preview(
    @Param('id') id: string,
    @Query('_ticket') ticket: string | undefined,
    @Req() req: Request & { userId?: string },
    @Res({ passthrough: true }) response: Response
  ) {
    const userId = ticket ? await this.items.validateFileAccessTicket(ticket, id, 'preview') : null;
    if (!userId) {
      response.status(401).json({ message: 'Autenticação necessária.' });
      return;
    }

    const { item, path } = await this.items.getDownload(userId, id);
    const filename = item.name.replace(/[^\x20-\x7E]/g, '_').replace(/"/g, '\\"');
    const baseHeaders = {
      'Accept-Ranges': 'bytes',
      'Cache-Control': 'private, no-store',
      'Content-Disposition': `inline; filename="${filename}"; filename*=UTF-8''${encodeURIComponent(item.name)}`,
      'Content-Type': resolvedContentType(item)
    };
    const range = req.headers.range;

    if (range) {
      const match = /^bytes=(\d*)-(\d*)$/.exec(range);
      if (match) {
        const start = match[1] ? Number(match[1]) : 0;
        const end = match[2] ? Math.min(Number(match[2]), item.size - 1) : item.size - 1;
        if (start <= end && start < item.size) {
          response.status(206);
          response.set({
            ...baseHeaders,
            'Content-Length': end - start + 1,
            'Content-Range': `bytes ${start}-${end}/${item.size}`
          });
          return new StreamableFile(this.items.createReadStream(path, { start, end }));
        }
      }
      response.status(416);
      response.set({ 'Content-Range': `bytes */${item.size}` });
      return;
    }

    response.set({ ...baseHeaders, 'Content-Length': item.size });
    return new StreamableFile(this.items.createReadStream(path));
  }

  @Get('files/:id/pdf-info')
  @UseGuards(AuthGuard)
  async pdfInfo(@Param('id') id: string, @Req() req: AuthRequest) {
    return this.items.getPdfInfo(req.userId, id);
  }

  @Get('files/:id/office/config')
  @UseGuards(AuthGuard)
  async officeConfig(
    @Param('id') id: string,
    @Query('mode') mode: 'view' | 'edit' | undefined,
    @Req() req: AuthRequest
  ) {
    const base = apiBaseUrl(req);
    const download = await this.items.createFileAccessTicket(req.userId, id, 'office-download');
    const callback = await this.items.createFileAccessTicket(req.userId, id, 'office-callback');
    return this.items.getOfficeConfig(req.userId, id, {
      mode: mode === 'view' ? 'view' : 'edit',
      fileUrl: `${base}/files/${encodeURIComponent(id)}/download?_ticket=${encodeURIComponent(download.ticket)}`,
      callbackUrl: `${base}/files/${encodeURIComponent(id)}/office/callback?_ticket=${encodeURIComponent(callback.ticket)}`
    });
  }

  @Post('files/:id/office/callback')
  @HttpCode(200)
  async officeCallback(
    @Param('id') id: string,
    @Query('_ticket') ticket: string | undefined,
    @Req() req: Request & { userId?: string },
    @Body() body: any,
    @Res({ passthrough: true }) response: Response
  ) {
    const userId = ticket ? await this.items.validateFileAccessTicket(ticket, id, 'office-callback') : null;
    if (!userId) {
      response.status(401);
      return { error: 1 };
    }
    return this.items.handleOfficeCallback(userId, id, body);
  }

  @Get('files/:id/pages/:page.png')
  async pdfPage(
    @Param('id') id: string,
    @Param('page') page: string,
    @Query('_ticket') ticket: string | undefined,
    @Req() req: Request & { userId?: string },
    @Res({ passthrough: true }) response: Response
  ) {
    const userId = ticket ? await this.items.validateFileAccessTicket(ticket, id, 'pdf-page') : null;
    if (!userId) {
      response.status(401).json({ message: 'Autenticação necessária.' });
      return;
    }

    const image = await this.items.renderPdfPage(userId, id, page);
    response.set({
      'Cache-Control': 'private, no-store',
      'Content-Length': image.length,
      'Content-Type': 'image/png'
    });
    return new StreamableFile(image);
  }

  @Get('files/:id')
  @UseGuards(AuthGuard)
  get(@Req() req: AuthRequest, @Param('id') id: string) {
    return this.items.get(req.userId, id);
  }

  @Post('files/:id/opened')
  @UseGuards(AuthGuard)
  opened(@Req() req: AuthRequest, @Param('id') id: string) {
    return this.items.markOpened(req.userId, id);
  }

  @Get('files/:id/breadcrumbs')
  @UseGuards(AuthGuard)
  breadcrumbs(@Req() req: AuthRequest, @Param('id') id: string) {
    return this.items.breadcrumbs(req.userId, id);
  }

  @Post('folders')
  @UseGuards(AuthGuard)
  createFolder(@Req() req: AuthRequest, @Body() dto: CreateFolderDto) {
    return this.items.createFolder(req.userId, dto);
  }

  @Post('files/upload')
  @UseGuards(AuthGuard)
  @UseInterceptors(FileInterceptor('file'))
  upload(@Req() req: AuthRequest, @UploadedFile() file: Express.Multer.File, @Body() dto: UploadFileDto) {
    return this.items.upload(req.userId, file, dto.parentId, dto.ownerId);
  }

  @Post('files/:id/copy')
  @UseGuards(AuthGuard)
  copy(@Req() req: AuthRequest, @Param('id') id: string, @Body() dto: CopyItemDto) {
    return this.items.copy(req.userId, id, dto);
  }

  @Patch('files/:id')
  @UseGuards(AuthGuard)
  update(@Req() req: AuthRequest, @Param('id') id: string, @Body() dto: UpdateItemDto) {
    return this.items.update(req.userId, id, dto);
  }

  @Post('files/:id/text')
  @UseGuards(AuthGuard)
  saveText(@Req() req: AuthRequest, @Param('id') id: string, @Body() dto: SaveTextContentDto) {
    return this.items.saveTextContent(req.userId, id, dto);
  }

  @Post('files/:id/content')
  @UseGuards(AuthGuard)
  saveBinary(@Req() req: AuthRequest, @Param('id') id: string, @Body() dto: SaveBinaryContentDto) {
    return this.items.saveBinaryContent(req.userId, id, dto);
  }

  @Delete('files/:id')
  @UseGuards(AuthGuard)
  remove(@Req() req: AuthRequest, @Param('id') id: string, @Query('hard') hard?: string) {
    return this.items.remove(req.userId, id, hard === 'true');
  }

  @Post('files/:id/share')
  @UseGuards(AuthGuard)
  share(@Req() req: AuthRequest, @Param('id') id: string) {
    return this.items.share(req.userId, id);
  }

  @Post('files/:id/share/access')
  @UseGuards(AuthGuard)
  shareAccess(@Req() req: AuthRequest, @Param('id') id: string, @Body() dto: ShareItemAccessDto) {
    return this.items.shareAccess(req.userId, id, dto);
  }

  @Delete('files/:id/share')
  @UseGuards(AuthGuard)
  unshare(@Req() req: AuthRequest, @Param('id') id: string) {
    return this.items.unshare(req.userId, id);
  }

  @Get('files/:id/download')
  @Header('Cache-Control', 'private, max-age=60')
  async download(
    @Param('id') id: string,
    @Query('_ticket') ticket: string | undefined,
    @Req() req: Request & { userId?: string },
    @Res({ passthrough: true }) response: Response
  ) {
    const userId = await this.validateDownloadTicket(ticket, id);
    if (!userId) {
      response.status(401).json({ message: 'Autenticação necessária.' });
      return;
    }
    const { item, path } = await this.items.getDownload(userId, id);
    response.set({
      'Content-Type': resolvedContentType(item),
      'Content-Disposition': `attachment; filename="${item.name.replace(/[^\x20-\x7E]/g, '_').replace(/"/g, '\\"')}"; filename*=UTF-8''${encodeURIComponent(item.name)}`,
      'Content-Length': item.size
    });
    return new StreamableFile(this.items.createReadStream(path));
  }

  // ── Accounts (admin) ─────────────────────────────────────────────────────

  @Get('accounts')
  @UseGuards(AuthGuard)
  accounts(@Req() req: AuthRequest) {
    return this.accountsService.accounts(req.userId);
  }

  @Post('accounts')
  @UseGuards(AuthGuard)
  createAccount(@Req() req: AuthRequest, @Body() dto: CreateAccountDto) {
    return this.accountsService.createAccount(req.userId, dto);
  }

  @Patch('accounts/:id')
  @UseGuards(AuthGuard)
  updateAccount(@Req() req: AuthRequest, @Param('id') id: string, @Body() dto: UpdateAccountDto) {
    return this.accountsService.updateAccount(req.userId, id, dto);
  }

  @Delete('accounts/:id')
  @UseGuards(AuthGuard)
  deleteAdminAccount(@Req() req: AuthRequest, @Param('id') id: string) {
    return this.accountsService.deleteAdminAccount(req.userId, id);
  }

  @Post('accounts/:id/set-password')
  @UseGuards(AuthGuard)
  adminSetPassword(@Req() req: AuthRequest, @Param('id') id: string, @Body() dto: AdminSetPasswordDto) {
    return this.accountsService.adminSetPassword(req.userId, id, dto);
  }

  // ── Admin ─────────────────────────────────────────────────────────────────

  @Get('admin/stats')
  @UseGuards(AuthGuard)
  adminStats(@Req() req: AuthRequest) {
    return this.admin.adminStats(req.userId);
  }

  @Get('admin/settings')
  @UseGuards(AuthGuard)
  getSettings(@Req() req: AuthRequest) {
    return this.admin.getSettings(req.userId);
  }

  @Patch('admin/settings')
  @UseGuards(AuthGuard)
  updateSettings(@Req() req: AuthRequest, @Body() dto: UpdateSettingsDto) {
    return this.admin.updateSettings(req.userId, dto);
  }

  @Get('admin/maintenance')
  @UseGuards(AuthGuard)
  maintenanceOverview(@Req() req: AuthRequest) {
    return this.admin.maintenanceOverview(req.userId);
  }

  @Get('admin/maintenance/directories')
  @UseGuards(AuthGuard)
  browseServerDirectories(@Req() req: AuthRequest, @Query('path') path?: string) {
    return this.admin.browseServerDirectories(req.userId, path);
  }

  @Post('admin/maintenance/backup')
  @UseGuards(AuthGuard)
  backupDatabase(@Req() req: AuthRequest) {
    return this.admin.backupDatabase(req.userId);
  }

  @Post('admin/maintenance/backups/:id/restore')
  @UseGuards(AuthGuard)
  restoreDatabaseBackup(@Req() req: AuthRequest, @Param('id') id: string) {
    return this.admin.restoreDatabaseBackup(req.userId, id);
  }

  @Post('admin/maintenance/backup/upload-restore')
  @UseGuards(AuthGuard)
  @UseInterceptors(FileInterceptor('file'))
  restoreUploadedBackup(@Req() req: AuthRequest, @UploadedFile() file: Express.Multer.File) {
    return this.admin.restoreUploadedBackup(req.userId, file);
  }

  @Delete('admin/maintenance/backups/:id')
  @UseGuards(AuthGuard)
  deleteDatabaseBackup(@Req() req: AuthRequest, @Param('id') id: string) {
    return this.admin.deleteDatabaseBackup(req.userId, id);
  }

  @Post('admin/maintenance/audit')
  @UseGuards(AuthGuard)
  auditStorage(@Req() req: AuthRequest, @Body() dto: StorageAuditDto) {
    return this.admin.auditStorage(req.userId, dto);
  }
}
