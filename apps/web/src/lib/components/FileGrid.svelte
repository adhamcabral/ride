<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import FileIcon from '$lib/components/FileIcon.svelte';
  import FileThumbnail from '$lib/components/FileThumbnail.svelte';
  import { formatBytes, formatDriveDate } from '$lib/format';
  import type { DriveDensity } from '$lib/preferences';
  import type {
    DriveItem,
    FolderOrder,
    Section,
    SortDirection,
    SortField,
    UserAccount,
    ViewMode
  } from '$lib/types';

  type MaybePromise<T> = T | Promise<T>;

  export let items: DriveItem[] = [];
  export let density: DriveDensity = 'low';
  export let viewMode: ViewMode = 'list';
  export let section: Section = 'drive';
  export let owner: UserAccount | null = null;
  export let accounts: UserAccount[] = [];
  export let folders: DriveItem[] = [];
  export let activeAccountId = '';
  export let selectedIds: string[] = [];
  export let marquee: {
    active: boolean;
    left: number;
    top: number;
    width: number;
    height: number;
    baseIds: string[];
    additive: boolean;
  } | null = null;
  export let sortField: SortField = 'name';
  export let sortDirection: SortDirection = 'asc';
  export let folderOrder: FolderOrder = 'first';
  export let ownerFilterId = 'all';
  export let showLocation = false;
  export let canEdit = true;
  export let canShare = true;
  export let canStar = true;
  export let allowContextMenu = true;
  export let thumbnailPreviewUrl: ((itemId: string) => MaybePromise<string>) | null = null;
  export let thumbnailPdfPageUrl: ((itemId: string, page: number) => MaybePromise<string>) | null = null;

  const dispatch = createEventDispatcher<{
    open: DriveItem;
    select: { item: DriveItem; mode: 'single' | 'toggle' | 'range' };
    sort: { field: SortField; direction?: SortDirection };
    ownerFilter: string;
    folderOrder: FolderOrder;
    star: DriveItem;
    trash: DriveItem;
    restore: DriveItem;
    rename: DriveItem;
    move: DriveItem;
    download: DriveItem;
    share: DriveItem;
    spam: DriveItem;
    hardDelete: DriveItem;
    reveal: string | null;
    contextMenu: { item: DriveItem; x: number; y: number };
    marqueeHits: string[];
    moveItems: { items: DriveItem[]; targetFolder: DriveItem };
  }>();

  $: selectedLookup = new Set(selectedIds);
  $: accountLookup = new Map(accounts.map((account) => [account.id, account]));
  $: folderLookup = new Map(folders.map((folder) => [folder.id, folder]));
  $: ownerOptions = accounts.length ? accounts : owner ? [owner] : [];
  $: selectedVisible = items.filter((item) => selectedLookup.has(item.id));
  $: sortLabel = sortFieldLabel(sortField);
  $: directionLabel = sortDirectionLabel(sortField, sortDirection);
  $: densityMetrics =
    density === 'high'
      ? {
          gridMin: '190px',
          gridGap: '10px',
          folderHeight: '40px',
          fileHeaderHeight: '42px',
          thumbnailHeight: '108px',
          listHeaderHeight: '38px',
          listRowHeight: '42px',
          iconSize: 20,
          fileIconSize: 20,
          thumbnailIconSize: 42,
          fontSize: 14,
          secondaryFontSize: 13
        }
      : density === 'medium'
        ? {
            gridMin: '218px',
            gridGap: '12px',
            folderHeight: '44px',
            fileHeaderHeight: '46px',
            thumbnailHeight: '132px',
            listHeaderHeight: '40px',
            listRowHeight: '46px',
            iconSize: 22,
            fileIconSize: 21,
            thumbnailIconSize: 48,
            fontSize: 14,
            secondaryFontSize: 13
          }
        : {
            gridMin: '246px',
            gridGap: '16px',
            folderHeight: '48px',
            fileHeaderHeight: '50px',
            thumbnailHeight: '160px',
            listHeaderHeight: '44px',
            listRowHeight: '50px',
            iconSize: 24,
            fileIconSize: 22,
            thumbnailIconSize: 56,
            fontSize: 15,
            secondaryFontSize: 14
          };
  $: gridFolders = items.filter((item) => item.type === 'folder');
  $: gridFiles = items.filter((item) => item.type !== 'folder');
  let sortMenuOpen = false;
  let ownerMenuOpen = false;
  let rootEl: HTMLDivElement;
  let draggingItems: DriveItem[] = [];
  let dragTargetFolderId: string | null = null;
  let dragImageEl: HTMLDivElement | null = null;
  let nativeDragImageEl: HTMLCanvasElement | null = null;
  let locationPreviewId: string | null = null;
  let expandedLocationPreviewId: string | null = null;
  let locationPreviewTimer: ReturnType<typeof setTimeout> | null = null;
  let locationPreviewCloseTimer: ReturnType<typeof setTimeout> | null = null;
  let lastClickItemId = '';
  let lastClickAt = 0;
  const SAME_ITEM_OPEN_MS = 520;
  $: if (marquee?.active) updateMarqueeHits();

  function closeMenus() {
    sortMenuOpen = false;
    ownerMenuOpen = false;
  }

  function selectionMode(e: MouseEvent | KeyboardEvent): 'single' | 'toggle' | 'range' {
    if (e.shiftKey) return 'range';
    if (e.ctrlKey || e.metaKey) return 'toggle';
    if (selectedIds.length > 0 && isTouchSelectionMode()) return 'toggle';
    return 'single';
  }

  function isTouchSelectionMode() {
    if (typeof window === 'undefined') return false;
    return window.matchMedia('(hover: none), (pointer: coarse)').matches;
  }

  function selectItem(item: DriveItem, e: MouseEvent | KeyboardEvent) {
    e.stopPropagation();
    dispatch('select', { item, mode: selectionMode(e) });
  }

  function clickItem(item: DriveItem, e: MouseEvent | KeyboardEvent) {
    e.stopPropagation();
    const now = Date.now();
    const repeatedSameItem = lastClickItemId === item.id && now - lastClickAt <= SAME_ITEM_OPEN_MS;
    lastClickItemId = item.id;
    lastClickAt = now;
    if (repeatedSameItem) {
      dispatch('open', item);
      return;
    }
    dispatch('select', { item, mode: selectionMode(e) });
  }

  function updateMarqueeHits() {
    if (!rootEl || !marquee) return;
    const selectionRect = {
      left: marquee.left,
      top: marquee.top,
      right: marquee.left + marquee.width,
      bottom: marquee.top + marquee.height
    };
    const hits = Array.from(rootEl.querySelectorAll<HTMLElement>('[data-drive-item-id]'))
      .filter((node) => {
        const rect = node.getBoundingClientRect();
        return (
          rect.left < selectionRect.right &&
          rect.right > selectionRect.left &&
          rect.top < selectionRect.bottom &&
          rect.bottom > selectionRect.top
        );
      })
      .map((node) => node.dataset.driveItemId)
      .filter((id): id is string => Boolean(id));
    dispatch('marqueeHits', marquee.additive ? Array.from(new Set([...marquee.baseIds, ...hits])) : hits);
  }

  function openMenu(item: DriveItem, e: MouseEvent) {
    e.stopPropagation();
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    dispatch('contextMenu', { item, x: rect.right - 224, y: rect.bottom + 4 });
  }

  function onItemRightClick(item: DriveItem, e: MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (isTouchSelectionMode()) return;
    if (!selectedLookup.has(item.id)) {
      dispatch('select', { item, mode: 'single' });
    }
    if (!allowContextMenu) return;
    dispatch('contextMenu', { item, x: e.clientX, y: e.clientY });
  }

  function selectedVisibleItems() {
    return items.filter((item) => selectedLookup.has(item.id));
  }

  function isDescendantOf(folder: DriveItem, possibleAncestorId: string) {
    let parentId = folder.parentId;
    while (parentId) {
      if (parentId === possibleAncestorId) return true;
      parentId = folderLookup.get(parentId)?.parentId ?? null;
    }
    return false;
  }

  function canDragItem(item: DriveItem) {
    return canEdit && !isTrashLike(section) && (item.ownerId === activeAccountId || section === 'shared-with-me');
  }

  function canDropOnFolder(target: DriveItem, dragged = draggingItems) {
    if (!canEdit) return false;
    if (isTrashLike(section) || target.type !== 'folder') return false;
    if (target.ownerId !== activeAccountId && section !== 'shared-with-me') return false;
    if (!dragged.length) return false;
    return dragged.every((item) => {
      if (item.id === target.id || item.parentId === target.id || item.ownerId !== target.ownerId) return false;
      if (item.type === 'folder' && isDescendantOf(target, item.id)) return false;
      return true;
    });
  }

  function escapeHtml(value: string) {
    return value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function dragIconHtml(item: DriveItem) {
    if (item.type === 'folder') {
      return '<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="#3c4043"><path d="M10 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z"/></svg>';
    }
    const ext = (item.extension || item.name.split('.').pop() || '').toLowerCase();
    if (ext === 'pdf') {
      return '<span class="flex h-4 w-4 items-center justify-center rounded-[1px] bg-[#ea4335] text-[5px] font-bold leading-none text-white">PDF</span>';
    }
    if (['xls', 'xlsx', 'csv', 'ods'].includes(ext)) {
      return '<svg xmlns="http://www.w3.org/2000/svg" width="21" height="21" viewBox="0 0 24 24" fill="#34a853"><path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zM9 17H7v-2h2v2zm4 0h-2v-2h2v2zm4 0h-2v-2h2v2zM9 13H7v-2h2v2zm4 0h-2v-2h2v2zm4 0h-2v-2h2v2zM9 9H7V7h2v2zm4 0h-2V7h2v2zm4 0h-2V7h2v2z"/></svg>';
    }
    return '<svg xmlns="http://www.w3.org/2000/svg" width="21" height="21" viewBox="0 0 24 24" fill="#4285f4"><path d="M14 2H6c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V8l-6-6zM13 9V3.5L18.5 9H13z"/></svg>';
  }

  function createNativeDragImage() {
    const canvas = document.createElement('canvas');
    canvas.width = 1;
    canvas.height = 1;
    canvas.style.cssText = 'position:fixed;left:-1000px;top:-1000px;opacity:0;pointer-events:none';
    document.body.appendChild(canvas);
    nativeDragImageEl = canvas;
    return canvas;
  }

  function positionDragImage(x: number, y: number) {
    if (!dragImageEl) return;
    dragImageEl.style.transform = `translate3d(${x + 18}px, ${y + 12}px, 0)`;
  }

  function moveDragImage(e: DragEvent) {
    if (!dragImageEl || !draggingItems.length) return;
    positionDragImage(e.clientX, e.clientY);
  }

  function createDragImage(item: DriveItem, x: number, y: number, sourceWidth: number) {
    const count = draggingItems.length;
    const initialWidth = Math.min(Math.max(sourceWidth, 430), 620);
    const el = document.createElement('div');
    el.style.cssText = [
      'pointer-events:none',
      'position:fixed',
      'left:0',
      'top:0',
      'z-index:9999',
      'display:flex',
      'align-items:center',
      'gap:14px',
      'width:360px',
      'height:48px',
      'box-sizing:border-box',
      'padding:0 18px',
      'border:1px solid #dadce0',
      'border-radius:10px',
      'background:#fff',
      'color:#3c4043',
      'font:500 14px/20px Arial, sans-serif',
      'opacity:1',
      'box-shadow:0 3px 12px rgba(60,64,67,.32), 0 1px 3px rgba(60,64,67,.18)',
      'will-change:transform,width'
    ].join(';');
    el.innerHTML = `
      <span style="display:flex;height:24px;width:24px;flex:0 0 auto;align-items:center;justify-content:center">
        ${dragIconHtml(item)}
      </span>
      <span style="min-width:0;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">
        ${escapeHtml(item.name)}
      </span>
      ${
        count > 1
          ? `<span style="position:absolute;right:-10px;top:-10px;display:flex;height:24px;min-width:24px;align-items:center;justify-content:center;border-radius:999px;background:#1a73e8;padding:0 7px;color:#fff;font:600 13px/24px Arial, sans-serif;box-shadow:0 1px 4px rgba(60,64,67,.35)">${count}</span>`
          : ''
      }
    `;
    document.body.appendChild(el);
    dragImageEl = el;
    positionDragImage(x, y);
    el.animate([{ width: `${initialWidth}px` }, { width: '360px' }], {
      duration: 260,
      easing: 'cubic-bezier(.05,.7,.1,1)',
      fill: 'both'
    });
    return el;
  }

  function cleanupDragImage() {
    dragImageEl?.remove();
    dragImageEl = null;
    nativeDragImageEl?.remove();
    nativeDragImageEl = null;
  }

  function startItemDrag(item: DriveItem, e: DragEvent) {
    if (!canDragItem(item) || !e.dataTransfer) {
      e.preventDefault();
      return;
    }
    e.stopPropagation();
    const currentSelection = selectedLookup.has(item.id) ? selectedVisibleItems() : [item];
    draggingItems = currentSelection.filter(canDragItem);
    if (!draggingItems.length) {
      e.preventDefault();
      return;
    }
    if (!selectedLookup.has(item.id)) dispatch('select', { item, mode: 'single' });
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('application/x-ride-items', draggingItems.map((entry) => entry.id).join(','));
    const sourceWidth = (e.currentTarget as HTMLElement | null)?.getBoundingClientRect().width ?? 520;
    createDragImage(item, e.clientX, e.clientY, sourceWidth);
    e.dataTransfer.setDragImage(createNativeDragImage(), 0, 0);
  }

  function endItemDrag() {
    draggingItems = [];
    dragTargetFolderId = null;
    cleanupDragImage();
  }

  function dragOverFolder(item: DriveItem, e: DragEvent) {
    if (!canDropOnFolder(item)) return;
    e.preventDefault();
    e.stopPropagation();
    dragTargetFolderId = item.id;
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
  }

  function leaveFolder(item: DriveItem, e: DragEvent) {
    if (!(e.currentTarget as HTMLElement).contains(e.relatedTarget as Node | null)) {
      if (dragTargetFolderId === item.id) dragTargetFolderId = null;
    }
  }

  function dropOnFolder(item: DriveItem, e: DragEvent) {
    if (!canDropOnFolder(item)) return;
    e.preventDefault();
    e.stopPropagation();
    dispatch('moveItems', { items: draggingItems, targetFolder: item });
    endItemDrag();
  }

  const isTrashLike = (s: Section) => s === 'trash' || s === 'spam';

  function ownerFor(item: DriveItem) {
    return accountLookup.get(item.ownerId) ?? owner;
  }

  function updatedByFor(item: DriveItem) {
    return accountLookup.get(item.updatedById ?? item.ownerId) ?? ownerFor(item);
  }

  function firstName(account: UserAccount | null | undefined) {
    const name = account?.name?.trim() || account?.email?.split('@')[0] || 'eu';
    return name.split(/\s+/)[0];
  }

  function updatedByLabel(item: DriveItem) {
    const updatedById = item.updatedById ?? item.ownerId;
    if (updatedById === activeAccountId) return 'eu';
    return firstName(updatedByFor(item));
  }

  function ownerLabel(item: DriveItem) {
    const itemOwner = ownerFor(item);
    if (!itemOwner) return 'eu';
    return itemOwner.id === activeAccountId ? 'eu' : itemOwner.name || itemOwner.email;
  }

  function deletionLabel(item: DriveItem) {
    if (item.daysUntilDeletion === undefined) return '—';
    return `${item.daysUntilDeletion} ${item.daysUntilDeletion === 1 ? 'dia' : 'dias'}`;
  }

  function originalLocation(item: DriveItem) {
    if (!item.parentId) return 'Meu Ride';
    return folderLookup.get(item.parentId)?.name ?? 'Pasta original';
  }

  function isDirectlySharedFile(item: DriveItem) {
    return (
      item.type === 'file' &&
      Boolean(item.linkRole || item.sharedWith?.length || item.sharePermissions?.length)
    );
  }

  function openLocation(item: DriveItem, event: MouseEvent) {
    event.stopPropagation();
    closeMenus();
    dispatch('reveal', item.parentId);
  }

  function locationPath(item: DriveItem) {
    const path: Array<{ id: string | null; name: string; root: boolean }> = [
      { id: null, name: 'Meu Ride', root: true }
    ];
    const folders: DriveItem[] = [];
    const seen = new Set<string>();
    let current = item.parentId ? folderLookup.get(item.parentId) : undefined;

    while (current && !seen.has(current.id)) {
      seen.add(current.id);
      folders.unshift(current);
      current = current.parentId ? folderLookup.get(current.parentId) : undefined;
    }

    return path.concat(folders.map((folder) => ({ id: folder.id, name: folder.name, root: false })));
  }

  function openPathSegment(id: string | null, event: MouseEvent) {
    event.stopPropagation();
    if (locationPreviewTimer) clearTimeout(locationPreviewTimer);
    if (locationPreviewCloseTimer) clearTimeout(locationPreviewCloseTimer);
    locationPreviewId = null;
    expandedLocationPreviewId = null;
    closeMenus();
    dispatch('reveal', id);
  }

  function scheduleLocationPreview(itemId: string) {
    if (locationPreviewTimer) clearTimeout(locationPreviewTimer);
    if (locationPreviewCloseTimer) clearTimeout(locationPreviewCloseTimer);
    locationPreviewTimer = setTimeout(() => {
      locationPreviewId = itemId;
      expandedLocationPreviewId = null;
    }, 320);
  }

  function closeLocationPreview() {
    if (locationPreviewTimer) clearTimeout(locationPreviewTimer);
    locationPreviewTimer = null;
    if (locationPreviewCloseTimer) clearTimeout(locationPreviewCloseTimer);
    locationPreviewCloseTimer = setTimeout(() => {
      locationPreviewId = null;
      expandedLocationPreviewId = null;
    }, 220);
  }

  function keepLocationPreview() {
    if (locationPreviewCloseTimer) clearTimeout(locationPreviewCloseTimer);
    locationPreviewCloseTimer = null;
  }

  function expandLocationPreview(itemId: string, event: MouseEvent) {
    event.stopPropagation();
    expandedLocationPreviewId = itemId;
  }

  function chooseSort(field: SortField, direction?: SortDirection) {
    closeMenus();
    dispatch('sort', { field, direction });
  }

  function defaultDirectionFor(field: SortField): SortDirection {
    return field === 'modified' || field === 'size' ? 'desc' : 'asc';
  }

  function chooseSortFieldInMenu(field: SortField) {
    dispatch('sort', { field, direction: sortField === field ? sortDirection : defaultDirectionFor(field) });
    sortMenuOpen = true;
    ownerMenuOpen = false;
  }

  function chooseOwnerFilter(id: string) {
    closeMenus();
    dispatch('ownerFilter', id);
  }

  function chooseFolderOrder(order: FolderOrder) {
    closeMenus();
    dispatch('folderOrder', order);
  }

  function sortFieldLabel(field: SortField) {
    if (field === 'name') return 'Nome';
    if (field === 'owner') return 'Proprietário';
    if (field === 'modified') return 'Data da modificação';
    return 'Tamanho';
  }

  function sortDirectionLabel(field: SortField, direction: SortDirection) {
    if (field === 'modified') return direction === 'desc' ? 'Mais recentes primeiro' : 'Mais antigas primeiro';
    if (field === 'size') return direction === 'desc' ? 'Maiores primeiro' : 'Menores primeiro';
    return direction === 'asc' ? 'A a Z' : 'Z a A';
  }

  function sortTooltip(field: SortField) {
    const direction =
      sortField === field ? sortDirection : field === 'modified' || field === 'size' ? 'desc' : 'asc';
    return `Classificar de ${sortDirectionLabel(field, direction)}`;
  }

  function headerButtonClass(field: SortField) {
    return 'flex h-9 w-full items-center gap-1 rounded-md px-2 text-left hover:bg-[#e8eaed]';
  }

  function listHeaderButtonClass(field: SortField) {
    return headerButtonClass(field);
  }

  $: listColumns = isTrashLike(section)
    ? 'minmax(300px,1fr) 210px 220px 150px 190px 126px 42px'
    : showLocation
      ? 'minmax(320px,1fr) 210px 220px 120px 220px 126px 42px'
      : 'minmax(320px,1fr) 210px 220px 150px 126px 42px';
</script>

<svelte:window on:click={closeMenus} on:dragover={moveDragImage} on:drop={endItemDrag} />

<div
  bind:this={rootEl}
  data-file-grid
  data-density={density}
  class="relative"
  role="presentation"
>
{#if viewMode === 'grid'}
  <div data-grid-view class="px-5 pb-10 pt-1">
    <div class="mb-3 flex h-9 items-center">
      <button
        class="flex h-8 min-w-[140px] items-center gap-1 rounded-md px-2 text-left hover:bg-[#e8eaed]"
        title={sortTooltip('name')}
        on:click|stopPropagation={() => chooseSort('name')}
      >
        <span>Nome</span>
        {#if sortField === 'name'}
          {@render SortArrow(sortDirection)}
        {/if}
      </button>
    </div>

    {#if gridFolders.length > 0}
      <div
        data-grid-folders
        class="mb-8 grid"
        style="grid-template-columns:repeat(auto-fill,minmax({densityMetrics.gridMin},1fr));gap:{densityMetrics.gridGap}"
      >
        {#each gridFolders as item (item.id)}
          {@const selected = selectedLookup.has(item.id)}
          <div
            data-drive-item-id={item.id}
            data-grid-folder-card
            class="group flex h-[48px] select-none items-center gap-3 rounded-[10px] px-4 text-[#1f1f1f] {dragTargetFolderId ===
            item.id
              ? 'bg-[#c2e7ff] text-[#004a77] ring-2 ring-[#0b57d0]'
              : selected
                ? 'bg-[#c2e7ff] text-[#004a77]'
                : 'bg-[#f0f4f9] hover:bg-[#e8eaed]'}"
            style="height:{densityMetrics.folderHeight};font-size:{densityMetrics.fontSize}px"
            aria-selected={selected}
            tabindex="0"
            role="option"
            draggable={canDragItem(item)}
            on:click={(e) => clickItem(item, e)}
            on:dragstart={(e) => startItemDrag(item, e)}
            on:dragend={endItemDrag}
            on:dragover={(e) => dragOverFolder(item, e)}
            on:dragleave={(e) => leaveFolder(item, e)}
            on:drop={(e) => dropOnFolder(item, e)}
            on:keydown={(e) => {
              if (e.key === 'Enter') dispatch('open', item);
              if (e.key === ' ') {
                e.preventDefault();
                selectItem(item, e);
              }
            }}
            on:contextmenu={(e) => onItemRightClick(item, e)}
          >
            <FileIcon {item} size={densityMetrics.iconSize} />
            <span class="min-w-0 flex-1 truncate font-medium">{item.name}</span>
            {#if canEdit}
              <button
                class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[#1f1f1f] hover:bg-[#dde3ea]"
                on:click={(e) => openMenu(item, e)}
                aria-label="Mais ações"
              >
                {@render MoreIcon()}
              </button>
            {/if}
          </div>
        {/each}
      </div>
    {/if}

    <div
      data-grid-files
      class="grid"
      style="grid-template-columns:repeat(auto-fill,minmax({densityMetrics.gridMin},1fr));gap:{densityMetrics.gridGap}"
    >
      {#each gridFiles as item (item.id)}
        {@const selected = selectedLookup.has(item.id)}
        <div
          data-drive-item-id={item.id}
          data-grid-file-card
          class="group select-none overflow-hidden rounded-xl border bg-white text-[#1f1f1f] {selected
            ? 'border-[#a8d8f5] bg-[#c2e7ff]'
            : 'border-[#c4c7c5] bg-white hover:bg-[#e8eaed]'}"
          aria-selected={selected}
          tabindex="0"
          role="option"
          draggable={canDragItem(item)}
          on:click={(e) => clickItem(item, e)}
          on:dragstart={(e) => startItemDrag(item, e)}
          on:dragend={endItemDrag}
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
            class="flex h-[50px] items-center gap-3 px-4"
            style="height:{densityMetrics.fileHeaderHeight};font-size:{densityMetrics.fontSize}px"
          >
            <FileIcon {item} size={densityMetrics.fileIconSize} />
            <span class="min-w-0 flex-1 truncate font-medium">{item.name}</span>
            {#if isDirectlySharedFile(item)}
              <span class="shrink-0 text-[#5f6368]" title="Compartilhado">
                {@render SharedFileIndicator()}
              </span>
            {/if}
            {#if canEdit}
              <button
                class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[#1f1f1f] hover:bg-[#dde3ea]"
                on:click={(e) => openMenu(item, e)}
                aria-label="Mais ações"
              >
                {@render MoreIcon()}
              </button>
            {/if}
          </div>
          <button
            class="mx-3 mb-3 flex h-40 w-[calc(100%-24px)] items-center justify-center rounded-lg bg-[#f0f4f9]"
            style="height:{densityMetrics.thumbnailHeight}"
            on:click={(e) => {
              e.stopPropagation();
              clickItem(item, e);
            }}
          >
            <FileThumbnail
              {item}
              iconSize={densityMetrics.thumbnailIconSize}
              previewUrlFor={thumbnailPreviewUrl}
              pdfPageUrlFor={thumbnailPdfPageUrl}
            />
          </button>
        </div>
      {/each}
    </div>
  </div>
{:else}
  <div data-list-view class="px-5 pb-10">
    <div
      data-list-header
      class="drive-list-divider grid h-[44px] items-end border-b border-[#c7c7c7] pb-1 text-[15px] text-[#1f1f1f]"
      style="grid-template-columns:{listColumns};height:{densityMetrics.listHeaderHeight};font-size:{densityMetrics.fontSize}px"
    >
      <div class="flex h-9 min-w-0 items-center gap-1">
        <button
          class={headerButtonClass('name')}
          title={sortTooltip('name')}
          on:click|stopPropagation={() => chooseSort('name')}
        >
          <span>Nome</span>
          {#if sortField === 'name'}
            {@render SortArrow(sortDirection)}
          {/if}
        </button>
      </div>
      <div class="relative hidden h-9 items-center lg:flex">
        <button
          class={headerButtonClass('owner')}
          title={sortTooltip('owner')}
          on:click|stopPropagation={() => {
            ownerMenuOpen = !ownerMenuOpen;
            sortMenuOpen = false;
          }}
        >
          <span class="truncate">Proprietário</span>
          {#if sortField === 'owner'}
            {@render SortArrow(sortDirection)}
          {/if}
        </button>
        {#if ownerMenuOpen}
          <div
            class="absolute left-0 top-10 z-40 w-[260px] overflow-hidden rounded bg-white py-2 text-[14px] text-[#202124] shadow-[0_2px_10px_rgba(0,0,0,.2)] ring-1 ring-black/10"
          >
            <button
              class="flex h-10 w-full items-center gap-3 px-4 text-left hover:bg-[#e8eaed]"
              on:click={() => chooseOwnerFilter('all')}
            >
              <span class="w-5">{ownerFilterId === 'all' ? '✓' : ''}</span>
              Todos
            </button>
            {#each ownerOptions as option (option.id)}
              <button
                class="flex h-10 w-full items-center gap-3 px-4 text-left hover:bg-[#e8eaed]"
                on:click={() => chooseOwnerFilter(option.id)}
              >
                <span class="w-5">{ownerFilterId === option.id ? '✓' : ''}</span>
                <span class="truncate">{option.id === activeAccountId ? 'Eu' : option.name || option.email}</span>
              </button>
            {/each}
            <div class="my-2 h-px bg-[#dadce0]"></div>
            <button
              class="flex h-10 w-full items-center gap-3 px-4 text-left hover:bg-[#e8eaed]"
              on:click={() => chooseSort('owner', 'asc')}
            >
              <span class="w-5">{sortField === 'owner' && sortDirection === 'asc' ? '✓' : ''}</span>
              A a Z
            </button>
            <button
              class="flex h-10 w-full items-center gap-3 px-4 text-left hover:bg-[#e8eaed]"
              on:click={() => chooseSort('owner', 'desc')}
            >
              <span class="w-5">{sortField === 'owner' && sortDirection === 'desc' ? '✓' : ''}</span>
              Z a A
            </button>
          </div>
        {/if}
      </div>
      <div class="hidden h-9 items-center lg:flex">
        <button
          class={listHeaderButtonClass('modified')}
          title={sortTooltip('modified')}
          on:click|stopPropagation={() => chooseSort('modified')}
        >
          <span>{isTrashLike(section) ? 'Tempo até exclusão' : 'Data da modificação'}</span>
          {#if sortField === 'modified'}
            {@render SortArrow(sortDirection)}
          {/if}
        </button>
      </div>
      <div class="hidden h-9 items-center md:flex">
        <button
          class={listHeaderButtonClass('size')}
          title={sortTooltip('size')}
          on:click|stopPropagation={() => chooseSort('size')}
        >
          <span>Tamanho</span>
          {#if sortField === 'size'}
            {@render SortArrow(sortDirection)}
          {/if}
        </button>
      </div>
      {#if isTrashLike(section)}
        <div class="hidden h-9 items-center xl:flex">
          <span class="px-2">Local original</span>
        </div>
      {:else if showLocation}
        <div class="hidden h-9 items-center xl:flex">
          <span class="px-2">Local</span>
        </div>
      {/if}
      <div class="relative hidden h-9 items-center gap-2 xl:flex">
        <button
          class="flex h-9 items-center gap-2 rounded-full px-3 {sortMenuOpen
            ? 'bg-[#edf2fa]'
            : 'hover:bg-[#e8eaed]'}"
          title={`Classificado por ${sortLabel}: ${directionLabel}`}
          on:click|stopPropagation={() => {
            sortMenuOpen = !sortMenuOpen;
            ownerMenuOpen = false;
          }}
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="#444746">
            <path d="M10 18h4v-2h-4v2zM3 6v2h18V6H3zm3 7h12v-2H6v2z" />
          </svg>
          <span>Classificado</span>
        </button>
        {#if sortMenuOpen}
          <div
            class="absolute right-0 top-10 z-40 w-[288px] overflow-hidden rounded bg-white py-2 text-[14px] text-[#202124] shadow-[0_2px_10px_rgba(0,0,0,.2)] ring-1 ring-black/10"
          >
            <div class="px-4 pb-2 pt-1 text-[12px] text-[#5f6368]">Ordenar por</div>
            {#each [{ field: 'name', label: 'Nome' }, { field: 'owner', label: 'Proprietário' }, { field: 'modified', label: 'Data da modificação' }, { field: 'size', label: 'Tamanho' }] as option}
              <button
                class="flex h-10 w-full items-center gap-4 px-4 text-left hover:bg-[#e8eaed]"
                on:click|stopPropagation={() => chooseSortFieldInMenu(option.field as SortField)}
              >
                <span class="w-5">{sortField === option.field ? '✓' : ''}</span>
                <span class="truncate">{option.label}</span>
              </button>
            {/each}
            <div class="my-2 h-px bg-[#dadce0]"></div>
            <div class="px-4 pb-2 pt-1 text-[12px] text-[#5f6368]">Direção de classif.</div>
            <button
              class="flex h-10 w-full items-center gap-4 px-4 text-left hover:bg-[#e8eaed]"
              on:click={() => chooseSort(sortField, 'desc')}
            >
              <span class="w-5">{sortDirection === 'desc' ? '✓' : ''}</span>
              <span>{sortField === 'modified' ? 'Mais recentes primeiro' : sortField === 'size' ? 'Maiores primeiro' : 'Z a A'}</span>
            </button>
            <button
              class="flex h-10 w-full items-center gap-4 px-4 text-left hover:bg-[#e8eaed]"
              on:click={() => chooseSort(sortField, 'asc')}
            >
              <span class="w-5">{sortDirection === 'asc' ? '✓' : ''}</span>
              <span>{sortField === 'modified' ? 'Mais antigas primeiro' : sortField === 'size' ? 'Menores primeiro' : 'A a Z'}</span>
            </button>
            <div class="my-2 h-px bg-[#dadce0]"></div>
            <div class="px-4 pb-2 pt-1 text-[12px] text-[#5f6368]">Pastas</div>
            <button
              class="flex h-10 w-full items-center gap-4 px-4 text-left hover:bg-[#e8eaed]"
              on:click={() => chooseFolderOrder('first')}
            >
              <span class="w-5">{folderOrder === 'first' ? '✓' : ''}</span>
              Acima
            </button>
            <button
              class="flex h-10 w-full items-center gap-4 px-4 text-left hover:bg-[#e8eaed]"
              on:click={() => chooseFolderOrder('mixed')}
            >
              <span class="w-5">{folderOrder === 'mixed' ? '✓' : ''}</span>
              Misturado com arquivos
            </button>
          </div>
        {/if}
      </div>
      <span></span>
    </div>

    {#each items as item (item.id)}
      {@const selected = selectedLookup.has(item.id)}
      {@const itemOwner = ownerFor(item)}
      <div
        data-drive-item-id={item.id}
        data-list-row
        class="drive-list-divider group grid h-[50px] select-none items-center border-b border-[#d7d7d7] text-[15px] {dragTargetFolderId ===
        item.id
          ? 'bg-[#c2e7ff] text-[#004a77] outline outline-2 outline-[#0b57d0]'
          : selected
            ? 'bg-[#c2e7ff] text-[#004a77]'
            : 'text-[#1f1f1f] hover:bg-[#e8eaed]'}"
        style="grid-template-columns:{listColumns};height:{densityMetrics.listRowHeight};font-size:{densityMetrics.fontSize}px"
        role="row"
        aria-selected={selected}
        tabindex="0"
        draggable={canDragItem(item)}
        on:click={(e) => clickItem(item, e)}
        on:dragstart={(e) => startItemDrag(item, e)}
        on:dragend={endItemDrag}
        on:dragover={(e) => item.type === 'folder' && dragOverFolder(item, e)}
        on:dragleave={(e) => item.type === 'folder' && leaveFolder(item, e)}
        on:drop={(e) => item.type === 'folder' && dropOnFolder(item, e)}
        on:keydown={(e) => {
          if (e.key === 'Enter') dispatch('open', item);
          if (e.key === ' ') {
            e.preventDefault();
            selectItem(item, e);
          }
        }}
        on:contextmenu={(e) => onItemRightClick(item, e)}
      >
        <div class="flex min-w-0 items-center gap-3 pl-4 pr-3 text-left">
          <FileIcon {item} size={densityMetrics.iconSize} />
          <span class="min-w-0 truncate font-medium">{item.name}</span>
          {#if isDirectlySharedFile(item)}
            <span class="shrink-0 text-[#5f6368]" title="Compartilhado">
              {@render SharedFileIndicator()}
            </span>
          {/if}
          {#if canStar && item.starred}
            <svg
              class="shrink-0"
              xmlns="http://www.w3.org/2000/svg"
              width="15"
              height="15"
              viewBox="0 0 24 24"
              fill="#f9ab00"
            >
              <path
                d="M12 17.27 18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21 12 17.27z"
              />
            </svg>
          {/if}
        </div>

        <span
          class="hidden min-w-0 items-center gap-2 truncate pl-2 {selected
            ? 'text-[#004a77]'
            : 'text-[#3c4043]'} lg:flex"
        >
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
          {ownerLabel(item)}
        </span>

        <span
          class="hidden truncate pl-2 {selected ? 'text-[#004a77]' : 'text-[#3c4043]'} lg:block"
        >
          {#if isTrashLike(section)}
            {deletionLabel(item)}
          {:else}
            {formatDriveDate(item.updatedAt)} {updatedByLabel(item)}
          {/if}
        </span>

        <span
          class="hidden truncate pl-2 {selected ? 'text-[#004a77]' : 'text-[#3c4043]'} md:block"
        >
          {formatBytes(item.size)}
        </span>

        {#if isTrashLike(section)}
          <span
            class="relative hidden min-w-0 items-center gap-2 pl-2 {selected
              ? 'text-[#004a77]'
              : 'text-[#3c4043]'} xl:flex"
            on:mouseenter={() => scheduleLocationPreview(item.id)}
            on:mouseleave={closeLocationPreview}
            role="presentation"
          >
            <button
              data-location-pill
              class="flex min-w-0 items-center gap-2 truncate rounded-full px-2 py-1 text-left hover:bg-[#e8eaed]"
              on:click={(event) => openLocation(item, event)}
            >
              {#if item.parentId}
                {@render FolderLocationIcon()}
              {:else}
                {@render DriveLocationIcon()}
              {/if}
              <span class="truncate">{originalLocation(item)}</span>
            </button>
            {#if locationPreviewId === item.id}
              {@const path = locationPath(item)}
              {@const expanded = expandedLocationPreviewId === item.id || path.length <= 2}
              <div
                class="absolute bottom-[34px] right-0 z-[70] flex w-max max-w-[min(760px,calc(100vw-96px))] items-center gap-2 overflow-x-auto rounded-[28px] bg-[#303134] px-5 py-3 text-[15px] text-[#e8eaed] shadow-[0_6px_18px_rgba(0,0,0,.32)]"
                role="menu"
                tabindex="-1"
                on:click|stopPropagation
                on:mouseenter={keepLocationPreview}
                on:mouseleave={closeLocationPreview}
                on:keydown|stopPropagation
              >
                {#if expanded}
                  {#each path as crumb, index (crumb.id ?? 'root')}
                    {#if index > 0}
                      <span class="shrink-0 text-[24px] leading-none text-[#c4c7c5]">›</span>
                    {/if}
                    <button
                      data-location-path-item
                      class="flex h-10 max-w-[220px] shrink-0 items-center gap-2 rounded-[22px] px-3 text-left hover:bg-[#454746]"
                      on:click={(event) => openPathSegment(crumb.id, event)}
                    >
                      {#if crumb.root}
                        {@render DriveLocationIcon()}
                      {:else}
                        {@render FolderLocationIcon()}
                      {/if}
                      <span class="truncate">{crumb.name}</span>
                    </button>
                  {/each}
                {:else}
                  <button
                    data-location-path-item
                    class="flex h-10 max-w-[190px] shrink-0 items-center gap-2 rounded-[22px] px-3 text-left hover:bg-[#454746]"
                    on:click={(event) => openPathSegment(path[0].id, event)}
                  >
                    {@render DriveLocationIcon()}
                    <span class="truncate">{path[0].name}</span>
                  </button>
                  <span class="shrink-0 text-[24px] leading-none text-[#c4c7c5]">›</span>
                  <button
                    data-location-path-item
                    class="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-[18px] font-semibold hover:bg-[#454746]"
                    aria-label="Mostrar caminho completo"
                    on:click={(event) => expandLocationPreview(item.id, event)}
                  >
                    ...
                  </button>
                  <span class="shrink-0 text-[24px] leading-none text-[#c4c7c5]">›</span>
                  <button
                    data-location-path-item
                    class="flex h-10 max-w-[220px] shrink-0 items-center gap-2 rounded-[22px] px-3 text-left hover:bg-[#454746]"
                    on:click={(event) => openPathSegment(path[path.length - 1].id, event)}
                  >
                    {@render FolderLocationIcon()}
                    <span class="truncate">{path[path.length - 1].name}</span>
                  </button>
                {/if}
              </div>
            {/if}
          </span>
        {:else if showLocation}
          <span
            class="relative hidden min-w-0 items-center gap-2 pl-2 {selected
              ? 'text-[#004a77]'
              : 'text-[#3c4043]'} xl:flex"
            on:mouseenter={() => scheduleLocationPreview(item.id)}
            on:mouseleave={closeLocationPreview}
            role="presentation"
          >
            <button
              data-location-pill
              class="flex min-w-0 items-center gap-2 truncate rounded-full px-2 py-1 text-left hover:bg-[#e8eaed]"
              on:click={(event) => openLocation(item, event)}
            >
              {#if item.parentId}
                {@render FolderLocationIcon()}
              {:else}
                {@render DriveLocationIcon()}
              {/if}
              <span class="truncate">{originalLocation(item)}</span>
            </button>
            {#if locationPreviewId === item.id}
              {@const path = locationPath(item)}
              {@const expanded = expandedLocationPreviewId === item.id || path.length <= 2}
              <div
                class="absolute bottom-[34px] right-0 z-[70] flex w-max max-w-[min(760px,calc(100vw-96px))] items-center gap-2 overflow-x-auto rounded-[28px] bg-[#303134] px-5 py-3 text-[15px] text-[#e8eaed] shadow-[0_6px_18px_rgba(0,0,0,.32)]"
                role="menu"
                tabindex="-1"
                on:click|stopPropagation
                on:mouseenter={keepLocationPreview}
                on:mouseleave={closeLocationPreview}
                on:keydown|stopPropagation
              >
                {#if expanded}
                  {#each path as crumb, index (crumb.id ?? 'root')}
                    {#if index > 0}
                      <span class="shrink-0 text-[24px] leading-none text-[#c4c7c5]">›</span>
                    {/if}
                    <button
                      data-location-path-item
                      class="flex h-10 max-w-[220px] shrink-0 items-center gap-2 rounded-[22px] px-3 text-left hover:bg-[#454746]"
                      on:click={(event) => openPathSegment(crumb.id, event)}
                    >
                      {#if crumb.root}
                        {@render DriveLocationIcon()}
                      {:else}
                        {@render FolderLocationIcon()}
                      {/if}
                      <span class="truncate">{crumb.name}</span>
                    </button>
                  {/each}
                {:else}
                  <button
                    data-location-path-item
                    class="flex h-10 max-w-[190px] shrink-0 items-center gap-2 rounded-[22px] px-3 text-left hover:bg-[#454746]"
                    on:click={(event) => openPathSegment(path[0].id, event)}
                  >
                    {@render DriveLocationIcon()}
                    <span class="truncate">{path[0].name}</span>
                  </button>
                  <span class="shrink-0 text-[24px] leading-none text-[#c4c7c5]">›</span>
                  <button
                    data-location-path-item
                    class="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-[18px] font-semibold hover:bg-[#454746]"
                    aria-label="Mostrar caminho completo"
                    on:click={(event) => expandLocationPreview(item.id, event)}
                  >
                    ...
                  </button>
                  <span class="shrink-0 text-[24px] leading-none text-[#c4c7c5]">›</span>
                  <button
                    data-location-path-item
                    class="flex h-10 max-w-[220px] shrink-0 items-center gap-2 rounded-[22px] px-3 text-left hover:bg-[#454746]"
                    on:click={(event) => openPathSegment(path[path.length - 1].id, event)}
                  >
                    {@render FolderLocationIcon()}
                    <span class="truncate">{path[path.length - 1].name}</span>
                  </button>
                {/if}
              </div>
            {/if}
          </span>
        {/if}

        <span class="hidden truncate {selected ? 'text-[#004a77]' : 'text-[#3c4043]'} xl:block"></span>

        <div data-list-actions class="relative flex items-center justify-end pr-3">
          <div class="absolute right-11 top-1/2 hidden -translate-y-1/2 items-center gap-1 group-hover:flex">
            {#if canShare}
              <button
                class="flex h-8 w-8 items-center justify-center rounded-full text-[#3c4043] hover:bg-[#dde3ea]"
                on:click={(e) => {
                  e.stopPropagation();
                  dispatch('share', item);
                }}
                aria-label="Compartilhar"
              >
                {@render ShareIcon()}
              </button>
            {/if}
            <button
              class="flex h-8 w-8 items-center justify-center rounded-full text-[#3c4043] hover:bg-[#dde3ea]"
              on:click={(e) => {
                e.stopPropagation();
                if (item.type === 'folder') dispatch('open', item);
                else dispatch('download', item);
              }}
              aria-label={item.type === 'folder' ? 'Abrir' : 'Baixar'}
            >
              {@render DownloadIcon()}
            </button>
            {#if canEdit}
              <button
                class="flex h-8 w-8 items-center justify-center rounded-full text-[#3c4043] hover:bg-[#dde3ea]"
                on:click={(e) => {
                  e.stopPropagation();
                  dispatch('rename', item);
                }}
                aria-label="Renomear"
              >
                {@render EditIcon()}
              </button>
              {#if canStar}
                <button
                  class="flex h-8 w-8 items-center justify-center rounded-full text-[#3c4043] hover:bg-[#dde3ea]"
                  on:click={(e) => {
                    e.stopPropagation();
                    dispatch('star', item);
                  }}
                  aria-label={item.starred ? 'Remover estrela' : 'Adicionar estrela'}
                >
                  {@render StarIcon(item.starred)}
                </button>
              {/if}
            {/if}
          </div>
          {#if canEdit}
            <button
              class="flex h-8 w-8 items-center justify-center rounded-full text-[#1f1f1f] hover:bg-[#e9eef6]"
              on:click={(e) => openMenu(item, e)}
              aria-label="Mais ações"
            >
              {@render MoreIcon()}
            </button>
          {/if}
        </div>
      </div>
    {/each}
  </div>
{/if}

{#if selectedVisible.length === 1 && !isTrashLike(section)}
  {@const selectedItem = selectedVisible[0]}
  <div
    class="sticky bottom-0 z-20 flex h-[52px] items-center gap-3 border-t border-[#e0e0e0] bg-white px-8 text-[16px] text-[#1f1f1f]"
  >
    <button
      class="flex h-9 min-w-0 items-center gap-2 rounded-full px-2 font-medium hover:bg-[#edf2fa]"
      on:click={() => dispatch('reveal', null)}
    >
      {@render DriveLocationIcon()} Meu Ride
    </button>
    {#each locationPath(selectedItem).slice(1) as crumb (crumb.id ?? 'root')}
      <span class="text-[24px] text-[#5f6368]">›</span>
      <button
        class="flex h-9 min-w-0 items-center gap-2 truncate rounded-full px-2 font-medium hover:bg-[#edf2fa]"
        on:click={(event) => openPathSegment(crumb.id, event)}
      >
        {#if crumb.root}
          {@render DriveLocationIcon()}
        {:else}
          {@render FolderLocationIcon()}
        {/if}
        <span class="truncate">{crumb.name}</span>
      </button>
    {/each}
    <span class="text-[24px] text-[#5f6368]">›</span>
    <button
      class="flex h-9 min-w-0 items-center gap-2 truncate rounded-full px-2 font-medium hover:bg-[#edf2fa]"
      on:click={() => dispatch('reveal', selectedItem.type === 'folder' ? selectedItem.id : selectedItem.parentId)}
    >
      <FileIcon item={selectedItem} size={20} />
      <span class="truncate">{selectedItem.name}</span>
    </button>
  </div>
{/if}

</div>

{#snippet MoreIcon()}
  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
    <path
      d="M12 8c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm0 2c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm0 6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z"
    />
  </svg>
{/snippet}

{#snippet SharedFileIndicator()}
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="18"
    height="18"
    viewBox="0 0 24 24"
    fill="currentColor"
    aria-hidden="true"
  >
    <path
      d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5s-3 1.34-3 3 1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5C15 14.17 10.33 13 8 13zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z"
    />
  </svg>
{/snippet}

{#snippet SortArrow(direction: SortDirection)}
  <span class="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#c2e7ff] text-[#0b57d0]">
    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
      {#if direction === 'desc'}
        <path d="M4 12l1.41-1.41L11 16.17V4h2v12.17l5.59-5.58L20 12l-8 8-8-8z" />
      {:else}
        <path d="M4 12l1.41 1.41L11 7.83V20h2V7.83l5.59 5.58L20 12 12 4l-8 8z" />
      {/if}
    </svg>
  </span>
{/snippet}

{#snippet DriveLocationIcon()}
  <svg
    class="shrink-0 text-[#3c4043]"
    xmlns="http://www.w3.org/2000/svg"
    width="18"
    height="18"
    viewBox="0 0 24 24"
    fill="currentColor"
  >
    <path
      d="M20 6H4V4h16v2zm0 2H4c-1.1 0-2 .9-2 2v4c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2v-4c0-1.1-.9-2-2-2zm0 6H4v-4h16v4zm-14-3h2v2H6v-2zm14 7H4v2h16v-2z"
    />
  </svg>
{/snippet}

{#snippet FolderLocationIcon()}
  <svg
    class="shrink-0 text-[#3c4043]"
    xmlns="http://www.w3.org/2000/svg"
    width="18"
    height="18"
    viewBox="0 0 24 24"
    fill="currentColor"
  >
    <path d="M10 4H2v16h20V6H12l-2-2zm10 14H4V6h5.17l2 2H20v10z" />
  </svg>
{/snippet}

{#snippet ShareIcon()}
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="19"
    height="19"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="2"
    stroke-linecap="round"
    stroke-linejoin="round"
  >
    <circle cx="18" cy="5" r="3" />
    <circle cx="6" cy="12" r="3" />
    <circle cx="18" cy="19" r="3" />
    <path d="M8.6 10.6 15.4 6.4M8.6 13.4l6.8 4.2" />
  </svg>
{/snippet}

{#snippet DownloadIcon()}
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="19"
    height="19"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="2"
    stroke-linecap="round"
    stroke-linejoin="round"
  >
    <path d="M12 3v11" />
    <path d="m7 9 5 5 5-5" />
    <path d="M5 20h14" />
  </svg>
{/snippet}

{#snippet EditIcon()}
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="19"
    height="19"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="2"
    stroke-linecap="round"
    stroke-linejoin="round"
  >
    <path d="M12 20h9" />
    <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
  </svg>
{/snippet}

{#snippet StarIcon(active: boolean)}
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="19"
    height="19"
    viewBox="0 0 24 24"
    fill={active ? '#fbbc04' : 'none'}
    stroke={active ? '#fbbc04' : 'currentColor'}
    stroke-width="2"
    stroke-linecap="round"
    stroke-linejoin="round"
  >
    <path d="m12 2.5 2.93 5.94 6.56.95-4.75 4.63 1.12 6.53L12 17.47l-5.86 3.08 1.12-6.53-4.75-4.63 6.56-.95L12 2.5z" />
  </svg>
{/snippet}
