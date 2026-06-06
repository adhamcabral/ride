<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import FileIcon from '$lib/components/FileIcon.svelte';
  import { formatBytes } from '$lib/format';
  import type { DriveItem, StorageSummary } from '$lib/types';

  export let items: DriveItem[] = [];
  export let summary: StorageSummary | null = null;
  export let selectedIds: string[] = [];

  const dispatch = createEventDispatcher<{
    open: DriveItem;
    select: { item: DriveItem; mode: 'single' | 'toggle' | 'range' };
    contextMenu: { item: DriveItem; x: number; y: number };
  }>();

  const colors: Record<StorageSummary['categories'][number]['id'], string> = {
    pdfs: '#ea4335',
    sheets: '#34a853',
    docs: '#4285f4',
    archives: '#5f6368',
    images: '#fbbc04',
    videos: '#a142f4',
    trash: '#3c4043',
    other: '#80868b'
  };

  type StorageCategory = StorageSummary['categories'][number];

  let hoveredCategory: StorageCategory | null = null;
  let tooltipX = 0;
  let tooltipY = 0;

  $: selectedLookup = new Set(selectedIds);
  $: categories = summary?.categories ?? [];
  $: totalBytes = Math.max(1, summary?.totalBytes ?? 1);
  $: usedBytes = Math.max(1, summary?.usedBytes ?? 1);

  function categoryPercent(category: StorageCategory) {
    if (!summary?.usedBytes) return '0%';
    return `${((category.bytes / usedBytes) * 100).toLocaleString('pt-BR', {
      maximumFractionDigits: 1
    })}%`;
  }

  function moveTooltip(e: MouseEvent) {
    const width = 232;
    const height = 76;
    const viewportWidth = typeof window === 'undefined' ? 1920 : window.innerWidth;
    tooltipX = Math.min(e.clientX + 14, viewportWidth - width - 12);
    tooltipY = Math.max(12, e.clientY - height - 12);
  }

  function showTooltip(category: StorageCategory, e: MouseEvent) {
    hoveredCategory = category;
    moveTooltip(e);
  }

  function focusTooltip(category: StorageCategory, e: FocusEvent) {
    const width = 232;
    const height = 76;
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const viewportWidth = typeof window === 'undefined' ? 1920 : window.innerWidth;
    tooltipX = Math.min(rect.left, viewportWidth - width - 12);
    tooltipY = Math.max(12, rect.top - height - 10);
    hoveredCategory = category;
  }

  function hideTooltip() {
    hoveredCategory = null;
  }

  function selectionMode(e: MouseEvent | KeyboardEvent): 'single' | 'toggle' | 'range' {
    if (e.shiftKey) return 'range';
    if (e.ctrlKey || e.metaKey) return 'toggle';
    return 'single';
  }

  function selectItem(item: DriveItem, e: MouseEvent | KeyboardEvent) {
    e.stopPropagation();
    dispatch('select', { item, mode: selectionMode(e) });
  }

  function onItemRightClick(item: DriveItem, e: MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (!selectedLookup.has(item.id)) {
      dispatch('select', { item, mode: 'single' });
    }
    dispatch('contextMenu', { item, x: e.clientX, y: e.clientY });
  }
</script>

