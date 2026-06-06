import { Injectable } from '@nestjs/common';
import { FilesService } from './files.service';

@Injectable()
export class DriveItemsService {
  constructor(private readonly files: FilesService) {}

  list(...args: Parameters<FilesService['list']>) {
    return this.files.list(...args);
  }

  summary(...args: Parameters<FilesService['summary']>) {
    return this.files.summary(...args);
  }

  folders(...args: Parameters<FilesService['folders']>) {
    return this.files.folders(...args);
  }

  get(...args: Parameters<FilesService['get']>) {
    return this.files.get(...args);
  }

  markOpened(...args: Parameters<FilesService['markOpened']>) {
    return this.files.markOpened(...args);
  }

  breadcrumbs(...args: Parameters<FilesService['breadcrumbs']>) {
    return this.files.breadcrumbs(...args);
  }

  createFolder(...args: Parameters<FilesService['createFolder']>) {
    return this.files.createFolder(...args);
  }

  upload(...args: Parameters<FilesService['upload']>) {
    return this.files.upload(...args);
  }

  copy(...args: Parameters<FilesService['copy']>) {
    return this.files.copy(...args);
  }

  update(...args: Parameters<FilesService['update']>) {
    return this.files.update(...args);
  }

  saveTextContent(...args: Parameters<FilesService['saveTextContent']>) {
    return this.files.saveTextContent(...args);
  }

  saveBinaryContent(...args: Parameters<FilesService['saveBinaryContent']>) {
    return this.files.saveBinaryContent(...args);
  }

  createFileAccessTicket(...args: Parameters<FilesService['createFileAccessTicket']>) {
    return this.files.createFileAccessTicket(...args);
  }

  validateFileAccessTicket(...args: Parameters<FilesService['validateFileAccessTicket']>) {
    return this.files.validateFileAccessTicket(...args);
  }

  remove(...args: Parameters<FilesService['remove']>) {
    return this.files.remove(...args);
  }

  share(...args: Parameters<FilesService['share']>) {
    return this.files.share(...args);
  }

  shareAccess(...args: Parameters<FilesService['shareAccess']>) {
    return this.files.shareAccess(...args);
  }

  unshare(...args: Parameters<FilesService['unshare']>) {
    return this.files.unshare(...args);
  }

  getDownload(...args: Parameters<FilesService['getDownload']>) {
    return this.files.getDownload(...args);
  }

  getPdfInfo(...args: Parameters<FilesService['getPdfInfo']>) {
    return this.files.getPdfInfo(...args);
  }

  renderPdfPage(...args: Parameters<FilesService['renderPdfPage']>) {
    return this.files.renderPdfPage(...args);
  }

  getOfficeConfig(...args: Parameters<FilesService['getOfficeConfig']>) {
    return this.files.getOfficeConfig(...args);
  }

  handleOfficeCallback(...args: Parameters<FilesService['handleOfficeCallback']>) {
    return this.files.handleOfficeCallback(...args);
  }

  createReadStream(...args: Parameters<FilesService['createReadStream']>) {
    return this.files.createReadStream(...args);
  }
}
