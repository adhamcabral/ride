<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import type { DriveItem, SharePermission, ShareRole, UserAccount } from '$lib/types';

  export let item: DriveItem | null = null;
  export let accounts: UserAccount[] = [];
  export let currentUser: UserAccount | null = null;

  const dispatch = createEventDispatcher<{
    close: void;
    save: { users: SharePermission[]; linkRole: ShareRole | null };
    copyLink: void;
  }>();

  let query = '';
  let selectedUsers: UserAccount[] = [];
  let role: ShareRole = 'editor';
  let notify = true;
  let message = '';
  let composing = false;
  let roleMenuOpen = false;
  let linkRole: ShareRole | null = null;
  let linkAccessMenuOpen = false;
  let linkRoleMenuOpen = false;
  let suggestionsOpen = false;
  let permissionDraft: SharePermission[] = [];
  let permissionMenuUserId = '';
  let lastItemId = '';

  $: owner = item ? accounts.find((account) => account.id === item.ownerId) ?? currentUser : currentUser;
  $: suggestions = availableUsers(query, accounts, permissionDraft, selectedUsers, item?.ownerId ?? '');

  $: if (item?.id && item.id !== lastItemId) {
    lastItemId = item.id;
    query = '';
    selectedUsers = [];
    role = 'editor';
    linkRole = item.linkRole ?? null;
    permissionDraft = normalizedPermissions(item);
    notify = true;
    message = '';
    composing = false;
    roleMenuOpen = false;
    linkAccessMenuOpen = false;
    linkRoleMenuOpen = false;
    suggestionsOpen = false;
    permissionMenuUserId = '';
  }

  $: if (!item) {
    lastItemId = '';
  }

  function normalizedPermissions(target: DriveItem | null): SharePermission[] {
    if (!target) return [];
    if (target.sharePermissions?.length) return target.sharePermissions;
    return target.sharedWith.map((userId) => ({ userId, role: 'reader' }));
  }

  function accountFor(userId: string) {
    return accounts.find((account) => account.id === userId) ?? null;
  }

  function availableUsers(
    termInput: string,
    accountList: UserAccount[],
    permissions: SharePermission[],
    selected: UserAccount[],
    ownerId: string
  ) {
    const term = termInput.trim().toLowerCase();
    const blocked = new Set([
      ownerId,
      ...permissions.map((permission) => permission.userId),
      ...selected.map((user) => user.id)
    ]);
    return accountList
      .filter((account) => !blocked.has(account.id))
      .filter((account) => {
        if (!term) return true;
        return account.name.toLowerCase().includes(term) || account.email.toLowerCase().includes(term);
      })
      .slice(0, 6);
  }

  function addUser(account: UserAccount) {
    selectedUsers = [...selectedUsers, account];
    query = '';
    composing = true;
    suggestionsOpen = true;
  }

  function removeSelected(account: UserAccount) {
    selectedUsers = selectedUsers.filter((user) => user.id !== account.id);
    if (!selectedUsers.length) composing = false;
  }

  function roleLabel(value: ShareRole) {
    if (value === 'reader') return 'Leitor';
    if (value === 'commenter') return 'Comentador';
    return 'Editor';
  }

  function roleDescription(value: ShareRole) {
    if (value === 'editor') return 'Organizar, adicionar e editar arquivos';
    if (value === 'commenter') return 'Pode comentar quando esse recurso estiver disponível';
    return 'Pode abrir e visualizar';
  }

  function saveDraft(users: SharePermission[], nextLinkRole = linkRole) {
    dispatch('save', { users, linkRole: nextLinkRole });
  }

  function send() {
    if (!selectedUsers.length) return;
    const merged = new Map(permissionDraft.map((permission) => [permission.userId, permission.role]));
    for (const user of selectedUsers) merged.set(user.id, role);
    const nextDraft = Array.from(merged, ([userId, nextRole]) => ({ userId, role: nextRole }));
    permissionDraft = nextDraft;
    selectedUsers = [];
    query = '';
    composing = false;
    roleMenuOpen = false;
    suggestionsOpen = false;
    saveDraft(nextDraft);
  }

  function saveLinkAccess(nextRole: ShareRole | null) {
    linkRole = nextRole;
    linkAccessMenuOpen = false;
    linkRoleMenuOpen = false;
  }

  function setPermissionRole(userId: string, nextRole: ShareRole) {
    permissionDraft = permissionDraft.map((permission) =>
      permission.userId === userId ? { ...permission, role: nextRole } : permission
    );
    permissionMenuUserId = '';
  }

  function removePermission(userId: string) {
    permissionDraft = permissionDraft.filter((permission) => permission.userId !== userId);
    permissionMenuUserId = '';
  }

  function finish() {
    saveDraft(permissionDraft);
    dispatch('close');
  }

  function cancelAndClose() {
    dispatch('close');
  }

  function showSuggestions() {
    suggestionsOpen = true;
  }

  function hideSuggestions() {
    if (query.trim() || selectedUsers.length) return;
    suggestionsOpen = false;
  }
