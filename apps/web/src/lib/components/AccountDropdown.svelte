<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import { formatBytes } from '$lib/format';
  import type { StorageSummary, UserAccount } from '$lib/types';

  export let user: UserAccount | null = null;
  export let loggedAccounts: UserAccount[] = [];
  export let activeAccountId = '';
  export let summary: StorageSummary | null = null;
  export let visible = false;

  const dispatch = createEventDispatcher<{
    profile: void;
    settings: void;
    admin: void;
    addAccount: void;
    logout: void;
    logoutAccount: string;
    close: void;
    select: string;
  }>();

  let accountMenu: { account: UserAccount; x: number; y: number } | null = null;

  $: accountList = loggedAccounts.length ? loggedAccounts : user ? [user] : [];
  $: storagePercent = summary ? Math.round((summary.usedBytes / summary.totalBytes) * 100) : 0;
  $: if (!visible) accountMenu = null;

  function firstName(name?: string) {
    return name?.trim().split(/\s+/)[0] || 'usuário';
  }

  function initials(account: UserAccount | null) {
    return account?.name?.slice(0, 1).toUpperCase() ?? 'U';
  }

  function selectAccount(account: UserAccount) {
    dispatch('select', account.id);
    dispatch('close');
  }

  function openAccountMenu(event: MouseEvent, account: UserAccount) {
    event.preventDefault();
    event.stopPropagation();
    if (accountList.length <= 1) return;
    accountMenu = { account, x: event.clientX, y: event.clientY };
  }

  function logoutMenuAccount() {
    if (!accountMenu) return;
    dispatch('logoutAccount', accountMenu.account.id);
    accountMenu = null;
    dispatch('close');
  }

  function act(name: 'profile' | 'settings' | 'admin' | 'addAccount' | 'logout') {
    dispatch(name);
    dispatch('close');
  }
</script>

<svelte:window
  on:click={() => visible && dispatch('close')}
  on:keydown={(e) => visible && e.key === 'Escape' && dispatch('close')}
/>

