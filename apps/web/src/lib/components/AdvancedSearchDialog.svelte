<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import {
    defaultAdvancedSearchFilters,
    type AdvancedDatePreset,
    type AdvancedItemType,
    type AdvancedLocation,
    type AdvancedSearchFilters
  } from '$lib/advanced-search';
  import FileIcon from '$lib/components/FileIcon.svelte';
  import type { DriveItem, UserAccount } from '$lib/types';

  export let open = false;
  export let filters: AdvancedSearchFilters = { ...defaultAdvancedSearchFilters };
  export let accounts: UserAccount[] = [];
  export let folders: DriveItem[] = [];
  export let activeAccountId = '';

  const dispatch = createEventDispatcher<{
    close: void;
    search: AdvancedSearchFilters;
    reset: void;
  }>();

  let itemType: AdvancedItemType = filters.itemType;
  let ownerId = filters.ownerId;
  let content = filters.content;
  let itemName = filters.itemName;
  let location: AdvancedLocation = filters.location;
  let locationFolderId = filters.locationFolderId;
  let modifiedPreset: AdvancedDatePreset = filters.modifiedPreset;
  let modifiedAfter = filters.modifiedAfter;
  let modifiedBefore = filters.modifiedBefore;
  let sharedWith = filters.sharedWith;
  let folderPickerOpen = false;
  let folderSearch = '';
  let folderPickerTab: 'suggestions' | 'starred' | 'all' = 'suggestions';

  $: if (open) syncFilters(filters);
  $: selectedFolder = folders.find((folder) => folder.id === locationFolderId) ?? null;
  $: visibleFolders = folderPickerFolders();

  function syncFilters(next: AdvancedSearchFilters) {
    itemType = next.itemType;
    ownerId = next.ownerId;
    content = next.content;
    itemName = next.itemName;
    location = next.location;
    locationFolderId = next.locationFolderId;
    modifiedPreset = next.modifiedPreset;
    modifiedAfter = next.modifiedAfter;
    modifiedBefore = next.modifiedBefore;
    sharedWith = next.sharedWith;
  }

  function currentFilters(): AdvancedSearchFilters {
    const custom = modifiedPreset === 'custom';
    return {
      itemType,
      ownerId,
      content,
      itemName,
      location,
      locationFolderId: location === 'folder' ? locationFolderId : '',
      modifiedPreset,
      modifiedAfter: custom ? modifiedAfter : '',
      modifiedBefore: custom ? modifiedBefore : '',
      sharedWith
    };
  }

  function submit() {
    dispatch('search', currentFilters());
  }

  function reset() {
    syncFilters(defaultAdvancedSearchFilters);
    folderPickerOpen = false;
    dispatch('reset');
  }

  function close() {
    folderPickerOpen = false;
    dispatch('close');
  }

  function chooseLocation(next: AdvancedLocation) {
    location = next;
    if (next !== 'folder') {
      locationFolderId = '';
      folderPickerOpen = false;
    } else {
      folderPickerOpen = true;
    }
  }

  function chooseFolder(folder: DriveItem) {
    location = 'folder';
    locationFolderId = folder.id;
  }

  function folderPickerFolders() {
    const term = folderSearch.trim().toLocaleLowerCase('pt-BR');
    let source = folders.filter((folder) => !folder.trashed && !folder.spam);
    if (folderPickerTab === 'suggestions') source = source.filter((folder) => folder.parentId === null).slice(0, 12);
    if (folderPickerTab === 'starred') source = source.filter((folder) => folder.starred);
    if (term) source = source.filter((folder) => folder.name.toLocaleLowerCase('pt-BR').includes(term));
    return source;
  }

  function ownerLabel(account: UserAccount) {
    return account.id === activeAccountId ? `${account.name || account.email} (eu)` : account.name || account.email;
  }

  function handleKeydown(event: KeyboardEvent) {
    if (event.key === 'Escape') close();
    if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') submit();
  }
</script>

