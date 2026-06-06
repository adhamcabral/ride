<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import { formatBytes } from '$lib/format';
  import { officeCreateOptions, type OfficeCreateKind } from '$lib/office-create';
  import type { DriveItem, Section, StorageSummary, UserAccount } from '$lib/types';

  const paths: Record<string, string> = {
    home: 'M12 3 2 12h3v8h14v-8h3L12 3zm5 15h-3v-5h-4v5H7v-7.19l5-4.5 5 4.5V18z',
    drive:
      'M20 6H4V4h16v2zm0 2H4c-1.1 0-2 .9-2 2v4c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2v-4c0-1.1-.9-2-2-2zm0 6H4v-4h16v4zm-14-3h2v2H6v-2zm14 7H4v2h16v-2z',
    folder: 'M10 4H2v16h20V6H12l-2-2zm10 14H4V6h5.17l2 2H20v10z',
    computer:
      'M20 18c1.1 0 1.99-.9 1.99-2L22 6c0-1.1-.9-2-2-2H4c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2H1v2h22v-2h-3zM4 6h16v10H4V6z',
    shared:
      'M9 11.75c-2.34 0-7 1.17-7 3.5V18h14v-2.75c0-2.33-4.66-3.5-7-3.5zM4.34 16c.84-.58 2.87-1.25 4.66-1.25s3.82.67 4.66 1.25H4.34zM9 10c1.93 0 3.5-1.57 3.5-3.5S10.93 3 9 3 5.5 4.57 5.5 6.5 7.07 10 9 10zm0-5c.83 0 1.5.67 1.5 1.5S9.83 8 9 8s-1.5-.67-1.5-1.5S8.17 5 9 5zm7.04 6.81c1.16.84 1.96 1.96 1.96 3.44V18h4v-2.75c0-2.02-3.5-3.17-5.96-3.44zM15 10c1.93 0 3.5-1.57 3.5-3.5S16.93 3 15 3c-.54 0-1.04.13-1.5.35.63.89 1 1.98 1 3.15s-.37 2.26-1 3.15c.46.22.96.35 1.5.35z',
    recent:
      'M11.99 2C6.47 2 2 6.48 2 12s4.47 10 9.99 10C17.52 22 22 17.52 22 12S17.52 2 11.99 2zM12 20c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8zm.5-13H11v6l5.25 3.15.75-1.23-4.5-2.67V7z',
    star: 'M22 9.24l-7.19-.62L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21 12 17.27 18.18 21l-1.63-7.03L22 9.24zM12 15.4l-3.76 2.27 1-4.28-3.32-2.88 4.38-.38L12 6.1l1.71 4.04 4.38.38-3.32 2.88 1 4.28L12 15.4z',
    spam: 'M15.73 3H8.27L3 8.27v7.46L8.27 21h7.46L21 15.73V8.27L15.73 3zM19 14.9 14.9 19H9.1L5 14.9V9.1L9.1 5h5.8L19 9.1v5.8zM11 7h2v6h-2zm0 8h2v2h-2z',
    trash: 'M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM8 9h8v10H8V9zm7.5-5-1-1h-5l-1 1H5v2h14V4z',
    storage:
      'M19.35 10.04C18.67 6.59 15.64 4 12 4 9.11 4 6.6 5.64 5.35 8.04 2.34 8.36 0 10.91 0 14c0 3.31 2.69 6 6 6h13c2.76 0 5-2.24 5-5 0-2.64-2.05-4.78-4.65-4.96zM19 18H6c-2.21 0-4-1.79-4-4s1.79-4 4-4h.71C7.37 7.69 9.48 6 12 6c3.04 0 5.5 2.46 5.5 5.5v.5H19c1.66 0 3 1.34 3 3s-1.34 3-3 3z',
    upload: 'M5 20h14v-2H5v2zm0-10h4v6h6v-6h4l-7-7-7 7z'
  };

  function iconPath(name: string) {
    return paths[name] ?? paths.drive;
  }

  export let section: Section = 'drive';
  export let currentFolderId: string | null = null;
  export let folders: DriveItem[] = [];
  export let summary: StorageSummary | null = null;
  export let account: UserAccount | null = null;
  export let open = true;

  let showNewMenu = false;
  let driveExpanded = true;
  let expandedFolderIds: string[] = [];

  const dispatch = createEventDispatcher<{
    navigate: Section;
    openFolder: string | null;
    new: void;
    upload: void;
    uploadFolder: void;
    createOffice: OfficeCreateKind;
  }>();

  const navItems: Array<{ id: Section; label: string; icon: string; indent?: boolean }> = [
    { id: 'personal', label: 'Pessoal', icon: 'home' },
    { id: 'drive', label: 'Meu Ride', icon: 'drive', indent: true },
    { id: 'shared-with-me', label: 'Compartilhados comigo', icon: 'shared' },
    { id: 'recent', label: 'Recentes', icon: 'recent' },
    { id: 'starred', label: 'Com estrela', icon: 'star' },
    { id: 'spam', label: 'Spam', icon: 'spam' },
    { id: 'trash', label: 'Lixeira', icon: 'trash' },
    { id: 'storage', label: 'Armazenamento', icon: 'storage' }
  ];

  $: usedPercent = summary ? Math.min(100, (summary.usedBytes / summary.totalBytes) * 100) : 0;

  function childrenFor(parentId: string | null) {
    return folders.filter((folder) => folder.parentId === parentId);
  }

  function hasChildren(folderId: string) {
    return folders.some((folder) => folder.parentId === folderId);
  }

  function isFolderExpanded(folderId: string) {
    return expandedFolderIds.includes(folderId);
  }

  function toggleFolder(folderId: string) {
    expandedFolderIds = isFolderExpanded(folderId)
      ? expandedFolderIds.filter((id) => id !== folderId)
      : [...expandedFolderIds, folderId];
  }