<section class="px-7 pb-8">
  <div class="mb-7">
    <div class="flex flex-wrap items-baseline gap-x-2 gap-y-1 text-[#3c4043]">
      <span class="text-[14px]">Armazenamento usado:</span>
      <span class="text-[32px] leading-10 text-[#202124]">{formatBytes(summary?.usedBytes ?? 0)}</span>
      <span class="text-[14px]">de {formatBytes(summary?.totalBytes ?? 0)}</span>
    </div>

    <div class="mt-2 h-2 rounded-full bg-[#f1f3f4]">
      <div class="flex h-full overflow-hidden rounded-full">
        {#each categories as category (category.id)}
          <button
            type="button"
            class="h-full cursor-default outline-none transition-[filter] hover:brightness-95 focus-visible:brightness-95"
            style="width:{Math.max(0.7, Math.min(100, (category.bytes / totalBytes) * 100))}%;background:{colors[
              category.id
            ]}"
            aria-label={`${category.label}: ${formatBytes(category.bytes)}`}
            on:mouseenter={(e) => showTooltip(category, e)}
            on:mousemove={moveTooltip}
            on:mouseleave={hideTooltip}
            on:focus={(e) => focusTooltip(category, e)}
            on:blur={hideTooltip}
          ></button>
        {/each}
      </div>
    </div>

    {#if categories.length > 0}
      <div class="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-[12px] text-[#3c4043]">
        {#each categories as category (category.id)}
          <button
            type="button"
            class="flex cursor-default items-center gap-2 rounded px-1 py-0.5 text-left outline-none hover:bg-[#e8eaed] focus-visible:bg-[#e8eaed]"
            on:mouseenter={(e) => showTooltip(category, e)}
            on:mousemove={moveTooltip}
            on:mouseleave={hideTooltip}
            on:focus={(e) => focusTooltip(category, e)}
            on:blur={hideTooltip}
          >
            <span class="h-2 w-2 rounded-full" style="background:{colors[category.id]}"></span>
            {category.label}
          </button>
        {/each}
      </div>
    {/if}
  </div>

  {#if hoveredCategory}
    <div
      class="pointer-events-none fixed z-[200] w-[232px] rounded bg-[#202124] px-3 py-2 text-[12px] leading-5 text-white shadow-[0_2px_8px_rgba(0,0,0,.35)]"
      style="left:{tooltipX}px;top:{tooltipY}px"
      role="tooltip"
    >
      <div class="flex items-center gap-2">
        <span class="h-2.5 w-2.5 rounded-full" style="background:{colors[hoveredCategory.id]}"></span>
        <span class="truncate font-medium">{hoveredCategory.label}</span>
      </div>
      <div class="mt-1 text-[#e8eaed]">
        {formatBytes(hoveredCategory.bytes)} usados · {categoryPercent(hoveredCategory)} do usado
      </div>
      <div class="text-[#bdc1c6]">
        {hoveredCategory.count} {hoveredCategory.count === 1 ? 'item' : 'itens'}
      </div>
    </div>
  {/if}

  <div role="table" aria-label="Arquivos por armazenamento">
    <div
      class="grid h-11 items-center border-b border-[#c7c7c7] text-[15px] font-medium text-[#3c4043]"
      style="grid-template-columns:minmax(260px,1fr) 220px"
      role="row"
    >
      <span class="pl-2">Nome</span>
      <span class="flex items-center justify-end gap-2 pr-3">
        Armazename...
        <span class="flex h-6 w-6 items-center justify-center rounded-full bg-[#c2e7ff] text-[#0b57d0]">
          <svg xmlns="http://www.w3.org/2000/svg" width="17" height="17" viewBox="0 0 24 24" fill="currentColor">
            <path d="M4 12l1.41 1.41L11 7.83V20h2V7.83l5.59 5.58L20 12 12 4l-8 8z" />
          </svg>
        </span>
      </span>
    </div>

    {#each items as item (item.id)}
      {@const selected = selectedLookup.has(item.id)}
      <div
        data-drive-item-id={item.id}
        class="group grid h-[48px] select-none items-center border-b border-[#d7d7d7] text-[15px] {selected
          ? 'bg-[#c2e7ff] text-[#004a77]'
          : 'text-[#1f1f1f] hover:bg-[#e8eaed]'}"
        style="grid-template-columns:minmax(260px,1fr) 220px"
        role="row"
        aria-selected={selected}
        tabindex="0"
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
          <FileIcon {item} size={24} />
          <span class="truncate font-medium">{item.name}</span>
          {#if item.linkRole || item.sharedWith.length > 0}
            <svg
              class="shrink-0"
              xmlns="http://www.w3.org/2000/svg"
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="#3c4043"
            >
              <path
                d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z"
              />
            </svg>
          {/if}
        </div>
        <span class="justify-self-end pr-[78px] text-[#3c4043] {selected ? 'text-[#004a77]' : ''}">
          {formatBytes(item.size)}
        </span>
      </div>
    {/each}
  </div>
</section>
