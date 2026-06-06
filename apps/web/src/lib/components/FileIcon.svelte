<script lang="ts">
  import { isImageFile } from '$lib/file-kind';
  import type { DriveItem } from '$lib/types';

  export let item: DriveItem;
  export let size = 48;

  type IconType =
    | 'folder'
    | 'image'
    | 'video'
    | 'audio'
    | 'pdf'
    | 'sheet'
    | 'doc'
    | 'text'
    | 'slides'
    | 'archive'
    | 'code'
    | 'file';

  function getType(it: DriveItem): IconType {
    if (it.type === 'folder') return 'folder';
    const mime = it.mimeType ?? '';
    const ext = (it.extension ?? '').toLowerCase();
    if (isImageFile(it)) return 'image';
    if (mime.startsWith('video/')) return 'video';
    if (mime.startsWith('audio/')) return 'audio';
    if (mime.includes('pdf')) return 'pdf';
    if (mime.includes('spreadsheet') || ['xls', 'xlsx', 'csv', 'ods'].includes(ext)) return 'sheet';
    if (mime.includes('wordprocessingml') || mime.includes('msword') || ['doc', 'docx', 'odt'].includes(ext))
      return 'doc';
    if (mime.startsWith('text/') || ['txt', 'rtf'].includes(ext)) return 'text';
    if (mime.includes('presentation') || ['ppt', 'pptx', 'odp'].includes(ext)) return 'slides';
    if (['zip', 'rar', '7z', 'tar', 'gz', 'bz2'].includes(ext)) return 'archive';
    if (
      [
        'js',
        'ts',
        'jsx',
        'tsx',
        'py',
        'java',
        'c',
        'cpp',
        'go',
        'rs',
        'html',
        'css',
        'json',
        'xml',
        'yml',
        'yaml',
        'sh',
        'md'
      ].includes(ext)
    )
      return 'code';
    return 'file';
  }

  const palette: Record<IconType, { bg: string; fill: string }> = {
    folder: { bg: '#feefc3', fill: '#3c4043' },
    image: { bg: '#e6f4ea', fill: '#1e8e3e' },
    video: { bg: '#e8eaed', fill: '#5f6368' },
    audio: { bg: '#f3e8ff', fill: '#9334e6' },
    pdf: { bg: '#fce8e6', fill: '#d93025' },
    sheet: { bg: '#e6f4ea', fill: '#188038' },
    doc: { bg: '#e8f0fe', fill: '#1a73e8' },
    text: { bg: '#e8f0fe', fill: '#4285f4' },
    slides: { bg: '#fef7e0', fill: '#e37400' },
    archive: { bg: '#f1f3f4', fill: '#5f6368' },
    code: { bg: '#f1f3f4', fill: '#5f6368' },
    file: { bg: '#f1f3f4', fill: '#5f6368' }
  };

  const tileStyles: Partial<Record<IconType, { bg: string; fg: string; accent: string }>> = {
    pdf: { bg: '#f28b82', fg: '#7f1d1d', accent: '#7f1d1d' },
    sheet: { bg: '#81c995', fg: '#0d652d', accent: '#0d652d' },
    doc: { bg: '#8ab4f8', fg: '#174ea6', accent: '#174ea6' },
    slides: { bg: '#fde293', fg: '#b06000', accent: '#b06000' }
  };

  $: type = getType(item);
  $: c = palette[type];
  $: s = Math.round(size * 0.52);
  $: compact = size <= 24;
  $: officeTile = tileStyles[type] ?? null;
  $: tileSize = compact ? Math.max(16, Math.min(18, size - 4)) : size;
  $: tileRadius = Math.max(2, Math.round(tileSize * 0.13));
  $: tileStroke = Math.max(2, Math.round(tileSize * 0.12));
  $: tilePdfFontSize = Math.max(6, Math.round(tileSize * 0.39));
  $: sharedFolder =
    item.type === 'folder' &&
    Boolean(
      item.sharedByAncestor ||
        item.linkRole ||
        item.sharedWith?.length ||
        item.sharePermissions?.length
    );
  $: sharedMaskId = `shared-folder-${item.id.replace(/[^a-zA-Z0-9_-]/g, '')}-${size}`;
</script>

<div
  class="flex shrink-0 items-center justify-center {compact || officeTile ? '' : 'rounded-xl'}"
  style="width:{size}px;height:{size}px;background:{compact || officeTile ? 'transparent' : c.bg};"
