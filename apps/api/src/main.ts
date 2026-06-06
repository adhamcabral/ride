import { existsSync } from 'fs';
import { resolve } from 'path';
import { config as loadEnv } from 'dotenv';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { json, urlencoded, type NextFunction, type Request, type Response } from 'express';
import { AppModule } from './app.module';

for (const envPath of [resolve(__dirname, '../../../.env'), resolve(process.cwd(), '.env')]) {
  if (existsSync(envPath)) loadEnv({ path: envPath });
}

function configuredCorsOrigins(): Set<string> {
  const origins = new Set([
    'http://127.0.0.1:5173',
    'http://localhost:5173',
    'https://localhost',
    'http://localhost',
    'capacitor://localhost',
    'ionic://localhost'
  ]);
  const appUrl = process.env.PUBLIC_APP_URL?.trim();
  if (appUrl) origins.add(appUrl.replace(/\/+$/, ''));
  for (const origin of (process.env.CORS_ORIGINS ?? '').split(',').map((value) => value.trim()).filter(Boolean)) {
    origins.add(origin.replace(/\/+$/, ''));
  }
  return origins;
}

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bodyParser: false });

  app.setGlobalPrefix('api');
  app.use(json({ limit: process.env.JSON_BODY_LIMIT ?? '32mb' }));
  app.use(urlencoded({ extended: true, limit: process.env.JSON_BODY_LIMIT ?? '32mb' }));
  const allowedOrigins = configuredCorsOrigins();
  app.enableCors({
    credentials: true,
    origin(origin: string | undefined, callback: (error: Error | null, allow?: boolean) => void) {
      if (!origin || allowedOrigins.has(origin.replace(/\/+$/, ''))) {
        callback(null, true);
        return;
      }
      callback(null, false);
    }
  });
  app.use((req: Request, res: Response, next: NextFunction) => {
    if (req.path.startsWith('/api') && !req.path.includes('/download')) {
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
      res.setHeader('Surrogate-Control', 'no-store');
    }
    next();
  });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      forbidUnknownValues: false
    })
  );

  const port = Number(process.env.API_PORT ?? 3333);
  const host = process.env.API_HOST ?? '0.0.0.0';
  await app.listen(port, host);
}

void bootstrap();
