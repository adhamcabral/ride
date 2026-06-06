import { Injectable } from '@nestjs/common';
import { FilesService } from './files.service';

@Injectable()
export class DriveAdminService {
  constructor(private readonly files: FilesService) {}

  adminStats(...args: Parameters<FilesService['adminStats']>) {
    return this.files.adminStats(...args);
  }

  getSettings(...args: Parameters<FilesService['getSettings']>) {
    return this.files.getSettings(...args);
  }

  updateSettings(...args: Parameters<FilesService['updateSettings']>) {
    return this.files.updateSettings(...args);
  }

  maintenanceOverview(...args: Parameters<FilesService['maintenanceOverview']>) {
    return this.files.maintenanceOverview(...args);
  }

  browseServerDirectories(...args: Parameters<FilesService['browseServerDirectories']>) {
    return this.files.browseServerDirectories(...args);
  }

  backupDatabase(...args: Parameters<FilesService['backupDatabase']>) {
    return this.files.backupDatabase(...args);
  }

  restoreDatabaseBackup(...args: Parameters<FilesService['restoreDatabaseBackup']>) {
    return this.files.restoreDatabaseBackup(...args);
  }

  restoreUploadedBackup(...args: Parameters<FilesService['restoreUploadedBackup']>) {
    return this.files.restoreUploadedBackup(...args);
  }

  deleteDatabaseBackup(...args: Parameters<FilesService['deleteDatabaseBackup']>) {
    return this.files.deleteDatabaseBackup(...args);
  }

  auditStorage(...args: Parameters<FilesService['auditStorage']>) {
    return this.files.auditStorage(...args);
  }
}