</script>

{#if item}
  <div
    class="fixed inset-0 z-[120] flex items-center justify-center bg-black/40"
    role="presentation"
    on:click={cancelAndClose}
  >
    <div
      data-dialog
      class="w-[512px] rounded-[8px] bg-white p-6 text-[#1f1f1f] shadow-[0_8px_32px_rgba(0,0,0,.28)]"
      role="dialog"
      aria-modal="true"
      aria-label={`Compartilhar ${item.name}`}
      tabindex="-1"
      on:click|stopPropagation
      on:keydown|stopPropagation
    >
      <div class="mb-5 flex items-center gap-3">
        {#if composing}
          <button
            class="flex h-9 w-9 items-center justify-center rounded-full hover:bg-[#f1f3f4]"
            aria-label="Voltar"
            on:click={() => (composing = false)}
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
              <path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.42-1.41L7.83 13H20v-2z" />
            </svg>
          </button>
        {/if}
        <h2 class="min-w-0 flex-1 truncate text-[24px] font-normal">Compartilhar "{item.name}"</h2>
        <button class="flex h-9 w-9 items-center justify-center rounded-full hover:bg-[#f1f3f4]" aria-label="Ajuda">
          <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
            <path d="M11 18h2v-2h-2v2zm1-16C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm0-14c-2.21 0-4 1.79-4 4h2c0-1.1.9-2 2-2s2 .9 2 2c0 2-3 1.75-3 5h2c0-2.25 3-2.5 3-5 0-2.21-1.79-4-4-4z" />
          </svg>
        </button>
        <button class="flex h-9 w-9 items-center justify-center rounded-full hover:bg-[#f1f3f4]" aria-label="Configurações">
          <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
            <path d="M19.43 12.98c.04-.32.07-.65.07-.98s-.02-.66-.07-.98l2.11-1.65c.19-.15.24-.42.12-.64l-2-3.46c-.12-.22-.37-.31-.6-.22l-2.49 1a7.3 7.3 0 0 0-1.69-.98L14.5 2.42A.49.49 0 0 0 14 2h-4c-.25 0-.46.18-.5.42L9.12 5.07c-.61.24-1.18.56-1.69.98l-2.49-1a.49.49 0 0 0-.6.22l-2 3.46c-.13.22-.07.49.12.64l2.11 1.65a7.93 7.93 0 0 0 0 1.96l-2.11 1.65a.5.5 0 0 0-.12.64l2 3.46c.12.22.37.31.6.22l2.49-1c.51.4 1.08.73 1.69.98l.38 2.65c.04.24.25.42.5.42h4c.25 0 .46-.18.5-.42l.38-2.65c.61-.24 1.18-.56 1.69-.98l2.49 1c.23.08.48 0 .6-.22l2-3.46a.5.5 0 0 0-.12-.64l-2.11-1.65zM12 15.5A3.5 3.5 0 1 1 12 8a3.5 3.5 0 0 1 0 7.5z" />
          </svg>
        </button>
      </div>

      <div class="relative">
        <div class="flex min-h-12 items-center gap-2 rounded border border-[#8ab4f8] px-3 py-1.5">
          {#each selectedUsers as user (user.id)}
            <span class="flex h-8 max-w-[240px] items-center gap-2 rounded-full border border-[#8f8f8f] px-2 text-[14px]">
              <span
                class="flex h-6 w-6 shrink-0 items-center justify-center overflow-hidden rounded-full text-[11px] text-white"
                style="background:{user.avatarColor}"
              >
                {#if user.avatarUrl}
                  <img src={user.avatarUrl} alt="" class="h-full w-full object-cover" />
                {:else}
                  {user.name.slice(0, 1).toUpperCase()}
                {/if}
              </span>
              <span class="truncate">{user.email}</span>
              <button class="text-[#bdc1c6]" aria-label={`Remover ${user.name}`} on:click={() => removeSelected(user)}>
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M18.3 5.71 12 12l6.3 6.29-1.41 1.41L10.59 13.41 4.29 19.71 2.88 18.3 9.17 12 2.88 5.71 4.29 4.29l6.3 6.3 6.29-6.3z" />
                </svg>
              </button>
            </span>
          {/each}
          <input
            class="h-8 min-w-[120px] flex-1 bg-transparent text-[14px] outline-none"
            placeholder="Adicionar participantes, grupos, espaços e eventos da agenda"
            bind:value={query}
            on:pointerdown={showSuggestions}
            on:click={showSuggestions}
            on:focus={showSuggestions}
            on:blur={() => setTimeout(hideSuggestions, 160)}
          />
        </div>

        {#if suggestionsOpen && !selectedUsers.length}
          <div class="absolute left-0 right-0 top-[52px] z-10 overflow-hidden rounded-b bg-white shadow-[0_4px_14px_rgba(60,64,67,.2)]">
            {#if suggestions.length > 0}
              {#each suggestions as user (user.id)}
                <button
                  class="flex h-[68px] w-full items-center gap-3 px-4 text-left hover:bg-[#f1f3f4]"
                  on:pointerdown|preventDefault
                  on:click={() => addUser(user)}
                >
                  <span
                    class="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full text-white"
                    style="background:{user.avatarColor}"
                  >
                    {#if user.avatarUrl}
                      <img src={user.avatarUrl} alt="" class="h-full w-full object-cover" />
                    {:else}
                      {user.name.slice(0, 1).toUpperCase()}
                    {/if}
                  </span>
                  <span class="min-w-0">
                    <span class="block truncate">{user.email}</span>
                    <span class="block truncate text-[13px] text-[#5f6368]">{user.name}</span>
                  </span>
                </button>
              {/each}
            {:else}
              <div class="px-4 py-4 text-[14px] text-[#5f6368]">Nenhum outro usuário disponível.</div>
            {/if}
          </div>
        {/if}
      </div>

      {#if composing || selectedUsers.length > 0}
        <div class="mt-3 flex items-start gap-3">
          <label class="flex flex-1 items-center gap-2 text-[14px]">
            <input type="checkbox" bind:checked={notify} />
            Notificar pessoas
          </label>
          <div class="relative">
            <button
              class="flex h-12 min-w-[104px] items-center justify-center gap-2 rounded border border-[#747775] px-4 hover:bg-[#f1f3f4]"
              on:click={() => (roleMenuOpen = !roleMenuOpen)}
            >
              {roleLabel(role)}
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                <path d="M7 10l5 5 5-5z" />
              </svg>
            </button>
            {#if roleMenuOpen}
              <div class="absolute right-0 top-14 z-20 w-[352px] rounded bg-white py-3 shadow-[0_4px_14px_rgba(60,64,67,.2)]">
                {#each ['reader', 'commenter', 'editor'] as option}
                  <button
                    class="flex w-full items-start gap-4 px-5 py-3 text-left hover:bg-[#f1f3f4]"
                    on:click={() => {
                      role = option as ShareRole;
                      roleMenuOpen = false;
                    }}
                  >
                    <span class="mt-1 w-5">{role === option ? '✓' : ''}</span>
                    <span>
                      <span class="block text-[16px]">{roleLabel(option as ShareRole)}</span>
                      {#if option === 'editor'}
                        <span class="block text-[14px] text-[#5f6368]">{roleDescription(option as ShareRole)}</span>
                      {/if}
                    </span>
                  </button>
                {/each}
              </div>
            {/if}
          </div>
        </div>
        <textarea
          class="mt-3 h-32 w-full resize-none rounded border border-[#747775] bg-transparent p-3 text-[16px] outline-none focus:border-[#8ab4f8]"
          placeholder="Mensagem"
          bind:value={message}
        ></textarea>
      {:else}
        <h3 class="mt-5 text-[17px] font-medium">Pessoas com acesso</h3>
        <div class="mt-3 space-y-3">
          {#if owner}
            <div class="flex items-center gap-3">
              <span class="flex h-9 w-9 items-center justify-center overflow-hidden rounded-full text-white" style="background:{owner.avatarColor}">
                {#if owner.avatarUrl}
                  <img src={owner.avatarUrl} alt="" class="h-full w-full object-cover" />
                {:else}
                  {owner.name.slice(0, 1).toUpperCase()}
                {/if}
              </span>
              <span class="min-w-0 flex-1">
                <span class="block truncate">{owner.name}{owner.id === currentUser?.id ? ' (you)' : ''}</span>
                <span class="block truncate text-[13px] text-[#5f6368]">{owner.email}</span>
              </span>
              <span class="text-[14px] text-[#5f6368]">Proprietário</span>
            </div>
          {/if}
          {#each permissionDraft as permission (permission.userId)}
            {@const account = accountFor(permission.userId)}
            {#if account}
              <div class="flex items-center gap-3">
                <span class="flex h-9 w-9 items-center justify-center overflow-hidden rounded-full text-white" style="background:{account.avatarColor}">
                  {#if account.avatarUrl}
                    <img src={account.avatarUrl} alt="" class="h-full w-full object-cover" />
                  {:else}
                    {account.name.slice(0, 1).toUpperCase()}
                  {/if}
                </span>
                <span class="min-w-0 flex-1">
                  <span class="block truncate">{account.name}</span>
                  <span class="block truncate text-[13px] text-[#5f6368]">{account.email}</span>
                </span>
                <div class="relative">
                  <button
                    class="flex items-center gap-1 rounded px-2 py-1 text-[14px] text-[#5f6368] hover:bg-[#e8eaed]"
                    aria-label={`Alterar acesso de ${account.name}`}
                    on:click={() => {
                      permissionMenuUserId = permissionMenuUserId === permission.userId ? '' : permission.userId;
                      linkAccessMenuOpen = false;
                      linkRoleMenuOpen = false;
                    }}
                  >
                    {roleLabel(permission.role)}
                    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M7 10l5 5 5-5z" />
                    </svg>
                  </button>
                  {#if permissionMenuUserId === permission.userId}
                    <div class="absolute right-0 top-9 z-30 w-[300px] rounded bg-white py-3 shadow-[0_4px_14px_rgba(60,64,67,.2)]">
                      {#each ['reader', 'commenter', 'editor'] as option}
                        <button
                          class="flex w-full items-start gap-4 px-5 py-3 text-left hover:bg-[#f1f3f4]"
                          on:click={() => setPermissionRole(permission.userId, option as ShareRole)}
                        >
                          <span class="mt-1 w-5 text-[#8ab4f8]">{permission.role === option ? '✓' : ''}</span>
                          <span>
                            <span class="block text-[16px]">{roleLabel(option as ShareRole)}</span>
                            {#if option === 'editor'}
                              <span class="block text-[14px] text-[#5f6368]">{roleDescription(option as ShareRole)}</span>
                            {/if}
                          </span>
                        </button>
                      {/each}
                      <div class="my-2 border-t border-[#dadce0]"></div>
                      <button
                        class="flex w-full items-center gap-4 px-5 py-3 text-left text-[#d93025] hover:bg-[#f1f3f4]"
                        on:click={() => removePermission(permission.userId)}
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                          <path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM8 9h8v10H8V9zm7.5-5-1-1h-5l-1 1H5v2h14V4z" />
                        </svg>
                        <span>Remover acesso</span>
                      </button>
                    </div>
                  {/if}
                </div>
              </div>
            {/if}
          {/each}
        </div>

        <h3 class="mt-7 text-[17px] font-medium">Acesso geral</h3>
        <div class="relative mt-3 flex items-center gap-3 {linkRole ? 'bg-[#f1f3f4] px-3 py-2' : ''}">
          <span class="flex h-9 w-9 items-center justify-center rounded-full {linkRole ? 'bg-[#188038]' : 'bg-[#5f6368]'} text-white">
            <svg xmlns="http://www.w3.org/2000/svg" width="21" height="21" viewBox="0 0 24 24" fill="currentColor">
              {#if linkRole}
                <path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm6.93 6h-2.95a15.4 15.4 0 0 0-1.38-3.12A8.03 8.03 0 0 1 18.93 8zM12 4.04A14.1 14.1 0 0 1 13.91 8h-3.82A14.1 14.1 0 0 1 12 4.04zM4.26 14a8.3 8.3 0 0 1 0-4h3.33a16.5 16.5 0 0 0 0 4H4.26zm.81 2h2.95c.34 1.12.8 2.17 1.38 3.12A8.03 8.03 0 0 1 5.07 16zm2.95-8H5.07A8.03 8.03 0 0 1 9.4 4.88 15.4 15.4 0 0 0 8.02 8zM12 19.96A14.1 14.1 0 0 1 10.09 16h3.82A14.1 14.1 0 0 1 12 19.96zM14.34 14H9.66a14.71 14.71 0 0 1 0-4h4.68a14.71 14.71 0 0 1 0 4zm.26 5.12c.58-.95 1.04-2 1.38-3.12h2.95a8.03 8.03 0 0 1-4.33 3.12zM16.41 14a16.5 16.5 0 0 0 0-4h3.33a8.3 8.3 0 0 1 0 4h-3.33z" />
              {:else}
                <path d="M12 17a2 2 0 0 0 2-2c0-.74-.4-1.38-1-1.72V11h-2v2.28A1.99 1.99 0 0 0 12 17zm6-8h-1V7A5 5 0 0 0 7 7v2H6c-1.1 0-2 .9-2 2v9c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2v-9c0-1.1-.9-2-2-2zM9 9V7a3 3 0 0 1 6 0v2H9z" />
              {/if}
            </svg>
          </span>
          <span class="min-w-0 flex-1">
            <button
              class="flex items-center gap-1 rounded px-1 py-0.5 font-medium hover:bg-[#e8eaed]"
              on:click={() => {
                linkAccessMenuOpen = !linkAccessMenuOpen;
                linkRoleMenuOpen = false;
                permissionMenuUserId = '';
              }}
            >
              {linkRole ? 'Qualquer pessoa com o link' : 'Restrito'}
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                <path d="M7 10l5 5 5-5z" />
              </svg>
            </button>
            <span class="block truncate text-[13px] text-[#5f6368]">
              {linkRole
                ? 'Qualquer pessoa na internet com o link pode ver.'
                : 'Só as pessoas com acesso podem abrir usando o link.'}
            </span>
          </span>
          {#if linkRole}
            <div class="relative">
              <button
                class="flex items-center gap-1 rounded px-2 py-1 text-[15px] hover:bg-[#e8eaed]"
                on:click={() => {
                  linkRoleMenuOpen = !linkRoleMenuOpen;
                  linkAccessMenuOpen = false;
                  permissionMenuUserId = '';
                }}
              >
                {roleLabel(linkRole)}
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M7 10l5 5 5-5z" />
                </svg>
              </button>
              {#if linkRoleMenuOpen}
                <div class="absolute right-0 top-9 z-20 w-[350px] rounded bg-white py-3 shadow-[0_4px_14px_rgba(60,64,67,.2)]">
                  <div class="px-5 pb-2 text-[11px] font-medium uppercase tracking-wide text-[#5f6368]">Função</div>
                  {#each ['reader', 'commenter', 'editor'] as option}
                    <button
                      class="flex w-full items-start gap-4 px-5 py-3 text-left hover:bg-[#f1f3f4]"
                      on:click={() => saveLinkAccess(option as ShareRole)}
                    >
                      <span class="mt-1 w-5 text-[#8ab4f8]">{linkRole === option ? '✓' : ''}</span>
                      <span>
                        <span class="block text-[16px]">{roleLabel(option as ShareRole)}</span>
                        {#if option === 'editor'}
                          <span class="block text-[14px] text-[#5f6368]">{roleDescription(option as ShareRole)}</span>
                        {/if}
                      </span>
                    </button>
                  {/each}
                </div>
              {/if}
            </div>
          {/if}
          {#if linkAccessMenuOpen}
            <div class="absolute left-12 top-10 z-20 w-[312px] rounded bg-white py-4 shadow-[0_4px_14px_rgba(60,64,67,.2)]">
              <button
                class="flex h-12 w-full items-center gap-5 px-5 text-left hover:bg-[#f1f3f4]"
                on:click={() => saveLinkAccess(null)}
              >
                <span class="w-5 text-[#8ab4f8]">{!linkRole ? '✓' : ''}</span>
                <span>Restrito</span>
              </button>
              <button
                class="flex h-12 w-full items-center gap-5 px-5 text-left hover:bg-[#f1f3f4]"
                on:click={() => saveLinkAccess(linkRole ?? 'reader')}
              >
                <span class="w-5 text-[#8ab4f8]">{linkRole ? '✓' : ''}</span>
                <span>Qualquer pessoa com o link</span>
              </button>
            </div>
          {/if}
        </div>
      {/if}

      <div class="mt-8 flex items-center justify-between">
        <button
          class="flex h-10 items-center gap-2 rounded-full border border-[#747775] px-4 font-medium text-[#0b57d0] hover:bg-[#f8fafd]"
          on:click={() => dispatch('copyLink')}
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
            <path d="M3.9 12c0-1.71 1.39-3.1 3.1-3.1h4V7H7a5 5 0 0 0 0 10h4v-1.9H7A3.1 3.1 0 0 1 3.9 12zM8 13h8v-2H8v2zm9-6h-4v1.9h4a3.1 3.1 0 0 1 0 6.2h-4V17h4a5 5 0 0 0 0-10z" />
          </svg>
          Copiar link
        </button>
        <div class="flex items-center gap-3">
          {#if composing}
            <button class="h-10 rounded-full px-5 font-medium text-[#8ab4f8] hover:bg-[#f8fafd]" on:click={() => (composing = false)}>
              Cancelar
            </button>
            <button
              class="h-10 rounded-full bg-[#a8c7fa] px-7 font-medium text-[#062e6f] disabled:opacity-50"
              disabled={!selectedUsers.length}
              on:click={send}
            >
              Enviar
            </button>
          {:else}
            <button class="h-10 rounded-full bg-[#a8c7fa] px-7 font-medium text-[#062e6f]" on:click={finish}>
              Concluído
            </button>
          {/if}
        </div>
      </div>
    </div>
  </div>
{/if}
