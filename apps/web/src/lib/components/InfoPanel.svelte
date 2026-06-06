<script context="module" lang="ts">
  export type InfoPanelTab = 'details' | 'activity';
  export type InfoPanelLocation = { folderId: string | null; section: 'drive' | 'shared-with-me' };
</script>

<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import FileIcon from '$lib/components/FileIcon.svelte';
  import FileThumbnail from '$lib/components/FileThumbnail.svelte';
  import { formatBytes } from '$lib/format';
  import { previewUrl } from '$lib/api';
  import type { DriveActivityEvent, DriveItem, Section, StorageSummary, UserAccount } from '$lib/types';

  const DESCRIPTION_LIMIT = 25000;

  export let open = false;
  export let activeTab: InfoPanelTab = 'details';
  export let item: DriveItem | null = null;
  export let currentFolder: DriveItem | null = null;
  export let selectedItems: DriveItem[] = [];
  export let items: DriveItem[] = [];
  export let accounts: UserAccount[] = [];
  export let folders: DriveItem[] = [];
  export let activeAccount: UserAccount | null = null;
  export let summary: StorageSummary | null = null;
  export let section: Section = 'drive';
  export let sectionTitle = 'Meu Ride';

  type DetailRow = { label: string; value: string; muted?: boolean };
  type ActivityGroup = { label: string; rows: DriveActivityEvent[] };

  const dispatch = createEventDispatcher<{
    close: void;
    tab: InfoPanelTab;
    openItem: DriveItem;
    share: DriveItem;
    location: InfoPanelLocation;
    saveDescription: { item: DriveItem; description: string | null };
  }>();

  let draftDescription = '';
  let descriptionItemId: string | null = null;
  let panelPreviewSource = '';
  let panelPreviewItemId: string | null = null;
  let panelPreviewRun = 0;

  $: accountLookup = new Map(accounts.map((account) => [account.id, account]));
  $: folderLookup = new Map(folders.map((folder) => [folder.id, folder]));
  $: explicitSubject = item ?? (selectedItems.length === 1 ? selectedItems[0] : null);
  $: panelSubject = explicitSubject ?? currentFolder;
  $: multiSelection = !item && selectedItems.length > 1;
  $: rootIsShared = panelSubject ? panelSubject.ownerId !== activeAccount?.id : section === 'shared-with-me';
  $: rootLabel = rootIsShared ? 'Compartilhado comigo' : 'Meu Ride';
  $: title = titleForPanel(explicitSubject, selectedItems, multiSelection, currentFolder, section, sectionTitle);
  $: subtitle = subtitleForPanel(
    explicitSubject,
    selectedItems,
    multiSelection,
    currentFolder,
    section,
    summary,
    activeAccount
  );
  $: detailRows = buildDetailRows(section, explicitSubject, multiSelection, selectedItems, panelSubject, summary);
  $: activityGroups = groupActivity(panelSubject?.activity ?? buildVisibleActivity(items));
  $: emptyDetails = !panelSubject && !multiSelection && section !== 'storage';
  $: canEditDescription = Boolean(panelSubject);
  $: if (panelSubject?.id !== descriptionItemId) {
    descriptionItemId = panelSubject?.id ?? null;
    draftDescription = panelSubject?.description ?? '';
  }
  $: if (panelSubject?.type === 'file' && shouldLoadPreview(panelSubject)) {
    void loadPanelPreview(panelSubject);
  } else {
    panelPreviewSource = '';
    panelPreviewItemId = null;
  }

  function setTab(tab: InfoPanelTab) {
    dispatch('tab', tab);
  }

  function titleForPanel(
    subject: DriveItem | null,
    selected: DriveItem[],
    hasMultiSelection: boolean,
    folder: DriveItem | null,
    currentSection: Section,
    currentSectionTitle: string
  ) {
    if (subject) return subject.name;
    if (hasMultiSelection) return `${selected.length} itens selecionados`;
    if (folder) return folder.name;
    if (currentSection === 'storage') return 'Armazenamento';
    return currentSectionTitle;
  }

  function subtitleForPanel(
    subject: DriveItem | null,
    selected: DriveItem[],
    hasMultiSelection: boolean,
    folder: DriveItem | null,
    currentSection: Section,
    storageSummary: StorageSummary | null,
    account: UserAccount | null
  ) {
    if (subject) return typeLabel(subject);
    if (hasMultiSelection) return `${selected.filter((entry) => entry.type === 'file').length} arquivos`;
    if (currentSection === 'storage')
      return storageSummary ? `${formatBytes(storageSummary.usedBytes)} usado` : 'Uso de armazenamento';
    if (folder) return 'Pasta';
    return account?.name ?? 'Meu Ride';
  }

  function accountFor(userId?: string | null) {
    if (!userId) return activeAccount;
    return accountLookup.get(userId) ?? activeAccount;
  }

  function actorName(userId?: string | null, selfLabel = 'eu') {
    const user = accountFor(userId);
    if (!user) return selfLabel;
    return user.id === activeAccount?.id ? selfLabel : user.name || user.email;
  }

  function ownerLabel(entry: DriveItem) {
    return actorName(entry.ownerId, 'eu');
  }

  function updatedByLabel(entry: DriveItem) {
    return actorName(entry.updatedById ?? entry.ownerId, 'eu');
  }

  function userAvatar(userId?: string | null) {
    return accountFor(userId) ?? activeAccount;
  }

  function initials(user?: UserAccount | null) {
    return (user?.name || user?.email || 'eu').slice(0, 1).toUpperCase();
  }

  function typeLabel(entry: DriveItem) {
    if (entry.type === 'folder') return 'Pasta';
    const ext = (entry.extension || entry.name.split('.').pop() || '').toLowerCase();
    if (entry.mimeType?.includes('pdf') || ext === 'pdf') return 'PDF';
    if (entry.mimeType?.startsWith('image/')) return 'Imagem';
    if (entry.mimeType?.startsWith('video/')) return 'Vídeo';
    if (entry.mimeType?.startsWith('audio/')) return 'Áudio';
    if (entry.mimeType?.includes('spreadsheet') || ['xls', 'xlsx', 'csv', 'ods'].includes(ext))
      return 'Planilha';
    if (entry.mimeType?.includes('presentation') || ['ppt', 'pptx', 'odp'].includes(ext))
      return 'Apresentação';
    if (entry.mimeType?.includes('word') || ['doc', 'docx', 'odt', 'rtf'].includes(ext)) return 'Documento';
    if (
      entry.mimeType?.startsWith('text/') ||
      ['txt', 'md', 'json', 'xml', 'html', 'css', 'js', 'ts'].includes(ext)
    )
      return 'Texto';
    if (['zip', 'rar', '7z', 'tar', 'gz'].includes(ext)) return 'Arquivo compactado';
    return ext ? ext.toUpperCase() : 'Arquivo';
  }

  function formatDetailBytes(bytes: number) {
    return formatBytes(bytes)
      .replace(/\.0(?=\s)/, '')
      .replace('.', ',');
  }

  function roleLabel(role: DriveItem['linkRole']) {
    if (role === 'editor') return 'pode editar';
    if (role === 'commenter') return 'pode comentar';
    return 'pode ver';
  }

  function accessSummary(entry: DriveItem) {
    const directShares = entry.sharePermissions?.length || entry.sharedWith?.length || 0;
    const ownership = entry.ownerId === activeAccount?.id ? 'Pertence a você.' : `Pertence a ${ownerLabel(entry)}.`;
    if (entry.linkRole) return `${ownership} Qualquer pessoa na internet com o link ${roleLabel(entry.linkRole)}.`;
    if (directShares > 0)
      return `${ownership} Compartilhado com ${directShares} ${directShares === 1 ? 'pessoa' : 'pessoas'}.`;
    if (entry.sharedByAncestor) return 'Acesso herdado da pasta compartilhada.';
    return 'Só você tem acesso a este arquivo.';
  }

  function accessUsers(entry: DriveItem) {
    return [
      accountFor(entry.ownerId),
      ...entry.sharePermissions.map((permission) => accountFor(permission.userId)).filter(Boolean)
    ];
  }

  function rootSectionFor(entry: DriveItem | null = panelSubject): InfoPanelLocation['section'] {
    return entry?.ownerId === activeAccount?.id ? 'drive' : 'shared-with-me';
  }

  function locationChipLabel(folderId: string | null, fallback = rootLabel) {
    if (!folderId) return fallback;
    return folderLookup.get(folderId)?.name ?? fallback;
  }

  function goLocation(folderId: string | null, subject: DriveItem | null = panelSubject) {
    dispatch('location', { folderId, section: rootSectionFor(subject) });
  }

  function openSubject(subject = panelSubject) {
    if (subject) dispatch('openItem', subject);
  }

  function shouldLoadPreview(subject: DriveItem): boolean {
    return Boolean(subject.mimeType?.startsWith('image/') || subject.mimeType?.includes('pdf') || subject.extension === 'pdf');
  }

  async function loadPanelPreview(subject: DriveItem) {
    if (panelPreviewItemId === subject.id && panelPreviewSource) return;
    const run = ++panelPreviewRun;
    panelPreviewItemId = subject.id;
    panelPreviewSource = '';
    try {
      const source = await previewUrl(subject.id);
      if (run === panelPreviewRun && panelPreviewItemId === subject.id) panelPreviewSource = source;
    } catch {
      if (run === panelPreviewRun) panelPreviewSource = '';
    }
  }

  function saveDescription() {
    if (!panelSubject || !canEditDescription) return;
    const normalized = draftDescription.trim();
    const nextDescription = normalized ? normalized.slice(0, DESCRIPTION_LIMIT) : null;
    if ((panelSubject.description ?? null) === nextDescription) return;
    dispatch('saveDescription', { item: panelSubject, description: nextDescription });
  }

  function formatDateOnly(value: string) {
    return new Intl.DateTimeFormat('pt-BR', { day: 'numeric', month: 'short', year: 'numeric' }).format(
      new Date(value)
    );
  }

  function formatDateTime(value: string) {
    const date = new Date(value);
    return new Intl.DateTimeFormat('pt-BR', {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit'
    }).format(date);
  }

  function startOfDay(date: Date) {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate());
  }

  function buildDetailRows(
    currentSection: Section,
    subjectFromSelection: DriveItem | null,
    hasMultiSelection: boolean,
    selected: DriveItem[],
    subject: DriveItem | null,
    storageSummary: StorageSummary | null
  ): DetailRow[] {
    if (currentSection === 'storage' && !subjectFromSelection && !hasMultiSelection) {
      return [
        { label: 'Uso', value: storageSummary ? formatDetailBytes(storageSummary.usedBytes) : '0 B' },
        {
          label: 'Disponível',
          value: storageSummary
            ? formatDetailBytes(Math.max(0, storageSummary.totalBytes - storageSummary.usedBytes))
            : '-'
        },
        { label: 'Total', value: storageSummary ? formatDetailBytes(storageSummary.totalBytes) : '-' },
        { label: 'Arquivos', value: String(storageSummary?.fileCount ?? 0) },
        { label: 'Pastas', value: String(storageSummary?.folderCount ?? 0) }
      ];
    }

    if (hasMultiSelection) {
      const fileCount = selected.filter((entry) => entry.type === 'file').length;
      const folderCount = selected.filter((entry) => entry.type === 'folder').length;
      const totalBytes = selected.reduce((total, entry) => total + entry.size, 0);
      return [
        { label: 'Tipo', value: 'Seleção múltipla' },
        { label: 'Itens', value: String(selected.length) },
        { label: 'Arquivos', value: String(fileCount) },
        { label: 'Pastas', value: String(folderCount) },
        { label: 'Tamanho', value: formatDetailBytes(totalBytes) }
      ];
    }

    if (!subject) {
      return [];
    }

    return [
      { label: 'Tipo', value: typeLabel(subject) },
      { label: 'Tamanho', value: formatDetailBytes(subject.size) },
      { label: 'Armazenamento usado', value: formatDetailBytes(subject.size) },
      { label: 'Proprietário', value: ownerLabel(subject) },
      { label: 'Modificado', value: `${formatDateOnly(subject.updatedAt)} por ${updatedByLabel(subject)}` },
      {
        label: 'Aberto',
        value: subject.openedAt
          ? `${formatDateOnly(subject.openedAt)} por ${actorName(subject.openedById, 'mim')}`
          : 'Nenhum registro',
        muted: !subject.openedAt
      },
      { label: 'Criado em', value: formatDateOnly(subject.createdAt) }
    ];
  }

  function buildVisibleActivity(source: DriveItem[]) {
    return source
      .flatMap((entry) => entry.activity ?? [])
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  function groupLabel(date: Date) {
    const now = new Date();
    if (date.toDateString() === now.toDateString()) return 'Hoje';
    const daysAgo = Math.floor((startOfDay(now).getTime() - startOfDay(date).getTime()) / 86400000);
    if (daysAgo >= 0 && daysAgo < 7) return 'Esta semana';
    if (date.getFullYear() === now.getFullYear()) return 'Este ano';
    if (date.getFullYear() === now.getFullYear() - 1) return 'Ano passado';
    return String(date.getFullYear());
  }

  function groupActivity(activity: DriveActivityEvent[]): ActivityGroup[] {
    const groups = new Map<string, DriveActivityEvent[]>();
    for (const event of [...activity].sort((a, b) => b.createdAt.localeCompare(a.createdAt))) {
      const label = groupLabel(new Date(event.createdAt));
      groups.set(label, [...(groups.get(label) ?? []), event]);
    }
    return Array.from(groups, ([label, rows]) => ({ label, rows }));
  }

  function eventSubject(event: DriveActivityEvent) {
    return panelSubject && panelSubject.id === event.itemId
      ? panelSubject
      : (items.find((entry) => entry.id === event.itemId) ?? panelSubject);
  }

  function activityTitle(event: DriveActivityEvent) {
    const actor = actorName(event.actorId, 'Você');
    if (event.type === 'renamed') return `${actor} renomeou um item`;
    if (event.type === 'moved') return `${actor} moveu 1 item`;
    if (event.type === 'created') return `${actor} criou 1 item em`;
    if (event.type === 'uploaded') return `${actor} fez upload de um item`;
    if (event.type === 'copied') return `${actor} criou uma cópia`;
    if (event.type === 'description_changed') return `${actor} alterou a descrição`;
    if (event.type === 'edited') return `${actor} editou 1 item`;
    if (event.type === 'access_changed') {
      const action = accessAction(event);
      if (action === 'restricted') return `${actor} restringiu o acesso a 1 item`;
      if (action === 'shared') return `${actor} compartilhou um item.`;
      return `${actor} alterou as permissões em um item`;
    }
    if (event.type === 'trashed') return `${actor} moveu para a lixeira`;
    if (event.type === 'restored') return `${actor} restaurou um item`;
    if (event.type === 'spam_changed') return `${actor} alterou o spam`;
    if (event.type === 'starred') return `${actor} adicionou estrela`;
    if (event.type === 'unstarred') return `${actor} removeu estrela`;
    return `${actor} modificou este item`;
  }

  function metadataText(event: DriveActivityEvent, key: string) {
    const value = event.metadata?.[key];
    return typeof value === 'string' ? value : '';
  }

  function metadataNumber(event: DriveActivityEvent, key: string) {
    const value = event.metadata?.[key];
    return typeof value === 'number' ? value : null;
  }

  async function copyPlainText(value: string) {
    const text = value.trim();
    if (!text) return;
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        return;
      }
    } catch {
      // Fall back to the legacy copy path below.
    }
    if (typeof document === 'undefined') return;
    const input = document.createElement('textarea');
    input.value = text;
    input.setAttribute('readonly', '');
    input.style.position = 'fixed';
    input.style.left = '-9999px';
    document.body.appendChild(input);
    input.select();
    try {
      document.execCommand('copy');
    } finally {
      input.remove();
    }
  }

  function accessAction(event: DriveActivityEvent) {
    const action = metadataText(event, 'accessAction');
    if (action) return action;
    if (event.metadata?.linkRole === null || metadataNumber(event, 'directShares') === 0) return 'restricted';
    if (metadataText(event, 'previousLinkRole')) return 'permissions_changed';
    return metadataText(event, 'linkRole') ? 'shared' : 'permissions_changed';
  }

  function accessRoleLabel(role: string) {
    if (role === 'editor') return 'Editor';
    if (role === 'commenter') return 'Comentador';
    return 'Leitor';
  }

  function eventFolderId(event: DriveActivityEvent) {
    return (metadataText(event, 'newParentId') || event.parentId || null) as string | null;
  }

  function eventFolderLabel(event: DriveActivityEvent) {
    return metadataText(event, 'newParentName') || metadataText(event, 'parentName') || event.parentName || rootLabel;
  }

  function eventSourceFolderId(event: DriveActivityEvent) {
    return (metadataText(event, 'oldParentId') || metadataText(event, 'sourceParentId') || null) as string | null;
  }

  function eventSourceFolderLabel(event: DriveActivityEvent) {
    return metadataText(event, 'oldParentName') || metadataText(event, 'sourceParentName') || rootLabel;
  }

  function showActivityLocation(event: DriveActivityEvent) {
    return ['created', 'uploaded', 'moved', 'copied'].includes(event.type);
  }

  function showSourceLocation(event: DriveActivityEvent) {
    if (event.type !== 'moved' && event.type !== 'copied') return false;
    const metadata = event.metadata ?? {};
    return (
      'oldParentId' in metadata ||
      'oldParentName' in metadata ||
      'sourceParentId' in metadata ||
      'sourceParentName' in metadata
    );
  }

  function showAccessActivity(event: DriveActivityEvent) {
    return event.type === 'access_changed';
  }

  function accessActivityRole(event: DriveActivityEvent) {
    return metadataText(event, 'linkRole') || metadataText(event, 'previousLinkRole') || 'reader';
  }
