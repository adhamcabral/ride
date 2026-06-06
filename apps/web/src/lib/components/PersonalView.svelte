<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import FileIcon from '$lib/components/FileIcon.svelte';
  import FileThumbnail from '$lib/components/FileThumbnail.svelte';
  import SearchBox from '$lib/components/SearchBox.svelte';
  import type { DriveDensity } from '$lib/preferences';
  import type { DriveItem, UserAccount, ViewMode } from '$lib/types';

  export let items: DriveItem[] = [];
  export let folders: DriveItem[] = [];
  export let selectedIds: string[] = [];
  export let owner: UserAccount | null = null;
  export let accounts: UserAccount[] = [];
  export let searchResults: DriveItem[] = [];
  export let searchOpen = false;
  export let query = '';
  export let viewMode: ViewMode = 'list';
  export let density: DriveDensity = 'low';

  const dispatch = createEventDispatcher<{
    search: string;
    searchFocus: void;
    searchClose: void;
    searchOpenItem: DriveItem;
    searchAllResults: void;
    select: { item: DriveItem; mode: 'single' | 'toggle' | 'range' };
    open: DriveItem;
    contextMenu: { item: DriveItem; x: number; y: number };
    clearSelection: void;
    shareSelected: void;
    downloadSelected: void;
    moveSelected: void;
    trashSelected: void;
    copyLinks: void;
    selectedMenu: { x: number; y: number };
    reveal: string | null;
    viewMode: ViewMode;
    info: void;
  }>();

  $: selectedLookup = new Set(selectedIds);
  $: selectableItems = Array.from(new Map([...folders, ...items].map((item) => [item.id, item])).values());
  $: selectedItems = selectableItems.filter((item) => selectedLookup.has(item.id));
  $: suggestedFolders = folders.slice(0, 6);
  $: suggestedFiles = items.filter((item) => item.type === 'file').slice(0, 10);
  $: folderById = new Map(folders.map((folder) => [folder.id, folder]));
  $: accountById = new Map(accounts.map((account) => [account.id, account]));
  $: densityMetrics =
    density === 'high'
      ? {
          folderWidth: '210px',
          folderHeight: '46px',
          folderGap: '10px',
          gridMin: '190px',
          gridGap: '10px',
          fileHeaderHeight: '42px',
          thumbnailHeight: '96px',
          listHeaderHeight: '40px',
          listRowHeight: '42px',
          iconSize: 20,
          fileIconSize: 20,
          thumbnailIconSize: 40,
          fontSize: 14,
          secondaryFontSize: 12
        }
      : density === 'medium'
        ? {
            folderWidth: '228px',
            folderHeight: '50px',
            folderGap: '12px',
            gridMin: '214px',
            gridGap: '12px',
            fileHeaderHeight: '48px',
            thumbnailHeight: '112px',
            listHeaderHeight: '46px',
            listRowHeight: '46px',
            iconSize: 22,
            fileIconSize: 22,
            thumbnailIconSize: 46,
            fontSize: 14,
            secondaryFontSize: 13
          }
        : {
            folderWidth: '246px',
            folderHeight: '56px',
            folderGap: '16px',
            gridMin: '238px',
            gridGap: '16px',
            fileHeaderHeight: '54px',
            thumbnailHeight: '128px',
            listHeaderHeight: '52px',
            listRowHeight: '52px',
            iconSize: 24,
            fileIconSize: 24,
            thumbnailIconSize: 54,
            fontSize: 15,
            secondaryFontSize: 14
          };

  function selectionMode(e: MouseEvent | KeyboardEvent): 'single' | 'toggle' | 'range' {
    if (e.shiftKey) return 'range';
    if (e.ctrlKey || e.metaKey) return 'toggle';
    return 'single';
  }

  function selectItem(item: DriveItem, e: MouseEvent | KeyboardEvent) {
    e.stopPropagation();
    dispatch('select', { item, mode: selectionMode(e) });
  }

  function openMenu(item: DriveItem, e: MouseEvent) {
    e.stopPropagation();
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    dispatch('contextMenu', { item, x: rect.right - 224, y: rect.bottom + 4 });
  }

  function onItemRightClick(item: DriveItem, e: MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (!selectedLookup.has(item.id)) dispatch('select', { item, mode: 'single' });
    dispatch('contextMenu', { item, x: e.clientX, y: e.clientY });
  }

  function openSelectedMenu(e: MouseEvent) {
    e.stopPropagation();
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    dispatch('selectedMenu', { x: rect.right - 320, y: rect.bottom + 6 });
  }

  function locationName(item: DriveItem) {
    const belongsToActiveAccount = !owner?.id || item.ownerId === owner.id;
    if (!item.parentId) return belongsToActiveAccount ? 'Meu Ride' : 'Compartilhados comigo';
    return folderById.get(item.parentId)?.name ?? (belongsToActiveAccount ? 'Meu Ride' : 'Compartilhados comigo');
  }

  function ownerFor(item: DriveItem) {
    return accountById.get(item.ownerId) ?? owner;
  }

  function ownerName(item: DriveItem) {
    const itemOwner = ownerFor(item);
    if (!itemOwner) return 'eu';
    return itemOwner.id === owner?.id ? 'eu' : itemOwner.name || itemOwner.email;
  }

  function pathFor(item: DriveItem) {
    const path: DriveItem[] = [];
    let current = item.parentId ? folderById.get(item.parentId) : null;
    while (current) {
      path.unshift(current);
      current = current.parentId ? folderById.get(current.parentId) : null;
    }
    return path;
  }

  function revealSelectedLocation(item: DriveItem) {
    dispatch('reveal', item.type === 'folder' ? item.id : item.parentId);
  }

  function reason(item: DriveItem) {
    const date = new Intl.DateTimeFormat('pt-BR', { day: 'numeric', month: 'short' }).format(
      new Date(item.updatedAt)
    );
    return item.createdAt === item.updatedAt ? `Você criou • ${date}` : `Você abriu • ${date}`;
  }
