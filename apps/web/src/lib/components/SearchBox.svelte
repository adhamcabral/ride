<script lang="ts">
  import FileIcon from '$lib/components/FileIcon.svelte';
  import { formatDriveDate } from '$lib/format';
  import type { DriveItem, UserAccount } from '$lib/types';
  import { createEventDispatcher } from 'svelte';

  export let query = '';
  export let results: DriveItem[] = [];
  export let accounts: UserAccount[] = [];
  export let open = false;
  export let large = false;
  export let showTune = false;

  const dispatch = createEventDispatcher<{
    search: string;
    focus: void;
    close: void;
    openItem: DriveItem;
    allResults: void;
    advancedSearch: void;
  }>();

  $: visibleResults = results.slice(0, 5);
  $: active = open && query.trim().length > 0;

  function ownerName(item: DriveItem) {
    return accounts.find((account) => account.id === item.ownerId)?.name ?? 'eu';
  }

  function clearSearch() {
    dispatch('search', '');
    dispatch('close');
  }

  function openResult(item: DriveItem) {
    dispatch('openItem', item);
    dispatch('close');
  }
</script>

<div
  class="relative w-full {large ? 'max-w-[860px]' : 'max-w-[724px]'}"
  data-search-box
  role="presentation"
  on:click|stopPropagation
>
  <div
    class="relative z-[60] flex w-full items-center border-[#dadce0] bg-[#edf2fa] transition-colors {large
      ? 'h-[56px] px-6'
      : 'h-[46px] px-5'} {active
      ? 'rounded-t-[24px] border-x border-t bg-white shadow-[0_1px_2px_rgba(60,64,67,.2)]'
      : 'rounded-full'}"
  >
    <svg
      class="mr-4 shrink-0 text-[#444746]"
      xmlns="http://www.w3.org/2000/svg"
      width={large ? 24 : 22}
      height={large ? 24 : 22}
      viewBox="0 0 24 24"
      fill="currentColor"
    >
      <path
        d="M15.5 14h-.79l-.28-.27A6.471 6.471 0 0 0 16 9.5 6.5 6.5 0 1 0 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"
      />
    </svg>

    <input
      class="h-full min-w-0 flex-1 bg-transparent text-[#3c4043] outline-none placeholder:text-[#444746] {large
        ? 'text-[17px]'
        : 'text-[16px]'}"
      placeholder="Pesquise no Ride"
      value={query}
      on:focus={() => dispatch('focus')}
      on:input={(e) => dispatch('search', e.currentTarget.value)}
    />

    {#if query.trim()}
      <button
        class="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-[#444746] hover:bg-[#e8eaed]"
        aria-label="Limpar pesquisa"
        on:click|stopPropagation={clearSearch}
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
          <path
            d="M18.3 5.71 12 12l6.3 6.29-1.41 1.41L10.59 13.41 4.29 19.7 2.88 18.29 9.17 12 2.88 5.71 4.29 4.3l6.3 6.29 6.3-6.29z"
          />
        </svg>
      </button>
    {/if}

    {#if showTune}
      <button
        class="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-[#5f6368] hover:bg-[#dfe6f1]"
        aria-label="Opções de pesquisa"
        on:click|stopPropagation={() => dispatch('advancedSearch')}
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
          <path
            d="M3 17v2h6v-2H3zM3 5v2h10V5H3zm10 16v-2h8v-2h-8v-2h-2v6h2zM7 9v2H3v2h4v2h2V9H7zm14 4v-2H11v2h10zm-6-4h2V7h4V5h-4V3h-2v6z"
          />
        </svg>
      </button>
    {/if}
  </div>

  {#if active}
    <div
      class="absolute left-0 right-0 top-full z-50 overflow-hidden rounded-b-[24px] border-x border-b border-[#dadce0] bg-white shadow-[0_2px_6px_rgba(60,64,67,.3)]"
    >
      <div class="flex flex-wrap gap-2 border-b border-[#e0e0e0] px-3 py-3">
        {#each ['Tipo', 'Pessoas', 'Modificado'] as label}
          <button
            class="flex h-8 items-center gap-2 rounded-[8px] border border-[#747775] bg-white px-3 text-[14px] font-medium text-[#3c4043] hover:bg-[#e8eaed]"
          >
            {label}
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
              <path d="M7 10l5 5 5-5z" />
            </svg>
          </button>
        {/each}
      </div>

      <div class="py-2">
        {#each visibleResults as item (item.id)}
          <button
            class="grid h-[52px] w-full grid-cols-[1fr_auto] items-center gap-4 px-5 text-left text-[#1f1f1f] hover:bg-[#e8eaed]"
            on:click={() => openResult(item)}
          >
            <span class="flex min-w-0 items-center gap-4">
              <FileIcon {item} size={22} />
              <span class="min-w-0">
                <span class="block truncate text-[15px] font-medium leading-5">{item.name}</span>
                <span class="block truncate text-[12px] leading-4 text-[#5f6368]">{ownerName(item)}</span>
              </span>
            </span>
            <span class="shrink-0 text-[13px] text-[#1f1f1f]">{formatDriveDate(item.updatedAt)}</span>
          </button>
        {:else}
          <div class="px-5 py-5 text-[14px] text-[#5f6368]">Nenhum resultado encontrado</div>
        {/each}
      </div>

      <div class="flex items-center justify-between px-6 pb-4 pt-2 text-[15px] font-medium text-[#0b57d0]">
        <button class="hover:underline" on:click={() => dispatch('advancedSearch')}>Pesquisa avançada</button>
        <button class="flex items-center gap-3 text-right hover:underline" on:click={() => dispatch('allResults')}>
          <span aria-hidden="true">←</span>
          <span>Todos os<br class={large ? 'hidden sm:block' : 'hidden'} /> resultados</span>
        </button>
      </div>
    </div>
  {/if}
</div>
