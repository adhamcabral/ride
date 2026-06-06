<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import type { DriveItem } from '$lib/types';

  export let items: DriveItem[] = [];
  export let title = 'Meu Ride';
  export let variant: 'compact' | 'title' = 'compact';
  export let currentHasMenu = false;

  const dispatch = createEventDispatcher<{ open: string | null; menu: MouseEvent }>();
</script>

<nav
  class="{variant === 'title'
    ? '-ml-2 flex min-w-0 flex-wrap items-center gap-y-1 text-[25px] font-normal leading-8'
    : 'flex flex-wrap items-center text-[14px] text-[#202124]'}"
  aria-label="Localização"
  >
  <button
    class="{variant === 'title'
      ? '-ml-1.5 -mt-1.5 min-w-0 truncate rounded-[22px] pb-2 pl-3.5 pr-2.5 pt-2.5 text-[#5f6368] hover:bg-[#e8eaed]'
      : 'rounded px-1 py-0.5 hover:bg-[#f1f3f4]'}"
    on:click={() => dispatch('open', null)}
    >{title}</button
  >
  {#each items as item}
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={variant === 'title' ? 24 : 18}
      height={variant === 'title' ? 24 : 18}
      viewBox="0 0 24 24"
      fill="#5f6368"
      class="{variant === 'title' ? 'mx-1 shrink-0' : 'mx-0.5 shrink-0'}"
    >
      <path d="M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z" />
    </svg>
    {#if variant === 'title' && currentHasMenu && item === items.at(-1)}
      <button
        class="flex min-w-0 max-w-full items-center gap-1 rounded-full px-2 py-1 text-[#1f1f1f] hover:bg-[#e8eaed]"
        on:click|stopPropagation={(event) => dispatch('menu', event)}
        aria-haspopup="menu"
      >
        <span class="truncate">{item.name}</span>
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="currentColor"
          class="shrink-0"
        >
          <path d="M7 10l5 5 5-5z" />
        </svg>
      </button>
    {:else}
      <button
        class="{variant === 'title'
          ? 'min-w-0 max-w-full truncate rounded-full px-2 py-1 text-[#5f6368] hover:bg-[#e8eaed]'
          : 'rounded px-1 py-0.5 hover:bg-[#f1f3f4]'}"
        on:click={() => dispatch('open', item.id)}
        >{item.name}</button
      >
    {/if}
  {/each}
</nav>
