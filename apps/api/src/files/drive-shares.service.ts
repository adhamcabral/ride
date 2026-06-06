import { Injectable } from '@nestjs/common';
import { FilesService } from './files.service';

@Injectable()
export class DriveSharesService {
  constructor(private readonly files: FilesService) {}

  getShared(...args: Parameters<FilesService['getShared']>) {
    return this.files.getShared(...args);
  }

  getSharedChildren(...args: Parameters<FilesService['getSharedChildren']>) {
    return this.files.getSharedChildren(...args);
  }

  createSharedFolder(...args: Parameters<FilesService['createSharedFolder']>) {
    return this.files.createSharedFolder(...args);
  }

  uploadShared(...args: Parameters<FilesService['uploadShared']>) {
    return this.files.uploadShared(...args);
  }

  updateSharedItem(...args: Parameters<FilesService['updateSharedItem']>) {
    return this.files.updateSharedItem(...args);
  }

  deleteSharedItem(...args: Parameters<FilesService['deleteSharedItem']>) {
    return this.files.deleteSharedItem(...args);
  }

  saveSharedTextContent(...args: Parameters<FilesService['saveSharedTextContent']>) {
    return this.files.saveSharedTextContent(...args);
  }

  saveSharedBinaryContent(...args: Parameters<FilesService['saveSharedBinaryContent']>) {
    return this.files.saveSharedBinaryContent(...args);
  }

  getSharedOfficeConfig(...args: Parameters<FilesService['getSharedOfficeConfig']>) {
    return this.files.getSharedOfficeConfig(...args);
  }

  handleSharedOfficeCallback(...args: Parameters<FilesService['handleSharedOfficeCallback']>) {
    return this.files.handleSharedOfficeCallback(...args);
  }

  getSharedDownload(...args: Parameters<FilesService['getSharedDownload']>) {
    return this.files.getSharedDownload(...args);
  }

  getSharedPdfInfo(...args: Parameters<FilesService['getSharedPdfInfo']>) {
    return this.files.getSharedPdfInfo(...args);
  }

  renderSharedPdfPage(...args: Parameters<FilesService['renderSharedPdfPage']>) {
    return this.files.renderSharedPdfPage(...args);
  }

  createReadStream(...args: Parameters<FilesService['createReadStream']>) {
    return this.files.createReadStream(...args);
  }
}