</script>

<section class="pb-20" data-density={density}>
  <div class="px-8 pb-6 pt-6">
    <div class="relative flex min-h-[190px] flex-col items-center justify-start">
      <h1 class="mt-1 text-[30px] font-normal text-[#1f1f1f]">Olá! Este é o Ride</h1>
      <button
        class="absolute right-3 top-1 flex h-10 w-10 items-center justify-center rounded-full text-[#1f1f1f] hover:bg-[#f1f3f4]"
        aria-label="Informações"
        on:click={() => dispatch('info')}
      >
        {@render InfoIcon()}
      </button>

      <div class="mt-9 flex w-full justify-center px-4">
        <SearchBox
          {query}
          {accounts}
          results={searchResults}
          open={searchOpen}
          large
          on:search={(e) => dispatch('search', e.detail)}
          on:focus={() => dispatch('searchFocus')}
          on:close={() => dispatch('searchClose')}
          on:openItem={(e) => dispatch('searchOpenItem', e.detail)}
          on:allResults={() => dispatch('searchAllResults')}
        />
      </div>
    </div>

    <div class="mb-8">
      <div class="mb-4 flex h-11 items-center text-[#1f1f1f]">
        {#if selectedItems.length > 0}
          <div class="flex h-11 w-full items-center gap-3 rounded-full bg-[#edf2fa] px-3">
            <button
              class="flex h-9 w-9 items-center justify-center rounded-full hover:bg-[#dde3ea]"
              on:click|stopPropagation={() => dispatch('clearSelection')}
              aria-label="Limpar seleção"
            >
              {@render CloseIcon()}
            </button>
            <span class="min-w-[158px] text-[16px]"
              >{selectedItems.length}
              {selectedItems.length === 1 ? 'item selecionado' : 'itens selecionados'}</span
            >
            <button
              class="flex h-9 w-9 items-center justify-center rounded-full hover:bg-[#dde3ea]"
              on:click|stopPropagation={() => dispatch('shareSelected')}
              aria-label="Compartilhar">{@render ShareIcon()}</button
            >
            <button
              class="flex h-9 w-9 items-center justify-center rounded-full hover:bg-[#dde3ea]"
              on:click|stopPropagation={() => dispatch('downloadSelected')}
              aria-label="Baixar">{@render DownloadIcon()}</button
            >
            <button
              class="flex h-9 w-9 items-center justify-center rounded-full hover:bg-[#dde3ea]"
              on:click|stopPropagation={() => dispatch('moveSelected')}
              aria-label="Mover">{@render MoveIcon()}</button
            >
            <button
              class="flex h-9 w-9 items-center justify-center rounded-full hover:bg-[#dde3ea]"
              on:click|stopPropagation={() => dispatch('trashSelected')}
              aria-label="Mover para lixeira">{@render TrashIcon()}</button
            >
            <button
              class="flex h-9 w-9 items-center justify-center rounded-full hover:bg-[#dde3ea]"
              on:click|stopPropagation={() => dispatch('copyLinks')}
              aria-label="Copiar link">{@render LinkIcon()}</button
            >
            <button
              class="flex h-9 w-9 items-center justify-center rounded-full hover:bg-[#dde3ea]"
              on:click|stopPropagation={openSelectedMenu}
              aria-label="Mais ações">{@render MoreIcon()}</button
            >
          </div>
        {:else}
          <div class="flex items-center gap-3 text-[19px] font-medium">
            <span class="text-[22px] leading-none">⌄</span>
            Pastas sugeridas
          </div>
        {/if}
      </div>
      <div class="flex flex-wrap" style="gap:{densityMetrics.folderGap}">
        {#each suggestedFolders as folder (folder.id)}
          {@const selected = selectedLookup.has(folder.id)}
          <div
            data-drive-item-id={folder.id}
            class="group flex h-[56px] w-[246px] select-none items-center gap-4 rounded-[10px] px-4 {selected
              ? 'bg-[#c2e7ff] text-[#004a77]'
              : 'bg-[#f0f4f9] hover:bg-[#e8eaed]'}"
            style="width:{densityMetrics.folderWidth};height:{densityMetrics.folderHeight};font-size:{densityMetrics.fontSize}px"
            role="row"
            tabindex="0"
            aria-selected={selected}
            on:click={(e) => selectItem(folder, e)}
            on:dblclick={() => dispatch('open', folder)}
            on:keydown={(e) => {
              if (e.key === 'Enter') dispatch('open', folder);
              if (e.key === ' ') {
                e.preventDefault();
                selectItem(folder, e);
              }
            }}
            on:contextmenu={(e) => onItemRightClick(folder, e)}
          >
            <FileIcon item={folder} size={densityMetrics.iconSize} />
            <div class="min-w-0 flex-1">
              <div class="truncate font-medium">{folder.name}</div>
              <div class="truncate text-[#5f6368]" style="font-size:{densityMetrics.secondaryFontSize}px">em {locationName(folder)}</div>
            </div>
            <button
              class="flex h-8 w-8 items-center justify-center rounded-full opacity-0 hover:bg-[#dde3ea] group-hover:opacity-100"
              on:click={(e) => openMenu(folder, e)}
              aria-label="Mais ações"
            >
              {@render MoreIcon()}
            </button>
          </div>
        {/each}
      </div>
    </div>

    <div>
      <div class="mb-4 flex items-center justify-between">
        <div class="flex items-center gap-3 text-[19px] font-medium text-[#1f1f1f]">
          <span class="text-[22px] leading-none">⌄</span>
          Arquivos sugeridos
        </div>
        <div class="flex h-9 overflow-hidden rounded-full border border-[#747775]">
          <button
            class="flex h-9 w-14 items-center justify-center border-r border-[#747775] {viewMode === 'list'
              ? 'bg-[#c2e7ff] text-[#001d35]'
              : 'bg-white text-[#1f1f1f]'}"
            on:click|stopPropagation={() => dispatch('viewMode', 'list')}
            aria-label="Visualizar como lista"
            >{@render ListIcon()}</button
          >
          <button
            class="flex h-9 w-14 items-center justify-center {viewMode === 'grid'
              ? 'bg-[#c2e7ff] text-[#001d35]'
              : 'bg-white text-[#1f1f1f]'}"
            on:click|stopPropagation={() => dispatch('viewMode', 'grid')}
            aria-label="Visualizar como grade"
            >{@render GridIcon()}</button
          >
        </div>
      </div>

      {#if viewMode === 'grid'}
        <div
          class="grid"
          style="grid-template-columns:repeat(auto-fill,minmax({densityMetrics.gridMin},1fr));gap:{densityMetrics.gridGap}"
        >
          {#each suggestedFiles as item (item.id)}
            {@const selected = selectedLookup.has(item.id)}
            <div
              data-drive-item-id={item.id}
              class="group select-none overflow-hidden rounded-xl border text-[#1f1f1f] {selected
                ? 'border-[#a8d8f5] bg-[#c2e7ff]'
                : 'border-[#c4c7c5] bg-white hover:bg-[#e8eaed]'}"
              role="option"
              tabindex="0"
              aria-selected={selected}
              on:click={(e) => selectItem(item, e)}
              on:dblclick={() => dispatch('open', item)}
              on:keydown={(e) => {
                if (e.key === 'Enter') dispatch('open', item);
                if (e.key === ' ') {
                  e.preventDefault();
                  selectItem(item, e);
                }
              }}
              on:contextmenu={(e) => onItemRightClick(item, e)}
            >
              <div
                class="flex h-[54px] items-center gap-3 px-4"
                style="height:{densityMetrics.fileHeaderHeight};font-size:{densityMetrics.fontSize}px"
              >
                <FileIcon {item} size={densityMetrics.fileIconSize} />
                <span class="min-w-0 flex-1 truncate font-medium">{item.name}</span>
                <button
                  class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full opacity-0 hover:bg-[#dde3ea] group-hover:opacity-100"
                  on:click={(e) => openMenu(item, e)}
                  aria-label="Mais ações"
                >
                  {@render MoreIcon()}
                </button>
              </div>
              <button
                class="mx-3 mb-3 flex h-32 w-[calc(100%-24px)] items-center justify-center rounded-lg bg-[#f0f4f9]"
                style="height:{densityMetrics.thumbnailHeight}"
                on:click={(e) => {
                  e.stopPropagation();
                  selectItem(item, e);
                }}
              >
                <FileThumbnail {item} iconSize={densityMetrics.thumbnailIconSize} />
              </button>
              <div class="flex items-center gap-2 px-4 pb-3 text-[#5f6368]" style="font-size:{densityMetrics.secondaryFontSize}px">
                {@render FolderTinyIcon()}
                <span class="truncate">{locationName(item)}</span>
              </div>
            </div>
          {/each}
        </div>
      {:else}
        <div
          class="grid h-[52px] items-center border-b border-[#c7c7c7] text-[16px] text-[#3c4043]"
          style="grid-template-columns:minmax(320px,1fr) minmax(220px,470px) 216px 220px 44px;height:{densityMetrics.listHeaderHeight};font-size:{densityMetrics.fontSize}px"
        >
          <span class="pl-2">Nome</span>
          <span>Porque sugerimos este arquivo</span>
          <span>Proprietário</span>
          <span>Local</span>
          <span></span>
        </div>

        {#each suggestedFiles as item (item.id)}
          {@const selected = selectedLookup.has(item.id)}
          {@const itemOwner = ownerFor(item)}
          <div
            data-drive-item-id={item.id}
            class="group grid h-[52px] select-none items-center border-b border-[#d7d7d7] text-[16px] {selected
              ? 'bg-[#c2e7ff] text-[#004a77]'
              : 'text-[#1f1f1f] hover:bg-[#e8eaed]'}"
            style="grid-template-columns:minmax(320px,1fr) minmax(220px,470px) 216px 220px 44px;height:{densityMetrics.listRowHeight};font-size:{densityMetrics.fontSize}px"
            role="row"
            tabindex="0"
            aria-selected={selected}
            on:click={(e) => selectItem(item, e)}
            on:dblclick={() => dispatch('open', item)}
            on:keydown={(e) => {
              if (e.key === 'Enter') dispatch('open', item);
              if (e.key === ' ') {
                e.preventDefault();
                selectItem(item, e);
              }
            }}
            on:contextmenu={(e) => onItemRightClick(item, e)}
          >
            <div class="flex min-w-0 items-center gap-4 pl-5 pr-4">
              <FileIcon {item} size={densityMetrics.fileIconSize} />
              <span class="truncate font-medium">{item.name}</span>
            </div>
            <span class="truncate text-[#3c4043]">{reason(item)}</span>
            <span class="flex min-w-0 items-center gap-2 truncate text-[#3c4043]">
              <span
                class="flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded-full text-[12px] font-medium text-white"
                style="background:{itemOwner?.avatarColor ?? '#1a73e8'}"
              >
                {#if itemOwner?.avatarUrl}
                  <img src={itemOwner.avatarUrl} alt="" class="h-full w-full object-cover" />
                {:else}
                  {itemOwner?.name?.slice(0, 1).toUpperCase() ?? 'e'}
                {/if}
              </span>
              {ownerName(item)}
            </span>
            <span class="flex min-w-0 items-center gap-2 truncate font-medium text-[#3c4043]">
              {@render FolderTinyIcon()}
              {locationName(item)}
            </span>
            <button
              class="mr-3 flex h-8 w-8 items-center justify-center justify-self-end rounded-full text-[#1f1f1f] hover:bg-[#dde3ea]"
              on:click={(e) => openMenu(item, e)}
              aria-label="Mais ações"
            >
              {@render MoreIcon()}
            </button>
          </div>
        {/each}
      {/if}
    </div>
  </div>

  {#if selectedItems.length === 1}
    {@const selectedItem = selectedItems[0]}
    <div
      class="sticky bottom-0 z-20 flex h-[52px] items-center gap-3 border-t border-[#e0e0e0] bg-white px-8 text-[16px] text-[#1f1f1f]"
    >
      <button
        class="flex h-9 min-w-0 items-center gap-2 rounded-full px-2 font-medium hover:bg-[#edf2fa]"
        on:click={() => dispatch('reveal', null)}
      >
        {@render DriveTinyIcon()} Meu Ride
      </button>
      {#each pathFor(selectedItem) as folder (folder.id)}
        <span class="text-[24px] text-[#5f6368]">›</span>
        <button
          class="flex h-9 min-w-0 items-center gap-2 truncate rounded-full px-2 font-medium hover:bg-[#edf2fa]"
          on:click={() => dispatch('reveal', folder.id)}
        >
          {@render FolderTinyIcon()}
          {folder.name}
        </button>
      {/each}
      <span class="text-[24px] text-[#5f6368]">›</span>
      <button
        class="flex h-9 min-w-0 items-center gap-2 truncate rounded-full px-2 font-medium hover:bg-[#edf2fa]"
        on:click={() => revealSelectedLocation(selectedItem)}
      >
        <FileIcon item={selectedItem} size={20} />
        {selectedItem.name}
      </button>
    </div>
  {/if}
</section>

{#snippet MoreIcon()}<svg
    xmlns="http://www.w3.org/2000/svg"
    width="20"
    height="20"
    viewBox="0 0 24 24"
    fill="currentColor"
    ><path
      d="M12 8c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm0 2c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm0 6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z"
    /></svg
  >{/snippet}
{#snippet CloseIcon()}<svg
    xmlns="http://www.w3.org/2000/svg"
    width="21"
    height="21"
    viewBox="0 0 24 24"
    fill="currentColor"
    ><path
      d="M18.3 5.71 12 12l6.3 6.29-1.41 1.41L10.59 13.41 4.29 19.71 2.88 18.3 9.17 12 2.88 5.71 4.29 4.29l6.3 6.3 6.29-6.3z"
    /></svg
  >{/snippet}
{#snippet ShareIcon()}<svg
    xmlns="http://www.w3.org/2000/svg"
    width="21"
    height="21"
    viewBox="0 0 24 24"
    fill="currentColor"
    ><path
      d="M15 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0-6c1.1 0 2 .9 2 2s-.9 2-2 2-2-.9-2-2 .9-2 2-2zM15 14c-2.67 0-8 1.34-8 4v2h10v-2H9.34c.72-.72 3.08-2 5.66-2 .77 0 1.5.1 2.14.27l1.52-1.52C17.54 14.27 16.2 14 15 14zM6 10V7H3V5h3V2h2v3h3v2H8v3H6zm13 4v3h3v2h-3v3h-2v-3h-3v-2h3v-3h2z"
    /></svg
  >{/snippet}
{#snippet DownloadIcon()}<svg
    xmlns="http://www.w3.org/2000/svg"
    width="21"
    height="21"
    viewBox="0 0 24 24"
    fill="currentColor"><path d="M5 20h14v-2H5v2zM19 9h-4V3H9v6H5l7 7 7-7zm-8-4h2v6h1.17L12 13.17 9.83 11H11V5z" /></svg
  >{/snippet}
{#snippet MoveIcon()}<svg
    xmlns="http://www.w3.org/2000/svg"
    width="21"
    height="21"
    viewBox="0 0 24 24"
    fill="currentColor"
    ><path d="M20 6h-8.17l-2-2H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2zm0 12H4V6h5l2 2h9v10zm-5-8v2H9v2h6v2l4-3-4-3z" /></svg
  >{/snippet}
{#snippet TrashIcon()}<svg
    xmlns="http://www.w3.org/2000/svg"
    width="21"
    height="21"
    viewBox="0 0 24 24"
    fill="currentColor"
    ><path
      d="M16 9v10H8V9h8m-1.5-6h-5l-1 1H5v2h14V4h-3.5l-1-1zM18 7H6v12c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7z"
    /></svg
  >{/snippet}
{#snippet LinkIcon()}<svg
    xmlns="http://www.w3.org/2000/svg"
    width="21"
    height="21"
    viewBox="0 0 24 24"
    fill="currentColor"
    ><path
      d="M3.9 12c0-1.71 1.39-3.1 3.1-3.1h4V7H7c-2.76 0-5 2.24-5 5s2.24 5 5 5h4v-1.9H7c-1.71 0-3.1-1.39-3.1-3.1zM8 13h8v-2H8v2zm9-6h-4v1.9h4c1.71 0 3.1 1.39 3.1 3.1s-1.39 3.1-3.1 3.1h-4V17h4c2.76 0 5-2.24 5-5s-2.24-5-5-5z"
    /></svg
  >{/snippet}
{#snippet InfoIcon()}<svg
    xmlns="http://www.w3.org/2000/svg"
    width="22"
    height="22"
    viewBox="0 0 24 24"
    fill="currentColor"
    ><path
      d="M11 17h2v-6h-2v6zm0-8h2V7h-2v2zm1-7C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8z"
    /></svg
  >{/snippet}
{#snippet ListIcon()}<svg
    xmlns="http://www.w3.org/2000/svg"
    width="21"
    height="21"
    viewBox="0 0 24 24"
    fill="currentColor"
    ><path
      d="M4 10.5c.83 0 1.5-.67 1.5-1.5S4.83 7.5 4 7.5 2.5 8.17 2.5 9 3.17 10.5 4 10.5zm3-2.5v2h14V8H7zm0 8h14v-2H7v2z"
    /></svg
  >{/snippet}
{#snippet GridIcon()}<svg
    xmlns="http://www.w3.org/2000/svg"
    width="21"
    height="21"
    viewBox="0 0 24 24"
    fill="currentColor"><path d="M4 4h7v7H4V4zm2 2v3h3V6H6zm7-2h7v7h-7V4zm2 2v3h3V6h-3zM4 13h7v7H4v-7zm2 2v3h3v-3H6zm7-2h7v7h-7v-7zm2 2v3h3v-3h-3z" /></svg
  >{/snippet}
{#snippet FileTinyIcon()}<svg
    xmlns="http://www.w3.org/2000/svg"
    width="18"
    height="18"
    viewBox="0 0 24 24"
    fill="currentColor"
    ><path d="M14 2H6c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V8l-6-6zm4 18H6V4h7v5h5v11zm-3-13V5.5L16.5 7H15z" /></svg
  >{/snippet}
{#snippet PersonTinyIcon()}<svg
    xmlns="http://www.w3.org/2000/svg"
    width="18"
    height="18"
    viewBox="0 0 24 24"
    fill="currentColor"
    ><path
      d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0-6c1.1 0 2 .9 2 2s-.9 2-2 2-2-.9-2-2 .9-2 2-2zm0 8c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4zm-6 4c.72-.72 3.08-2 6-2s5.28 1.28 6 2H6z"
    /></svg
  >{/snippet}
{#snippet CalendarTinyIcon()}<svg
    xmlns="http://www.w3.org/2000/svg"
    width="18"
    height="18"
    viewBox="0 0 24 24"
    fill="currentColor"
    ><path
      d="M19 3h-1V1h-2v2H8V1H6v2H5c-1.11 0-2 .9-2 2v14c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H5V9h14v10zm0-12H5V5h14v2z"
    /></svg
  >{/snippet}
{#snippet FolderTinyIcon()}<svg
    class="shrink-0"
    xmlns="http://www.w3.org/2000/svg"
    width="18"
    height="18"
    viewBox="0 0 24 24"
    fill="currentColor"
    ><path d="M10 4H2v16h20V6H12l-2-2zm10 14H4V6h5.17l2 2H20v10z" /></svg
  >{/snippet}
{#snippet DriveTinyIcon()}<svg
    class="shrink-0"
    xmlns="http://www.w3.org/2000/svg"
    width="18"
    height="18"
    viewBox="0 0 24 24"
    fill="currentColor"
    ><path
      d="M20 6H4V4h16v2zm0 2H4c-1.1 0-2 .9-2 2v4c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2v-4c0-1.1-.9-2-2-2zm0 6H4v-4h16v4zm-14-3h2v2H6v-2zm14 7H4v2h16v-2z"
    /></svg
  >{/snippet}
