<script lang="ts">
  import { createEventDispatcher, tick } from 'svelte';
  import { officeCreateOptions, type OfficeCreateKind } from '$lib/office-create';
  import type { DriveItem, Section } from '$lib/types';

  export let visible = false;
  export let x = 0;
  export let y = 0;
  export let item: DriveItem | null = null;
  export let section: Section = 'drive';

  const dispatch = createEventDispatcher<{
    open: DriveItem;
    star: DriveItem;
    rename: DriveItem;
    move: DriveItem;
    share: DriveItem;
    infoDetails: DriveItem;
    infoActivity: DriveItem;
    spam: DriveItem;
    trash: DriveItem;
    restore: DriveItem;
    hardDelete: DriveItem;
    newFolder: void;
    upload: void;
    uploadFolder: void;
    createOffice: OfficeCreateKind;
    close: void;
  }>();

  const defaultMenuWidth = 232;
  const itemMenuWidth = 320;
  const infoSubmenuWidth = 292;
  const viewportMargin = 8;
  let menuEl: HTMLDivElement | null = null;
  let menuHeight = 0;
  let infoMenuOpen = false;

  $: menuWidth = item ? itemMenuWidth : defaultMenuWidth;
  $: infoSubmenuOpensLeft =
    typeof window !== 'undefined' && ax + menuWidth + infoSubmenuWidth + viewportMargin > window.innerWidth;

  $: if (visible) {
    measureMenu(item?.id, section);
  }

  $: if (!visible) {
    infoMenuOpen = false;
  }

  $: ax =
    typeof window !== 'undefined'
      ? Math.min(Math.max(viewportMargin, x), window.innerWidth - menuWidth - viewportMargin)
      : x;
  $: ay =
    typeof window !== 'undefined'
      ? Math.max(
          viewportMargin,
          Math.min(Math.max(viewportMargin, y), window.innerHeight - (menuHeight || 0) - viewportMargin)
        )
      : y;

  async function measureMenu(_itemId?: string, _section?: Section) {
    await tick();
    menuHeight = menuEl?.offsetHeight ?? 0;
  }

  function act(name: string, data?: DriveItem | OfficeCreateKind) {
    dispatch(name as any, data as any);
    dispatch('close');
  }

  const isTrashLike = (s: Section) => s === 'trash' || s === 'spam';
  const canCreate = (s: Section) => ['drive', 'personal', 'workspace', 'shared-with-me'].includes(s);
</script>

<svelte:window
  on:click={() => visible && dispatch('close')}
  on:keydown={(e) => visible && e.key === 'Escape' && dispatch('close')}
/>

