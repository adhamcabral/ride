import { Module } from '@nestjs/common';
import { MulterModule } from '@nestjs/platform-express';
import { mkdirSync, statfsSync } from 'fs';
import { diskStorage } from 'multer';
import { join } from 'path';
import { AuthGuard } from './auth.guard';
import { DriveAccountsService } from './drive-accounts.service';
import { DriveAdminService } from './drive-admin.service';
import { DriveAuthService } from './drive-auth.service';
import { DriveItemsService } from './drive-items.service';
import { DriveSharesService } from './drive-shares.service';
import { FilesController } from './files.controller';
import { FilesService } from './files.service';
import { SharesController } from './shares.controller';

const DEFAULT_MIN_FREE_BYTES = 512 * 1024 * 1024;

function minFreeBytes() {
  const configured = Number(process.env.RIDE_MIN_FREE_BYTES ?? DEFAULT_MIN_FREE_BYTES);
  return Number.isFinite(configured) && configured > 0 ? configured : DEFAULT_MIN_FREE_BYTES;
}

@Module({
  imports: [
    MulterModule.register({
      storage: diskStorage({
        destination: (_req, _file, callback) => {
          const tempDir = join(process.cwd(), process.env.STORAGE_DIR ?? 'data', 'tmp');
          mkdirSync(tempDir, { recursive: true });
          const contentLength = Number(_req.headers['content-length'] ?? 0);
          const stats = statfsSync(tempDir);
          const available = Number(stats.bavail) * Number(stats.bsize);
          if (contentLength > 0 && available - contentLength < minFreeBytes()) {
            callback(new Error('Espaço em disco insuficiente para receber este upload.'), tempDir);
            return;
          }
          callback(null, tempDir);
        },
        filename: (_req, _file, callback) => {
          callback(null, `${Date.now()}-${Math.random().toString(36).slice(2)}.upload`);
        }
      }),
      limits: { fileSize: 1024 * 1024 * 1024 }
    })
  ],
  controllers: [FilesController, SharesController],
  providers: [
    FilesService,
    DriveAuthService,
    DriveItemsService,
    DriveAccountsService,
    DriveAdminService,
    DriveSharesService,
    AuthGuard
  ]
})
export class FilesModule {}
