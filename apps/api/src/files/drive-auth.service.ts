import { Injectable } from '@nestjs/common';
import { FilesService } from './files.service';

@Injectable()
export class DriveAuthService {
  constructor(private readonly files: FilesService) {}

  login(...args: Parameters<FilesService['login']>) {
    return this.files.login(...args);
  }

  lookupLoginAccount(...args: Parameters<FilesService['lookupLoginAccount']>) {
    return this.files.lookupLoginAccount(...args);
  }

  setupStatus(...args: Parameters<FilesService['setupStatus']>) {
    return this.files.setupStatus(...args);
  }

  setupFirstAccount(...args: Parameters<FilesService['setupFirstAccount']>) {
    return this.files.setupFirstAccount(...args);
  }

  logout(...args: Parameters<FilesService['logout']>) {
    return this.files.logout(...args);
  }

  validateSession(...args: Parameters<FilesService['validateSession']>) {
    return this.files.validateSession(...args);
  }

  listSecuritySessions(...args: Parameters<FilesService['listSecuritySessions']>) {
    return this.files.listSecuritySessions(...args);
  }

  revokeSecuritySession(...args: Parameters<FilesService['revokeSecuritySession']>) {
    return this.files.revokeSecuritySession(...args);
  }

  getMe(...args: Parameters<FilesService['getMe']>) {
    return this.files.getMe(...args);
  }

  updateProfile(...args: Parameters<FilesService['updateProfile']>) {
    return this.files.updateProfile(...args);
  }

  deleteAccount(...args: Parameters<FilesService['deleteAccount']>) {
    return this.files.deleteAccount(...args);
  }

  notifications(...args: Parameters<FilesService['notifications']>) {
    return this.files.notifications(...args);
  }

  markNotificationsRead(...args: Parameters<FilesService['markNotificationsRead']>) {
    return this.files.markNotificationsRead(...args);
  }

  clearNotifications(...args: Parameters<FilesService['clearNotifications']>) {
    return this.files.clearNotifications(...args);
  }
}
