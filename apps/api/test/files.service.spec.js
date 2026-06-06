const assert = require('node:assert/strict');
const { existsSync, mkdirSync, statSync, writeFileSync } = require('node:fs');
const { rm } = require('node:fs/promises');
const { tmpdir } = require('node:os');
const { basename, join } = require('node:path');
const test = require('node:test');

require('ts-node/register');

const { FilesService } = require('../src/files/files.service.ts');

function createWorkspace() {
  const root = join(tmpdir(), `ride-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(root, { recursive: true });
  return root;
}

async function withService(fn) {
  const previousCwd = process.cwd();
  const previousStorageDir = process.env.STORAGE_DIR;
  const root = createWorkspace();
  process.chdir(root);
  process.env.STORAGE_DIR = 'data';
  const service = new FilesService();
  try {
    return await fn(service, root);
  } finally {
    service.onModuleDestroy();
    process.chdir(previousCwd);
    if (previousStorageDir === undefined) delete process.env.STORAGE_DIR;
    else process.env.STORAGE_DIR = previousStorageDir;
    await rm(root, { recursive: true, force: true });
  }
}

test('first-run setup creates an admin session in SQLite storage', async () => {
  await withService(async (service, root) => {
    assert.deepEqual(await service.setupStatus(), { setupRequired: true });

    const result = await service.setupFirstAccount({
      name: 'Admin',
      email: 'admin@example.com',
      password: 'secret123'
    });

    assert.equal(result.user.role, 'admin');
    assert.equal(await service.validateSession(result.token), result.user.id);
    assert.equal(existsSync(join(root, 'data', 'ride.sqlite')), true);
    assert.deepEqual(await service.setupStatus(), { setupRequired: false });
  });
});

test('concurrent folder creation is serialized and preserves every write', async () => {
  await withService(async (service) => {
    const { user } = await service.setupFirstAccount({
      name: 'Admin',
      email: 'admin@example.com',
      password: 'secret123'
    });

    const created = await Promise.all(
      Array.from({ length: 25 }, () => service.createFolder(user.id, { name: 'Projetos' }))
    );
    const names = new Set(created.map((item) => item.name));
    const listed = await service.list(user.id, { section: 'drive' });

    assert.equal(created.length, 25);
    assert.equal(names.size, 25);
    assert.equal(listed.length, 25);
    assert.equal(listed.filter((item) => item.name.startsWith('Projetos')).length, 25);
  });
});

test('disk-backed upload moves the temporary file into object storage', async () => {
  await withService(async (service, root) => {
    const { user } = await service.setupFirstAccount({
      name: 'Admin',
      email: 'admin@example.com',
      password: 'secret123'
    });
    const tempDir = join(root, 'data', 'tmp');
    mkdirSync(tempDir, { recursive: true });
    const tempFile = join(tempDir, 'incoming.upload');
    writeFileSync(tempFile, 'hello ride');

    const uploaded = await service.upload(user.id, {
      fieldname: 'file',
      originalname: 'hello.txt',
      encoding: '7bit',
      mimetype: 'text/plain',
      size: statSync(tempFile).size,
      destination: tempDir,
      filename: 'incoming.upload',
      path: tempFile
    });

    assert.equal(uploaded.name, 'hello.txt');
    assert.equal(uploaded.size, 10);
    assert.match(uploaded.checksum, /^[a-f0-9]{64}$/);
    assert.equal(existsSync(tempFile), false);
    assert.equal(existsSync(join(root, 'data', 'objects', uploaded.storageKey)), true);

    const summary = await service.summary(user.id);
    assert.equal(summary.usedBytes, 10);
    assert.equal(summary.fileCount, 1);
  });
});

test('maintenance can audit, create complete backups, mirror them, and restore files', async () => {
  await withService(async (service, root) => {
    const { user } = await service.setupFirstAccount({
      name: 'Admin',
      email: 'admin@example.com',
      password: 'secret123'
    });
    const tempDir = join(root, 'data', 'tmp');
    mkdirSync(tempDir, { recursive: true });
    const tempFile = join(tempDir, 'incoming.upload');
    writeFileSync(tempFile, 'snapshot content');

    const uploaded = await service.upload(user.id, {
      fieldname: 'file',
      originalname: 'snapshot.txt',
      encoding: '7bit',
      mimetype: 'text/plain',
      size: statSync(tempFile).size,
      destination: tempDir,
      filename: 'incoming.upload',
      path: tempFile
    });

    const audit = await service.auditStorage(user.id, { repair: true, removeOrphans: true });
    assert.equal(audit.checkedFiles, 1);
    assert.equal(audit.missingObjects.length, 0);
    assert.equal(audit.checksumMismatches.length, 0);

    const backup = await service.backupDatabase(user.id);
    assert.equal(existsSync(backup.path), true);
    assert.match(backup.path, /\.tar\.gz$/);
    assert.ok(backup.bytes > 0);

    const mirrorDir = join(root, 'mirror-backups');
    const settings = await service.updateSettings(user.id, {
      backupScheduleEnabled: true,
      backupIntervalHours: 12,
      backupRetentionCount: 1,
      backupTargetPaths: [mirrorDir]
    });
    assert.equal(settings.backupSchedule.enabled, true);
    assert.equal(settings.backupSchedule.intervalHours, 12);
    assert.equal(settings.backupSchedule.retentionCount, 1);
    assert.deepEqual(settings.backupSchedule.targetPaths, [mirrorDir]);

    const secondBackup = await service.backupDatabase(user.id);
    assert.equal(existsSync(secondBackup.path), true);
    assert.equal(existsSync(join(mirrorDir, basename(secondBackup.path))), true);
    assert.equal(existsSync(backup.path), false);

    const transientFolder = await service.createFolder(user.id, { name: 'temporario' });
    assert.equal((await service.list(user.id, { section: 'drive' })).some((item) => item.id === transientFolder.id), true);
    const sourceObject = join(root, 'data', 'objects', uploaded.storageKey);
    await service.remove(user.id, uploaded.id, true);
    assert.equal(existsSync(sourceObject), false);
    await service.restoreDatabaseBackup(user.id, secondBackup.id);
    assert.equal((await service.list(user.id, { section: 'drive' })).some((item) => item.id === transientFolder.id), false);
    assert.equal(existsSync(sourceObject), true);
  });
});

test('deleting the last account removes data and returns the project to setup', async () => {
  await withService(async (service, root) => {
    const { user } = await service.setupFirstAccount({
      name: 'Admin',
      email: 'admin@example.com',
      password: 'secret123'
    });
    const tempDir = join(root, 'data', 'tmp');
    mkdirSync(tempDir, { recursive: true });
    const tempFile = join(tempDir, 'delete.upload');
    writeFileSync(tempFile, 'delete me');

    const uploaded = await service.upload(user.id, {
      fieldname: 'file',
      originalname: 'delete.txt',
      encoding: '7bit',
      mimetype: 'text/plain',
      size: statSync(tempFile).size,
      destination: tempDir,
      filename: 'delete.upload',
      path: tempFile
    });
    const backup = await service.backupDatabase(user.id);
    const objectPath = join(root, 'data', 'objects', uploaded.storageKey);

    assert.equal(existsSync(objectPath), true);
    assert.equal(existsSync(backup.path), true);

    const result = await service.deleteAccount(user.id, 'secret123');
    assert.deepEqual(result, { ok: true, setupRequired: true, deletedAccountId: user.id });
    assert.deepEqual(await service.setupStatus(), { setupRequired: true });
    assert.equal(existsSync(objectPath), false);
    assert.equal(existsSync(backup.path), false);
  });
});

test('admin deletion removes the target account files and sessions only', async () => {
  await withService(async (service, root) => {
    const { user: admin } = await service.setupFirstAccount({
      name: 'Admin',
      email: 'admin@example.com',
      password: 'secret123'
    });
    const user = await service.createAccount(admin.id, {
      name: 'User',
      email: 'user@example.com',
      password: 'secret456'
    });
    const tempDir = join(root, 'data', 'tmp');
    mkdirSync(tempDir, { recursive: true });
    const tempFile = join(tempDir, 'target.upload');
    writeFileSync(tempFile, 'target content');

    const uploaded = await service.upload(user.id, {
      fieldname: 'file',
      originalname: 'target.txt',
      encoding: '7bit',
      mimetype: 'text/plain',
      size: statSync(tempFile).size,
      destination: tempDir,
      filename: 'target.upload',
      path: tempFile
    });
    const objectPath = join(root, 'data', 'objects', uploaded.storageKey);
    assert.equal(existsSync(objectPath), true);

    const result = await service.deleteAdminAccount(admin.id, user.id);
    assert.deepEqual(result, { ok: true, setupRequired: false, deletedAccountId: user.id });
    assert.equal(existsSync(objectPath), false);
    assert.deepEqual(await service.setupStatus(), { setupRequired: false });
    assert.equal((await service.accounts(admin.id)).some((account) => account.id === user.id), false);
  });
});

test('admin cannot demote the last administrator', async () => {
  await withService(async (service) => {
    const { user: admin } = await service.setupFirstAccount({
      name: 'Admin',
      email: 'admin@example.com',
      password: 'secret123'
    });

    await assert.rejects(
      service.updateAccount(admin.id, admin.id, { role: 'user' }),
      /último administrador/
    );
    assert.deepEqual(await service.setupStatus(), { setupRequired: false });
  });
});

test('file access tickets are scoped to a single file and action', async () => {
  await withService(async (service, root) => {
    const { user } = await service.setupFirstAccount({
      name: 'Admin',
      email: 'admin@example.com',
      password: 'secret123'
    });
    const tempDir = join(root, 'data', 'tmp');
    mkdirSync(tempDir, { recursive: true });
    const tempFile = join(tempDir, 'ticket.upload');
    writeFileSync(tempFile, 'ticket content');

    const uploaded = await service.upload(user.id, {
      fieldname: 'file',
      originalname: 'ticket.txt',
      encoding: '7bit',
      mimetype: 'text/plain',
      size: statSync(tempFile).size,
      destination: tempDir,
      filename: 'ticket.upload',
      path: tempFile
    });

    const { ticket } = await service.createFileAccessTicket(user.id, uploaded.id, 'preview');
    assert.equal(await service.validateFileAccessTicket(ticket, uploaded.id, 'preview'), user.id);
    assert.equal(await service.validateFileAccessTicket(ticket, uploaded.id, 'download'), null);
    assert.equal(await service.validateFileAccessTicket(`${ticket}x`, uploaded.id, 'preview'), null);
  });
});

test('users can list safe account records for sharing', async () => {
  await withService(async (service) => {
    const { user: admin } = await service.setupFirstAccount({
      name: 'Admin',
      email: 'admin@example.com',
      password: 'secret123'
    });
    const user = await service.createAccount(admin.id, {
      name: 'User',
      email: 'user@example.com',
      password: 'secret456'
    });

    assert.equal((await service.accounts(admin.id)).length, 2);
    const listed = await service.accounts(user.id);
    assert.equal(listed.length, 2);
    assert.equal(listed.some((account) => account.id === admin.id), true);
    assert.equal(listed.some((account) => account.id === user.id), true);
    assert.equal(listed.some((account) => 'passwordHash' in account), false);
  });
});

test('admin recovery promotion only works when no admin exists', async () => {
  await withService(async (service) => {
    const { user: admin } = await service.setupFirstAccount({
      name: 'Admin',
      email: 'admin@example.com',
      password: 'secret123'
    });
    const user = await service.createAccount(admin.id, {
      name: 'User',
      email: 'user@example.com',
      password: 'secret456'
    });

    await assert.rejects(() => service.promoteAdminRecovery(user.email), /administradora/);

    const library = await service.readLibrary();
    library.users = library.users.map((current) => (current.id === admin.id ? { ...current, role: 'user' } : current));
    await service.writeLibrary(library);

    const recovered = await service.promoteAdminRecovery(user.email);
    assert.equal(recovered.role, 'admin');
    await assert.rejects(() => service.promoteAdminRecovery(admin.email), /administradora/);
  });
});

test('copying a share link does not publish restricted files or folders', async () => {
  await withService(async (service, root) => {
    const { user } = await service.setupFirstAccount({
      name: 'Admin',
      email: 'admin@example.com',
      password: 'secret123'
    });
    const folder = await service.createFolder(user.id, { name: 'Privado' });
    const tempDir = join(root, 'data', 'tmp');
    mkdirSync(tempDir, { recursive: true });
    const tempFile = join(tempDir, 'private.upload');
    writeFileSync(tempFile, 'private content');

    const file = await service.upload(user.id, {
      fieldname: 'file',
      originalname: 'private.txt',
      encoding: '7bit',
      mimetype: 'text/plain',
      size: statSync(tempFile).size,
      destination: tempDir,
      filename: 'private.upload',
      path: tempFile
    });

    for (const item of [folder, file]) {
      const restrictedLink = await service.share(user.id, item.id);
      assert.ok(restrictedLink.token);

      const restricted = await service.get(user.id, item.id);
      assert.equal(restricted.linkRole, null);
      assert.equal(restricted.sharedToken, restrictedLink.token);
      await assert.rejects(() => service.getShared(restrictedLink.token), {
        message: /Compartilhamento não encontrado/
      });

      await service.shareAccess(user.id, item.id, { users: [], linkRole: 'reader' });
      const publicLink = await service.share(user.id, item.id);
      assert.equal(publicLink.token, restrictedLink.token);
      const shared = await service.getShared(publicLink.token);
      assert.equal(shared.id, item.id);

      await service.shareAccess(user.id, item.id, { users: [], linkRole: null });
      const stillRestrictedLink = await service.share(user.id, item.id);
      assert.equal(stillRestrictedLink.token, restrictedLink.token);
      await assert.rejects(() => service.getShared(publicLink.token), {
        message: /Compartilhamento não encontrado/
      });
    }
  });
});
