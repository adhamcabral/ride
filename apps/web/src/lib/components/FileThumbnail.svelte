<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import { pdfPageUrl, previewUrl } from '$lib/api';
  import FileIcon from '$lib/components/FileIcon.svelte';
  import { fileExtension, imageMimeType, isImageFile } from '$lib/file-kind';
  import {
    isOfficeFile,
    loadOfficeThumbnailPreview,
    officeKindForItem,
    officeTheme,
    officeThumbnailCacheKey,
    type OfficeThumbnailPreview
  } from '$lib/office';
  import type { DriveItem } from '$lib/types';

  type MaybePromise<T> = T | Promise<T>;

  export let item: DriveItem;
  export let iconSize = 54;
  export let previewUrlFor: ((itemId: string) => MaybePromise<string>) | null = previewUrl;
  export let pdfPageUrlFor: ((itemId: string, page: number) => MaybePromise<string>) | null = pdfPageUrl;

  let textPreview = '';
  let loadingText = false;
  let officePreview: OfficeThumbnailPreview | null = null;
  let loadingOffice = false;
  let failed = false;
  let mediaUrl = '';
  let mediaObjectUrl = '';
  let mediaUrlKey = '';
  let mediaUrlRun = 0;
  let controller: AbortController | null = null;
  let loadedTextKey = '';
  let loadedOfficeKey = '';

  $: kind = fileKind(item);
  $: officeKind = kind === 'office' ? officeKindForItem(item) : 'unsupported';
  $: previewKey = [item.id, item.checksum || '', item.updatedAt, item.size].join(':');
  $: if (kind === 'text' && loadedTextKey !== previewKey) {
    void loadTextPreview();
  }
  $: if (kind === 'office' && loadedOfficeKey !== previewKey) {
    void loadOfficePreview();
  }
  $: if ((kind === 'pdf' || kind === 'image' || kind === 'video') && mediaUrlKey !== `${kind}:${previewKey}`) {
    void loadMediaUrl();
  }

  onMount(() => {
    if (kind === 'text') void loadTextPreview();
    if (kind === 'office') void loadOfficePreview();
  });

  onDestroy(() => {
    controller?.abort();
    cleanupMediaObjectUrl();
  });

  function cleanupMediaObjectUrl() {
    if (!mediaObjectUrl) return;
    URL.revokeObjectURL(mediaObjectUrl);
    mediaObjectUrl = '';
  }

  function fileKind(current: DriveItem): 'pdf' | 'text' | 'image' | 'video' | 'office' | 'fallback' {
    const ext = fileExtension(current);
    const mime = current.mimeType || '';
    if (mime === 'application/pdf' || ext === 'pdf') return 'pdf';
    if (isImageFile(current)) return 'image';
    if (mime.startsWith('video/')) return 'video';
    if (isOfficeFile(ext, mime)) return 'office';
    if (
      mime.startsWith('text/') ||
      ['txt', 'md', 'log', 'csv', 'json', 'xml', 'html', 'css', 'js', 'ts', 'svelte', 'env', 'ini', 'yml', 'yaml'].includes(
        ext
      )
    )
      return 'text';
    return 'fallback';
  }

  async function loadTextPreview() {
    loadedTextKey = previewKey;
    textPreview = '';
    failed = false;
    loadingText = true;
    controller?.abort();
    controller = new AbortController();
    try {
      const source = await (previewUrlFor ?? previewUrl)(item.id);
      const response = await fetch(source, {
        cache: 'no-store',
        signal: controller.signal
      });
      if (!response.ok) throw new Error('preview failed');
      const text = await response.text();
      textPreview = text.slice(0, 1400);
    } catch (error) {
      if ((error as Error).name !== 'AbortError') failed = true;
    } finally {
      loadingText = false;
    }
  }

  async function loadOfficePreview() {
    const key = officeThumbnailCacheKey(item);
    loadedOfficeKey = key;
    officePreview = null;
    failed = false;
    loadingOffice = true;
    controller?.abort();
    controller = new AbortController();
    try {
      const url = await (previewUrlFor ?? previewUrl)(item.id);
      const preview = await loadOfficeThumbnailPreview(item, url, controller.signal);
      if (loadedOfficeKey === key) officePreview = preview;
    } catch (error) {
      if ((error as Error).name !== 'AbortError') failed = true;
    } finally {
      if (loadedOfficeKey === key) loadingOffice = false;
    }
  }

  async function loadMediaUrl() {
    const key = `${kind}:${previewKey}`;
    const run = ++mediaUrlRun;
    mediaUrlKey = key;
    mediaUrl = '';
    failed = false;
    cleanupMediaObjectUrl();
    controller?.abort();
    controller = new AbortController();
    try {
      const source =
        kind === 'pdf' ? await (pdfPageUrlFor ?? pdfPageUrl)(item.id, 1) : await (previewUrlFor ?? previewUrl)(item.id);
      if (kind === 'pdf' || kind === 'image') {
        const response = await fetch(source, { cache: 'no-store', signal: controller?.signal });
        if (!response.ok) throw new Error('thumbnail failed');
        let blob = await response.blob();
        if (!blob.type.startsWith('image/') && kind === 'pdf') throw new Error('invalid pdf thumbnail');
        if (!blob.type.startsWith('image/') && kind === 'image' && !isImageFile(item)) {
          throw new Error('invalid image thumbnail');
        }
        if (!blob.type.startsWith('image/') && kind === 'image') blob = new Blob([blob], { type: imageMimeType(item) });
        const objectUrl = URL.createObjectURL(blob);
        if (run === mediaUrlRun && mediaUrlKey === key) {
          mediaObjectUrl = objectUrl;
          mediaUrl = objectUrl;
        } else {
          URL.revokeObjectURL(objectUrl);
        }
      } else if (run === mediaUrlRun && mediaUrlKey === key) {
        mediaUrl = source;
      }
    } catch {
      if (run === mediaUrlRun) failed = true;
    }
  }