{#if visible}
  <div
    data-account-dropdown
    class="fixed right-4 top-[58px] z-50 w-[412px] overflow-hidden rounded-[28px] bg-[#e9eef6] px-4 pb-5 pt-4 text-[#1f1f1f] shadow-[0_4px_18px_rgba(60,64,67,.3)] ring-1 ring-black/10"
    role="menu"
    tabindex="-1"
    on:click|stopPropagation
    on:contextmenu|preventDefault
    on:keydown|stopPropagation
  >
    <div class="relative flex min-h-[214px] flex-col items-center">
      <p class="max-w-[290px] truncate text-center text-[15px] font-medium">{user?.email ?? ''}</p>
      <button
        class="absolute right-3 top-0 h-10 w-10 rounded-full text-[#444746] hover:bg-[#f8fafd]"
        on:click={() => dispatch('close')}
        aria-label="Fechar"
      >
        {@render CloseIcon()}
      </button>

      <div class="relative mt-6">
        <div
          class="flex h-20 w-20 items-center justify-center overflow-hidden rounded-full text-[32px] font-medium text-white"
          style="background:{user?.avatarColor ?? '#1a73e8'}"
        >
          {#if user?.avatarUrl}
            <img src={user.avatarUrl} alt="" class="h-full w-full object-cover" />
          {:else}
            {initials(user)}
          {/if}
        </div>
        <button
          class="absolute -bottom-1 -right-1 flex h-8 w-8 items-center justify-center rounded-full bg-white text-[#444746] shadow-sm hover:bg-[#f1f3f4]"
          on:click={() => act('profile')}
          aria-label="Editar foto do perfil"
        >
          {@render CameraIcon()}
        </button>
      </div>

      <h2 class="mt-3 text-[24px] font-normal leading-8">Olá, {firstName(user?.name)}!</h2>
      <button
        class="mt-2 flex h-10 items-center justify-center rounded-full border border-[#747775] bg-transparent px-6 text-[15px] font-medium text-[#0b57d0] hover:bg-[#f8fafd]"
        on:click={() => act('profile')}
      >
        Gerenciar sua Conta do Ride
      </button>
    </div>

    <div class="overflow-hidden rounded-[24px] bg-white">
      <div class="flex h-14 items-center justify-between px-6 text-[15px]">
        <span>Ocultar mais contas</span>
        <button
          class="flex h-8 w-8 items-center justify-center rounded-full bg-[#edf2fa] text-[#5f6368] hover:bg-[#dfe5ee]"
          aria-label="Ocultar mais contas"
        >
          {@render ChevronUpIcon()}
        </button>
      </div>

      {#each accountList as account (account.id)}
        <button
          data-account-menu-row
          class="flex h-[58px] w-full items-center gap-4 border-t border-[#e6ebf2] px-6 text-left hover:bg-[#f8fafd] {activeAccountId ===
          account.id
            ? 'bg-[#f8fafd]'
            : ''}"
          on:click={() => selectAccount(account)}
          on:contextmenu={(event) => openAccountMenu(event, account)}
        >
          <span
            class="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full text-[14px] font-medium text-white"
            style="background:{account.avatarColor}"
          >
            {#if account.avatarUrl}
              <img src={account.avatarUrl} alt="" class="h-full w-full object-cover" />
            {:else}
              {initials(account)}
            {/if}
          </span>
          <span class="min-w-0 flex-1">
            <span class="block truncate text-[16px] leading-5">{account.name}</span>
            <span class="block truncate text-[13px] leading-5 text-[#5f6368]">{account.email}</span>
          </span>
        </button>
      {/each}

      <button
        data-account-menu-row
        class="flex h-[58px] w-full items-center gap-4 border-t border-[#e6ebf2] px-6 text-left hover:bg-[#f8fafd]"
        on:click={() => act('addAccount')}
      >
        <span
          class="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#e8f0fe] text-[#1a73e8]"
          data-add-account-icon
        >
          {@render AddIcon()}
        </span>
        <span class="text-[16px]">Adicionar outra conta</span>
      </button>

      <button
        data-account-menu-row
        class="flex h-[58px] w-full items-center gap-4 border-t border-[#e6ebf2] px-6 text-left hover:bg-[#f8fafd]"
        on:click={() => act('logout')}
      >
        <span class="flex h-9 w-9 shrink-0 items-center justify-center text-[#444746]"
          >{@render LogoutIcon()}</span
        >
        <span class="text-[16px]">Sair de todas as contas</span>
      </button>
    </div>

    <div class="mt-3 flex h-14 items-center gap-3 rounded-full bg-white px-5 text-[15px]">
      <span class="text-[#1a73e8]">{@render CloudIcon()}</span>
      <span>
        {#if summary}
          Você usou {storagePercent}% de {formatBytes(summary.totalBytes)}
        {:else}
          Armazenamento indisponível
        {/if}
      </span>
    </div>

    <div class="mt-5 flex justify-center gap-3 text-[12px] text-[#3c4043]">
      <span>Política de Privacidade</span>
      <span>•</span>
      <span>Termos de Serviço</span>
    </div>

    {#if accountMenu}
      <div
        class="fixed z-[80] min-w-[190px] overflow-hidden rounded-lg bg-white py-1 text-[#1f1f1f] shadow-[0_4px_18px_rgba(60,64,67,.28)] ring-1 ring-black/10"
        style:left={`${accountMenu.x}px`}
        style:top={`${accountMenu.y}px`}
        role="menu"
        tabindex="-1"
        on:click|stopPropagation
        on:keydown|stopPropagation
      >
        <button
          class="flex h-10 w-full items-center px-4 text-left text-[14px] hover:bg-[#f8fafd]"
          on:click={logoutMenuAccount}
        >
          Sair desta conta
        </button>
      </div>
    {/if}
  </div>
{/if}

{#snippet CloseIcon()}
  <svg
    class="absolute left-1/2 top-1/2 block h-5 w-5 -translate-x-1/2 -translate-y-1/2"
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 24 24"
    fill="currentColor"
  >
    <path d="M19 6.41 17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
  </svg>
{/snippet}

{#snippet SettingsIcon()}
  <svg xmlns="http://www.w3.org/2000/svg" width="23" height="23" viewBox="0 0 24 24" fill="currentColor">
    <path
      d="M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58c.18-.14.23-.41.12-.61l-1.92-3.32c-.12-.22-.37-.29-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54c-.04-.24-.24-.41-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.09.63-.09.94s.02.64.07.94l-2.03 1.58c-.18.14-.23.41-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.57 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.21.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z"
    />
  </svg>
{/snippet}

{#snippet CameraIcon()}
  <svg xmlns="http://www.w3.org/2000/svg" width="19" height="19" viewBox="0 0 24 24" fill="currentColor">
    <path
      d="M20 5h-3.17l-1.84-2H9.01L7.17 5H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm-8 13c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8.2A3.2 3.2 0 1 0 12 16.2a3.2 3.2 0 0 0 0-6.4z"
    />
  </svg>
{/snippet}

{#snippet ChevronUpIcon()}
  <svg xmlns="http://www.w3.org/2000/svg" width="21" height="21" viewBox="0 0 24 24" fill="currentColor">
    <path d="M7.41 14.59 12 10l4.59 4.59L18 13.17l-6-6-6 6z" />
  </svg>
{/snippet}

{#snippet AddIcon()}
  <svg xmlns="http://www.w3.org/2000/svg" width="23" height="23" viewBox="0 0 24 24" fill="currentColor">
    <path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6z" />
  </svg>
{/snippet}

{#snippet LogoutIcon()}
  <svg xmlns="http://www.w3.org/2000/svg" width="23" height="23" viewBox="0 0 24 24" fill="currentColor">
    <path
      d="M10.09 15.59 11.5 17l5-5-5-5-1.41 1.41L12.67 11H3v2h9.67zM19 3H5c-1.1 0-2 .9-2 2v4h2V5h14v14H5v-4H3v4c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2z"
    />
  </svg>
{/snippet}

{#snippet CloudIcon()}
  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
    <path d="M19.35 10.04A7.49 7.49 0 0 0 5.36 8.5 5.994 5.994 0 0 0 6 20h13a5 5 0 0 0 .35-9.96z" />
  </svg>
{/snippet}
