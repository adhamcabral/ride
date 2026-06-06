#!/usr/bin/env node

const { existsSync } = require('node:fs');
const { resolve } = require('node:path');
const { config: loadEnv } = require('dotenv');

const rootDir = resolve(__dirname, '..');
const apiDir = resolve(rootDir, 'apps/api');
const email = process.argv[2];

if (!email) {
  console.error('Uso: npm run admin:promote -- usuario@email.com');
  process.exit(1);
}

for (const envPath of [resolve(rootDir, '.env'), resolve(apiDir, '.env')]) {
  if (existsSync(envPath)) loadEnv({ path: envPath });
}

process.chdir(apiDir);
require('ts-node/register');

const { FilesService } = require('../apps/api/src/files/files.service.ts');

async function main() {
  const service = new FilesService();
  try {
    const user = await service.promoteAdminRecovery(email);
    console.log(`Conta promovida para admin: ${user.email}`);
  } finally {
    service.onModuleDestroy();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : 'Falha ao promover conta.');
  process.exit(1);
});
