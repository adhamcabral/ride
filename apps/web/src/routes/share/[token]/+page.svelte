<script lang="ts">
  import { page } from '$app/stores';
  import { onDestroy, onMount } from 'svelte';
  import FilePreview from '$lib/components/FilePreview.svelte';
  import FileGrid from '$lib/components/FileGrid.svelte';
  import FileIcon from '$lib/components/FileIcon.svelte';
  import LoginPage from '$lib/components/LoginPage.svelte';
  import {
    createSharedFolder,
    deleteSharedItem,
    getStoredSessions,
    getShared,
    getSharedChildren,
    getSharedOfficeConfig,
    getSharedPdfInfo,
    getToken,
    saveSharedBinaryFile,
    saveSharedTextFile,
    sharedDownloadUrl,
    sharedItemDownloadUrl,
    sharedPdfPageUrl,
    sharedPreviewUrl,
    updateSharedItem,
    uploadSharedFile
  } from '$lib/api';
  import type { DriveItem, FolderOrder, SortDirection, SortField, UserAccount, ViewMode } from '$lib/types';

  let root: DriveItem | null = null;
  let items: DriveItem[] = [];
  let knownFolders: DriveItem[] = [];
  let path: DriveItem[] = [];
  let currentFolderId: string | null = null;
  let loading = true;
  let error = '';
  let query = '';
  let viewMode: ViewMode = 'list';
  let sortField: SortField = 'name';
  let sortDirection: SortDirection = 'asc';
  let folderOrder: FolderOrder = 'first';
  let selectedIds: string[] = [];
  let contextItem: DriveItem | null = null;
  let contextX = 0;
  let contextY = 0;
  let contextVisible = false;
  let previewItem: DriveItem | null = null;
  let searchRun = 0;
  let searchTimer: ReturnType<typeof setTimeout> | null = null;
  let fileInput: HTMLInputElement;
  let showLoginForUnavailableLink = false;
  let knownLoginAccounts: UserAccount[] = [];

  $: token = $page.params.token ?? '';
  $: canEdit = root?.linkRole === 'editor';
  $: ownerAccount = root ? publicOwner(root) : null;
  $: displayedItems = sortItems(items);
  $: selectedItems = displayedItems.filter((item) => selectedIds.includes(item.id));
  $: previewFiles = displayedItems.filter((item) => item.type === 'file');
  $: scheduleSearch(query, currentFolderId, root?.id);

  onMount(() => {
    refreshLocalAccountState();
    void loadRoot();
  });

  onDestroy(() => {
    if (searchTimer) clearTimeout(searchTimer);
  });

  function publicOwner(item: DriveItem): UserAccount {
    return {
      id: item.ownerId,
      name: 'Proprietário',
      email: 'Compartilhado por link',
      role: 'user',
      storageQuotaBytes: 0,
      avatarColor: '#1a73e8',
      avatarUrl: null,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt
    };
  }

  function refreshLocalAccountState() {
    const sessions = getStoredSessions();
    knownLoginAccounts = sessions.map((session) => session.user);
    showLoginForUnavailableLink = sessions.length === 0 && !getToken();
  }

  function sortItems(source: DriveItem[]) {
    const factor = sortDirection === 'asc' ? 1 : -1;
    return [...source].sort((a, b) => {
      if (folderOrder === 'first' && a.type !== b.type) return a.type === 'folder' ? -1 : 1;
      let result = 0;
      if (sortField === 'name') result = a.name.localeCompare(b.name, 'pt-BR', { sensitivity: 'base', numeric: true });
      if (sortField === 'modified') result = a.updatedAt.localeCompare(b.updatedAt);
      if (sortField === 'size') result = a.size - b.size;
      if (sortField === 'owner') result = a.ownerId.localeCompare(b.ownerId);
      return result * factor;
    });
  }

  function rememberFolders(nextItems: DriveItem[]) {
    const folders = nextItems.filter((item) => item.type === 'folder');
    knownFolders = Array.from(new Map([...knownFolders, ...folders, ...path].map((item) => [item.id, item])).values());
  }

  async function loadRoot() {
    loading = true;
    error = '';
    try {
      const shared = await getShared(token);
      root = shared;
      if (shared.type === 'folder') {
        currentFolderId = shared.id;
        path = [shared];
        items = await getSharedChildren(token, shared.id);
        rememberFolders(items);
      } else {
        currentFolderId = null;
        path = [];
        items = [shared];
      }
    } catch (exception) {
      error = exception instanceof Error ? exception.message : 'Link inválido ou expirado.';
      refreshLocalAccountState();
    } finally {
      loading = false;
    }
  }

  function handleUnavailableLinkLogin() {
    window.location.href = '/';
  }

  async function openFolder(folder: DriveItem) {
    if (folder.type !== 'folder') return;
    loading = true;
    error = '';
    try {
      currentFolderId = folder.id;
      query = '';
      items = await getSharedChildren(token, folder.id);
      const existingIndex = path.findIndex((entry) => entry.id === folder.id);
      path = existingIndex >= 0 ? path.slice(0, existingIndex + 1) : [...path, folder];
      rememberFolders(items);
      clearSelection();
    } catch (exception) {
      error = exception instanceof Error ? exception.message : 'Não foi possível abrir a pasta.';
    } finally {
      loading = false;
    }
  }

  async function openPath(folder: DriveItem) {
    await openFolder(folder);
  }

  function openItem(item: DriveItem) {
    if (item.type === 'folder') {
      void openFolder(item);
      return;
    }
    previewItem = item;
  }

  function downloadHref(item: DriveItem) {
    return item.id === root?.id ? sharedDownloadUrl(token) : sharedItemDownloadUrl(token, item.id);
  }

  function downloadItem(item: DriveItem) {
    if (item.type !== 'file') return;
    window.open(downloadHref(item), '_blank');
  }

  async function refreshUpdatedItem(item: DriveItem) {
    if (root?.id === item.id) root = item;
    items = items.map((entry) => (entry.id === item.id ? item : entry));
    if (previewItem?.id === item.id) previewItem = item;
    await refreshCurrentFolder(false);
  }

  function selectItem(detail: { item: DriveItem; mode: 'single' | 'toggle' | 'range' }) {
    closeContextMenu();
    const id = detail.item.id;
    if (detail.mode === 'toggle') {
      selectedIds = selectedIds.includes(id) ? selectedIds.filter((current) => current !== id) : [...selectedIds, id];
      return;
    }
    selectedIds = [id];
  }

  function clearSelection() {
    selectedIds = [];
    closeContextMenu();
  }

  function closeContextMenu() {
    contextVisible = false;
  }

  async function createFolder() {
    if (!canEdit || !root || root.type !== 'folder') return;
    const name = window.prompt('Nova pasta', '');
    if (!name?.trim()) return;
    try {
      await createSharedFolder(token, name.trim(), currentFolderId ?? root.id);
      await refreshCurrentFolder();
    } catch (exception) {
      error = exception instanceof Error ? exception.message : 'Não foi possível criar a pasta.';
    }
  }

  async function uploadFiles(files: FileList | null) {
    if (!canEdit || !files?.length || !root || root.type !== 'folder') return;
    loading = true;
    error = '';
    try {
      for (const file of Array.from(files)) {
        await uploadSharedFile(token, file, currentFolderId ?? root.id);
      }
      await refreshCurrentFolder(false);
    } catch (exception) {
      error = exception instanceof Error ? exception.message : 'Falha ao enviar arquivo.';
    } finally {
      loading = false;
      if (fileInput) fileInput.value = '';
    }
  }

  async function renameItem(item: DriveItem) {
    if (!canEdit) return;
    const name = window.prompt('Renomear', item.name);
    if (!name?.trim() || name.trim() === item.name) return;
    try {
      await updateSharedItem(token, item.id, { name: name.trim() });
      await refreshCurrentFolder();
    } catch (exception) {
      error = exception instanceof Error ? exception.message : 'Não foi possível renomear.';
    }
  }

  async function trashItem(item: DriveItem) {
    if (!canEdit) return;
    const ok = window.confirm(`Mover "${item.name}" para a lixeira do proprietário?`);
    if (!ok) return;
    try {
      await deleteSharedItem(token, item.id);
      selectedIds = selectedIds.filter((id) => id !== item.id);
      await refreshCurrentFolder();
    } catch (exception) {
      error = exception instanceof Error ? exception.message : 'Não foi possível excluir.';
    }
  }

  async function moveItemsToFolder(detail: { items: DriveItem[]; targetFolder: DriveItem }) {
    if (!canEdit) return;
    try {
      for (const item of detail.items) {
        await updateSharedItem(token, item.id, { parentId: detail.targetFolder.id });
      }
      clearSelection();
      await refreshCurrentFolder();
    } catch (exception) {
      error = exception instanceof Error ? exception.message : 'Não foi possível mover os itens.';
    }
  }

  async function refreshCurrentFolder(showLoading = true) {
    if (!root || root.type !== 'folder') return;
    if (showLoading) loading = true;
    error = '';
    try {
      items = await getSharedChildren(token, currentFolderId ?? root.id, {
        q: query.trim() || null,
        deep: Boolean(query.trim())
      });
      rememberFolders(items);
    } catch (exception) {
      error = exception instanceof Error ? exception.message : 'Não foi possível atualizar a pasta.';
    } finally {
      loading = false;
    }
  }

  function showContextMenu(item: DriveItem, x: number, y: number) {
    contextItem = item;
    contextX = x;
    contextY = y;
    contextVisible = true;
  }

  function chooseSort(field: SortField, direction?: SortDirection) {
    if (field === sortField && !direction) {
      sortDirection = sortDirection === 'asc' ? 'desc' : 'asc';
    } else {
      sortField = field;
      sortDirection = direction ?? (field === 'modified' || field === 'size' ? 'desc' : 'asc');
    }
  }

  function scheduleSearch(currentQuery: string, folderId: string | null, rootId?: string) {
    if (!rootId || !root || root.type !== 'folder') return;
    const run = ++searchRun;
    if (searchTimer) clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      void runSearch(run, currentQuery, folderId ?? rootId);
    }, 220);
  }

  async function runSearch(run: number, currentQuery: string, folderId: string) {
    if (!root || root.type !== 'folder') return;
    loading = true;
    error = '';
    try {
      const trimmed = currentQuery.trim();
      const nextItems = await getSharedChildren(token, folderId, {
        q: trimmed || null,
        deep: Boolean(trimmed)
      });
      if (run !== searchRun) return;
      items = nextItems;
      rememberFolders(nextItems);
      selectedIds = selectedIds.filter((id) => nextItems.some((item) => item.id === id));
      closeContextMenu();
    } catch (exception) {
      if (run !== searchRun) return;
      error = exception instanceof Error ? exception.message : 'Não foi possível pesquisar.';
    } finally {
      if (run === searchRun) loading = false;
    }
  }
