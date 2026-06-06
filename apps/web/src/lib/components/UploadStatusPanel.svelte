<script lang="ts">
  import { createEventDispatcher } from 'svelte';

  type UploadTaskStatus = 'pending' | 'uploading' | 'done' | 'error' | 'canceled';
  type UploadTask = {
    id: string;
    name: string;
    mimeType: string;
    extension: string;
    status: UploadTaskStatus;
    error?: string;
  };

  export let visible = false;
  export let collapsed = false;
  export let tasks: UploadTask[] = [];
  export let cancelable = false;

  const dispatch = createEventDispatcher<{
    toggle: void;
    close: void;
    cancel: void;
  }>();

  function fileKind(task: UploadTask) {
    const mime = task.mimeType || '';
    const ext = task.extension.toLowerCase();
    if (mime.includes('pdf') || ext === 'pdf') return 'pdf';
    if (mime.startsWith('image/')) return 'image';
    if (mime.startsWith('video/')) return 'video';
    if (mime.includes('spreadsheet') || ['xls', 'xlsx', 'csv', 'ods'].includes(ext)) return 'sheet';
    if (mime.includes('wordprocessingml') || mime.includes('msword') || ['doc', 'docx', 'odt'].includes(ext))
      return 'doc';
    if (mime.startsWith('text/') || ['txt', 'rtf', 'md', 'json', 'xml', 'yml', 'yaml'].includes(ext)) return 'text';
    if (['zip', 'rar', '7z', 'tar', 'gz', 'bz2'].includes(ext)) return 'archive';
    return 'file';
  }

  const iconColors: Record<string, string> = {
    pdf: '#ea4335',
    image: '#ea4335',
    video: '#ea4335',
    sheet: '#34a853',
    doc: '#1a73e8',
    text: '#4285f4',
    archive: '#5f6368',
    file: '#9aa0a6'
  };

  $: total = tasks.length;
  $: activeCount = tasks.filter((task) => task.status === 'pending' || task.status === 'uploading').length;
  $: doneCount = tasks.filter((task) => task.status === 'done').length;
  $: errorCount = tasks.filter((task) => task.status === 'error').length;
  $: canceledCount = tasks.filter((task) => task.status === 'canceled').length;
  $: activeTask = tasks.find((task) => task.status === 'uploading');
  $: title = activeCount
    ? `Fazendo upload de ${total} ${total === 1 ? 'item' : 'itens'}`
    : errorCount
      ? `${errorCount} ${errorCount === 1 ? 'upload falhou' : 'uploads falharam'}`
      : canceledCount && !doneCount
        ? 'Upload cancelado'
        : total
          ? `${doneCount} ${doneCount === 1 ? 'upload concluído' : 'uploads concluídos'}`
          : '';
  $: statusText = activeTask
    ? `Enviando ${activeTask.name}`
    : activeCount
      ? 'Iniciando uploads...'
      : errorCount
        ? 'Alguns itens não foram enviados'
        : canceledCount
          ? 'Upload cancelado'
          : 'Uploads concluídos';
</script>

