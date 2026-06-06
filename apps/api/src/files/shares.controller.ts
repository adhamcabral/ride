import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  Req,
  Res,
  StreamableFile,
  UploadedFile,
  UseInterceptors
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Request, Response } from 'express';
import { lookup } from 'mime-types';
import { DriveSharesService } from './drive-shares.service';
import { CreateFolderDto, SaveBinaryContentDto, SaveTextContentDto, UpdateItemDto } from './dto';

type MimeSubject = { name: string; mimeType: string | null };

function apiBaseUrl(req: Request): string {
  return (process.env.PUBLIC_API_URL ?? `${req.protocol}://${req.get('host')}/api`).replace(/\/+$/, '');
}

function resolvedContentType(item: MimeSubject): string {
  const stored = item.mimeType?.trim();
  if (stored && stored !== 'application/octet-stream') return stored;
  return lookup(item.name) || stored || 'application/octet-stream';
}

@Controller('shares')
export class SharesController {
  constructor(private readonly shares: DriveSharesService) {}

  @Get(':token')
  get(@Param('token') token: string) {
    return this.shares.getShared(token);
  }

  @Get(':token/children')
  children(
    @Param('token') token: string,
    @Query('parentId') parentId?: string,
    @Query('q') q?: string,
    @Query('deep') deep?: string
  ) {
    return this.shares.getSharedChildren(token, parentId, q, deep === 'true');
  }

  @Post(':token/folders')
  createFolder(@Param('token') token: string, @Body() dto: CreateFolderDto) {
    return this.shares.createSharedFolder(token, dto);
  }

  @Post(':token/upload')
  @UseInterceptors(FileInterceptor('file'))
  upload(
    @Param('token') token: string,
    @UploadedFile() file: Express.Multer.File,
    @Body('parentId') parentId?: string
  ) {
    return this.shares.uploadShared(token, file, parentId);
  }

  @Patch(':token/items/:id')
  update(@Param('token') token: string, @Param('id') id: string, @Body() dto: UpdateItemDto) {
    return this.shares.updateSharedItem(token, id, dto);
  }

  @Delete(':token/items/:id')
  delete(@Param('token') token: string, @Param('id') id: string) {
    return this.shares.deleteSharedItem(token, id);
  }

  @Get(':token/items/:id/preview')
  async preview(
    @Param('token') token: string,
    @Param('id') id: string,
    @Req() req: Request,
    @Res({ passthrough: true }) response: Response
  ) {
    const { item, path } = await this.shares.getSharedDownload(token, id);
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
          return new StreamableFile(this.shares.createReadStream(path, { start, end }));
        }
      }
      response.status(416);
      response.set({ 'Content-Range': `bytes */${item.size}` });
      return;
    }

    response.set({ ...baseHeaders, 'Content-Length': item.size });
    return new StreamableFile(this.shares.createReadStream(path));
  }

  @Get(':token/items/:id/pdf-info')
  pdfInfo(@Param('token') token: string, @Param('id') id: string) {
    return this.shares.getSharedPdfInfo(token, id);
  }

  @Get(':token/items/:id/office/config')
  officeConfig(
    @Param('token') token: string,
    @Param('id') id: string,
    @Query('mode') mode: 'view' | 'edit' | undefined,
    @Req() req: Request
  ) {
    const base = apiBaseUrl(req);
    return this.shares.getSharedOfficeConfig(token, id, {
      mode: mode === 'edit' ? 'edit' : 'view',
      fileUrl: `${base}/shares/${encodeURIComponent(token)}/items/${encodeURIComponent(id)}/download`,
      callbackUrl: `${base}/shares/${encodeURIComponent(token)}/items/${encodeURIComponent(id)}/office/callback`
    });
  }

  @Post(':token/items/:id/office/callback')
  @HttpCode(200)
  officeCallback(@Param('token') token: string, @Param('id') id: string, @Body() body: any) {
    return this.shares.handleSharedOfficeCallback(token, id, body);
  }

  @Get(':token/items/:id/pages/:page.png')
  async pdfPage(
    @Param('token') token: string,
    @Param('id') id: string,
    @Param('page') page: string,
    @Res({ passthrough: true }) response: Response
  ) {
    const image = await this.shares.renderSharedPdfPage(token, id, page);
    response.set({
      'Cache-Control': 'private, no-store',
      'Content-Length': image.length,
      'Content-Type': 'image/png'
    });
    return new StreamableFile(image);
  }

  @Post(':token/items/:id/text')
  saveText(@Param('token') token: string, @Param('id') id: string, @Body() dto: SaveTextContentDto) {
    return this.shares.saveSharedTextContent(token, id, dto);
  }

  @Post(':token/items/:id/content')
  saveBinary(@Param('token') token: string, @Param('id') id: string, @Body() dto: SaveBinaryContentDto) {
    return this.shares.saveSharedBinaryContent(token, id, dto);
  }

  @Get(':token/download')
  @Header('Cache-Control', 'private, max-age=60')
  async download(@Param('token') token: string, @Res({ passthrough: true }) response: Response) {
    const { item, path } = await this.shares.getSharedDownload(token);
    response.set({
      'Content-Type': resolvedContentType(item),
      'Content-Disposition': `attachment; filename="${encodeURIComponent(item.name)}"`,
      'Content-Length': item.size
    });
    return new StreamableFile(this.shares.createReadStream(path));
  }

  @Get(':token/items/:id/download')
  @Header('Cache-Control', 'private, max-age=60')
  async downloadItem(
    @Param('token') token: string,
    @Param('id') id: string,
    @Res({ passthrough: true }) response: Response
  ) {
    const { item, path } = await this.shares.getSharedDownload(token, id);
    response.set({
      'Content-Type': resolvedContentType(item),
      'Content-Disposition': `attachment; filename="${encodeURIComponent(item.name)}"`,
      'Content-Length': item.size
    });
    return new StreamableFile(this.shares.createReadStream(path));
  }
}
