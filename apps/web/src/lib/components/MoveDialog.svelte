<script lang="ts">
  import { createEventDispatcher, tick } from 'svelte';
  import type { DriveItem } from '$lib/types';

  export let item: DriveItem | null = null;
  export let items: DriveItem[] = [];
  export let folders: DriveItem[] = [];
  export let selectedFolderId: string | null = null;

  const dispatch = createEventDispatcher<{ close: void; move: string | null }>();

  let browseFolderId: string | null = null;
  let lastInitialKey = '';
  let searchQuery = '';

  $: targets = items.length ? items : item ? [item] : [];
  $: targetName =
    targets.length === 1 ? targets[0].name : `${targets.length} ${targets.length === 1 ? 'item' : 'itens'}`;
  $: folderLookup = new Map(folders.map((folder) => [folder.id, folder]));
  $: blockedIds = blockedFolderIds();
  $: initialKey = `${item?.id ?? 'none'}:${targets.map((target) => target.id).join(',')}:${selectedFolderId ?? 'root'}`;
  $: if (item && initialKey !== lastInitialKey) initializeBrowser(initialKey);
  $: if (browseFolderId && !folderLookup.has(browseFolderId)) browseFolderId = null;
  $: currentPath = folderPath(browseFolderId);
  $: childFolders = sortFolders(
    folders.filter((folder) => folder.parentId === browseFolderId && !blockedIds.has(folder.id))
  );
  $: nearbyFolders = nearbyDestinations();
  $: searchResults = searchFolders();
  $: moveDisabled = !targets.length || targets.every((target) => target.parentId === browseFolderId);
  $: currentFolderName = browseFolderId ? folderLookup.get(browseFolderId)?.name ?? 'Pasta' : 'Meu Ride';

  function initializeBrowser(key: string) {
    lastInitialKey = key;
    browseFolderId = selectedFolderId;
    searchQuery = '';
  }

  function sortFolders(list: DriveItem[]) {
    return [...list].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR', { sensitivity: 'base' }));
  }

  function folderPath(folderId: string | null) {
    const path: DriveItem[] = [];
    const seen = new Set<string>();
    let nextId = folderId;
    while (nextId && !seen.has(nextId)) {
      seen.add(nextId);
      const folder = folderLookup.get(nextId);
      if (!folder) break;
      path.unshift(folder);
      nextId = folder.parentId;
    }
    return path;
  }

  function folderPathLabel(folderId: string | null) {
    const path = folderPath(folderId).map((folder) => folder.name);
    return ['Meu Ride', ...path].join(' / ');
  }

  function isDescendantOf(folder: DriveItem, ancestorId: string) {
    let parentId = folder.parentId;
    const seen = new Set<string>();
    while (parentId && !seen.has(parentId)) {
      if (parentId === ancestorId) return true;
      seen.add(parentId);
      parentId = folderLookup.get(parentId)?.parentId ?? null;
    }
    return false;
  }

  function blockedFolderIds() {
    const selectedFolderIds = new Set(targets.filter((target) => target.type === 'folder').map((target) => target.id));
    const blocked = new Set(selectedFolderIds);
    for (const folder of folders) {
      for (const selectedId of selectedFolderIds) {
        if (isDescendantOf(folder, selectedId)) {
          blocked.add(folder.id);
          break;
        }
      }
    }
    return blocked;
  }

  function nearbyDestinations() {
    const nearby = new Map<string, DriveItem>();
    const add = (folder: DriveItem | undefined | null) => {
      if (folder && !blockedIds.has(folder.id)) nearby.set(folder.id, folder);
    };

    if (browseFolderId) {
      const current = folderLookup.get(browseFolderId);
      add(current?.parentId ? folderLookup.get(current.parentId) : null);
      for (const sibling of folders.filter((folder) => folder.parentId === current?.parentId)) add(sibling);
    } else {
      for (const folder of folders.filter((entry) => entry.parentId === null)) add(folder);
    }

    for (const child of childFolders) add(child);
    return Array.from(nearby.values()).filter((folder) => folder.id !== browseFolderId).slice(0, 8);
  }

  function searchFolders() {
    const query = searchQuery.trim().toLocaleLowerCase('pt-BR');
    if (!query) return [];
    return sortFolders(
      folders.filter(
        (folder) =>
          !blockedIds.has(folder.id) &&
          (folder.name.toLocaleLowerCase('pt-BR').includes(query) ||
            folderPathLabel(folder.id).toLocaleLowerCase('pt-BR').includes(query))
      )
    ).slice(0, 30);
  }

  function openFolder(folderId: string | null) {
    browseFolderId = folderId;
    searchQuery = '';
  }

  function openParentFolder() {
    browseFolderId = browseFolderId ? folderLookup.get(browseFolderId)?.parentId ?? null : null;
    searchQuery = '';
  }

  async function chooseFolder(folderId: string | null) {
    openFolder(folderId);
    await tick();
  }