{#if visible}
  <div
    bind:this={menuEl}
    data-context-menu
    class="fixed z-[100] overflow-visible rounded-lg bg-white py-1"
    style="left:{ax}px;top:{ay}px;width:{menuWidth}px;box-shadow:0 2px 10px rgba(0,0,0,.2),0 0 0 1px rgba(0,0,0,.04)"
    role="menu"
    tabindex="-1"
    on:click|stopPropagation
    on:keydown|stopPropagation
    on:contextmenu|preventDefault|stopPropagation
  >
    {#if item}
      <button
        class="flex w-full items-center gap-3 px-4 py-2 text-[13px] text-[#202124] hover:bg-[#e8eaed]"
        on:click={() => act('open', item)}
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="#5f6368"
          ><path
            d="M19 19H5V5h7V3H5c-1.11 0-2 .9-2 2v14c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2v-7h-2v7zM14 3v2h3.59l-9.83 9.83 1.41 1.41L19 6.41V10h2V3h-7z"
          /></svg
        >
        Abrir
      </button>
      {#if !isTrashLike(section)}
        <button
          class="flex w-full items-center gap-3 px-4 py-2 text-[13px] text-[#202124] hover:bg-[#e8eaed]"
          on:click={() => act('rename', item)}
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="#5f6368"
            ><path
              d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"
            /></svg
          >
          Renomear
        </button>
        <button
          class="flex w-full items-center gap-3 px-4 py-2 text-[13px] text-[#202124] hover:bg-[#e8eaed]"
          on:click={() => act('star', item)}
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="#5f6368"
            ><path
              d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"
            /></svg
          >
          {item.starred ? 'Remover estrela' : 'Adicionar estrela'}
        </button>
        <button
          class="flex w-full items-center gap-3 px-4 py-2 text-[13px] text-[#202124] hover:bg-[#e8eaed]"
          on:click={() => act('move', item)}
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="#5f6368"
            ><path
              d="M20 6h-8l-2-2H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2z"
            /></svg
          >
          Mover para
        </button>
        <button
          class="flex w-full items-center gap-3 px-4 py-2 text-[13px] text-[#202124] hover:bg-[#e8eaed]"
          on:click={() => act('share', item)}
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="#5f6368"
            ><path
              d="M18 16.08c-.76 0-1.44.3-1.96.77L8.91 12.7c.05-.23.09-.46.09-.7s-.04-.47-.09-.7l7.05-4.11c.54.5 1.25.81 2.04.81 1.66 0 3-1.34 3-3s-1.34-3-3-3-3 1.34-3 3c0 .24.04.47.09.7L8.04 9.81C7.5 9.31 6.79 9 6 9c-1.66 0-3 1.34-3 3s1.34 3 3 3c.79 0 1.5-.31 2.04-.81l7.12 4.16c-.05.21-.08.43-.08.65 0 1.61 1.31 2.92 2.92 2.92 1.61 0 2.92-1.31 2.92-2.92s-1.31-2.92-2.92-2.92z"
            /></svg
          >
          Compartilhar
        </button>
        <div
          class="relative"
          role="none"
          on:mouseenter={() => (infoMenuOpen = true)}
          on:mouseleave={() => (infoMenuOpen = false)}
        >
          <button
            class="flex w-full items-center justify-between gap-3 px-4 py-2 text-left text-[13px] text-[#202124] hover:bg-[#e8eaed]"
            aria-haspopup="menu"
            aria-expanded={infoMenuOpen}
            on:focus={() => (infoMenuOpen = true)}
            on:click={() => act('infoDetails', item)}
          >
            <span class="flex min-w-0 items-center gap-3">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="#5f6368"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
              >
                <circle cx="12" cy="12" r="9" />
                <path d="M12 11v6" />
                <path d="M12 7h.01" />
              </svg>
              <span class="truncate">Informações sobre o arquivo</span>
            </span>
            <span class="text-[18px] leading-none text-[#5f6368]">›</span>
          </button>

          {#if infoMenuOpen}
            <div
              class="absolute top-0 z-[110] w-[292px] overflow-hidden rounded-lg bg-white py-1 {infoSubmenuOpensLeft
                ? 'right-full mr-1'
                : 'left-full ml-1'}"
              style="box-shadow:0 2px 10px rgba(0,0,0,.2),0 0 0 1px rgba(0,0,0,.04)"
              role="menu"
            >
              <button
                class="flex w-full items-center justify-between gap-4 px-4 py-2 text-left text-[13px] text-[#202124] hover:bg-[#e8eaed]"
                on:click={() => act('infoDetails', item)}
              >
                <span class="flex items-center gap-3">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="18"
                    height="18"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="#5f6368"
                    stroke-width="2"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                  >
                    <circle cx="12" cy="12" r="9" />
                    <path d="M12 11v6" />
                    <path d="M12 7h.01" />
                  </svg>
                  Detalhes
                </span>
                <span class="text-[11px] text-[#5f6368]">Alt+V, depois D</span>
              </button>
              <button
                class="flex w-full items-center justify-between gap-4 px-4 py-2 text-left text-[13px] text-[#202124] hover:bg-[#e8eaed]"
                on:click={() => act('infoDetails', item)}
              >
                <span class="flex items-center gap-3">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="18"
                    height="18"
                    viewBox="0 0 24 24"
                    fill="#5f6368"
                  >
                    <path
                      d="M12 1 4 4.6v5.5c0 5.08 3.41 9.82 8 11.2 4.59-1.38 8-6.12 8-11.2V4.6L12 1zm0 2.2 6 2.67v4.23c0 3.95-2.49 7.74-6 9.08-3.51-1.34-6-5.13-6-9.08V5.87l6-2.67z"
                    />
                  </svg>
                  Limitações de segurança
                </span>
              </button>
              <button
                class="flex w-full items-center justify-between gap-4 px-4 py-2 text-left text-[13px] text-[#202124] hover:bg-[#e8eaed]"
                on:click={() => act('infoActivity', item)}
              >
                <span class="flex items-center gap-3">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="18"
                    height="18"
                    viewBox="0 0 24 24"
                    fill="#5f6368"
                  >
                    <path d="M4 17.5 8.8 12l3.4 3.4L19.2 7 20.8 8.4l-8.5 10.2-3.4-3.4L5.5 19 4 17.5z" />
                  </svg>
                  Atividade
                </span>
                <span class="text-[11px] text-[#5f6368]">Alt+V, depois A</span>
              </button>
            </div>
          {/if}
        </div>
        <div class="my-1 h-px bg-[#e0e0e0]"></div>
        <button
          class="flex w-full items-center gap-3 px-4 py-2 text-[13px] text-[#202124] hover:bg-[#e8eaed]"
          on:click={() => act('spam', item)}
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="#5f6368"
            ><path d="M14.99 3H9L3 9v6l6 6h6l6-6V9l-6-6zm-1 13h-2v-2h2v2zm0-4h-2V7h2v5z" /></svg
          >
          Denunciar spam
        </button>
        <button
          class="flex w-full items-center gap-3 px-4 py-2 text-[13px] text-[#d93025] hover:bg-[#e8eaed]"
          on:click={() => act('trash', item)}
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="#d93025"
            ><path
              d="M16 9v10H8V9h8m-1.5-6h-5l-1 1H5v2h14V4h-3.5l-1-1zM18 7H6v12c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7z"
            /></svg
          >
          Mover para lixeira
        </button>
      {:else}
        <div class="my-1 h-px bg-[#e0e0e0]"></div>
        <button
          class="flex w-full items-center gap-3 px-4 py-2 text-[13px] text-[#202124] hover:bg-[#e8eaed]"
          on:click={() => act('restore', item)}
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="#5f6368"
            ><path
              d="M12 5V1L7 6l5 5V7c3.31 0 6 2.69 6 6s-2.69 6-6 6-6-2.69-6-6H4c0 4.42 3.58 8 8 8s8-3.58 8-8-3.58-8-8-8z"
            /></svg
          >
          Restaurar
        </button>
        <button
          class="flex w-full items-center gap-3 px-4 py-2 text-[13px] text-[#d93025] hover:bg-[#e8eaed]"
          on:click={() => act('hardDelete', item)}
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="#d93025"
            ><path
              d="M16 9v10H8V9h8m-1.5-6h-5l-1 1H5v2h14V4h-3.5l-1-1zM18 7H6v12c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7z"
            /></svg
          >
          Excluir permanentemente
        </button>
      {/if}
    {:else if canCreate(section)}
      <button
        class="flex w-full items-center gap-3 px-4 py-2 text-[13px] text-[#202124] hover:bg-[#e8eaed]"
        on:click={() => act('newFolder')}
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="#5f6368"
          ><path
            d="M20 6h-8l-2-2H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2zm-1 8h-3v3h-2v-3h-3v-2h3V9h2v3h3v2z"
          /></svg
        >
        Nova pasta
      </button>
      <button
        class="flex w-full items-center gap-3 px-4 py-2 text-[13px] text-[#202124] hover:bg-[#e8eaed]"
        on:click={() => act('upload')}
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="#5f6368"
          ><path d="M5 20h14v-2H5v2zm0-10h4v6h6v-6h4l-7-7-7 7z" /></svg
        >
        Upload de arquivo
      </button>
      <button
        class="flex w-full items-center gap-3 px-4 py-2 text-[13px] text-[#202124] hover:bg-[#e8eaed]"
        on:click={() => act('uploadFolder')}
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="#5f6368"
          ><path
            d="M20 6h-8l-2-2H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2zm-1 8h-3v3h-2v-3h-3v-2h3V9h2v3h3v2z"
          /></svg
        >
        Upload de pasta
      </button>
      <div class="my-1 h-px bg-[#e0e0e0]"></div>
      {#each officeCreateOptions as option}
        <button
          class="flex w-full items-center gap-3 px-4 py-2 text-[13px] text-[#202124] hover:bg-[#e8eaed]"
          on:click={() => act('createOffice', option.kind)}
        >
          {@render OfficeCreateIcon(option)}
          <span>{option.label}</span>
        </button>
      {/each}
    {/if}
  </div>
{/if}

{#snippet OfficeCreateIcon(option: (typeof officeCreateOptions)[number])}
  <span
    class="flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-[3px] text-[11px] font-bold leading-none text-white"
    style="background:{option.color}"
    aria-hidden="true"
  >
    {option.glyph}
  </span>
{/snippet}