</script>

{#if showNewMenu}
  <div class="fixed inset-0 z-40" role="presentation" on:click={() => (showNewMenu = false)}></div>
{/if}

<aside
  class="relative shrink-0 overflow-y-auto overflow-x-hidden bg-[#f8fafd] transition-all duration-200"
  style="width:{open ? '244px' : '0px'};min-width:{open ? '244px' : '0px'};"
>
  <div class="flex h-full w-[244px] flex-col py-2">
    <div class="relative mb-4 px-3 pt-2">
      <button
        data-new-button
        class="flex h-[56px] w-[108px] items-center gap-3 rounded-2xl bg-white px-5 text-[14px] font-medium text-[#1f1f1f] shadow-[0_1px_2px_rgba(60,64,67,.3),0_1px_3px_1px_rgba(60,64,67,.15)] hover:shadow-[0_1px_3px_rgba(60,64,67,.3),0_4px_8px_3px_rgba(60,64,67,.15)]"
        on:click={() => (showNewMenu = !showNewMenu)}
        aria-haspopup="true"
        aria-expanded={showNewMenu}
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="#1f1f1f">
          <path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z" />
        </svg>
        Novo
      </button>

      {#if showNewMenu}
        <div
          class="absolute left-1 top-16 z-50 w-60 overflow-hidden rounded-2xl bg-white py-2 shadow-[0_1px_3px_rgba(60,64,67,.3),0_4px_8px_3px_rgba(60,64,67,.15)]"
          role="menu"
        >
          <button
            class="flex w-full items-center gap-4 px-4 py-3 text-left text-[14px] text-[#202124] hover:bg-[#f1f3f4]"
            role="menuitem"
            on:click={() => {
              showNewMenu = false;
              dispatch('new');
            }}
          >
            {@render Icon('drive')}
            Nova pasta
          </button>
          <div class="my-1 h-px bg-[#e0e0e0]"></div>
          <button
            class="flex w-full items-center gap-4 px-4 py-3 text-left text-[14px] text-[#202124] hover:bg-[#f1f3f4]"
            role="menuitem"
            on:click={() => {
              showNewMenu = false;
              dispatch('upload');
            }}
          >
            {@render Icon('upload')}
            Upload de arquivo
          </button>
          <button
            class="flex w-full items-center gap-4 px-4 py-3 text-left text-[14px] text-[#202124] hover:bg-[#f1f3f4]"
            role="menuitem"
            on:click={() => {
              showNewMenu = false;
              dispatch('uploadFolder');
            }}
          >
            {@render Icon('drive')}
            Upload de pasta
          </button>
          <div class="my-1 h-px bg-[#e0e0e0]"></div>
          {#each officeCreateOptions as option}
            <button
              class="flex w-full items-center gap-4 px-4 py-3 text-left text-[14px] text-[#202124] hover:bg-[#f1f3f4]"
              role="menuitem"
              on:click={() => {
                showNewMenu = false;
                dispatch('createOffice', option.kind);
              }}
            >
              {@render OfficeCreateIcon(option)}
              <span>{option.label}</span>
            </button>
          {/each}
        </div>
      {/if}
    </div>

    <nav class="flex-1 px-2">
      {#each navItems as item, index}
        {#if index === 3 || index === 6}
          <div class="h-7"></div>
        {/if}
        {#if item.id === 'drive'}
          <div
            class="mb-0.5 flex h-9 w-full items-center rounded-full text-[14px] transition-colors {section ===
              'drive' && !currentFolderId
              ? 'bg-[#c2e7ff] font-medium text-[#001d35]'
              : 'text-[#1f1f1f] hover:bg-[#e9eef6]'}"
          >
            <button
              class="flex h-9 w-8 shrink-0 items-center justify-center rounded-l-full text-[#444746]"
              on:click|stopPropagation={() => (driveExpanded = !driveExpanded)}
              aria-label={driveExpanded ? 'Recolher Meu Ride' : 'Expandir Meu Ride'}
            >
              {@render Caret(driveExpanded)}
            </button>
            <button
              class="flex h-9 min-w-0 flex-1 items-center gap-3 rounded-r-full pr-4 text-left"
              on:click={() => dispatch('navigate', 'drive')}
            >
              {@render Icon(item.icon)}
              <span class="truncate">{item.label}</span>
            </button>
          </div>
          {#if driveExpanded}
            {@render FolderBranch(null, 0)}
          {/if}
        {:else}
          <button
            class="mb-0.5 flex h-9 w-full items-center gap-3 rounded-full pl-2 pr-3 text-left text-[14px] leading-9 transition-colors {section ===
            item.id
              ? 'bg-[#c2e7ff] font-medium text-[#001d35]'
              : 'text-[#1f1f1f] hover:bg-[#e9eef6]'}"
            on:click={() => dispatch('navigate', item.id)}
          >
            <span class="w-2 shrink-0 text-center text-[12px] text-[#444746]" aria-hidden="true">
              {item.indent ? '›' : ''}
            </span>
            {@render Icon(item.icon)}
            <span class="truncate">{item.label}</span>
          </button>
        {/if}
      {/each}
    </nav>

    <div class="px-4 pb-5 pt-4">
      <div class="mb-2 h-1 w-[175px] overflow-hidden rounded-full bg-[#dfe1e5]">
        <div class="h-full rounded-full bg-[#0b57d0]" style="width:{usedPercent}%"></div>
      </div>
      <p class="w-[190px] text-[13px] leading-5 text-[#3c4043]">
        {summary
          ? `${formatBytes(summary.usedBytes)} de ${formatBytes(summary.totalBytes)} usados`
          : 'Calculando...'}
      </p>
      {#if account}
        <p class="mt-0.5 w-[190px] truncate text-[12px] text-[#5f6368]">{account.email}</p>
      {/if}
    </div>
  </div>
</aside>

{#snippet Icon(name: string)}
  <svg
    class="block h-5 w-5 shrink-0 text-current"
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 24 24"
    fill="currentColor"
    aria-hidden="true"
  >
    <path d={iconPath(name)} />
  </svg>
{/snippet}

{#snippet OfficeCreateIcon(option: (typeof officeCreateOptions)[number])}
  <span
    class="flex h-5 w-5 shrink-0 items-center justify-center rounded-[3px] text-[12px] font-bold leading-none text-white"
    style="background:{option.color}"
    aria-hidden="true"
  >
    {option.glyph}
  </span>
{/snippet}

{#snippet FolderBranch(parentId: string | null, depth: number)}
  {#each childrenFor(parentId) as folder (folder.id)}
    {@const expanded = isFolderExpanded(folder.id)}
    {@const hasNested = hasChildren(folder.id)}
    {@const active = section === 'drive' && currentFolderId === folder.id}
    <div
      class="mb-0.5 flex h-9 w-full items-center rounded-full text-[14px] transition-colors {active
        ? 'bg-[#c2e7ff] font-medium text-[#001d35]'
        : 'text-[#1f1f1f] hover:bg-[#e9eef6]'}"
      style="padding-left:{12 + depth * 18}px"
    >
      {#if hasNested}
        <button
          class="flex h-9 w-7 shrink-0 items-center justify-center rounded-l-full text-[#444746]"
          on:click|stopPropagation={() => toggleFolder(folder.id)}
          aria-label={expanded ? `Recolher ${folder.name}` : `Expandir ${folder.name}`}
        >
          {@render Caret(expanded)}
        </button>
      {:else}
        <span class="w-7 shrink-0"></span>
      {/if}
      <button
        class="flex h-9 min-w-0 flex-1 items-center gap-3 rounded-r-full pr-3 text-left"
        on:click={() => dispatch('openFolder', folder.id)}
      >
        {@render Icon('folder')}
        <span class="truncate">{folder.name}</span>
      </button>
    </div>
    {#if hasNested && expanded}
      {@render FolderBranch(folder.id, depth + 1)}
    {/if}
  {/each}
{/snippet}

{#snippet Caret(expanded: boolean)}
  <svg
    class="h-4 w-4 transition-transform {expanded ? 'rotate-90' : ''}"
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 24 24"
    fill="currentColor"
    aria-hidden="true"
  >
    <path d="M10 17l5-5-5-5v10z" />
  </svg>
{/snippet}