{#if open}
  <div
    class="fixed inset-0 z-[260] bg-black/20 text-[#e8eaed]"
    role="dialog"
    aria-modal="true"
    aria-label="Pesquisa avançada"
    tabindex="-1"
    on:click|self={close}
    on:keydown={handleKeydown}
  >
    <section
      class="absolute left-2 top-[54px] w-[min(724px,calc(100vw-16px))] rounded-[28px] bg-[#2b2f31] px-6 pb-6 pt-5 shadow-[0_12px_32px_rgba(0,0,0,.38)] md:left-[calc(226px+1rem)]"
    >
      <header class="mb-5 flex items-center justify-between">
        <h2 class="text-[24px] font-normal leading-8">Pesquisa avançada</h2>
        <button class="grid h-10 w-10 place-items-center rounded-full text-[#e8eaed] hover:bg-white/10" on:click={close} aria-label="Fechar">
          <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
            <path d="M18.3 5.71 12 12l6.3 6.29-1.41 1.41L10.59 13.41 4.29 19.71 2.88 18.3 9.17 12 2.88 5.71 4.29 4.29l6.3 6.3 6.29-6.3z" />
          </svg>
        </button>
      </header>

      <div class="grid gap-y-5 text-[14px] md:grid-cols-[126px_minmax(0,1fr)] md:items-center">
        <label class="font-semibold text-[#c4c7c5]" for="advanced-type">Tipo</label>
        <select id="advanced-type" bind:value={itemType} class="h-10 rounded border border-[#8b8d90] bg-[#2b2f31] px-4 text-[16px] text-[#e8eaed] outline-none focus:border-[#a8c7fa] md:w-64">
          <option value="any">Qualquer valor</option>
          <option value="folder">Pastas</option>
          <option value="docs">Documentos</option>
          <option value="sheets">Planilhas</option>
          <option value="slides">Apresentações</option>
          <option value="pdfs">PDFs</option>
          <option value="images">Imagens</option>
          <option value="videos">Vídeos</option>
        </select>

        <label class="font-semibold text-[#c4c7c5]" for="advanced-owner">Proprietário</label>
        <select id="advanced-owner" bind:value={ownerId} class="h-10 rounded border border-[#8b8d90] bg-[#2b2f31] px-4 text-[16px] text-[#e8eaed] outline-none focus:border-[#a8c7fa] md:w-64">
          <option value="any">Qualquer pessoa</option>
          {#each accounts as account (account.id)}
            <option value={account.id}>{ownerLabel(account)}</option>
          {/each}
        </select>

        <label class="font-semibold text-[#c4c7c5]" for="advanced-content">Com as palavras</label>
        <input id="advanced-content" bind:value={content} class="h-10 rounded border border-[#8b8d90] bg-[#2b2f31] px-4 text-[16px] text-[#e8eaed] outline-none placeholder:text-[#bdc1c6] focus:border-[#a8c7fa]" placeholder="Digite palavras encontradas no arquivo" />

        <label class="font-semibold text-[#c4c7c5]" for="advanced-name">Nome do item</label>
        <input id="advanced-name" bind:value={itemName} class="h-10 rounded border border-[#8b8d90] bg-[#2b2f31] px-4 text-[16px] text-[#e8eaed] outline-none placeholder:text-[#bdc1c6] focus:border-[#a8c7fa]" placeholder="Digite um termo que corresponda a parte do nome do arquivo" />

        <label class="font-semibold text-[#c4c7c5]" for="advanced-location">Local</label>
        <div class="relative">
          <select
            id="advanced-location"
            bind:value={location}
            class="h-10 rounded border border-[#8b8d90] bg-[#2b2f31] px-4 text-[16px] text-[#e8eaed] outline-none focus:border-[#a8c7fa] md:w-64"
            on:change={(event) => chooseLocation(event.currentTarget.value as AdvancedLocation)}
          >
            <option value="any">Em qualquer lugar</option>
            <option value="drive">Meu Ride</option>
            <option value="shared">Compartilhados comigo</option>
            <option value="folder">{selectedFolder ? selectedFolder.name : 'Mais locais...'}</option>
          </select>
          {#if location === 'folder'}
            <button class="ml-3 h-10 rounded-full px-4 text-[14px] font-medium text-[#a8c7fa] hover:bg-white/10" on:click={() => (folderPickerOpen = true)}>
              Escolher pasta
            </button>
          {/if}

          {#if folderPickerOpen}
            <div class="absolute left-0 top-12 z-[270] flex h-[518px] w-[min(618px,calc(100vw-48px))] flex-col overflow-hidden rounded-md border border-[#5f6368] bg-[#111315] shadow-[0_8px_28px_rgba(0,0,0,.42)]">
              <div class="flex h-12 items-center border-b border-[#5f6368]">
                {#each [{ id: 'suggestions', label: 'Sugestões' }, { id: 'starred', label: 'Com estrela' }, { id: 'all', label: 'Todos os locais' }] as tab}
                  <button
                    class="h-full px-4 text-[14px] font-medium {folderPickerTab === tab.id ? 'border-b-2 border-[#8ab4f8] text-[#a8c7fa]' : 'text-[#e8eaed] hover:bg-white/10'}"
                    on:click={() => (folderPickerTab = tab.id as 'suggestions' | 'starred' | 'all')}
                  >
                    {tab.label}
                  </button>
                {/each}
                <div class="ml-auto flex h-full items-center px-3">
                  <svg class="mr-2 text-[#e8eaed]" xmlns="http://www.w3.org/2000/svg" width="21" height="21" viewBox="0 0 24 24" fill="currentColor"><path d="M15.5 14h-.79l-.28-.27A6.471 6.471 0 0 0 16 9.5 6.5 6.5 0 1 0 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z" /></svg>
                  <input bind:value={folderSearch} class="h-9 w-44 bg-transparent text-[#e8eaed] outline-none placeholder:text-[#9aa0a6]" placeholder="Buscar pasta" />
                </div>
              </div>
              <div class="min-h-0 flex-1 overflow-y-auto py-2">
                {#each visibleFolders as folder (folder.id)}
                  <button
                    class="flex h-8 w-full items-center gap-4 px-4 text-left text-[15px] {locationFolderId === folder.id ? 'bg-[#263238] text-[#a8c7fa]' : 'text-[#e8eaed] hover:bg-white/10'}"
                    on:click={() => chooseFolder(folder)}
                  >
                    <FileIcon item={folder} size={20} />
                    <span class="truncate">{folder.name}</span>
                  </button>
                {:else}
                  <p class="px-4 py-6 text-[13px] text-[#bdc1c6]">Nenhuma pasta encontrada.</p>
                {/each}
              </div>
              <div class="flex h-20 items-center justify-between border-t border-[#3c4043] px-6 text-[12px]">
                <span class="text-[#e8eaed]">{selectedFolder ? `Selecionado: ${selectedFolder.name}` : 'Selecione um local para mostrar o caminho da pasta'}</span>
                <div class="flex gap-2">
                  <button class="h-10 rounded-full px-4 text-[14px] font-medium text-[#a8c7fa] hover:bg-white/10" on:click={() => (folderPickerOpen = false)}>Cancelar</button>
                  <button
                    class="h-10 rounded-full px-5 text-[14px] font-medium {selectedFolder ? 'bg-[#a8c7fa] text-[#062e6f]' : 'bg-[#3c4043] text-[#9aa0a6]'}"
                    disabled={!selectedFolder}
                    on:click={() => (folderPickerOpen = false)}
                  >
                    Selecionar
                  </button>
                </div>
              </div>
            </div>
          {/if}
        </div>

        <label class="font-semibold text-[#c4c7c5]" for="advanced-date">Data da modificação</label>
        <select id="advanced-date" bind:value={modifiedPreset} class="h-10 rounded border border-[#8b8d90] bg-[#2b2f31] px-4 text-[16px] text-[#e8eaed] outline-none focus:border-[#a8c7fa] md:w-64">
          <option value="any">Qualquer período</option>
          <option value="today">Hoje</option>
          <option value="yesterday">Ontem</option>
          <option value="7d">Últimos sete dias</option>
          <option value="30d">Últimos 30 dias</option>
          <option value="90d">Últimos 90 dias</option>
          <option value="custom">Personalizado...</option>
        </select>

        {#if modifiedPreset === 'custom'}
          <span class="text-[#c4c7c5] md:col-start-2">Entre:</span>
          <div class="grid gap-4 md:col-start-2 md:grid-cols-2">
            <label class="relative">
              <span class="absolute -top-2 left-3 bg-[#2b2f31] px-1 text-[12px] text-[#a8c7fa]">Após a data</span>
              <input bind:value={modifiedAfter} type="date" class="h-11 w-full rounded border border-[#8b8d90] bg-[#2b2f31] px-4 text-[15px] text-[#e8eaed] outline-none focus:border-[#a8c7fa]" />
            </label>
            <label class="relative">
              <span class="absolute -top-2 left-3 bg-[#2b2f31] px-1 text-[12px] text-[#c4c7c5]">Antes da data</span>
              <input bind:value={modifiedBefore} type="date" class="h-11 w-full rounded border border-[#8b8d90] bg-[#2b2f31] px-4 text-[15px] text-[#e8eaed] outline-none focus:border-[#a8c7fa]" />
            </label>
          </div>
        {/if}

        <label class="font-semibold text-[#c4c7c5]" for="advanced-shared">Compartilhado com</label>
        <input id="advanced-shared" bind:value={sharedWith} class="h-10 rounded border border-[#8b8d90] bg-[#2b2f31] px-4 text-[14px] text-[#e8eaed] outline-none placeholder:text-[#bdc1c6] focus:border-[#a8c7fa]" placeholder="Digite um nome ou endereço de e-mail..." />
      </div>

      <footer class="mt-7 flex items-center justify-end gap-3">
        <button class="h-10 rounded-full px-4 text-[14px] font-medium text-[#a8c7fa] hover:bg-white/10" on:click={reset}>Redefinir</button>
        <button class="h-10 rounded-full bg-[#a8c7fa] px-6 text-[14px] font-medium text-[#062e6f] hover:bg-[#d3e3fd]" on:click={submit}>Pesquisar</button>
      </footer>
    </section>
  </div>
{/if}
