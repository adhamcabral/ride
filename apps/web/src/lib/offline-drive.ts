import type { DriveItem } from '$lib/types';

const DB_NAME = 'ride-offline';
const DB_VERSION = 1;
const STORE = 'files';

export type OfflineDriveFile = {
  key: string;
  accountId: string;
  item: DriveItem;
  blob: Blob;
  pdfPages?: Array<{ page: number; blob: Blob; width: number | null; height: number | null }>;
  mimeType: string;
  size: number;
  storedAt: string;
};

function offlineKey(accountId: string, itemId: string) {
  return `${accountId}:${itemId}`;
}

function openOfflineDb() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('Storage offline indisponível neste navegador.'));
      return;
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onerror = () => reject(request.error ?? new Error('Não foi possível abrir o storage offline.'));
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: 'key' });
        store.createIndex('accountId', 'accountId', { unique: false });
        store.createIndex('storedAt', 'storedAt', { unique: false });
      }
    };
    request.onsuccess = () => resolve(request.result);
  });
}

function withStore<T>(mode: IDBTransactionMode, action: (store: IDBObjectStore) => IDBRequest<T>) {
  return openOfflineDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const tx = db.transaction(STORE, mode);
        const store = tx.objectStore(STORE);
        const request = action(store);
        request.onerror = () => reject(request.error ?? new Error('Operação offline falhou.'));
        request.onsuccess = () => resolve(request.result);
        tx.oncomplete = () => db.close();
        tx.onerror = () => {
          db.close();
          reject(tx.error ?? new Error('Operação offline falhou.'));
        };
      })
  );
}

export async function saveOfflineFile(
  accountId: string,
  item: DriveItem,
  blob: Blob,
  pdfPages?: Array<{ page: number; blob: Blob; width: number | null; height: number | null }>
) {
  const record: OfflineDriveFile = {
    key: offlineKey(accountId, item.id),
    accountId,
    item: {
      ...item,
      mimeType: blob.type || item.mimeType || 'application/octet-stream',
      size: blob.size || item.size,
      updatedAt: item.updatedAt
    },
    blob,
    pdfPages,
    mimeType: blob.type || item.mimeType || 'application/octet-stream',
    size: blob.size || item.size,
    storedAt: new Date().toISOString()
  };
  await withStore('readwrite', (store) => store.put(record));
  return record;
}

export async function listOfflineFiles(accountId: string) {
  const db = await openOfflineDb();
  return new Promise<OfflineDriveFile[]>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const index = tx.objectStore(STORE).index('accountId');
    const request = index.getAll(accountId);
    request.onerror = () => reject(request.error ?? new Error('Não foi possível listar arquivos offline.'));
    request.onsuccess = () => {
      const records = (request.result as OfflineDriveFile[]).sort(
        (a, b) => Date.parse(b.storedAt) - Date.parse(a.storedAt)
      );
      resolve(records);
    };
    tx.oncomplete = () => db.close();
    tx.onerror = () => {
      db.close();
      reject(tx.error ?? new Error('Não foi possível listar arquivos offline.'));
    };
  });
}

export function getOfflineFile(accountId: string, itemId: string) {
  return withStore<OfflineDriveFile | undefined>('readonly', (store) => store.get(offlineKey(accountId, itemId)));
}