</script>

<div class="pointer-events-none flex h-full w-full items-center justify-center overflow-hidden rounded-lg bg-[#f0f4f9]">
  {#if failed || kind === 'fallback'}
    <FileIcon {item} size={iconSize} />
  {:else if kind === 'pdf'}
    <div class="flex h-full w-full items-start justify-center overflow-hidden bg-[#eef3fb] pt-3">
      {#if mediaUrl}
        <img
          src={mediaUrl}
          alt=""
          class="max-h-[172px] w-auto rounded-sm bg-white object-contain shadow-sm"
          loading="lazy"
          on:error={() => (failed = true)}
        />
      {:else}
        <FileIcon {item} size={iconSize} />
      {/if}
    </div>
  {:else if kind === 'image'}
    {#if mediaUrl}
      <img
        src={mediaUrl}
        alt=""
        class="h-full w-full object-cover"
        loading="lazy"
        on:error={() => (failed = true)}
      />
    {:else}
      <FileIcon {item} size={iconSize} />
    {/if}
  {:else if kind === 'video'}
    {#if mediaUrl}
      <video
        src={mediaUrl}
        class="h-full w-full object-cover"
        preload="metadata"
        muted
        playsinline
        on:error={() => (failed = true)}
      ></video>
    {:else}
      <FileIcon {item} size={iconSize} />
    {/if}
  {:else if kind === 'text'}
    {#if loadingText && !textPreview}
      <FileIcon {item} size={iconSize} />
    {:else}
      <div class="h-full w-full overflow-hidden bg-white px-4 py-3 text-left font-mono text-[10px] leading-[15px] text-[#202124]">
        <pre class="whitespace-pre-wrap break-words">{textPreview || item.name}</pre>
      </div>
    {/if}
  {:else if kind === 'office'}
    {@const theme = officeTheme(item)}
    <div class="flex h-full w-full items-center justify-center overflow-hidden p-4 text-left" style="background:{theme.pale}">
      {#if loadingOffice && !officePreview}
        <div class="h-full w-[76%] max-w-[130px] rounded bg-white px-3 py-3 shadow-sm">
          <div class="mb-3 h-4 w-3/5 rounded-full bg-[#dfe7f7]"></div>
          {#each [92, 78, 88, 70, 94, 82] as width}
            <div class="mb-2 h-2 rounded-full bg-[#dfe7f7]" style="width:{width}%"></div>
          {/each}
        </div>
      {:else if officePreview?.kind === 'spreadsheet'}
        <div class="h-full w-full overflow-hidden rounded bg-white shadow-sm">
          <div class="border-b border-[#dfe1e5] bg-[#e6f4ea] px-2 py-1 text-[9px] font-medium text-[#188038]">
            {officePreview.sheetName}
          </div>
          <div class="grid text-[8px] leading-4 text-[#202124]" style="grid-template-columns:repeat(5,minmax(0,1fr))">
            {#each officePreview.rows.flat() as cell, index}
              <div
                class="h-5 truncate border-b border-r border-[#e6ebf2] px-1 {index < 5
                  ? 'bg-[#f8fbf8] font-medium text-[#188038]'
                  : 'bg-white'}"
              >
                {cell || (index < 5 ? String.fromCharCode(65 + index) : '')}
              </div>
            {/each}
          </div>
        </div>
      {:else if officePreview?.kind === 'presentation'}
        <div class="aspect-video w-full rounded bg-white p-3 shadow-sm">
          <div class="mb-2 truncate text-[11px] font-medium text-[#b06000]">
            {officePreview.title || item.name}
          </div>
          <div class="grid h-[calc(100%-1.75rem)] grid-cols-[1fr_0.75fr] gap-3">
            <div class="space-y-2">
              {#each officePreview.lines.length ? officePreview.lines.slice(0, 4) : ['Apresentacao'] as line}
                <div class="flex items-center gap-1.5 text-[8px] leading-3 text-[#5f6368]">
                  <span class="h-1.5 w-1.5 shrink-0 rounded-full bg-[#e8710a]"></span>
                  <span class="truncate">{line}</span>
                </div>
              {/each}
            </div>
            <div class="rounded bg-[#fef7e0]"></div>
          </div>
        </div>
      {:else if officePreview?.kind === 'document'}
        <div class="h-full w-[76%] max-w-[138px] overflow-hidden rounded bg-white px-3 py-3 shadow-sm">
          <div class="mb-3 flex items-center gap-2">
            <span
              class="flex h-6 w-6 shrink-0 items-center justify-center rounded text-[9px] font-bold text-white"
              style="background:{theme.color}"
            >
              {theme.short.slice(0, 4)}
            </span>
            <span class="h-2.5 flex-1 rounded-full bg-[#dfe7f7]"></span>
          </div>
          {#each officePreview.lines.length ? officePreview.lines.slice(0, 9) : [item.name] as line}
            <p class="mb-1 truncate font-serif text-[7px] leading-[9px] text-[#202124]">{line}</p>
          {/each}
        </div>
      {:else if officeKind === 'spreadsheet'}
        <div class="h-full w-full overflow-hidden rounded bg-white shadow-sm">
          <div class="grid h-full grid-cols-5 grid-rows-6 text-[8px] text-[#5f6368]">
            {#each Array(30) as _, index}
              <div
                class="border-b border-r border-[#e6ebf2] {index < 5
                  ? 'bg-[#e6f4ea]'
                  : index % 5 === 0
                    ? 'bg-[#f8fbf8]'
                    : 'bg-white'}"
              ></div>
            {/each}
          </div>
        </div>
      {:else}
        <div class="h-full w-[76%] max-w-[130px] rounded bg-white px-3 py-3 shadow-sm">
          <div class="mb-3 h-4 w-3/5 rounded-full" style="background:{theme.color}"></div>
          {#each [92, 78, 88, 70, 94, 82, 58] as width}
            <div class="mb-2 h-2 rounded-full bg-[#dfe7f7]" style="width:{width}%"></div>
          {/each}
        </div>
      {/if}
    </div>
  {/if}
</div>