>
  {#if type === 'folder'}
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={compact ? size : s}
      height={compact ? size : s}
      viewBox="0 0 24 24"
      fill={c.fill}
    >
      {#if sharedFolder}
        <defs>
          <mask id={sharedMaskId}>
            <rect width="24" height="24" fill="white" />
            <circle cx="10" cy="12.1" r="2" fill="black" />
            <path d="M6.35 17.1c.32-1.58 2.33-2.4 3.65-2.4s3.33.82 3.65 2.4H6.35z" fill="black" />
          </mask>
        </defs>
        <path
          d="M10 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z"
          mask={`url(#${sharedMaskId})`}
        />
      {:else}
        <path d="M10 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z" />
      {/if}
    </svg>
  {:else if type === 'image'}
    <svg xmlns="http://www.w3.org/2000/svg" width={s} height={s} viewBox="0 0 24 24" fill={c.fill}>
      <path
        d="M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z"
      />
    </svg>
  {:else if type === 'video'}
    <svg xmlns="http://www.w3.org/2000/svg" width={s} height={s} viewBox="0 0 24 24" fill={c.fill}>
      <path
        d="M17 10.5V7c0-.55-.45-1-1-1H4c-.55 0-1 .45-1 1v10c0 .55.45 1 1 1h12c.55 0 1-.45 1-1v-3.5l4 4v-11l-4 4z"
      />
    </svg>
  {:else if type === 'audio'}
    <svg xmlns="http://www.w3.org/2000/svg" width={s} height={s} viewBox="0 0 24 24" fill={c.fill}>
      <path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z" />
    </svg>
  {:else if officeTile}
    <span
      class="relative flex shrink-0 items-center justify-center overflow-hidden leading-none"
      style="width:{tileSize}px;height:{tileSize}px;border-radius:{tileRadius}px;background:{officeTile.bg};color:{officeTile.fg};"
      aria-hidden="true"
    >
      {#if type === 'pdf'}
        <span class="font-black tracking-normal" style="font-size:{tilePdfFontSize}px;line-height:1">PDF</span>
      {:else if type === 'sheet'}
        <span
          class="absolute left-1/2 top-1/2 block -translate-x-1/2 -translate-y-1/2 rounded-full"
          style="width:62%;height:{tileStroke}px;background:{officeTile.accent};"
        ></span>
        <span
          class="absolute top-1/2 block -translate-x-1/2 -translate-y-1/2 rounded-full"
          style="left:44%;width:{tileStroke}px;height:62%;background:{officeTile.accent};"
        ></span>
      {:else if type === 'doc'}
        <span
          class="absolute block rounded-full"
          style="left:27%;top:33%;width:46%;height:{tileStroke}px;background:{officeTile.accent};"
        ></span>
        <span
          class="absolute block rounded-full"
          style="left:27%;top:48%;width:46%;height:{tileStroke}px;background:{officeTile.accent};"
        ></span>
        <span
          class="absolute block rounded-full"
          style="left:27%;top:68%;width:34%;height:{tileStroke}px;background:{officeTile.accent};"
        ></span>
      {:else}
        <span
          class="absolute block"
          style="left:21%;top:25%;width:58%;height:42%;border-radius:{Math.max(1, tileRadius - 1)}px;background:#fff7d6;"
        ></span>
        <span
          class="absolute block rounded-full"
          style="left:27%;top:72%;width:46%;height:{tileStroke}px;background:{officeTile.accent};"
        ></span>
      {/if}
    </span>
  {:else if type === 'text'}
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={compact ? size : s}
      height={compact ? size : s}
      viewBox="0 0 24 24"
      fill="none"
    >
      <path d="M5.5 4h9.25l3.75 3.75V20H5.5V4z" fill="#4285f4" />
      <path d="M14.75 4v4h3.75" fill="#a8c7fa" />
      <path d="M8 10.5h8v1.25H8V10.5zm0 2.8h8v1.25H8V13.3zm0 2.8h6v1.25H8V16.1z" fill="#fff" />
    </svg>
  {:else if type === 'slides'}
    <svg xmlns="http://www.w3.org/2000/svg" width={s} height={s} viewBox="0 0 24 24" fill={c.fill}>
      <path
        d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H5V5h14v14zm-4.5-5.5l-3-4-2.5 3.24L7.5 14 5 18h14l-4.5-4.5z"
      />
    </svg>
  {:else if type === 'archive'}
    <svg xmlns="http://www.w3.org/2000/svg" width={s} height={s} viewBox="0 0 24 24" fill={c.fill}>
      <path
        d="M20 6h-8l-2-2H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2zm-2 10h-2v2h-4v-2H10v-2h2v-2h4v2h2v2zm-2-6h-4V8h4v2z"
      />
    </svg>
  {:else if type === 'code'}
    <svg xmlns="http://www.w3.org/2000/svg" width={s} height={s} viewBox="0 0 24 24" fill={c.fill}>
      <path d="M9.4 16.6L4.8 12l4.6-4.6L8 6l-6 6 6 6 1.4-1.4zm5.2 0l4.6-4.6-4.6-4.6L16 6l6 6-6 6-1.4-1.4z" />
    </svg>
  {:else}
    <svg xmlns="http://www.w3.org/2000/svg" width={s} height={s} viewBox="0 0 24 24" fill={c.fill}>
      <path
        d="M14 2H6c-1.1 0-1.99.9-1.99 2L4 20c0 1.1.89 2 1.99 2H18c1.1 0 2-.9 2-2V8l-6-6zm4 18H6V4h7v5h5v11z"
      />
    </svg>
  {/if}
</div>
