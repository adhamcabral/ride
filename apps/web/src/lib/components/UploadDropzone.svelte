<script lang="ts">
  import { createEventDispatcher } from 'svelte';

  export let active = false;

  type DroppedEntry = {
    isFile: boolean;
    isDirectory: boolean;
    name: string;
  };

  type DroppedFileEntry = DroppedEntry & {
    file: (success: (file: File) => void, error?: (error: DOMException) => void) => void;
  };

  type DroppedDirectoryEntry = DroppedEntry & {
    createReader: () => {
      readEntries: (
        success: (entries: DroppedEntry[]) => void,
        error?: (error: DOMException) => void
      ) => void;
    };
  };

  type DataTransferItemWithEntry = DataTransferItem & {
    webkitGetAsEntry?: () => DroppedEntry | null;
  };

  const dispatch = createEventDispatcher<{ files: FileList | File[] }>();

  function setRelativePath(file: File, relativePath: string) {
    try {
      Object.defineProperty(file, 'webkitRelativePath', {
        value: relativePath,
        configurable: true
      });
    } catch {
      Object.defineProperty(file, 'relativePath', {
        value: relativePath,
        configurable: true
      });
    }
    return file;
  }

  function readFileEntry(entry: DroppedFileEntry, parentPath: string) {
    return new Promise<File[]>((resolve, reject) => {
      entry.file(
        (file) => resolve([setRelativePath(file, parentPath ? `${parentPath}/${file.name}` : file.name)]),
        reject
      );
    });
  }

  async function readDirectoryEntry(entry: DroppedDirectoryEntry, parentPath: string) {
    const reader = entry.createReader();
    const entries: DroppedEntry[] = [];
    const basePath = parentPath ? `${parentPath}/${entry.name}` : entry.name;

    while (true) {
      const batch = await new Promise<DroppedEntry[]>((resolve, reject) => {
        reader.readEntries(resolve, reject);
      });
      if (!batch.length) break;
      entries.push(...batch);
    }

    const nestedFiles = await Promise.all(entries.map((child) => readEntry(child, basePath)));
    return nestedFiles.flat();
  }

  function readEntry(entry: DroppedEntry, parentPath = ''): Promise<File[]> {
    if (entry.isFile) return readFileEntry(entry as DroppedFileEntry, parentPath);
    if (entry.isDirectory) return readDirectoryEntry(entry as DroppedDirectoryEntry, parentPath);
    return Promise.resolve([]);
  }

  async function getDroppedFiles(dataTransfer: DataTransfer | null) {
    if (!dataTransfer) return [];
    const items = Array.from(dataTransfer.items ?? []) as DataTransferItemWithEntry[];
    const entries = items.map((item) => item.webkitGetAsEntry?.()).filter(Boolean) as DroppedEntry[];

    if (entries.length) {
      const files = await Promise.all(entries.map((entry) => readEntry(entry)));
      return files.flat();
    }

    return Array.from(dataTransfer.files ?? []);
  }

  function isExternalFileDrag(event: DragEvent) {
    const types = Array.from(event.dataTransfer?.types ?? []);
    return types.includes('Files') && !types.includes('application/x-ride-items');
  }

  async function handleDrop(event: DragEvent) {
    event.preventDefault();
    active = false;
    if (!isExternalFileDrag(event)) return;
    const files = await getDroppedFiles(event.dataTransfer);
    if (files.length) dispatch('files', files);
  }

  function handleDragOver(event: DragEvent) {
    if (!isExternalFileDrag(event)) return;
    event.preventDefault();
    active = true;
  }
</script>

<div
  role="presentation"
  class="pointer-events-none fixed inset-0 z-40 flex items-center justify-center bg-[#1a73e8]/10 p-6 backdrop-blur-sm transition-opacity {active
    ? 'pointer-events-auto opacity-100'
    : 'opacity-0'}"
  on:dragover={handleDragOver}
  on:dragleave={() => (active = false)}
  on:drop={handleDrop}
>
  <div
    class="flex w-full max-w-md flex-col items-center gap-4 rounded-2xl border-2 border-dashed border-[#1a73e8] bg-white p-10 shadow-modal"
  >
    <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="#1a73e8">
      <path
        d="M19.35 10.04C18.67 6.59 15.64 4 12 4 9.11 4 6.6 5.64 5.35 8.04 2.34 8.36 0 10.91 0 14c0 3.31 2.69 6 6 6h13c2.76 0 5-2.24 5-5 0-2.64-2.05-4.78-4.65-4.96zM14 13v4h-4v-4H7l5-5 5 5h-3z"
      />
    </svg>
    <div class="text-center">
      <h2 class="text-[18px] font-normal text-[#202124]">Solte os arquivos aqui</h2>
      <p class="mt-1 text-[14px] text-[#5f6368]">Os arquivos serão enviados para a pasta atual</p>
    </div>
  </div>
</div>
