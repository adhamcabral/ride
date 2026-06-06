<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import SearchBox from '$lib/components/SearchBox.svelte';
  import type { DriveItem, DriveNotification, UserAccount } from '$lib/types';

  export let query = '';
  export let account: UserAccount | null = null;
  export let accounts: UserAccount[] = [];
  export let searchResults: DriveItem[] = [];
  export let searchOpen = false;
  export let showSearch = true;
  export let notifications: DriveNotification[] = [];
  export let notificationsOpen = false;

  $: unreadNotifications = notifications.some((notification) => !notification.readAt);

  const dispatch = createEventDispatcher<{
    search: string;
    searchFocus: void;
    searchClose: void;
    searchOpenItem: DriveItem;
    searchAllResults: void;
    advancedSearch: void;
    upload: void;
    notifications: void;
    clearNotifications: void;
    openNotification: DriveNotification;
    accounts: void;
    profile: void;
    toggleSidebar: void;
  }>();

  function notificationTime(value: string) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    return date.toLocaleString('pt-BR', {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit'
    });
  }
</script>

<header data-topbar class="z-30 flex h-[58px] shrink-0 items-center gap-2 bg-[#f8fafd] pl-3 pr-4 text-[#1f1f1f]">
  <div data-topbar-brand class="flex h-[58px] w-[226px] shrink-0 items-center gap-2">
    <button
      class="flex h-12 w-12 items-center justify-center rounded-full text-[#444746] hover:bg-[#e9eef6] active:bg-transparent"
      on:click={() => dispatch('toggleSidebar')}
      aria-label="Menu principal"
    >
      <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path d="M3 6h18v2H3V6zm0 5h18v2H3v-2zm0 5h18v2H3v-2z" />
      </svg>
    </button>

    <a href="/" class="flex items-center gap-2 no-underline">
      <img src="design/logo.png" alt="Ride" class="h-12 w-12 object-contain" />
      <span data-topbar-logo-text class="text-[24px] font-normal text-[#1f1f1f]">Ride</span>
    </a>
  </div>

  {#if showSearch}
    <SearchBox
      {query}
      {accounts}
      results={searchResults}
      open={searchOpen}
      showTune
      on:search={(e) => dispatch('search', e.detail)}
      on:focus={() => dispatch('searchFocus')}
      on:close={() => dispatch('searchClose')}
      on:openItem={(e) => dispatch('searchOpenItem', e.detail)}
      on:allResults={() => dispatch('searchAllResults')}
      on:advancedSearch={() => dispatch('advancedSearch')}
    />
  {:else}
    <div class="min-w-0 flex-1"></div>
  {/if}

  <div data-topbar-actions class="relative ml-auto flex items-center gap-2">
    <button
      class="relative flex h-10 w-10 items-center justify-center rounded-full text-[#444746] hover:bg-[#e9eef6]"
      on:click|stopPropagation={() => dispatch('notifications')}
      aria-label="Notificações"
      aria-expanded={notificationsOpen}
    >
      <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path
          d="M12 22a2.5 2.5 0 0 0 2.45-2h-4.9A2.5 2.5 0 0 0 12 22Zm7-6.7-1.5-1.5V10a5.5 5.5 0 0 0-4.4-5.39V3.75a1.1 1.1 0 0 0-2.2 0v.86A5.5 5.5 0 0 0 6.5 10v3.8L5 15.3V17h14v-1.7Z"
        />
      </svg>
      {#if unreadNotifications}
        <span class="absolute right-2.5 top-2.5 h-2.5 w-2.5 rounded-full border-2 border-[#f8fafd] bg-[#d93025]"></span>
      {/if}
    </button>

    {#if notificationsOpen}
      <div
        class="absolute right-12 top-12 z-50 w-[360px] max-w-[calc(100vw-24px)] overflow-hidden rounded-2xl border border-[#dadce0] bg-white text-[#1f1f1f] shadow-2xl"
        role="dialog"
        aria-label="Notificações"
        tabindex="-1"
        on:click|stopPropagation
        on:keydown|stopPropagation
      >
        <div class="flex items-center justify-between border-b border-[#e0e3e7] px-4 py-3">
          <h2 class="text-[16px] font-medium">Notificações</h2>
          <button
            class="rounded-full px-3 py-1.5 text-[13px] font-medium text-[#0b57d0] hover:bg-[#e8f0fe] disabled:text-[#9aa0a6] disabled:hover:bg-transparent"
            disabled={!notifications.length}
            on:click={() => dispatch('clearNotifications')}
          >
            Limpar
          </button>
        </div>
        <div class="max-h-[420px] overflow-y-auto py-1">
          {#if notifications.length}
            {#each notifications as notification (notification.id)}
              <button
                class="flex w-full gap-3 px-4 py-3 text-left hover:bg-[#f1f3f4]"
                on:click={() => dispatch('openNotification', notification)}
              >
                <span class="mt-2 h-2 w-2 shrink-0 rounded-full {notification.readAt ? 'bg-transparent' : 'bg-[#1a73e8]'}"></span>
                <span class="min-w-0 flex-1">
                  <span class="block truncate text-[14px] font-medium">{notification.title}</span>
                  <span class="mt-0.5 block break-words text-[13px] leading-5 text-[#5f6368]">{notification.message}</span>
                  <span class="mt-1 block text-[12px] text-[#80868b]">{notificationTime(notification.createdAt)}</span>
                </span>
              </button>
            {/each}
          {:else}
            <div class="px-4 py-8 text-center text-[13px] text-[#5f6368]">
              Nenhuma notificação.
            </div>
          {/if}
        </div>
      </div>
    {/if}

    <button
      class="flex h-10 w-10 items-center justify-center rounded-full text-[#444746] hover:bg-[#e9eef6]"
      on:click={() => dispatch('accounts')}
      aria-label="Configurações"
    >
      <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
        <path
          d="M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58c.18-.14.23-.41.12-.61l-1.92-3.32c-.12-.22-.37-.29-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54c-.04-.24-.24-.41-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.09.63-.09.94s.02.64.07.94l-2.03 1.58c-.18.14-.23.41-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.57 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.21.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z"
        />
      </svg>
    </button>

    <button
      class="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-[#1a73e8] text-[13px] font-medium text-white ring-2 ring-transparent hover:ring-[#d3e3fd]"
      style="background-color:{account?.avatarColor ?? '#1a73e8'}"
      on:click|stopPropagation={() => dispatch('profile')}
      title={account?.name ?? 'Conta'}
      aria-label="Conta"
    >
      {#if account?.avatarUrl}
        <img src={account.avatarUrl} alt="" class="h-full w-full object-cover" />
      {:else}
        {account?.name?.slice(0, 1).toUpperCase() ?? 'U'}
      {/if}
    </button>
  </div>
</header>