</script>

<svelte:head>
  <title>{root ? root.name + ' - Ride' : 'Pasta compartilhada - Ride'}</title>
</svelte:head>

<svelte:window on:click={() => (contextVisible = false)} />

<input bind:this={fileInput} class="hidden" type="file" multiple on:change={(event) => uploadFiles(event.currentTarget.files)} />

{#if loading && !root}
  <div class="flex h-screen items-center justify-center bg-[#f8fafd] text-[#3c4043]">Carregando...</div>
{:else if error && !root && showLoginForUnavailableLink}
  <LoginPage allowSetup={true} knownAccounts={knownLoginAccounts} on:success={handleUnavailableLinkLogin} />
{:else if error && !root}
  <div class="flex h-screen items-center justify-center bg-[#f8fafd] px-4">
    <div class="max-w-md rounded-2xl border border-[#dadce0] bg-white p-8 text-center">
      <h1 class="text-[22px] font-normal text-[#202124]">Link indisponível</h1>
      <p class="mt-2 text-[14px] text-[#5f6368]">{error}</p>
      <a class="mt-6 inline-flex rounded-full bg-[#1a73e8] px-6 py-2.5 text-[14px] font-medium text-white" href="/">Ir para o Ride</a>
    </div>
  </div>
{:else if root?.type === 'file'}
  <FilePreview
    item={root}
    files={[root]}
    url={sharedPreviewUrl(token, root.id)}
    canEditText={canEdit}
    canShare={false}
    showClose={false}
    loadPdfInfo={(id) => getSharedPdfInfo(token, id)}
    loadOfficeConfig={(id, mode = 'view') => getSharedOfficeConfig(token, id, mode)}
    renderPdfPageUrl={(id, page) => Promise.resolve(sharedPdfPageUrl(token, id, page))}
    saveTextContent={(id, content) => saveSharedTextFile(token, id, content)}
    saveBinaryContent={(id, contentBase64, mimeType) => saveSharedBinaryFile(token, id, contentBase64, mimeType)}
    on:download={(event) => downloadItem(event.detail)}
    on:refresh={() => void loadRoot()}
    on:updated={(event) => void refreshUpdatedItem(event.detail)}
  />
{:else if root}
  <div data-share-shell class="flex h-screen select-none flex-col overflow-hidden bg-[#f8fafd] text-[#1f1f1f]">
    <header data-share-topbar data-topbar class="z-30 flex h-[58px] shrink-0 items-center gap-2 bg-[#f8fafd] pl-3 pr-4">
      <div data-topbar-brand class="flex h-[58px] w-[226px] shrink-0 items-center gap-2">
        <a href="/" class="flex items-center gap-2 no-underline">
          <img src="/ride.png" alt="Ride" class="h-12 w-12 object-contain" />
          <span class="text-[24px] font-normal">Ride</span>
        </a>
      </div>
      <div class="flex h-12 max-w-[720px] flex-1 items-center gap-3 rounded-full bg-[#edf2fa] px-4">
        <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="#5f6368">
          <path d="M9.5 3A6.5 6.5 0 0 1 14.6 13.5l4.45 4.45-1.4 1.4-4.45-4.45A6.5 6.5 0 1 1 9.5 3m0 2A4.5 4.5 0 1 0 14 9.5 4.5 4.5 0 0 0 9.5 5z" />
        </svg>
        <input class="h-full min-w-0 flex-1 bg-transparent text-[16px] outline-none" placeholder="Pesquise nesta pasta" bind:value={query} />
      </div>
      <div class="ml-auto flex items-center gap-2">
        <span class="rounded-full bg-[#e6f4ea] px-3 py-1 text-[13px] font-medium text-[#137333]">
          {canEdit ? 'Editor por link' : root.linkRole === 'commenter' ? 'Comentador por link' : 'Leitor por link'}
        </span>
      </div>
    </header>

    <div data-share-body class="flex min-h-0 flex-1">
      <aside data-share-sidebar data-sidebar class="w-[244px] shrink-0 overflow-y-auto bg-[#f8fafd] py-4">
        {#if canEdit && root.type === 'folder'}
          <div class="px-3 pb-4">
            <button
              data-new-button
              class="flex h-[56px] w-[108px] items-center gap-3 rounded-2xl bg-white px-5 text-[14px] font-medium shadow-[0_1px_2px_rgba(60,64,67,.3),0_1px_3px_1px_rgba(60,64,67,.15)] hover:shadow-[0_1px_3px_rgba(60,64,67,.3),0_4px_8px_3px_rgba(60,64,67,.15)]"
              on:click={createFolder}
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
                <path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z" />
              </svg>
              Novo
            </button>
          </div>
        {/if}
        <nav class="px-2">
          <button class="mb-0.5 flex h-9 w-full items-center gap-3 rounded-full bg-[#c2e7ff] pl-5 pr-3 text-left text-[14px] font-medium text-[#001d35]">
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
              <path d="M10 4H2v16h20V6H12l-2-2zm10 14H4V6h5.17l2 2H20v10z" />
            </svg>
            <span class="truncate">{root.name}</span>
          </button>
          {#if canEdit && root.type === 'folder'}
            <button class="mb-0.5 flex h-9 w-full items-center gap-3 rounded-full pl-5 pr-3 text-left text-[14px] hover:bg-[#e9eef6]" on:click={() => fileInput.click()}>
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                <path d="M5 20h14v-2H5v2zm0-10h4v6h6v-6h4l-7-7-7 7z" />
              </svg>
              Upload
            </button>
          {/if}
        </nav>
        <div class="mt-auto px-4 pt-8 text-[12px] leading-5 text-[#5f6368]">
          <p class="font-medium text-[#3c4043]">Link público</p>
          <p>Você está vendo apenas esta pasta compartilhada e suas subpastas.</p>
        </div>
      </aside>

      <main data-share-main class="flex-1 overflow-y-auto rounded-tl-[22px] bg-white">
        <div data-share-content class="min-h-full px-2 pb-10">
          <div class="flex min-h-[126px] items-start justify-between gap-5 px-5 pb-3 pt-5">
            <div class="min-w-0 flex-1">
              <div class="flex flex-wrap items-center text-[25px] font-normal leading-8">
                {#each path as folder, index (folder.id)}
                  {#if index > 0}
                    <svg class="mx-1 shrink-0" xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="#5f6368">
                      <path d="M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z" />
                    </svg>
                  {/if}
                  <button
                    class="min-w-0 max-w-full truncate rounded-full px-2 py-1 {index === path.length - 1 ? 'text-[#1f1f1f]' : 'text-[#5f6368] hover:bg-[#e8eaed]'}"
                    on:click={() => index !== path.length - 1 && openPath(folder)}
                  >
                    {folder.name}
                  </button>
                {/each}
              </div>
              <p class="mt-2 text-[13px] text-[#5f6368]">
                {items.length} itens nesta pasta
              </p>
              {#if error}
                <p class="mt-2 text-[13px] text-[#d93025]">{error}</p>
              {/if}
            </div>

            <div class="flex shrink-0 items-center gap-3">
              {#if selectedItems.length > 0}
                <div class="flex h-10 items-center gap-2 rounded-full bg-[#edf2fa] px-2">
                  <button class="flex h-8 w-8 items-center justify-center rounded-full hover:bg-[#e8eaed]" on:click={clearSelection} aria-label="Limpar seleção">
                    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M18.3 5.71 12 12l6.3 6.29-1.41 1.41L10.59 13.41 4.29 19.71 2.88 18.3 9.17 12 2.88 5.71 4.29 4.29l6.3 6.3 6.29-6.3z" /></svg>
                  </button>
                  <span class="pr-2 text-[14px]">{selectedItems.length} item selecionado{selectedItems.length === 1 ? '' : 's'}</span>
                  {#if selectedItems.length === 1 && selectedItems[0].type === 'file'}
                    <button class="flex h-8 w-8 items-center justify-center rounded-full hover:bg-[#e8eaed]" on:click={() => downloadItem(selectedItems[0])} aria-label="Baixar">
                      <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M5 20h14v-2H5v2zm0-10h4v6h6v-6h4l-7-7-7 7z" /></svg>
                    </button>
                  {/if}
                  {#if canEdit && selectedItems.length === 1}
                    <button class="flex h-8 w-8 items-center justify-center rounded-full hover:bg-[#e8eaed]" on:click={() => renameItem(selectedItems[0])} aria-label="Renomear">
                      <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34a.9959.9959 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z" /></svg>
                    </button>
                    <button class="flex h-8 w-8 items-center justify-center rounded-full hover:bg-[#e8eaed]" on:click={() => trashItem(selectedItems[0])} aria-label="Excluir">
                      <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M16 9v10H8V9h8m-1.5-6h-5l-1 1H5v2h14V4h-3.5l-1-1zM18 7H6v12c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7z" /></svg>
                    </button>
                  {/if}
                </div>
              {/if}
              <div class="flex h-9 overflow-hidden rounded-full border border-[#747775]">
                <button class="flex h-9 w-14 items-center justify-center gap-1 {viewMode === 'list' ? 'bg-[#c2e7ff]' : ''}" on:click={() => (viewMode = 'list')} aria-label="Lista">
                  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M4 10.5c.83 0 1.5-.67 1.5-1.5S4.83 7.5 4 7.5 2.5 8.17 2.5 9s.67 1.5 1.5 1.5zM4 16.5c.83 0 1.5-.67 1.5-1.5S4.83 13.5 4 13.5 2.5 14.17 2.5 15s.67 1.5 1.5 1.5zM7 8h14v2H7V8zm0 6h14v2H7v-2z" /></svg>
                </button>
                <button class="flex h-9 w-14 items-center justify-center {viewMode === 'grid' ? 'bg-[#c2e7ff]' : ''}" on:click={() => (viewMode = 'grid')} aria-label="Grade">
                  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M3 3h8v8H3V3zm10 0h8v8h-8V3zM3 13h8v8H3v-8zm10 0h8v8h-8v-8z" /></svg>
                </button>
              </div>
            </div>
          </div>

          {#if loading}
            <div class="px-5 py-10 text-[14px] text-[#5f6368]">Carregando...</div>
          {:else if displayedItems.length === 0}
            <div class="flex min-h-[360px] flex-col items-center justify-center text-center text-[#5f6368]">
              <FileIcon item={root} size={72} />
              <p class="mt-4 text-[18px] text-[#3c4043]">{query.trim() ? 'Nenhum item encontrado' : 'Esta pasta está vazia'}</p>
            </div>
          {:else}
            <FileGrid
              items={displayedItems}
              {viewMode}
              section="shared-with-me"
              owner={ownerAccount}
              accounts={ownerAccount ? [ownerAccount] : []}
              folders={knownFolders}
              activeAccountId="public-link"
              {selectedIds}
              {sortField}
              {sortDirection}
              {folderOrder}
              ownerFilterId="all"
              canEdit={canEdit}
              canShare={false}
              canStar={false}
              allowContextMenu={true}
              thumbnailPreviewUrl={(id) => sharedPreviewUrl(token, id)}
              thumbnailPdfPageUrl={(id, page) => sharedPdfPageUrl(token, id, page)}
              on:open={(event) => openItem(event.detail)}
              on:select={(event) => selectItem(event.detail)}
              on:sort={(event) => chooseSort(event.detail.field, event.detail.direction)}
              on:folderOrder={(event) => (folderOrder = event.detail)}
              on:download={(event) => downloadItem(event.detail)}
              on:rename={(event) => renameItem(event.detail)}
              on:trash={(event) => trashItem(event.detail)}
              on:contextMenu={(event) => showContextMenu(event.detail.item, event.detail.x, event.detail.y)}
              on:moveItems={(event) => moveItemsToFolder(event.detail)}
            />
          {/if}
        </div>
      </main>
    </div>

    {#if contextVisible && contextItem}
      {@const menuItem = contextItem}
      <div
        data-context-menu
        class="fixed z-[120] w-80 overflow-hidden rounded bg-white py-1 text-[14px] text-[#202124] shadow-[0_2px_8px_rgba(60,64,67,.35)] ring-1 ring-black/10"
        style="left:{Math.min(contextX, typeof window !== 'undefined' ? window.innerWidth - 328 : contextX)}px;top:{contextY}px"
        role="menu"
        tabindex="-1"
        on:click|stopPropagation
        on:keydown|stopPropagation
        on:contextmenu|preventDefault|stopPropagation
      >
        <button
          class="flex h-10 w-full items-center justify-between px-4 text-left hover:bg-[#e8eaed]"
          on:click={() => {
            contextVisible = false;
            openItem(menuItem);
          }}
        >
          <span class="flex items-center gap-4">
            <svg xmlns="http://www.w3.org/2000/svg" width="21" height="21" viewBox="0 0 24 24" fill="#5f6368">
              <path d="M19 19H5V5h7V3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2v-7h-2v7zM14 3v2h3.59l-9.83 9.83 1.41 1.41L19 6.41V10h2V3h-7z" />
            </svg>
            Abrir
          </span>
        </button>
        {#if menuItem.type === 'file'}
          <button
            class="flex h-10 w-full items-center gap-4 px-4 text-left hover:bg-[#e8eaed]"
            on:click={() => {
              contextVisible = false;
              downloadItem(menuItem);
            }}
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="21" height="21" viewBox="0 0 24 24" fill="#5f6368">
              <path d="M5 20h14v-2H5v2zM19 9h-4V3H9v6H5l7 7 7-7zm-8-4h2v6h1.17L12 13.17 9.83 11H11V5z" />
            </svg>
            <span>Baixar</span>
          </button>
        {/if}
        {#if canEdit}
          <div class="my-1 h-px bg-[#dadce0]"></div>
          <button
            class="flex h-10 w-full items-center justify-between px-4 text-left hover:bg-[#e8eaed]"
            on:click={() => {
              contextVisible = false;
              renameItem(menuItem);
            }}
          >
            <span class="flex items-center gap-4">
              <svg xmlns="http://www.w3.org/2000/svg" width="21" height="21" viewBox="0 0 24 24" fill="#5f6368">
                <path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34a.9959.9959 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z" />
              </svg>
              Renomear
            </span>
            <span class="text-[12px]">F2</span>
          </button>
          <button
            class="flex h-10 w-full items-center justify-between px-4 text-left hover:bg-[#e8eaed]"
            on:click={() => {
              contextVisible = false;
              trashItem(menuItem);
            }}
          >
            <span class="flex items-center gap-4">
              <svg xmlns="http://www.w3.org/2000/svg" width="21" height="21" viewBox="0 0 24 24" fill="#5f6368">
                <path d="M16 9v10H8V9h8m-1.5-6h-5l-1 1H5v2h14V4h-3.5l-1-1zM18 7H6v12c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7z" />
              </svg>
              Mover para a lixeira
            </span>
            <span class="text-[12px]">Delete</span>
          </button>
        {/if}
      </div>
    {/if}

    {#if previewItem}
      {#key previewItem.id}
        <FilePreview
          item={previewItem}
          files={previewFiles}
          url={sharedPreviewUrl(token, previewItem.id)}
          canEditText={canEdit}
          canShare={false}
          loadPdfInfo={(id) => getSharedPdfInfo(token, id)}
          loadOfficeConfig={(id, mode = 'view') => getSharedOfficeConfig(token, id, mode)}
          renderPdfPageUrl={(id, page) => Promise.resolve(sharedPdfPageUrl(token, id, page))}
          saveTextContent={(id, content) => saveSharedTextFile(token, id, content)}
          saveBinaryContent={(id, contentBase64, mimeType) => saveSharedBinaryFile(token, id, contentBase64, mimeType)}
          on:close={() => {
            previewItem = null;
            void refreshCurrentFolder(false);
          }}
          on:navigate={(event) => (previewItem = event.detail)}
          on:download={(event) => downloadItem(event.detail)}
          on:refresh={() => void refreshCurrentFolder(false)}
          on:updated={(event) => void refreshUpdatedItem(event.detail)}
        />
      {/key}
    {/if}
  </div>
{/if}
