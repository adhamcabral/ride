import { Injectable } from '@nestjs/common';
import { FilesService } from './files.service';

@Injectable()
export class DriveAccountsService {
  constructor(private readonly files: FilesService) {}

  accounts(...args: Parameters<FilesService['accounts']>) {
    return this.files.accounts(...args);
  }

  createAccount(...args: Parameters<FilesService['createAccount']>) {
    return this.files.createAccount(...args);
  }

  updateAccount(...args: Parameters<FilesService['updateAccount']>) {
    return this.files.updateAccount(...args);
  }

  deleteAdminAccount(...args: Parameters<FilesService['deleteAdminAccount']>) {
    return this.files.deleteAdminAccount(...args);
  }

  adminSetPassword(...args: Parameters<FilesService['adminSetPassword']>) {
    return this.files.adminSetPassword(...args);
  }
}