</script>

{#if open}
  <aside
    data-info-panel
    class="flex h-full w-[320px] max-w-[38vw] shrink-0 flex-col rounded-l-2xl border-l border-[#303134] bg-[#131314] text-[#e8eaed]"
    aria-label="Informações"
  >
    <div class="flex min-h-[108px] shrink-0 items-start gap-4 px-5 pb-3 pt-5">
      {#if panelSubject}
        <FileIcon item={panelSubject} size={26} />
      {:else}
        <div class="flex h-[26px] w-[26px] items-center justify-center text-[#c4c7c5]">
          {@render DriveChipIcon(18)}
        </div>
      {/if}
      <button
        class="min-w-0 flex-1 text-left text-[18px] font-medium leading-7 text-[#e8eaed]"
        on:click={() => openSubject()}
        disabled={!panelSubject}
      >
        <span class="line-clamp-3">{title}</span>
      </button>
      <button
        class="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-[#e8eaed] hover:bg-[#2b2c2f]"
        aria-label="Fechar informações"
        on:click={() => dispatch('close')}
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="22"
          height="22"
          viewBox="0 0 24 24"
          fill="currentColor"
        >
          <path
            d="M18.3 5.71 12 12l6.3 6.29-1.41 1.41L10.59 13.41 4.29 19.71 2.88 18.3 9.17 12 2.88 5.71 4.29 4.29l6.3 6.3 6.29-6.3z"
          />
        </svg>
      </button>
    </div>

    <div class="flex h-[58px] shrink-0 border-b border-[#303134] px-5">
      <button
        class="relative flex flex-1 items-center justify-center gap-2 text-[14px] font-medium {activeTab ===
        'details'
          ? 'text-[#a8c7fa]'
          : 'text-[#c4c7c5] hover:text-[#e8eaed]'}"
        on:click={() => setTab('details')}
      >
        <svg
          class="h-[18px] w-[18px] shrink-0"
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"
        >
          <circle cx="12" cy="12" r="9" />
          <path d="M12 11v6" />
          <path d="M12 7h.01" />
        </svg>
        Detalhes
        {#if activeTab === 'details'}
          <span class="absolute bottom-0 left-6 right-6 h-[3px] rounded-t-full bg-[#a8c7fa]"></span>
        {/if}
      </button>
      <button
        class="relative flex flex-1 items-center justify-center gap-2 text-[14px] font-medium {activeTab ===
        'activity'
          ? 'text-[#a8c7fa]'
          : 'text-[#c4c7c5] hover:text-[#e8eaed]'}"
        on:click={() => setTab('activity')}
      >
        <svg
          class="h-[18px] w-[18px] shrink-0"
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="currentColor"
          aria-hidden="true"
        >
          <path d="M13 3a9 9 0 1 0 8.95 10h-2.02A7 7 0 1 1 13 5V3zm1 0v7h7a9 9 0 0 0-7-7zm2 3.08A7.03 7.03 0 0 1 18.92 9H16V6.08zM7 13h2.2l1.3-2.6 2.6 5.2L14.8 13H17v2h-1.1l-3 4.6-2.4-4.8L10.4 15H7v-2z" />
        </svg>
        Atividades
        {#if activeTab === 'activity'}
          <span class="absolute bottom-0 left-6 right-6 h-[3px] rounded-t-full bg-[#a8c7fa]"></span>
        {/if}
      </button>
    </div>

    <div class="min-h-0 flex-1 overflow-y-auto">
      {#if activeTab === 'details'}
        {#if emptyDetails}
          <div class="flex min-h-[360px] flex-col items-center px-6 pt-8 text-center">
            {@render EmptyDetailsIllustration()}
            <p class="mt-5 text-[13px] leading-5 text-[#c4c7c5]">
              Selecione um item para ver os detalhes.
            </p>
          </div>
        {:else}
        {#if panelSubject?.type === 'file'}
          <button
            class="mx-5 mt-4 flex h-[164px] w-[calc(100%-2.5rem)] items-center justify-center overflow-hidden rounded-lg border border-[#5f6368] bg-white text-[#202124]"
            on:click={() => openSubject(panelSubject)}
            aria-label="Abrir arquivo"
          >
            {#if panelSubject.mimeType?.startsWith('image/') && panelPreviewSource}
              <img src={panelPreviewSource} alt="" class="h-full w-full object-cover" />
            {:else if (panelSubject.mimeType?.includes('pdf') || panelSubject.extension === 'pdf') && panelPreviewSource}
              <iframe
                src={panelPreviewSource}
                title={panelSubject.name}
                class="pointer-events-none h-[280px] w-full scale-[0.72] bg-white"
              ></iframe>
            {:else}
              <FileThumbnail item={panelSubject} iconSize={64} />
            {/if}
          </button>
        {:else if panelSubject}
          <button
            class="mx-5 mt-4 flex h-[120px] w-[calc(100%-2.5rem)] flex-col items-center justify-center gap-3 rounded-lg border border-[#3c4043] bg-[#1f1f1f]"
            on:click={() => openSubject(panelSubject)}
            aria-label="Abrir pasta"
          >
            <FileIcon item={panelSubject} size={58} />
            <span class="max-w-[280px] truncate text-[13px] text-[#e8eaed]">{panelSubject.name}</span>
          </button>
        {/if}

        {#if panelSubject}
          <section class="border-b border-[#303134] px-5 py-7">
            <h3 class="text-[18px] font-medium leading-6">Quem pode acessar</h3>
            <div class="mt-4 flex items-center gap-2">
              {#each accessUsers(panelSubject) as user}
                <span
                  class="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full text-[13px] font-medium text-white"
                  style="background:{user?.avatarColor ?? '#1a73e8'}"
                  title={user?.name}
                >
                  {#if user?.avatarUrl}
                    <img src={user.avatarUrl} alt="" class="h-full w-full object-cover" />
                  {:else}
                    {initials(user)}
                  {/if}
                </span>
              {/each}
              {#if panelSubject.linkRole}
                <span class="mx-0.5 h-8 w-px shrink-0 bg-[#5f6368]"></span>
                <span
                  class="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#188038] text-white"
                  title="Qualquer pessoa com o link"
                >
                  {@render GlobeIcon(21)}
                </span>
              {/if}
            </div>
            <p class="mt-3 text-[13px] leading-5 text-[#c4c7c5]">{accessSummary(panelSubject)}</p>
            <button
              class="mt-4 h-10 rounded-full border border-[#8f8f8f] px-6 text-[14px] font-medium text-[#a8c7fa] hover:bg-[#1f1f1f]"
              on:click={() => dispatch('share', panelSubject)}
            >
              Gerenciar o acesso
            </button>
          </section>

          <section class="border-b border-[#303134] px-5 py-7">
            <div class="flex items-center gap-3">
              {@render SecurityIcon(22)}
              <h3 class="text-[18px] font-medium leading-6">Limitações de segurança</h3>
            </div>
            <div class="mt-5 rounded-xl bg-[#1f1f1f] px-4 py-4 text-[13px] leading-5 text-[#e8eaed]">
              <p>Nenhuma limitação foi aplicada</p>
              <p class="mt-2 text-[#c4c7c5]">Se alguma delas se aplicar, vai aparecer aqui</p>
            </div>
          </section>
        {/if}

        <section class="px-5 py-7">
          <h3 class="text-[18px] font-medium leading-6">Detalhes do arquivo</h3>
          {#if detailRows.length === 0}
            <p class="mt-4 text-[13px] leading-5 text-[#c4c7c5]">
              Selecione um arquivo para ver os detalhes.
            </p>
          {:else}
            <dl class="mt-4 space-y-6">
              {#each detailRows as row}
                <div>
                  <dt class="text-[12px] font-medium leading-5 text-[#e8eaed]">{row.label}</dt>
                  <dd
                    class="mt-0.5 whitespace-pre-line text-[14px] leading-5 {row.muted
                      ? 'text-[#9aa0a6]'
                      : 'text-[#c4c7c5]'}"
                  >
                    {row.value}
                  </dd>
                </div>
                {#if row.label === 'Armazenamento usado' && panelSubject}
                  <div>
                    <dt class="text-[12px] font-medium leading-5 text-[#e8eaed]">Local</dt>
                    <dd class="mt-2 flex flex-wrap gap-2">
                      <button
                        class="inline-flex h-9 items-center gap-2 rounded-md border border-[#8f8f8f] px-3 text-[14px] text-[#e8eaed] hover:bg-[#2b2c2f]"
                        on:click={() => goLocation(null)}
                      >
                        {@render DriveChipIcon(16)}
                        {rootLabel}
                      </button>
                    </dd>
                  </div>
                {/if}
              {/each}
            </dl>
          {/if}

          {#if panelSubject}
            <div class="mt-8">
              <label for="info-description" class="text-[12px] font-medium leading-5 text-[#e8eaed]"
                >Descrição</label
              >
              <textarea
                id="info-description"
                class="mt-2 h-10 min-h-10 w-full resize-y rounded border border-[#8f8f8f] bg-[#131314] px-3 py-2 text-[14px] leading-5 text-[#e8eaed] outline-none focus:border-[#a8c7fa]"
                maxlength={DESCRIPTION_LIMIT}
                placeholder="Adicionar descrição"
                bind:value={draftDescription}
                on:blur={saveDescription}
                on:keydown={(event) => {
                  if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
                    event.preventDefault();
                    saveDescription();
                    (event.currentTarget as HTMLTextAreaElement).blur();
                  }
                }}
              ></textarea>
              <p class="mt-1 text-right text-[12px] text-[#c4c7c5]">
                {draftDescription.length}/{DESCRIPTION_LIMIT.toLocaleString('pt-BR')}
              </p>
            </div>
          {/if}
        </section>
        {/if}
      {:else}
        <section class="px-5 py-5">
          {#if activityGroups.length === 0}
            <div class="py-16 text-center text-[13px] text-[#c4c7c5]">Nenhuma atividade recente</div>
          {:else}
            {#each activityGroups as group}
              <h3 class="mb-5 mt-1 text-[17px] font-medium text-[#e8eaed]">{group.label}</h3>
              <ol class="mb-8 space-y-8">
                {#each group.rows as event (event.id)}
                  {@const subject = eventSubject(event)}
                  {@const actor = userAvatar(event.actorId)}
                  <li class="grid grid-cols-[44px_minmax(0,1fr)] gap-4">
                    <span
                      class="mt-1 flex h-9 w-9 items-center justify-center overflow-hidden rounded-full text-[13px] font-medium text-white"
                      style="background:{actor?.avatarColor ?? '#1a73e8'}"
                    >
                      {#if actor?.avatarUrl}
                        <img src={actor.avatarUrl} alt="" class="h-full w-full object-cover" />
                      {:else}
                        {initials(actor)}
                      {/if}
                    </span>
                    <div class="min-w-0">
                      <p class="text-[14px] leading-5 text-[#e8eaed]">{activityTitle(event)}</p>
                      <p class="mt-0.5 text-[12px] leading-4 text-[#c4c7c5]">
                        {formatDateTime(event.createdAt)}
                      </p>
                      <div class="mt-2 flex flex-wrap items-center gap-2">
                        {#if showActivityLocation(event)}
                          <div class="flex w-full flex-col items-start">
                            {#if showSourceLocation(event)}
                              <button
                                class="inline-flex h-8 max-w-[190px] items-center gap-2 rounded-md border border-[#8f8f8f] px-3 text-[13px] text-[#e8eaed] hover:bg-[#2b2c2f]"
                                on:click={() => goLocation(eventSourceFolderId(event), subject)}
                              >
                                {@render DriveChipIcon(15)}
                                <span class="truncate">{eventSourceFolderLabel(event)}</span>
                              </button>
                              <div class="ml-4 flex items-start">
                                <span class="h-4 w-px bg-[#5f6368]"></span>
                                <span class="mt-4 h-px w-4 bg-[#5f6368]"></span>
                                <button
                                  class="mt-2 inline-flex h-8 max-w-[190px] items-center gap-2 rounded-md border border-[#8f8f8f] px-3 text-[13px] text-[#e8eaed] hover:bg-[#2b2c2f]"
                                  on:click={() => goLocation(eventFolderId(event), subject)}
                                >
                                  {@render DriveChipIcon(15)}
                                  <span class="truncate">{eventFolderLabel(event)}</span>
                                </button>
                              </div>
                              <div class="ml-8 flex items-start">
                                <span class="h-4 w-px bg-[#5f6368]"></span>
                                <span class="mt-4 h-px w-4 bg-[#5f6368]"></span>
                                <button
                                  class="mt-2 inline-flex h-8 max-w-[190px] items-center gap-2 rounded-md border border-[#8f8f8f] px-3 text-[13px] text-[#e8eaed] hover:bg-[#2b2c2f]"
                                  on:click={() => subject && dispatch('openItem', subject)}
                                  disabled={!subject}
                                >
                                  {#if subject}
                                    <FileIcon item={subject} size={18} />
                                  {:else}
                                    {@render FileChipIcon(15)}
                                  {/if}
                                  <span class="truncate">{event.itemName}</span>
                                </button>
                              </div>
                            {:else}
                              <button
                                class="inline-flex h-8 max-w-[190px] items-center gap-2 rounded-md border border-[#8f8f8f] px-3 text-[13px] text-[#e8eaed] hover:bg-[#2b2c2f]"
                                on:click={() => goLocation(eventFolderId(event), subject)}
                              >
                                {@render DriveChipIcon(15)}
                                <span class="truncate">{eventFolderLabel(event)}</span>
                              </button>
                              <div class="ml-4 flex items-start">
                                <span class="h-4 w-px bg-[#5f6368]"></span>
                                <span class="mt-4 h-px w-4 bg-[#5f6368]"></span>
                                <button
                                  class="mt-2 inline-flex h-8 max-w-[190px] items-center gap-2 rounded-md border border-[#8f8f8f] px-3 text-[13px] text-[#e8eaed] hover:bg-[#2b2c2f]"
                                  on:click={() => subject && dispatch('openItem', subject)}
                                  disabled={!subject}
                                >
                                  {#if subject}
                                    <FileIcon item={subject} size={18} />
                                  {:else}
                                    {@render FileChipIcon(15)}
                                  {/if}
                                  <span class="truncate">{event.itemName}</span>
                                </button>
                              </div>
                            {/if}
                          </div>
                        {:else}
                          <button
                            class="inline-flex h-8 max-w-[210px] items-center gap-2 rounded-md border border-[#8f8f8f] px-3 text-[13px] text-[#e8eaed] hover:bg-[#2b2c2f]"
                            on:click={() => subject && dispatch('openItem', subject)}
                            disabled={!subject}
                          >
                            {#if subject}
                              <FileIcon item={subject} size={18} />
                            {:else}
                              {@render FileChipIcon(15)}
                            {/if}
                            <span class="truncate">{event.itemName}</span>
                          </button>
                        {/if}
                        {#if showAccessActivity(event)}
                          {@const restricted = accessAction(event) === 'restricted'}
                          <div class="mt-1 flex w-full items-start gap-2">
                            <span class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#188038] text-white">
                              {@render GlobeIcon(18)}
                            </span>
                            <span class="min-w-0 text-[13px] leading-5 text-[#e8eaed]">
                              <span class:line-through={restricted} class="block font-medium">
                                Qualquer pessoa na Internet<br />com o link
                              </span>
                              {#if !restricted}
                                <span class="block text-[#c4c7c5]">{accessRoleLabel(accessActivityRole(event))}</span>
                              {/if}
                            </span>
                          </div>
                        {/if}
                      </div>
                      {#if event.type === 'renamed' && metadataText(event, 'oldName')}
                        <button
                          type="button"
                          class="ml-8 mt-2 block max-w-[210px] cursor-copy truncate text-left text-[13px] text-[#c4c7c5] line-through hover:text-[#e8eaed] focus:outline-none focus-visible:rounded-sm focus-visible:ring-2 focus-visible:ring-[#a8c7fa]"
                          title={metadataText(event, 'oldName')}
                          aria-label={`Copiar título anterior: ${metadataText(event, 'oldName')}`}
                          on:click={() => void copyPlainText(metadataText(event, 'oldName'))}
                        >
                          {metadataText(event, 'oldName')}
                        </button>
                      {/if}
                    </div>
                  </li>
                {/each}
              </ol>
            {/each}
          {/if}
        </section>
      {/if}
    </div>
  </aside>
{/if}

{#snippet InfoCircleIcon(size: number)}
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="currentColor"
    aria-hidden="true"
  >
    <path
      d="M11 17h2v-6h-2v6zm0-8h2V7h-2v2zm1-7C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2z"
    />
  </svg>
{/snippet}

{#snippet SecurityIcon(size: number)}
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="currentColor"
    class="text-[#c4c7c5]"
    aria-hidden="true"
  >
    <path
      d="M12 1 4 4.6v5.5c0 5.08 3.41 9.82 8 11.2 4.59-1.38 8-6.12 8-11.2V4.6L12 1zm0 2.2 6 2.67v4.23c0 3.95-2.49 7.74-6 9.08-3.51-1.34-6-5.13-6-9.08V5.87l6-2.67zm-1 5.8v6h2V9h-2zm0 8h2v-2h-2v2z"
    />
  </svg>
{/snippet}

{#snippet DriveChipIcon(size: number)}
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="currentColor"
    class="text-[#c4c7c5]"
    aria-hidden="true"
  >
    <path d="M4 5h16v14H4V5zm2 2v10h12V7H6zm2 8h8l-2.55-3.4-1.95 2.52L10.2 12.4 8 15z" />
  </svg>
{/snippet}

{#snippet GlobeIcon(size: number)}
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="currentColor"
    aria-hidden="true"
  >
    <path
      d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm6.93 6h-2.95a15.4 15.4 0 0 0-1.38-3.12A8.03 8.03 0 0 1 18.93 8zM12 4.04A14.1 14.1 0 0 1 13.91 8h-3.82A14.1 14.1 0 0 1 12 4.04zM4.26 14a8.3 8.3 0 0 1 0-4h3.33a16.5 16.5 0 0 0 0 4H4.26zm.81 2h2.95c.34 1.12.8 2.17 1.38 3.12A8.03 8.03 0 0 1 5.07 16zm2.95-8H5.07A8.03 8.03 0 0 1 9.4 4.88 15.4 15.4 0 0 0 8.02 8zM12 19.96A14.1 14.1 0 0 1 10.09 16h3.82A14.1 14.1 0 0 1 12 19.96zM14.34 14H9.66a14.71 14.71 0 0 1 0-4h4.68a14.71 14.71 0 0 1 0 4zm.26 5.12c.58-.95 1.04-2 1.38-3.12h2.95a8.03 8.03 0 0 1-4.33 3.12zM16.41 14a16.5 16.5 0 0 0 0-4h3.33a8.3 8.3 0 0 1 0 4h-3.33z"
    />
  </svg>
{/snippet}

{#snippet EmptyDetailsIllustration()}
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="190"
    height="170"
    viewBox="0 0 190 170"
    aria-hidden="true"
  >
    <path
      d="M49 121c-18-13-18-42 3-55 13-8 30-6 41 3 8-19 34-22 47-6 8 10 8 24 1 34 17 1 29 14 28 30-1 17-16 29-34 29H74c-8 0-17-2-25-7"
      fill="none"
      stroke="#1f1f1f"
      stroke-width="1.2"
    />
    <circle cx="67" cy="47" r="13" fill="#1e8e3e" />
    <rect x="100" y="90" width="49" height="45" rx="7" fill="#fdd7d7" />
    <path d="M92 18h50l28 28v66H92V18z" fill="#cfe8f8" stroke="#111315" stroke-width="1.5" />
    <path d="M142 18v28h28" fill="#fff" stroke="#111315" stroke-width="1.5" />
    <path d="M106 55h47M106 71h47M106 87h31" stroke="#78909c" stroke-width="2" />
    <circle cx="96" cy="95" r="34" fill="none" stroke="#fbbc04" stroke-width="10" />
    <path d="m119 121 24 38" stroke="#fbbc04" stroke-width="10" stroke-linecap="round" />
    <circle cx="96" cy="95" r="25" fill="#131314" opacity=".82" />
  </svg>
{/snippet}

{#snippet FileChipIcon(size: number)}
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="currentColor"
    class="text-[#c4c7c5]"
    aria-hidden="true"
  >
    <path d="M14 2H6c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V8l-6-6zm-1 7V3.5L18.5 9H13z" />
  </svg>
{/snippet}