</script>

{#if item}
  <div
    data-dialog
    data-move-dialog
    class="fixed inset-0 z-50 flex items-center justify-center bg-black/32 p-4"
    role="dialog"
    aria-modal="true"
    aria-label="Mover item"
  >
    <div class="flex max-h-[86vh] w-full max-w-[680px] flex-col overflow-hidden rounded-2xl bg-white shadow-modal">
      <div class="flex items-start justify-between gap-4 border-b border-[#e0e0e0] px-6 py-4">
        <div class="min-w-0">
          <h2 class="text-[18px] font-normal text-[#202124]">Mover para</h2>
          <p class="mt-1 truncate text-[13px] text-[#5f6368]">{targetName}</p>
        </div>
        <button
          class="flex h-9 w-9 shrink-0 items-center justify-center rounded-full hover:bg-[#f1f3f4]"
          on:click={() => dispatch('close')}
          aria-label="Fechar"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="#5f6368">
            <path
              d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"
            />
          </svg>
        </button>
      </div>

      <div class="border-b border-[#e8eaed] px-6 py-3">
        <label class="flex h-11 items-center gap-3 rounded-full bg-[#f1f3f4] px-4">
          <svg xmlns="http://www.w3.org/2000/svg" width="19" height="19" viewBox="0 0 24 24" fill="#5f6368">
            <path
              d="M9.5 3a6.5 6.5 0 0 1 5.17 10.44l4.45 4.44-1.41 1.42-4.45-4.45A6.5 6.5 0 1 1 9.5 3zm0 2a4.5 4.5 0 1 0 0 9 4.5 4.5 0 0 0 0-9z"
            />
          </svg>
          <input
            bind:value={searchQuery}
            class="min-w-0 flex-1 border-0 bg-transparent text-[14px] text-[#202124] outline-none placeholder:text-[#5f6368]"
            placeholder="Buscar pasta"
            aria-label="Buscar pasta"
          />
        </label>
      </div>

      <div class="min-h-0 flex-1 overflow-y-auto px-6 py-4">
        <div class="mb-3 flex min-w-0 items-center gap-1 overflow-x-auto text-[13px] text-[#5f6368]">
          <button
            class="shrink-0 rounded-full px-3 py-1 hover:bg-[#f1f3f4] {browseFolderId === null ? 'font-medium text-[#1967d2]' : ''}"
            on:click={() => openFolder(null)}
          >
            Meu Ride
          </button>
          {#each currentPath as folder}
            <span class="shrink-0 text-[#9aa0a6]">›</span>
            <button
              class="max-w-[180px] shrink-0 truncate rounded-full px-3 py-1 hover:bg-[#f1f3f4] {browseFolderId === folder.id
                ? 'font-medium text-[#1967d2]'
                : ''}"
              on:click={() => openFolder(folder.id)}
            >
              {folder.name}
            </button>
          {/each}
        </div>

        <div class="mb-4 rounded-xl border border-[#dadce0] bg-[#f8fafd] px-4 py-3">
          <div class="text-[12px] font-medium uppercase tracking-[0.04em] text-[#5f6368]">Destino atual</div>
          <div class="mt-1 flex items-center gap-3">
            <svg class="shrink-0" xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="#f9ab00">
              <path d="M10 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z" />
            </svg>
            <div class="min-w-0">
              <div class="truncate text-[15px] font-medium text-[#202124]">{currentFolderName}</div>
              <div class="truncate text-[13px] text-[#5f6368]">{folderPathLabel(browseFolderId)}</div>
            </div>
          </div>
        </div>

        {#if searchQuery.trim()}
          <div class="mb-2 text-[13px] font-medium text-[#5f6368]">Resultados</div>
          <div class="space-y-1">
            {#each searchResults as folder (folder.id)}
              <button
                class="grid w-full grid-cols-[22px_minmax(0,1fr)_22px] items-center gap-3 rounded-lg px-3 py-2 text-left hover:bg-[#f1f3f4]"
                on:click={() => chooseFolder(folder.id)}
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="#f9ab00">
                  <path d="M10 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z" />
                </svg>
                <span class="min-w-0">
                  <span class="block truncate text-[14px] text-[#202124]">{folder.name}</span>
                  <span class="block truncate text-[12px] text-[#5f6368]">{folderPathLabel(folder.id)}</span>
                </span>
                <span class="text-[#5f6368]">›</span>
              </button>
            {:else}
              <div class="rounded-lg bg-[#f8fafd] px-4 py-5 text-center text-[14px] text-[#5f6368]">
                Nenhuma pasta encontrada.
              </div>
            {/each}
          </div>
        {:else}
          {#if nearbyFolders.length}
            <div class="mb-2 text-[13px] font-medium text-[#5f6368]">Pastas próximas</div>
            <div class="mb-4 flex gap-2 overflow-x-auto pb-1">
              {#each nearbyFolders as folder (folder.id)}
                <button
                  class="max-w-[180px] shrink-0 truncate rounded-full border border-[#dadce0] px-3 py-2 text-[13px] text-[#202124] hover:bg-[#f1f3f4]"
                  title={folderPathLabel(folder.id)}
                  on:click={() => openFolder(folder.id)}
                >
                  {folder.name}
                </button>
              {/each}
            </div>
          {/if}

          <div class="mb-2 flex items-center justify-between gap-3">
            <div class="text-[13px] font-medium text-[#5f6368]">Subpastas</div>
            {#if browseFolderId !== null}
              <button
                class="rounded-full px-3 py-1 text-[13px] font-medium text-[#1967d2] hover:bg-[#e8f0fe]"
                on:click={openParentFolder}
              >
                Voltar
              </button>
            {/if}
          </div>
          <div class="space-y-1">
            {#each childFolders as folder (folder.id)}
              <button
                class="grid w-full grid-cols-[22px_minmax(0,1fr)_22px] items-center gap-3 rounded-lg px-3 py-2 text-left hover:bg-[#f1f3f4]"
                on:click={() => openFolder(folder.id)}
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="#f9ab00">
                  <path d="M10 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z" />
                </svg>
                <span class="min-w-0">
                  <span class="block truncate text-[14px] text-[#202124]">{folder.name}</span>
                  <span class="block truncate text-[12px] text-[#5f6368]">{folderPathLabel(folder.id)}</span>
                </span>
                <span class="text-[#5f6368]">›</span>
              </button>
            {:else}
              <div class="rounded-lg bg-[#f8fafd] px-4 py-5 text-center text-[14px] text-[#5f6368]">
                Esta pasta não tem subpastas. Use "Mover aqui" para escolher este destino.
              </div>
            {/each}
          </div>
        {/if}
      </div>

      <div class="flex flex-wrap items-center justify-end gap-2 border-t border-[#e0e0e0] px-6 py-3">
        <button
          class="rounded-full px-6 py-2 text-[14px] font-medium text-[#1a73e8] hover:bg-[#e8f0fe]"
          on:click={() => dispatch('close')}>Cancelar</button
        >
        <button
          class="rounded-full bg-[#1a73e8] px-6 py-2 text-[14px] font-medium text-white hover:bg-[#1557b0] disabled:cursor-not-allowed disabled:bg-[#c4c7c5]"
          disabled={moveDisabled}
          on:click={() => dispatch('move', browseFolderId)}>Mover aqui</button
        >
      </div>
    </div>
  </div>
{/if}