{#if visible && total > 0}
  <section
    data-upload-panel
    class="fixed bottom-0 right-8 z-[160] w-[360px] max-w-[calc(100vw-2rem)] overflow-hidden rounded-t-xl border border-[#1a73e8] bg-white text-[#202124] shadow-[0_2px_12px_rgba(60,64,67,.35)]"
    aria-label="Uploads em andamento"
  >
    <div class="flex h-[58px] items-center gap-3 border-b border-[#dadce0] px-4">
      <h2 class="min-w-0 flex-1 truncate text-[16px] font-medium">{title}</h2>
      <button
        class="flex h-8 w-8 items-center justify-center rounded-full text-[#202124] hover:bg-[#e8eaed]"
        aria-label={collapsed ? 'Expandir uploads' : 'Recolher uploads'}
        on:click={() => dispatch('toggle')}
      >
        <svg
          class:rotate-180={collapsed}
          class="transition-transform"
          xmlns="http://www.w3.org/2000/svg"
          width="22"
          height="22"
          viewBox="0 0 24 24"
          fill="currentColor"
        >
          <path d="m7.41 14.59 4.59-4.58 4.59 4.58L18 13.17l-6-6-6 6z" />
        </svg>
      </button>
      <button
        class="flex h-8 w-8 items-center justify-center rounded-full text-[#202124] hover:bg-[#e8eaed]"
        aria-label="Fechar uploads"
        on:click={() => dispatch('close')}
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
          <path
            d="M18.3 5.71 12 12l6.3 6.29-1.41 1.41L10.59 13.41 4.29 19.71 2.88 18.3 9.17 12 2.88 5.71 4.29 4.29l6.3 6.3 6.29-6.3z"
          />
        </svg>
      </button>
    </div>

    {#if !collapsed}
      <div class="flex h-9 items-center justify-between gap-3 bg-[#e8f0fe] px-4 text-[13px] text-[#3c4043]">
        <span class="min-w-0 truncate">{statusText}</span>
        {#if cancelable}
          <button class="shrink-0 font-medium text-[#0b57d0] hover:underline" on:click={() => dispatch('cancel')}>
            Cancelar
          </button>
        {/if}
      </div>

      <div class="max-h-[270px] overflow-y-auto overscroll-contain">
        {#each tasks as task (task.id)}
          {@const kind = fileKind(task)}
          <div class="flex h-[50px] items-center gap-3 px-4 text-[14px] hover:bg-[#f1f3f4]">
            <span class="flex h-6 w-6 shrink-0 items-center justify-center">
              {#if kind === 'pdf'}
                <span
                  class="flex h-4 w-4 items-center justify-center rounded-[1px] bg-[#ea4335] text-[5px] font-bold leading-none text-white"
                  >PDF</span
                >
              {:else if kind === 'image'}
                <svg xmlns="http://www.w3.org/2000/svg" width="19" height="19" viewBox="0 0 24 24" fill="#ea4335">
                  <path
                    d="M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z"
                  />
                </svg>
              {:else if kind === 'video'}
                <svg xmlns="http://www.w3.org/2000/svg" width="19" height="19" viewBox="0 0 24 24" fill="#ea4335">
                  <path
                    d="M17 10.5V7c0-.55-.45-1-1-1H4c-.55 0-1 .45-1 1v10c0 .55.45 1 1 1h12c.55 0 1-.45 1-1v-3.5l4 4v-11l-4 4z"
                  />
                </svg>
              {:else if kind === 'sheet'}
                <svg xmlns="http://www.w3.org/2000/svg" width="19" height="19" viewBox="0 0 24 24" fill="#34a853">
                  <path
                    d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zM9 17H7v-2h2v2zm0-4H7v-2h2v2zm0-4H7V7h2v2zm4 8h-2v-2h2v2zm0-4h-2v-2h2v2zm0-4h-2V7h2v2zm4 8h-2v-2h2v2zm0-4h-2v-2h2v2zm0-4h-2V7h2v2z"
                  />
                </svg>
              {:else}
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="19"
                  height="19"
                  viewBox="0 0 24 24"
                  fill={iconColors[kind]}
                >
                  <path d="M14 2H6c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V8l-6-6zM13 9V3.5L18.5 9H13z" />
                </svg>
              {/if}
            </span>

            <span class="min-w-0 flex-1 truncate" title={task.name}>{task.name}</span>

            {#if task.status === 'uploading'}
              <span class="h-5 w-5 shrink-0 animate-spin rounded-full border-2 border-[#dadce0] border-t-[#1a73e8]"></span>
            {:else if task.status === 'done'}
              <svg xmlns="http://www.w3.org/2000/svg" width="21" height="21" viewBox="0 0 24 24" fill="#188038">
                <path d="M9 16.17 4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" />
              </svg>
            {:else if task.status === 'error'}
              <svg xmlns="http://www.w3.org/2000/svg" width="21" height="21" viewBox="0 0 24 24" fill="#d93025">
                <path
                  d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"
                />
              </svg>
            {:else if task.status === 'canceled'}
              <svg xmlns="http://www.w3.org/2000/svg" width="21" height="21" viewBox="0 0 24 24" fill="#5f6368">
                <path
                  d="M18.3 5.71 12 12l6.3 6.29-1.41 1.41L10.59 13.41 4.29 19.71 2.88 18.3 9.17 12 2.88 5.71 4.29 4.29l6.3 6.3 6.29-6.3z"
                />
              </svg>
            {:else}
              <span class="h-5 w-5 shrink-0 rounded-full border-2 border-[#dadce0]"></span>
            {/if}
          </div>
        {/each}
      </div>
    {/if}
  </section>
{/if}
