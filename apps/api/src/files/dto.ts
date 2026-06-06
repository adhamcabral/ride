import { Transform, Type } from 'class-transformer';
import {
  IsArray,
  IsBase64,
  IsBoolean,
  IsEmail,
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  Length,
  MaxLength,
  Min,
  ValidateNested
} from 'class-validator';

export class ListFilesQueryDto {
  @IsOptional()
  @IsString()
  ownerId?: string;

  @IsOptional()
  @IsString()
  parentId?: string;

  @IsOptional()
  @IsString()
  q?: string;

  @IsOptional()
  @IsIn([
    'personal',
    'activity',
    'workspace',
    'drive',
    'shared-drives',
    'shared-with-me',
    'recent',
    'starred',
    'spam',
    'trash',
    'storage'
  ])
  section?: DriveSection;

  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  starred?: boolean;

  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  trashed?: boolean;

  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  deep?: boolean;

  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  advanced?: boolean;

  @IsOptional()
  @IsIn(['any', 'folder', 'pdfs', 'docs', 'sheets', 'slides', 'images', 'videos'])
  itemType?: 'any' | 'folder' | 'pdfs' | 'docs' | 'sheets' | 'slides' | 'images' | 'videos';

  @IsOptional()
  @IsString()
  advancedOwnerId?: string;

  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  content?: string;

  @IsOptional()
  @IsIn(['any', 'drive', 'shared', 'folder'])
  location?: 'any' | 'drive' | 'shared' | 'folder';

  @IsOptional()
  @IsString()
  locationFolderId?: string;

  @IsOptional()
  @IsString()
  modifiedAfter?: string;

  @IsOptional()
  @IsString()
  modifiedBefore?: string;

  @IsOptional()
  @IsString()
  sharedWith?: string;
}

export type DriveSection =
  | 'personal'
  | 'activity'
  | 'workspace'
  | 'drive'
  | 'shared-drives'
  | 'shared-with-me'
  | 'recent'
  | 'starred'
  | 'spam'
  | 'trash'
  | 'storage';

export class CreateFolderDto {
  @IsString()
  @Length(1, 120)
  name!: string;

  @IsOptional()
  @IsString()
  ownerId?: string;

  @IsOptional()
  @IsString()
  parentId?: string | null;

  @IsOptional()
  @IsString()
  color?: string | null;
}

export class UpdateItemDto {
  @IsOptional()
  @IsString()
  @Length(1, 120)
  name?: string;

  @IsOptional()
  @IsString()
  parentId?: string | null;

  @IsOptional()
  @IsBoolean()
  starred?: boolean;

  @IsOptional()
  @IsBoolean()
  trashed?: boolean;

  @IsOptional()
  @IsBoolean()
  spam?: boolean;

  @IsOptional()
  @IsString({ each: true })
  sharedWith?: string[];

  @IsOptional()
  @IsString()
  color?: string | null;

  @IsOptional()
  @IsString()
  @Length(0, 25000)
  description?: string | null;
}

export class SharePermissionDto {
  @IsString()
  userId!: string;

  @IsIn(['reader', 'commenter', 'editor'])
  role!: 'reader' | 'commenter' | 'editor';
}

export class ShareItemAccessDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SharePermissionDto)
  users!: SharePermissionDto[];

  @IsOptional()
  @IsIn(['reader', 'commenter', 'editor', null])
  linkRole?: 'reader' | 'commenter' | 'editor' | null;
}

export class FileAccessTicketDto {
  @IsIn(['download', 'preview', 'pdf-page'])
  scope!: 'download' | 'preview' | 'pdf-page';
}

export class SaveTextContentDto {
  @IsString()
  content!: string;
}

export class SaveBinaryContentDto {
  @IsString()
  @IsBase64()
  @MaxLength(32 * 1024 * 1024)
  contentBase64!: string;

  @IsOptional()
  @IsString()
  mimeType?: string;
}

export class UploadFileDto {
  @IsOptional()
  @IsString()
  ownerId?: string;

  @IsOptional()
  @IsString()
  parentId?: string | null;
}

export class CopyItemDto {
  @IsOptional()
  @IsString()
  parentId?: string | null;
}

export class CreateAccountDto {
  @IsString()
  @Length(1, 80)
  name!: string;

  @IsEmail()
  email!: string;

  @IsOptional()
  @IsIn(['admin', 'user'])
  role?: 'admin' | 'user';

  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsInt()
  @Min(1)
  storageQuotaGb?: number;

  @IsOptional()
  @IsString()
  @Length(6, 128)
  password?: string;
}

export class UpdateAccountDto {
  @IsOptional()
  @IsString()
  @Length(1, 80)
  name?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsIn(['admin', 'user'])
  role?: 'admin' | 'user';

  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsInt()
  @Min(1)
  storageQuotaGb?: number;
}

export class SortDto {
  @IsOptional()
  @IsIn(['name', 'updatedAt', 'size'])
  field?: 'name' | 'updatedAt' | 'size';
}

export class LoginDto {
  @IsEmail()
  email!: string;

  @IsString()
  @Length(1, 128)
  password!: string;

  @IsOptional()
  @IsObject()
  sessionMetadata?: Record<string, unknown>;
}

export class LoginLookupDto {
  @IsEmail()
  email!: string;
}

export class UpdateProfileDto {
  @IsOptional()
  @IsString()
  @Length(1, 80)
  name?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  avatarColor?: string;

  @IsOptional()
  @IsString()
  avatarUrl?: string | null;

  @IsOptional()
  @IsString()
  @Length(1, 128)
  currentPassword?: string;

  @IsOptional()
  @IsString()
  @Length(6, 128)
  newPassword?: string;
}

export class DeleteAccountDto {
  @IsString()
  @Length(1, 128)
  password!: string;
}

export class SetupAccountDto {
  @IsString()
  @Length(1, 80)
  name!: string;

  @IsEmail()
  email!: string;

  @IsString()
  @Length(6, 128)
  password!: string;

  @IsOptional()
  @IsObject()
  sessionMetadata?: Record<string, unknown>;
}

export class UpdateSettingsDto {
  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsInt()
  @Min(1)
  trashRetentionDays?: number;

  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  backupScheduleEnabled?: boolean;

  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsInt()
  @Min(1)
  backupIntervalHours?: number;

  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsInt()
  @Min(1)
  backupRetentionCount?: number;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  backupTargetPaths?: string[];

  @IsOptional()
  @IsString()
  backupDirectory?: string;
}

export class AdminSetPasswordDto {
  @IsString()
  @Length(6, 128)
  password!: string;
}

export class StorageAuditDto {
  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  repair?: boolean;

  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  removeOrphans?: boolean;
}
