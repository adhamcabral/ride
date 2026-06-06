import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Request } from 'express';
import { FilesService } from './files.service';

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private readonly service: FilesService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request & { userId?: string }>();
    const token = req.headers.authorization?.replace(/^Bearer\s+/i, '');
    if (!token) throw new UnauthorizedException('Autenticação necessária.');
    const userId = await this.service.validateSession(token);
    if (!userId) throw new UnauthorizedException('Sessão inválida ou expirada. Faça login novamente.');
    req.userId = userId;
    return true;
  }
}
