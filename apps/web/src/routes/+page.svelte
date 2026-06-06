<script lang="ts">
  import { onMount } from 'svelte';
  import AccountDropdown from '$lib/components/AccountDropdown.svelte';
  import AdminPanel from '$lib/components/AdminPanel.svelte';
  import AdvancedSearchDialog from '$lib/components/AdvancedSearchDialog.svelte';
  import AndroidDrive from '$lib/components/AndroidDrive.svelte';
  import Breadcrumbs from '$lib/components/Breadcrumbs.svelte';
  import ContextMenu from '$lib/components/ContextMenu.svelte';
  import Dialog from '$lib/components/Dialog.svelte';
  import EmptyState from '$lib/components/EmptyState.svelte';
  import FileGrid from '$lib/components/FileGrid.svelte';
  import FilePreview from '$lib/components/FilePreview.svelte';
  import InfoPanel, { type InfoPanelLocation, type InfoPanelTab } from '$lib/components/InfoPanel.svelte';
  import LoginPage from '$lib/components/LoginPage.svelte';
  import ModifiedFilterMenu, { type ModifiedFilterPreset } from '$lib/components/ModifiedFilterMenu.svelte';
  import MoveDialog from '$lib/components/MoveDialog.svelte';
  import PersonalView from '$lib/components/PersonalView.svelte';
  import PreferencesPanel from '$lib/components/PreferencesPanel.svelte';
  import ProfileModal from '$lib/components/ProfileModal.svelte';
  import ShareDialog from '$lib/components/ShareDialog.svelte';
  import Sidebar from '$lib/components/Sidebar.svelte';
  import ServerSetup from '$lib/components/ServerSetup.svelte';
  import StorageView from '$lib/components/StorageView.svelte';
  import Topbar from '$lib/components/Topbar.svelte';
  import UploadDropzone from '$lib/components/UploadDropzone.svelte';
  import UploadStatusPanel from '$lib/components/UploadStatusPanel.svelte';
  import {
    defaultAdvancedSearchFilters,
    hasAdvancedSearchFilters,
    type AdvancedSearchFilters
  } from '$lib/advanced-search';
  import {
    clearAllStoredSessions,
    clearNotifications as clearNotificationsApi,
    copyItem,
    createFolder,
    deleteItem,
    getAdminStats,
    buildShareUrl,
    getBreadcrumbs,
    getDriveServerDisplayUrl,
    getItem,
    getActiveStoredSession,
    getMe,
    getOfficeConfig,
    getStoredSessions,
    getToken,
    hasConfiguredDriveServerUrl,
    isApiConnectionError,
    isNativeMobileApp,
    listNotifications,
    getPdfInfo,
    getSummary,
    downloadUrl,
    listAccounts,
    listFolders,
    listItems,
    logout,
    markItemOpened,
    markNotificationsRead,
    removeStoredSession,
    pdfPageUrl,
    previewUrl,
    saveStoredSession,
    sectionTitles,
    setActiveStoredSession,
    shareItemAccess,
    shareItem,
    updateProfile,
    updateStoredSessionUser,
    updateItem,
    uploadFile,
    type StoredDriveSession
  } from '$lib/api';
  import {
    availableTypeFilters,
    filterItemsByModified,
    filterItemsByType,
    type TypeFilterId,
    typeFilterOptions
  } from '$lib/drive-page/filters';
  import {
    createBlankOfficeFile,
    officeCreateFileName,
    officeCreateOption,
    type OfficeCreateKind
  } from '$lib/office-create';
  import { buildOnlyOfficeStandaloneUrl } from '$lib/office-host';
  import { getOfflineFile, listOfflineFiles, saveOfflineFile } from '$lib/offline-drive';
  import {
    defaultDrivePreferences,
    readDrivePreferences,
    type DrivePreferences
  } from '$lib/preferences';
  import type {
    AdminStats,
    DriveItem,
    DriveNotification,
    FolderOrder,
    Section,
    SortDirection,
    SortField,
    SharePermission,
    StorageSummary,
    UserAccount,
    ViewMode
  } from '$lib/types';

  // Auth
  let currentUser: UserAccount | null = null;
  let authChecked = false;
  let needsServerSetup = false;
  let nativeMobileApp = false;
  let loggedSessions: StoredDriveSession[] = [];
  let addingAccount = false;
  let loginPageKey = 0;
  let androidAvatarVersion = 0;
  let realtimeRefreshTimer: ReturnType<typeof setInterval> | null = null;
  let reconnecting = false;

  // Data
  let accounts: UserAccount[] = [];
  let activeAccountId = '';
  let items: DriveItem[] = [];
  let offlineItems: DriveItem[] = [];
  let allFolders: DriveItem[] = [];
  let breadcrumbs: DriveItem[] = [];
  let summary: StorageSummary | null = null;
  let adminStats: AdminStats | null = null;
  let drivePreferences: DrivePreferences = { ...defaultDrivePreferences };
  let loadedPreferenceAccountId = '';

  // Navigation
  let currentFolderId: string | null = null;
  let section: Section = 'drive';
  let query = '';
  let appliedQuery = '';
  let viewMode: ViewMode = 'list';
  let sortField: SortField = 'name';
  let sortDirection: SortDirection = 'asc';
  let folderOrder: FolderOrder = 'first';
  let ownerFilterId = 'all';
  let typeFilterId: TypeFilterId = 'all';
  let modifiedFilterPreset: ModifiedFilterPreset = 'all';
  let modifiedFilterAfter: string | null = null;
  let modifiedFilterBefore: string | null = null;
  let advancedSearchFilters: AdvancedSearchFilters | null = null;
  let peopleSearch = '';
  let selectedIds: string[] = [];
  let lastSelectedId: string | null = null;

  // UI state
  let loading = true;
  let contentReady = false;
  let refreshRun = 0;
  let accountSwitchRun = 0;
  let uploading = false;
  let uploadPanelVisible = false;
  let uploadPanelCollapsed = false;
  let uploadTasks: UploadTask[] = [];
  let uploadCancelRequested = false;
  let uploadAbortController: AbortController | null = null;
  let dragActive = false;
  let adminOpen = false;
  let adminInitialTab: 'overview' | 'users' | 'security' | 'jobs' | 'backups' = 'overview';
  let preferencesOpen = false;
  let advancedSearchOpen = false;
  let profileOpen = false;
  let accountDropdownVisible = false;
  let notifications: DriveNotification[] = [];
  let notificationsOpen = false;
  let sidebarOpen = true;
  let previewItem: DriveItem | null = null;
  let offlinePreviewItem: DriveItem | null = null;
  let offlinePreviewUrl = '';
  let offlinePreviewPdfUrls: string[] = [];
  let offlinePreviewPdfWidth: number | null = null;
  let offlinePreviewPdfHeight: number | null = null;
  let shareDialogItem: DriveItem | null = null;
  let infoPanelOpen = false;
  let infoPanelTab: InfoPanelTab = 'details';
  let infoPanelItemId: string | null = null;
  let selectedMenuVisible = false;
  let typeFilterMenuOpen = false;
  let peopleFilterMenuOpen = false;
  let modifiedFilterMenuOpen = false;
  let selectedMenuX = 0;
  let selectedMenuY = 0;
  let error = '';
  let serverOffline = false;
  let fileInput: HTMLInputElement;
  let imageInput: HTMLInputElement;
  let folderInput: HTMLInputElement;
  let searchPreviewTimer: ReturnType<typeof setTimeout>;
  let searchPreviewItems: DriveItem[] = [];
  let searchPreviewOpen = false;
  let marqueeActive = false;
  let marqueePending = false;
  let marqueeStartX = 0;
  let marqueeStartY = 0;
  let marqueeCurrentX = 0;
  let marqueeCurrentY = 0;
  let marqueeBaseIds: string[] = [];
  let marqueeAdditive = false;
  let marqueeBounds: { left: number; top: number; right: number; bottom: number } | null = null;
  let suppressSurfaceClick = false;
  let popstateHandler: (() => void) | null = null;
  let itemClipboard: { mode: 'copy' | 'cut'; items: DriveItem[] } | null = null;
  let snackbarVisible = false;
  let snackbarMessage = '';
  let snackbarActionLabel = '';
  let snackbarAction: (() => void | Promise<void>) | null = null;
  let snackbarTimer: ReturnType<typeof setTimeout> | null = null;
  let lastUndo: UndoRecord | null = null;
  let undoStorageKeyValue = '';
  let pendingAndroidSharedFiles: AndroidSharedFile[] = [];
  let pendingAndroidOpenItemId = '';
  let androidActionItem: DriveItem | null = null;
  let androidActionItemKey = 0;
  const handledAndroidShareIds = new Set<string>();

  type AndroidDownloadBridge = {
    saveBase64?: (payload: string) => void;
    shareBase64?: (payload: string) => void;
    requestShortcut?: (payload: string) => void;
    consumeOpenPayload?: () => string;
  };

  type AndroidBackWindow = Window &
    typeof globalThis & {
      RideAndroidBack?: () => boolean;
    };

  type RouteTarget = {
    section: Section;
    folderId: string | null;
    fileId: string | null;
    query: string;
  };

  type UploadTask = {
    id: string;
    name: string;
    mimeType: string;
    extension: string;
    status: 'pending' | 'uploading' | 'done' | 'error' | 'canceled';
    error?: string;
  };

  type AndroidSharedFile = {
    name: string;
    mimeType?: string;
    base64: string;
    size?: number;
  };

  type AndroidSharedPayload = {
    id?: string;
    files?: AndroidSharedFile[];
  };

  type AndroidDownloadResult = {
    id?: string;
    name?: string;
    uri?: string;
    message?: string;
  };

  type AndroidOpenPayload = {
    id?: string;
    message?: string;
  };

  type UndoRecord =
    | { id: string; accountId: string; type: 'delete-created'; itemIds: string[] }
    | { id: string; accountId: string; type: 'trash'; itemIds: string[] }
    | {
        id: string;
        accountId: string;
        type: 'restore';
        items: Array<{ id: string; trashed: boolean; spam: boolean }>;
      }
    | {
        id: string;
        accountId: string;
        type: 'move';
        items: Array<{ id: string; parentId: string | null; name?: string }>;
      }
    | { id: string; accountId: string; type: 'rename'; itemId: string; name: string }
    | { id: string; accountId: string; type: 'star'; itemId: string; starred: boolean }
    | { id: string; accountId: string; type: 'spam'; itemId: string; spam: boolean };

  type UndoRecordInput<T> = T extends UndoRecord ? Omit<T, 'id' | 'accountId'> : never;
  type NewUndoRecord = UndoRecordInput<UndoRecord>;

  const routeSections = new Set<Section>([
    'personal',
    'workspace',
    'shared-with-me',
    'recent',
    'starred',
    'offline',
    'spam',
    'trash',
    'storage'
  ]);
  const localSessionIndex = 0;

  /** Decodes route segments defensively so malformed URLs fall back to safe navigation. */
  function decodePathPart(value: string | undefined): string | null {
    if (!value) return null;
    try {
      return decodeURIComponent(value);
    } catch {
      return null;
    }
  }

  /** Converts every supported Ride URL shape into one internal navigation target. */
  function parseRoute(): RouteTarget {
    if (typeof window === 'undefined') {
      return { section: defaultStartSection(), folderId: null, fileId: null, query: '' };
    }

    const parts = window.location.pathname.split('/').filter(Boolean);
    const queryValue = new URLSearchParams(window.location.search).get('q') ?? '';

    if (parts[0] === 'drive' && parts[1] === 'u') {
      const scopedTarget = parts[3];
      if (!scopedTarget || scopedTarget === 'home') {
        return { section: defaultStartSection(), folderId: null, fileId: null, query: queryValue };
      }
      if (scopedTarget === 'files') {
        return { section: 'drive', folderId: null, fileId: decodePathPart(parts[4]), query: '' };
      }
      if (scopedTarget === 'folders') {
        return { section: 'drive', folderId: decodePathPart(parts[4]), fileId: null, query: queryValue };
      }
      const maybeScopedSection = decodePathPart(scopedTarget) as Section | null;
      if (maybeScopedSection && routeSections.has(maybeScopedSection)) {
        return {
          section: maybeScopedSection,
          folderId: parts[4] === 'folders' ? decodePathPart(parts[5]) : null,
          fileId: null,
          query: queryValue
        };
      }
      return { section: defaultStartSection(), folderId: null, fileId: null, query: queryValue };
    }

    if (parts[0] === 'files') {
      return { section: 'drive', folderId: null, fileId: decodePathPart(parts[1]), query: '' };
    }

    if (parts[0] === 'drive') {
      return {
        section: parts[1] ? 'drive' : defaultStartSection(),
        folderId: parts[1] === 'folders' ? decodePathPart(parts[2]) : null,
        fileId: null,
        query: queryValue
      };
    }

    const maybeSection = decodePathPart(parts[0]) as Section | null;
    if (maybeSection && routeSections.has(maybeSection)) {
      return {
        section: maybeSection,
        folderId: parts[1] === 'folders' ? decodePathPart(parts[2]) : null,
        fileId: null,
        query: queryValue
      };
    }

    return { section: defaultStartSection(), folderId: null, fileId: null, query: queryValue };
  }

  /** Applies the per-account start-page preference when the URL points to home. */
  function defaultStartSection(): Section {
    return drivePreferences.startPage === 'drive' ? 'drive' : 'personal';
  }

  /** Loads session-scoped preferences for the active account. */
  function loadPreferencesForAccount(accountId = activeAccountId) {
    drivePreferences = readDrivePreferences(accountId);
    loadedPreferenceAccountId = accountId;
  }

  /** Applies saved preferences immediately after settings panels change them. */
  function applyDrivePreferences(preferences: DrivePreferences) {
    drivePreferences = preferences;
    loadedPreferenceAccountId = activeAccountId;
  }

  /** Builds canonical Ride URLs without leaking internal folder state into unrelated sections. */
  function pathForRoute(fileId: string | null = previewItem?.id ?? null): string {
    const params = new URLSearchParams();
    if (appliedQuery.trim() && !fileId) params.set('q', appliedQuery.trim());

    const sessionBase = `/drive/u/${localSessionIndex}`;
    let path = `${sessionBase}/home`;
    if (fileId) {
      path = `${sessionBase}/files/${encodeURIComponent(fileId)}`;
    } else if (section === 'drive') {
      path = currentFolderId ? `${sessionBase}/folders/${encodeURIComponent(currentFolderId)}` : `${sessionBase}/home`;
    } else if (currentFolderId && section === 'shared-with-me') {
      path = `${sessionBase}/${section}/folders/${encodeURIComponent(currentFolderId)}`;
    } else {
      path = `${sessionBase}/${section}`;
    }

    const qs = params.toString();
    return qs ? `${path}?${qs}` : path;
  }

  /** Replaces browser history during initial route sync or silent state correction. */
  function replaceUrl(fileId: string | null = previewItem?.id ?? null) {
    if (typeof window === 'undefined') return;
    const next = pathForRoute(fileId);
    if (`${window.location.pathname}${window.location.search}` !== next) {
      window.history.replaceState({}, '', next);
    }
  }

  /** Pushes browser history for user-driven navigation. */
  function pushUrl(fileId: string | null = previewItem?.id ?? null) {
    if (typeof window === 'undefined') return;
    const next = pathForRoute(fileId);
    if (`${window.location.pathname}${window.location.search}` !== next) {
      window.history.pushState({}, '', next);
    }
  }

  function viewModeKey(accountId = activeAccountId) {
    return `ride:viewMode:${accountId || 'default'}`;
  }

  function loadStoredViewMode(accountId = activeAccountId): ViewMode {
    if (typeof sessionStorage === 'undefined') return 'list';
    const stored = sessionStorage.getItem(viewModeKey(accountId));
    return stored === 'grid' || stored === 'list' ? stored : 'list';
  }

  function setViewMode(mode: ViewMode) {
    viewMode = mode;
    if (typeof sessionStorage !== 'undefined') sessionStorage.setItem(viewModeKey(), mode);
  }

  // Move dialog
  let movingItem: DriveItem | null = null;
  let movingItems: DriveItem[] = [];
  let moveFolders: DriveItem[] = [];
  let selectedMoveFolderId: string | null = null;

  // Context menu
  let ctxVisible = false;
  let ctxX = 0;
  let ctxY = 0;
  let ctxItem: DriveItem | null = null;
  let createMenuFromTitle = false;

  // Styled dialog (replaces window.prompt / window.confirm)
  let dlgVisible = false;
  let dlgType: 'prompt' | 'confirm' = 'confirm';
  let dlgTitle = '';
  let dlgMessage = '';
  let dlgDefault = '';
  let dlgPlaceholder = '';
  let dlgConfirmLabel = 'OK';
  let dlgDanger = false;
  let dlgResolve: ((v: string | null) => void) | null = null;

  function showPrompt(title: string, defaultValue = '', placeholder = ''): Promise<string | null> {
    return new Promise((resolve) => {
      dlgType = 'prompt';
      dlgTitle = title;
      dlgDefault = defaultValue;
      dlgPlaceholder = placeholder;
      dlgMessage = '';
      dlgDanger = false;
      dlgConfirmLabel = 'OK';
      dlgVisible = true;
      dlgResolve = resolve;
    });
  }

  function showConfirm(title: string, message = '', danger = false): Promise<boolean> {
    return new Promise((resolve) => {
      dlgType = 'confirm';
      dlgTitle = title;
      dlgMessage = message;
      dlgDefault = '';
      dlgDanger = danger;
      dlgConfirmLabel = danger ? 'Excluir' : 'OK';
      dlgVisible = true;
      dlgResolve = (v) => {
        resolve(v !== null);
      };
    });
  }

  function dlgConfirm(value: string) {
    dlgVisible = false;
    dlgResolve?.(value);
    dlgResolve = null;
  }
  function dlgCancel() {
    dlgVisible = false;
    dlgResolve?.(null);
    dlgResolve = null;
  }

  function ownerNameFor(item: DriveItem, accountList: UserAccount[]) {
    return (
      accountList.find((account) => account.id === item.ownerId)?.name ??
      accountList.find((account) => account.id === item.ownerId)?.email ??
      ''
    );
  }

  function sortAndFilterItems(
    source: DriveItem[],
    field: SortField,
    direction: SortDirection,
    folderMode: FolderOrder,
    ownerId: string,
    accountList: UserAccount[]
  ) {
    const filtered =
      ownerId === 'all'
        ? source
        : ownerId === 'link'
          ? source.filter((item) => Boolean(item.linkRole))
          : source.filter((item) => item.ownerId === ownerId);
    const factor = direction === 'asc' ? 1 : -1;
    return [...filtered].sort((a, b) => {
      if (folderMode === 'first' && a.type !== b.type) return a.type === 'folder' ? -1 : 1;

      let result = 0;
      if (field === 'name') {
        result = a.name.localeCompare(b.name, 'pt-BR', { sensitivity: 'base', numeric: true });
      } else if (field === 'owner') {
        result = ownerNameFor(a, accountList).localeCompare(ownerNameFor(b, accountList), 'pt-BR', {
          sensitivity: 'base',
          numeric: true
        });
      } else if (field === 'modified') {
        result = new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime();
      } else if (field === 'size') {
        result = a.size - b.size;
      }

      return result === 0
        ? a.name.localeCompare(b.name, 'pt-BR', { sensitivity: 'base', numeric: true })
        : result * factor;
    });
  }

  function recentTime(item: DriveItem) {
    const time = new Date(item.updatedAt || item.createdAt).getTime();
    return Number.isFinite(time) ? time : 0;
  }

  function sortRecentItems(source: DriveItem[]) {
    return [...source].sort((a, b) => {
      const result = recentTime(b) - recentTime(a);
      return result || a.name.localeCompare(b.name, 'pt-BR', { sensitivity: 'base', numeric: true });
    });
  }

  function setSort(field: SortField, direction?: SortDirection) {
    if (sortField === field && !direction) {
      sortDirection = sortDirection === 'asc' ? 'desc' : 'asc';
    } else {
      sortField = field;
      sortDirection = direction ?? (field === 'modified' || field === 'size' ? 'desc' : 'asc');
    }
    clearSelection();
  }

  function setOwnerFilter(id: string) {
    ownerFilterId = id;
    peopleFilterMenuOpen = false;
    if (sortField === 'owner') sortDirection = 'asc';
    clearSelection();
  }

  function personFilterLabel() {
    if (ownerFilterId === 'all') return 'Pessoas';
    if (ownerFilterId === 'link') return 'Qualquer pessoa com o link';
    const account = accounts.find((item) => item.id === ownerFilterId);
    return account?.id === activeAccountId ? `${account.name} (eu)` : account?.name || 'Pessoas';
  }

  function closeFilterMenus() {
    typeFilterMenuOpen = false;
    peopleFilterMenuOpen = false;
    modifiedFilterMenuOpen = false;
  }

  function toggleTypeFilterMenu() {
    const shouldOpen = !typeFilterMenuOpen;
    closeFilterMenus();
    typeFilterMenuOpen = shouldOpen;
  }

  function togglePeopleFilterMenu() {
    const shouldOpen = !peopleFilterMenuOpen;
    closeFilterMenus();
    peopleFilterMenuOpen = shouldOpen;
  }

  function handleModifiedFilterOpen() {
    typeFilterMenuOpen = false;
    peopleFilterMenuOpen = false;
  }

  function filteredPeopleOptions() {
    const term = peopleSearch.trim().toLowerCase();
    const uniqueAccounts = Array.from(new Map(accounts.map((account) => [account.id, account])).values());
    if (!term) return uniqueAccounts;
    return uniqueAccounts.filter((account) =>
      `${account.name} ${account.email}`.toLowerCase().includes(term)
    );
  }

  function setFolderOrder(next: FolderOrder) {
    folderOrder = next;
    clearSelection();
  }

  function applyModifiedFilter(detail: {
    preset: ModifiedFilterPreset;
    after: string | null;
    before: string | null;
  }) {
    modifiedFilterPreset = detail.preset;
    modifiedFilterAfter = detail.after;
    modifiedFilterBefore = detail.before;
    clearSelection();
    void refresh();
  }

  function clearModifiedFilter() {
    modifiedFilterPreset = 'all';
    modifiedFilterAfter = null;
    modifiedFilterBefore = null;
    clearSelection();
    void refresh();
  }

  function setTypeFilter(id: TypeFilterId) {
    typeFilterId = id;
    typeFilterMenuOpen = false;
    clearSelection();
    void refresh();
  }

  function isTextEditingTarget(target: EventTarget | null) {
    if (!(target instanceof HTMLElement)) return false;
    const tagName = target.tagName.toLowerCase();
    return (
      target.isContentEditable ||
      tagName === 'input' ||
      tagName === 'textarea' ||
      tagName === 'select'
    );
  }

  function shortcutsBlocked(e: KeyboardEvent) {
    return (
      isTextEditingTarget(e.target) ||
      dlgVisible ||
      profileOpen ||
      adminOpen ||
      preferencesOpen ||
      accountDropdownVisible ||
      ctxVisible ||
      Boolean(previewItem)
    );
  }

  function canPasteHere() {
    return section === 'personal' || section === 'drive' || section === 'workspace' || section === 'shared-with-me';
  }

  function pasteParentId() {
    return section === 'drive' || section === 'workspace' || section === 'shared-with-me' ? currentFolderId : null;
  }

  function locationName(parentId: string | null) {
    if (!parentId) return 'Meu Ride';
    return allFolders.find((folder) => folder.id === parentId)?.name ?? 'Pasta';
  }

  function folderPathFor(folderId: string | null, terminal?: DriveItem) {
    if (!folderId) return [];
    const source = terminal ? [...allFolders, ...items, ...breadcrumbs, terminal] : [...allFolders, ...items, ...breadcrumbs];
    const lookup = new Map(source.map((item) => [item.id, item]));
    const path: DriveItem[] = [];
    const seen = new Set<string>();
    let nextId: string | null = folderId;
    while (nextId && !seen.has(nextId)) {
      seen.add(nextId);
      const folder = lookup.get(nextId);
      if (!folder) return terminal ? [...breadcrumbs.filter((item) => item.id !== terminal.id), terminal] : breadcrumbs;
      path.unshift(folder);
      nextId = folder.parentId;
    }
    return path;
  }

  function topLevelItems(targets: DriveItem[]) {
    const selected = new Set(targets.map((item) => item.id));
    const lookup = new Map([...allFolders, ...items, ...targets].map((item) => [item.id, item]));
    return targets.filter((item) => {
      let parentId = item.parentId;
      while (parentId) {
        if (selected.has(parentId)) return false;
        parentId = lookup.get(parentId)?.parentId ?? null;
      }
      return true;
    });
  }

  function closeSnackbar() {
    snackbarVisible = false;
    snackbarMessage = '';
    snackbarActionLabel = '';
    snackbarAction = null;
    if (snackbarTimer) {
      clearTimeout(snackbarTimer);
      snackbarTimer = null;
    }
  }

  function showSnackbar(
    message: string,
    actionLabel = '',
    action: (() => void | Promise<void>) | null = null
  ) {
    if (snackbarTimer) clearTimeout(snackbarTimer);
    snackbarMessage = message;
    snackbarActionLabel = actionLabel;
    snackbarAction = action;
    snackbarVisible = true;
    snackbarTimer = setTimeout(closeSnackbar, 6500);
  }

  async function runSnackbarAction() {
    const action = snackbarAction;
    closeSnackbar();
    await action?.();
  }

  /** Switches the UI into offline mode without discarding the stored session. */
  function notifyServerOffline() {
    if (serverOffline) return;
    serverOffline = true;
    showSnackbar('Servidor offline. Sua sessão foi mantida.', 'Trocar servidor', configureServer);
  }

  /** Handles API failures consistently, distinguishing connectivity from business errors. */
  function handleApiFailure(ex: unknown, fallback: string) {
    if (isApiConnectionError(ex)) {
      notifyServerOffline();
      return true;
    }
    error = ex instanceof Error ? ex.message : fallback;
    return false;
  }

  function canUseFolderContextFor(sectionValue = section, queryValue = appliedQuery) {
    return ['personal', 'drive', 'workspace', 'shared-with-me'].includes(sectionValue) && !queryValue;
  }

  /** Avoids background refresh while user actions or invisible tabs would make it disruptive. */
  function canRealtimeRefresh() {
    return Boolean(
      currentUser &&
        activeAccountId &&
        authChecked &&
        !serverOffline &&
        !loading &&
        !uploading &&
        !movingItem &&
        movingItems.length === 0 &&
        !needsServerSetup &&
        typeof document !== 'undefined' &&
        document.visibilityState !== 'hidden'
    );
  }

  /** Revalidates the stored token after a connection returns and refreshes visible data. */
  async function restoreOnlineSession() {
    if (reconnecting || needsServerSetup) return;
    const token = getToken();
    if (!token) return;
    reconnecting = true;

    try {
      const user = await getMe();
      currentUser = user;
      saveStoredSession(token, user);
      loggedSessions = getStoredSessions();
      if (!activeAccountId) activeAccountId = user.id;
      serverOffline = false;
      if (snackbarMessage.startsWith('Servidor offline')) closeSnackbar();

      await refreshAccounts();
      if (section === 'offline') {
        showSnackbar('Conexão restaurada.');
        return;
      }
      await refresh({ silent: true });
      showSnackbar('Conexão restaurada.');
    } catch (ex) {
      if (isApiConnectionError(ex)) {
        serverOffline = true;
        loading = false;
        contentReady = true;
        return;
      }
      handleApiFailure(ex, 'Não foi possível restaurar a sessão.');
    } finally {
      reconnecting = false;
    }
  }

  function clearVisibleList() {
    items = [];
    selectedIds = [];
    lastSelectedId = null;
  }

  /** Periodic refresh entrypoint that first attempts reconnection when the server is offline. */
  function refreshRealtime() {
    if (serverOffline) {
      void restoreOnlineSession();
      return;
    }
    if (currentUser) void refreshNotifications();
    if (canRealtimeRefresh()) void refresh({ silent: true });
  }

  /** Loads notifications without making notification failures block the file list. */
  async function refreshNotifications() {
    if (!currentUser) {
      notifications = [];
      return;
    }
    try {
      notifications = await listNotifications();
    } catch (ex) {
      if (isApiConnectionError(ex)) notifyServerOffline();
    }
  }

  /** Opens notifications and optimistically marks unread entries as read. */
  async function toggleNotifications() {
    notificationsOpen = !notificationsOpen;
    accountDropdownVisible = false;
    if (!notificationsOpen) return;
    await refreshNotifications();
    if (!notifications.some((notification) => !notification.readAt)) return;
    const readAt = new Date().toISOString();
    notifications = notifications.map((notification) => notification.readAt ? notification : { ...notification, readAt });
    try {
      await markNotificationsRead();
    } catch (ex) {
      if (isApiConnectionError(ex)) notifyServerOffline();
    }
  }

  async function clearNotifications() {
    try {
      await clearNotificationsApi();
      notifications = [];
      notificationsOpen = false;
    } catch (ex) {
      handleApiFailure(ex, 'Não foi possível limpar as notificações.');
    }
  }

  /** Opens a notification target, fetching it when it is outside the current list. */
  function openNotification(notification: DriveNotification) {
    notificationsOpen = false;
    if (!notification.itemId) return;
    const item = items.find((current) => current.id === notification.itemId) ?? allFolders.find((current) => current.id === notification.itemId);
    if (item) {
      void openItem(item);
      return;
    }
    void (async () => {
      try {
        const fetched = await getItem(notification.itemId as string);
        await openItem(fetched);
      } catch (ex) {
        handleApiFailure(ex, 'Não foi possível abrir o item da notificação.');
      }
    })();
  }

  /** Scopes undo records by signed-in user and active Ride account. */
  function undoStorageKey(accountId = activeAccountId) {
    return currentUser && accountId ? `ride:undo:${currentUser.id}:${accountId}` : '';
  }

  function loadUndoFromSession() {
    const key = undoStorageKey();
    if (!key || typeof sessionStorage === 'undefined') {
      lastUndo = null;
      return;
    }

    try {
      const stored = sessionStorage.getItem(key);
      lastUndo = stored ? (JSON.parse(stored) as UndoRecord) : null;
      if (lastUndo?.accountId !== activeAccountId) lastUndo = null;
    } catch {
      lastUndo = null;
    }
  }

  function clearStoredUndo(id?: string) {
    if (id && lastUndo?.id !== id) return;
    const key = undoStorageKey(lastUndo?.accountId ?? activeAccountId);
    lastUndo = null;
    if (key && typeof sessionStorage !== 'undefined') sessionStorage.removeItem(key);
  }

  /** Persists the last undoable mutation so it survives a soft refresh in the same session. */
  function recordUndo(record: NewUndoRecord) {
    if (!activeAccountId) return null;
    const undo = {
      ...record,
      id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      accountId: activeAccountId
    } as UndoRecord;
    lastUndo = undo;
    const key = undoStorageKey();
    if (key && typeof sessionStorage !== 'undefined') sessionStorage.setItem(key, JSON.stringify(undo));
    return undo;
  }

  /** Replays the inverse operation for the supported single-step undo actions. */
  async function undoRecord(record: UndoRecord) {
    if (record.accountId !== activeAccountId) return;
    if (record.type === 'delete-created') {
      for (const id of record.itemIds) await deleteItem(id, true);
    } else if (record.type === 'trash') {
      for (const id of record.itemIds) await updateItem(id, { trashed: false, spam: false });
    } else if (record.type === 'restore') {
      for (const item of record.items) await updateItem(item.id, { trashed: item.trashed, spam: item.spam });
    } else if (record.type === 'move') {
      for (const item of record.items) await updateItem(item.id, { parentId: item.parentId, name: item.name });
    } else if (record.type === 'rename') {
      await updateItem(record.itemId, { name: record.name });
    } else if (record.type === 'star') {
      await updateItem(record.itemId, { starred: record.starred });
    } else if (record.type === 'spam') {
      await updateItem(record.itemId, { spam: record.spam });
    }
  }

  async function undoLastChange(id?: string) {
    const record = id && lastUndo?.id !== id ? null : lastUndo;
    if (!record) return;
    try {
      await undoRecord(record);
      clearStoredUndo(record.id);
      closeSnackbar();
      clearSelection();
      await refresh();
    } catch (ex) {
      error = ex instanceof Error ? ex.message : 'Não foi possível desfazer a última alteração.';
    }
  }

  function showUndoSnackbar(message: string, record: UndoRecord | null) {
    showSnackbar(message, 'Desfazer', record ? () => undoLastChange(record.id) : null);
  }

  function copySelectionToInternalClipboard(mode: 'copy' | 'cut') {
    const targets = topLevelItems(selectedItems).filter((item) => !item.trashed && !item.spam);
    if (!targets.length) return;
    itemClipboard = { mode, items: targets };
    selectedMenuVisible = false;
    showSnackbar(
      targets.length === 1
        ? `Item ${mode === 'copy' ? 'copiado' : 'recortado'} para a área de transferência.`
        : `Itens ${mode === 'copy' ? 'copiados' : 'recortados'} para a área de transferência.`,
      'Saiba mais'
    );
  }

  async function pasteInternalClipboard() {
    if (!itemClipboard || !itemClipboard.items.length || !canPasteHere()) return;
    const targetParentId = pasteParentId();
    selectedMenuVisible = false;
    error = '';

    try {
      if (itemClipboard.mode === 'cut') {
        const moved = itemClipboard.items.map((item) => ({
          item,
          previousParentId: item.parentId,
          previousName: item.name
        }));
        for (const { item } of moved) {
          await updateItem(item.id, { parentId: targetParentId });
        }
        selectedIds = moved.map(({ item }) => item.id);
        itemClipboard = null;
        const undo = recordUndo({
          type: 'move',
          items: moved.map(({ item, previousParentId, previousName }) => ({
            id: item.id,
            parentId: previousParentId,
            name: previousName
          }))
        });
        showUndoSnackbar(
          moved.length === 1
            ? `O item ${moved[0].item.name} foi movido de "${locationName(moved[0].previousParentId)}" para "${locationName(targetParentId)}".`
            : `${moved.length} itens foram movidos para "${locationName(targetParentId)}".`,
          undo
        );
      } else {
        const copied: DriveItem[] = [];
        for (const item of itemClipboard.items) {
          copied.push(await copyItem(item.id, targetParentId));
        }
        selectedIds = copied.map((item) => item.id);
        const undo = recordUndo({ type: 'delete-created', itemIds: copied.map((item) => item.id) });
        showUndoSnackbar(
          copied.length === 1 ? `Criou "${copied[0].name}".` : `Criou ${copied.length} itens.`,
          undo
        );
      }
      lastSelectedId = selectedIds.at(-1) ?? null;
      await refresh();
    } catch (ex) {
      error = ex instanceof Error ? ex.message : 'Falha ao colar itens.';
    }
  }

  function handleGlobalKeydown(e: KeyboardEvent) {
    const key = e.key.toLowerCase();
    const mod = e.ctrlKey || e.metaKey;

    if (!shortcutsBlocked(e) && mod && key === 'z' && !e.shiftKey) {
      e.preventDefault();
      void undoLastChange();
      return;
    }

    if (!shortcutsBlocked(e) && mod && key === 'a') {
      e.preventDefault();
      selectedIds = selectableItems.map((item) => item.id);
      lastSelectedId = selectedIds.at(-1) ?? null;
      selectedMenuVisible = false;
      return;
    }

    if (!shortcutsBlocked(e) && mod && key === 'c') {
      e.preventDefault();
      copySelectionToInternalClipboard('copy');
      return;
    }

    if (!shortcutsBlocked(e) && mod && key === 'x') {
      e.preventDefault();
      copySelectionToInternalClipboard('cut');
      return;
    }

    if (!shortcutsBlocked(e) && mod && key === 'v') {
      e.preventDefault();
      void pasteInternalClipboard();
      return;
    }

    if (!shortcutsBlocked(e) && (e.key === 'Delete' || e.key === 'Backspace')) {
      if (selectedItems.length > 0) {
        e.preventDefault();
        if (section === 'trash') void hardDeleteSelected();
        else void trashSelected();
      }
      return;
    }

    if (shortcutsBlocked(e)) return;

    if (e.key === 'F2' && selectedItems.length > 0) {
      e.preventDefault();
      const target =
        (lastSelectedId && selectedItems.find((item) => item.id === lastSelectedId)) ?? selectedItems.at(-1);
      if (target) void rename(target);
    }
    if (e.key === 'Escape') {
      if (typeFilterMenuOpen) typeFilterMenuOpen = false;
      else if (peopleFilterMenuOpen) peopleFilterMenuOpen = false;
      else if (modifiedFilterMenuOpen) modifiedFilterMenuOpen = false;
      else if (selectedMenuVisible) selectedMenuVisible = false;
      else if (selectedItems.length > 0) clearSelection();
    }
  }

  $: loggedAccounts = loggedSessions.map((session) => session.user);
  $: activeAccount = (() => {
    const listed = accounts.find((a) => a.id === activeAccountId) ?? null;
    if (currentUser?.id === activeAccountId && listed) return { ...listed, ...currentUser };
    return listed ?? currentUser ?? null;
  })();
  $: activeAvatarUrl =
    activeAccount?.avatarUrl ??
    (currentUser?.id === activeAccountId ? currentUser.avatarUrl : null) ??
    loggedSessions.find((session) => session.user.id === activeAccountId)?.user.avatarUrl ??
    null;
  $: pageTitle = sectionTitles[section];
  $: canUseFolderContext = ['personal', 'drive', 'workspace', 'shared-with-me'].includes(section) && !appliedQuery;
  $: advancedSearchActive = hasAdvancedSearchFilters(advancedSearchFilters);
  $: showInitialLoading = loading && !contentReady;
  $: isAdmin = currentUser?.role === 'admin';
  $: typeFilterSource = section === 'personal' ? [...allFolders, ...items] : items;
  $: visibleTypeFilterOptions = availableTypeFilters(typeFilterSource, typeFilterId);
  $: activeTypeFilter = typeFilterOptions.find((option) => option.id === typeFilterId) ?? null;
  $: typeFilteredItems = filterItemsByType(items, typeFilterId);
  $: typeFilteredFolders = filterItemsByType(allFolders, typeFilterId);
  $: modifiedFilteredItems = filterItemsByModified(
    typeFilteredItems,
    modifiedFilterPreset,
    modifiedFilterAfter,
    modifiedFilterBefore
  );
  $: modifiedFilteredFolders = filterItemsByModified(
    typeFilteredFolders,
    modifiedFilterPreset,
    modifiedFilterAfter,
    modifiedFilterBefore
  );
  $: displayedItems = sortAndFilterItems(
    modifiedFilteredItems,
    sortField,
    sortDirection,
    folderOrder,
    ownerFilterId,
    accounts
  );
  $: recentItems = sortRecentItems(modifiedFilteredItems);
  $: viewItems = section === 'recent' ? recentItems : displayedItems;
  $: androidActionsHidden =
    nativeMobileApp &&
    Boolean(
      previewItem ||
        offlinePreviewItem ||
        profileOpen ||
        preferencesOpen ||
        shareDialogItem ||
        movingItem ||
        movingItems.length
    );
  $: selectableItems =
    section === 'offline'
      ? offlineItems
      : section === 'recent'
        ? recentItems
        : section === 'personal'
          ? Array.from(
              new Map([...modifiedFilteredFolders, ...modifiedFilteredItems].map((item) => [item.id, item])).values()
            )
          : viewItems;
  $: selectedItems = selectableItems.filter((item) => selectedIds.includes(item.id));
  $: androidItems =
    section === 'offline'
      ? offlineItems
      : section === 'personal'
        ? modifiedFilteredItems
        : section === 'recent'
          ? recentItems
          : viewItems;
  $: if (infoPanelOpen && selectedItems.length === 1 && infoPanelItemId !== selectedItems[0].id) {
    infoPanelItemId = selectedItems[0].id;
  }
  $: if (infoPanelOpen && selectedItems.length > 1 && infoPanelItemId !== null) {
    infoPanelItemId = null;
  }
  $: infoPanelItem = findInfoItem(infoPanelItemId);
  $: infoPanelCurrentFolder = findInfoItem(currentFolderId);
  $: previewFiles = viewItems.filter((item) => item.type === 'file');
  $: if (currentUser && activeAccountId && pendingAndroidOpenItemId) {
    const id = pendingAndroidOpenItemId;
    pendingAndroidOpenItemId = '';
    void openFileRoute(id, true);
  }
  $: marqueeState = marqueeActive
    ? {
        active: marqueeActive,
        left: Math.min(marqueeStartX, marqueeCurrentX),
        top: Math.min(marqueeStartY, marqueeCurrentY),
        width: Math.abs(marqueeCurrentX - marqueeStartX),
        height: Math.abs(marqueeCurrentY - marqueeStartY),
        baseIds: marqueeBaseIds,
        additive: marqueeAdditive
      }
    : null;
  $: {
    const key = undoStorageKey();
    if (key && key !== undoStorageKeyValue) {
      undoStorageKeyValue = key;
      loadUndoFromSession();
    }
  }

  onMount(() => {
    nativeMobileApp = isNativeMobileApp();
    const androidBackWindow = window as AndroidBackWindow;
    androidBackWindow.RideAndroidBack = handleAndroidBackButton;
    const sharedFilesHandler = (event: Event) => {
      handleAndroidSharedFiles((event as CustomEvent<unknown>).detail);
    };
    const downloadCompleteHandler = (event: Event) => {
      const detail = parseAndroidDownloadResult((event as CustomEvent<unknown>).detail);
      showSnackbar(detail?.name ? `${detail.name} salvo em Downloads/Ride.` : 'Download salvo.');
    };
    const downloadErrorHandler = (event: Event) => {
      const detail = parseAndroidDownloadResult((event as CustomEvent<unknown>).detail);
      showSnackbar(detail?.message || 'Não foi possível salvar o download.');
    };
    const shareErrorHandler = (event: Event) => {
      const detail = parseAndroidDownloadResult((event as CustomEvent<unknown>).detail);
      showSnackbar(detail?.message || 'Não foi possível abrir o compartilhamento.');
    };
    const shortcutResultHandler = (event: Event) => {
      const detail = parseAndroidDownloadResult((event as CustomEvent<unknown>).detail);
      showSnackbar(detail?.message || 'Atalho enviado para a tela inicial.');
    };
    const openItemHandler = (event: Event) => {
      handleAndroidOpenItem((event as CustomEvent<unknown>).detail);
    };
    const foregroundRefreshHandler = () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
      processAndroidOpenPayload();
      if (serverOffline) {
        void restoreOnlineSession();
        return;
      }
      refreshRealtime();
    };
    const onlineHandler = () => {
      void restoreOnlineSession();
    };
    popstateHandler = () => {
      if (currentUser && activeAccountId) void applyRouteFromLocation(false);
    };
    window.addEventListener('popstate', popstateHandler);
    window.addEventListener('ride-shared-files', sharedFilesHandler);
    window.addEventListener('ride-download-complete', downloadCompleteHandler);
    window.addEventListener('ride-download-error', downloadErrorHandler);
    window.addEventListener('ride-share-error', shareErrorHandler);
    window.addEventListener('ride-shortcut-result', shortcutResultHandler);
    window.addEventListener('ride-shortcut-error', shareErrorHandler);
    window.addEventListener('ride-open-item', openItemHandler);
    processAndroidOpenPayload();
    window.addEventListener('focus', foregroundRefreshHandler);
    window.addEventListener('online', onlineHandler);
    document.addEventListener('visibilitychange', foregroundRefreshHandler);
    realtimeRefreshTimer = setInterval(refreshRealtime, nativeMobileApp ? 4500 : 8000);

    if (nativeMobileApp && !hasConfiguredDriveServerUrl()) {
      needsServerSetup = true;
      authChecked = true;
      return () => {
        if (androidBackWindow.RideAndroidBack === handleAndroidBackButton) delete androidBackWindow.RideAndroidBack;
        if (popstateHandler) window.removeEventListener('popstate', popstateHandler);
        window.removeEventListener('ride-shared-files', sharedFilesHandler);
        window.removeEventListener('ride-download-complete', downloadCompleteHandler);
        window.removeEventListener('ride-download-error', downloadErrorHandler);
        window.removeEventListener('ride-share-error', shareErrorHandler);
        window.removeEventListener('ride-shortcut-result', shortcutResultHandler);
        window.removeEventListener('ride-shortcut-error', shareErrorHandler);
        window.removeEventListener('ride-open-item', openItemHandler);
        window.removeEventListener('focus', foregroundRefreshHandler);
        window.removeEventListener('online', onlineHandler);
        document.removeEventListener('visibilitychange', foregroundRefreshHandler);
        if (realtimeRefreshTimer) clearInterval(realtimeRefreshTimer);
      };
    }

    void initializeAuth();

    return () => {
      if (androidBackWindow.RideAndroidBack === handleAndroidBackButton) delete androidBackWindow.RideAndroidBack;
      if (popstateHandler) window.removeEventListener('popstate', popstateHandler);
      window.removeEventListener('ride-shared-files', sharedFilesHandler);
      window.removeEventListener('ride-download-complete', downloadCompleteHandler);
      window.removeEventListener('ride-download-error', downloadErrorHandler);
      window.removeEventListener('ride-share-error', shareErrorHandler);
      window.removeEventListener('ride-shortcut-result', shortcutResultHandler);
      window.removeEventListener('ride-shortcut-error', shareErrorHandler);
      window.removeEventListener('ride-open-item', openItemHandler);
      window.removeEventListener('focus', foregroundRefreshHandler);
      window.removeEventListener('online', onlineHandler);
      document.removeEventListener('visibilitychange', foregroundRefreshHandler);
      if (realtimeRefreshTimer) clearInterval(realtimeRefreshTimer);
    };
  });

  function handleAndroidBackButton() {
    if (!nativeMobileApp) return false;

    if (shareDialogItem) {
      shareDialogItem = null;
      return true;
    }
    if (offlinePreviewItem) {
      closeOfflinePreview();
      return true;
    }
    if (movingItem || movingItems.length) {
      movingItem = null;
      movingItems = [];
      return true;
    }
    if (infoPanelOpen) {
      infoPanelOpen = false;
      return true;
    }
    if (profileOpen) {
      profileOpen = false;
      return true;
    }
    if (accountDropdownVisible) {
      accountDropdownVisible = false;
      return true;
    }
    if (preferencesOpen) {
      preferencesOpen = false;
      return true;
    }
    if (adminOpen) {
      adminOpen = false;
      return true;
    }
    if (ctxVisible) {
      ctxVisible = false;
      createMenuFromTitle = false;
      return true;
    }
    if (selectedMenuVisible) {
      selectedMenuVisible = false;
      return true;
    }
    if (searchPreviewOpen) {
      searchPreviewOpen = false;
      return true;
    }
    if (typeFilterMenuOpen || peopleFilterMenuOpen || modifiedFilterMenuOpen) {
      typeFilterMenuOpen = false;
      peopleFilterMenuOpen = false;
      modifiedFilterMenuOpen = false;
      return true;
    }

    const closeDetail = { handled: false };
    window.dispatchEvent(new CustomEvent('ride-android-close', { detail: closeDetail }));
    if (closeDetail.handled) return true;

    const hasRouteState = Boolean(previewItem || offlinePreviewItem || currentFolderId || section !== 'personal' || query.trim() || appliedQuery.trim());
    if (hasRouteState && window.history.length > 1) {
      window.history.back();
      return true;
    }
    if (currentFolderId) {
      const parentFolderId = breadcrumbs.length > 1 ? breadcrumbs[breadcrumbs.length - 2].id : null;
      openFolder(parentFolderId);
      return true;
    }
    return false;
  }

  /** Restores auth, route state, preferences, notifications, and pending Android intents on boot. */
  async function initializeAuth() {
      const initialRoute = parseRoute();
      section = initialRoute.section;
      currentFolderId = initialRoute.folderId;
      query = initialRoute.query;

      try {
        getActiveStoredSession();
        const token = getToken();
        if (!token) {
          authChecked = true;
          currentUser = null;
          loggedSessions = getStoredSessions();
          return;
        }

        currentUser = await getMe();
        serverOffline = false;
        saveStoredSession(token, currentUser);
        loggedSessions = getStoredSessions();
        authChecked = true;
        await refreshAccounts();
        await refreshNotifications();
        viewMode = loadStoredViewMode();
        await applyRouteFromLocation(true);
        processAndroidSharedFiles();
      } catch (ex) {
        const storedSession = getActiveStoredSession();
        if (isApiConnectionError(ex) && storedSession) {
          authChecked = true;
          currentUser = storedSession.user;
          loggedSessions = getStoredSessions();
          accounts = [storedSession.user];
          activeAccountId = storedSession.user.id;
          loadPreferencesForAccount(storedSession.user.id);
          loading = false;
          contentReady = true;
          notifyServerOffline();
          return;
        }
        authChecked = true;
        currentUser = null;
        loggedSessions = getStoredSessions();
      }
  }

  function configureServer() {
    addingAccount = false;
    accountDropdownVisible = false;
    preferencesOpen = false;
    authChecked = true;
    needsServerSetup = true;
  }

  function handleServerConfigured() {
    needsServerSetup = false;
    authChecked = false;
    currentUser = null;
    loggedSessions = [];
    loginPageKey += 1;
    serverOffline = false;
    void initializeAuth();
  }

  function cancelServerSetup() {
    needsServerSetup = false;
    authChecked = true;
  }

  async function applyRouteFromLocation(replace = false) {
    if (!activeAccountId) return;
    const route = parseRoute();
    query = route.query;
    appliedQuery = route.query;
    searchPreviewOpen = false;
    searchPreviewItems = [];
    ownerFilterId = 'all';
    clearSelection();

    if (route.fileId) {
      await openFileRoute(route.fileId, replace);
      return;
    }

    previewItem = null;
    section = route.section;
    currentFolderId = route.folderId;
    clearVisibleList();
    if ((route.section === 'drive' || route.section === 'shared-with-me') && route.folderId) {
      await openFolderRoute(route.folderId, replace, route.section);
      return;
    }
    if (section === 'storage') {
      sortField = 'size';
      sortDirection = 'desc';
    }
    viewMode = loadStoredViewMode();
    await refresh();
    if (replace) replaceUrl(null);
  }

  function findKnownFolder(folderId: string | null) {
    if (!folderId) return null;
    return (
      items.find((item) => item.id === folderId) ??
      allFolders.find((item) => item.id === folderId) ??
      breadcrumbs.find((item) => item.id === folderId) ??
      null
    );
  }

  function sectionForFolder(folder: DriveItem | string | null, fallback: Section = 'drive'): Section {
    if (!folder) return 'drive';
    const item = typeof folder === 'string' ? findKnownFolder(folder) : folder;
    if (!item) return fallback === 'shared-with-me' ? 'shared-with-me' : 'drive';
    return item.ownerId === activeAccountId ? 'drive' : 'shared-with-me';
  }

  function sectionForItem(item: DriveItem): Section {
    if (item.trashed) return 'trash';
    if (item.spam) return 'spam';
    return item.ownerId === activeAccountId ? 'drive' : 'shared-with-me';
  }

  async function openFolderRoute(folderId: string, replace = false, preferredSection: Section = 'drive') {
    error = '';
    try {
      const item = await getItem(folderId);
      if (item.type !== 'folder') {
        await openFileRoute(folderId, replace);
        return;
      }
      section = sectionForFolder(item, preferredSection);
      currentFolderId = item.id;
      query = '';
      appliedQuery = '';
      searchPreviewOpen = false;
      searchPreviewItems = [];
      ownerFilterId = 'all';
      viewMode = loadStoredViewMode();
      clearVisibleList();
      await refresh();
      if (replace) replaceUrl(null);
    } catch (ex) {
      currentFolderId = null;
      error = ex instanceof Error ? ex.message : 'Não foi possível abrir a pasta.';
      await refresh();
    }
  }

  async function openFileRoute(fileId: string, replace = false) {
    error = '';
    try {
      const item = await getItem(fileId);
      const targetSection = sectionForItem(item);
      const canUseFolderRoute = targetSection === 'drive' || targetSection === 'shared-with-me';

      section = targetSection;
      currentFolderId = canUseFolderRoute ? (item.type === 'folder' ? item.id : item.parentId) : null;
      query = '';
      appliedQuery = '';
      searchPreviewOpen = false;
      searchPreviewItems = [];
      ownerFilterId = 'all';
      viewMode = loadStoredViewMode();
      clearVisibleList();
      await refresh();
      previewItem = item.type === 'file' ? item : null;
      if (previewItem) {
        searchPreviewOpen = false;
        searchPreviewItems = [];
      }
      if (item.type === 'file') void markOpenedInBackground(item);
      if (item.type === 'folder') {
        if (replace) replaceUrl(null);
        return;
      }
      if (replace) replaceUrl(item.id);
    } catch (ex) {
      previewItem = null;
      error = ex instanceof Error ? ex.message : 'Não foi possível abrir o arquivo.';
      await refresh();
    }
  }

  function handleLoginSuccess(event: CustomEvent<{ user: UserAccount; token: string }>) {
    resetDriveState();
    addingAccount = false;
    currentUser = event.detail.user;
    serverOffline = false;
    loggedSessions = getStoredSessions();
    void refreshAccounts()
      .then(() => refreshNotifications())
      .then(() => {
        viewMode = loadStoredViewMode();
        return applyRouteFromLocation(true);
      })
      .then(() => {
        processAndroidSharedFiles();
      })
      .catch((ex) => {
        loading = false;
        contentReady = true;
        handleApiFailure(ex, 'Não foi possível carregar sua conta.');
      });
  }

  function resetDriveState() {
    accounts = [];
    activeAccountId = '';
    loadedPreferenceAccountId = '';
    drivePreferences = { ...defaultDrivePreferences };
    items = [];
    allFolders = [];
    breadcrumbs = [];
    summary = null;
    adminStats = null;
    notifications = [];
    notificationsOpen = false;
    loading = true;
    contentReady = false;
    refreshRun += 1;
    currentFolderId = null;
    section = 'personal';
    query = '';
    appliedQuery = '';
    typeFilterId = 'all';
    ownerFilterId = 'all';
    modifiedFilterPreset = 'all';
    modifiedFilterAfter = null;
    modifiedFilterBefore = null;
    advancedSearchFilters = null;
    peopleSearch = '';
    typeFilterMenuOpen = false;
    peopleFilterMenuOpen = false;
    modifiedFilterMenuOpen = false;
    sortField = 'name';
    sortDirection = 'asc';
    folderOrder = 'first';
    clearTimeout(searchPreviewTimer);
    searchPreviewOpen = false;
    searchPreviewItems = [];
    viewMode = loadStoredViewMode();
    clearSelection();
    movingItem = null;
    movingItems = [];
    moveFolders = [];
    selectedMoveFolderId = null;
    ctxVisible = false;
    ctxItem = null;
    previewItem = null;
    selectedMenuVisible = false;
    itemClipboard = null;
    lastUndo = null;
    undoStorageKeyValue = '';
    closeSnackbar();
    error = '';
  }

  function resetDriveViewForAccount(accountId: string) {
    refreshRun += 1;
    items = [];
    allFolders = [];
    breadcrumbs = [];
    summary = null;
    adminStats = null;
    notifications = [];
    notificationsOpen = false;
    loading = true;
    contentReady = false;
    activeAccountId = accountId;
    loadPreferencesForAccount(accountId);
    currentFolderId = null;
    section = 'drive';
    query = '';
    appliedQuery = '';
    typeFilterId = 'all';
    ownerFilterId = 'all';
    modifiedFilterPreset = 'all';
    modifiedFilterAfter = null;
    modifiedFilterBefore = null;
    advancedSearchFilters = null;
    peopleSearch = '';
    typeFilterMenuOpen = false;
    peopleFilterMenuOpen = false;
    modifiedFilterMenuOpen = false;
    sortField = 'name';
    sortDirection = 'asc';
    folderOrder = 'first';
    clearTimeout(searchPreviewTimer);
    searchPreviewOpen = false;
    searchPreviewItems = [];
    viewMode = loadStoredViewMode(accountId);
    clearSelection();
    movingItem = null;
    movingItems = [];
    moveFolders = [];
    selectedMoveFolderId = null;
    ctxVisible = false;
    ctxItem = null;
    previewItem = null;
    shareDialogItem = null;
    selectedMenuVisible = false;
    accountDropdownVisible = false;
    profileOpen = false;
    preferencesOpen = false;
    itemClipboard = null;
    lastUndo = null;
    undoStorageKeyValue = '';
    error = '';
  }

  async function handleLogout() {
    const sessions = getStoredSessions();
    if (sessions.length) {
      for (const session of sessions) {
        setActiveStoredSession(session.user.id);
        await logout();
      }
    } else {
      await logout();
    }
    clearAllStoredSessions();
    loggedSessions = [];
    currentUser = null;
    authChecked = true;
    addingAccount = false;
    loginPageKey += 1;
    resetDriveState();
  }

  function handleProjectResetToSetup() {
    clearAllStoredSessions();
    loggedSessions = [];
    currentUser = null;
    authChecked = true;
    addingAccount = false;
    profileOpen = false;
    adminOpen = false;
    resetDriveState();
    loginPageKey += 1;
    if (typeof window !== 'undefined') window.history.replaceState({}, '', '/');
  }

  function knownAccountsForCurrentUser() {
    const known = new Map<string, UserAccount>();
    for (const session of getStoredSessions()) known.set(session.user.id, session.user);
    if (currentUser) known.set(currentUser.id, currentUser);
    return Array.from(known.values());
  }

  async function refreshAccounts() {
    if (!currentUser) return;
    const accountId = currentUser.id;
    const currentIsAdmin = currentUser.role === 'admin';
    loggedSessions = getStoredSessions();
    if (currentIsAdmin) {
      const [nextAccounts, nextStats] = await Promise.all([listAccounts(), getAdminStats()]);
      if (currentUser?.id !== accountId) return;
      accounts = nextAccounts;
      adminStats = nextStats;
    } else {
      const nextAccounts = await listAccounts().catch(() => knownAccountsForCurrentUser());
      if (currentUser?.id !== accountId) return;
      accounts = nextAccounts;
      adminStats = null;
    }
    const updatedSelf = accounts.find((account) => account.id === accountId);
    if (updatedSelf) {
      currentUser = updatedSelf;
      updateStoredSessionUser(updatedSelf);
      loggedSessions = getStoredSessions();
    }
    activeAccountId = accountId;
    if (loadedPreferenceAccountId !== accountId) loadPreferencesForAccount(accountId);
    serverOffline = false;
  }

  async function openAdminPanel(
    initialTab: 'overview' | 'users' | 'security' | 'jobs' | 'backups' = 'overview'
  ) {
    await refreshAccounts().catch(() => undefined);
    if (currentUser?.role !== 'admin') return;
    adminInitialTab = initialTab;
    adminOpen = true;
    await refreshAdminPanelData();
  }

  function openSettingsPanel() {
    notificationsOpen = false;
    if (currentUser?.role === 'admin' && !nativeMobileApp) {
      preferencesOpen = false;
      void openAdminPanel('overview');
      return;
    }
    preferencesOpen = true;
  }

  async function refresh(options: { silent?: boolean } = {}) {
    if (!activeAccountId) return;
    if (section === 'offline') {
      await loadOfflineLibrary(options);
      return;
    }
    const runId = ++refreshRun;
    const requestSection = section;
    const requestFolderId = currentFolderId;
    const requestQuery = appliedQuery;
    const canUseRequestFolderContext = canUseFolderContextFor(requestSection, requestQuery);
    if (!options.silent) loading = true;
    if (!options.silent) error = '';
    try {
      const deepFilter =
        (typeFilterId !== 'all' || modifiedFilterPreset !== 'all') &&
        (requestSection === 'drive' || requestSection === 'shared-with-me') &&
        !requestQuery;
      const params = advancedSearchActive
        ? advancedSearchParams()
        : {
        ownerId: activeAccountId,
        section: requestSection === 'personal' ? 'recent' : requestSection,
        q: requestQuery,
        parentId: requestSection === 'personal' ? undefined : canUseRequestFolderContext ? requestFolderId : undefined,
        deep: deepFilter ? true : undefined
      };
      const [nextItems, nextSummary, nextBreadcrumbs, nextFolders] = await Promise.all([
        listItems(params),
        getSummary(activeAccountId),
        !advancedSearchActive && canUseRequestFolderContext && requestFolderId && requestSection !== 'personal'
          ? getBreadcrumbs(requestFolderId)
          : Promise.resolve([]),
        listFolders(activeAccountId)
      ]);
      if (runId !== refreshRun) return;
      items = nextItems;
      summary = nextSummary;
      breadcrumbs = nextBreadcrumbs;
      allFolders = nextFolders;
      serverOffline = false;
      const visibleItems =
        section === 'personal'
          ? Array.from(new Map([...allFolders, ...items].map((item) => [item.id, item])).values())
          : items;
      selectedIds = selectedIds.filter((id) => visibleItems.some((item) => item.id === id));
      if (lastSelectedId && !selectedIds.includes(lastSelectedId))
        lastSelectedId = selectedIds.at(-1) ?? null;
    } catch (ex) {
      if (runId !== refreshRun) return;
      if (isApiConnectionError(ex)) {
        notifyServerOffline();
        return;
      }
      error = ex instanceof Error ? ex.message : 'Falha ao carregar arquivos.';
    } finally {
      if (runId === refreshRun) {
        loading = false;
        contentReady = true;
      }
    }
  }

  /** Merges one updated item into every visible cache that may currently reference it. */
  function mergeUpdatedItem(updated: DriveItem) {
    items = items.map((item) => (item.id === updated.id ? updated : item));
    allFolders = allFolders.map((item) => (item.id === updated.id ? updated : item));
    breadcrumbs = breadcrumbs.map((item) => (item.id === updated.id ? updated : item));
    searchPreviewItems = searchPreviewItems.map((item) => (item.id === updated.id ? updated : item));
    if (previewItem?.id === updated.id) previewItem = updated;
    if (shareDialogItem?.id === updated.id) shareDialogItem = updated;
  }

  /** Records recent/opened metadata without blocking the preview transition. */
  async function markOpenedInBackground(item: DriveItem) {
    if (item.type !== 'file') return;
    try {
      const updated = await markItemOpened(item.id);
      mergeUpdatedItem(updated);
    } catch {
      // Opening the preview should not fail just because activity metadata could not be saved.
    }
  }

  async function saveInfoDescription(detail: { item: DriveItem; description: string | null }) {
    const updated = await updateItem(detail.item.id, { description: detail.description });
    mergeUpdatedItem(updated);
    await refresh({ silent: true });
  }

  function openInfoLocation(detail: InfoPanelLocation) {
    section = detail.section;
    openFolder(detail.folderId);
  }

  /** Updates search text and starts a short debounce for preview suggestions. */
  function handleSearch(value: string) {
    query = value;
    advancedSearchFilters = null;
    searchPreviewOpen = value.trim().length > 0;
    clearSelection();
    clearTimeout(searchPreviewTimer);
    if (value.trim()) {
      searchPreviewTimer = setTimeout(() => {
        void refreshSearchPreview(value);
      }, 120);
    } else {
      searchPreviewItems = [];
    }
  }

  /** Loads a small suggestion set while guarding against stale async responses. */
  async function refreshSearchPreview(value = query) {
    const term = value.trim();
    const accountId = activeAccountId;
    if (!term || !accountId) {
      searchPreviewItems = [];
      return;
    }
    try {
      const results = await listItems({ ownerId: accountId, section: 'drive', q: term });
      if (query.trim() === term && activeAccountId === accountId) searchPreviewItems = results.slice(0, 5);
    } catch {
      if (query.trim() === term && activeAccountId === accountId) searchPreviewItems = [];
    }
  }

  function focusSearchPreview() {
    if (!query.trim()) return;
    searchPreviewOpen = true;
    void refreshSearchPreview();
  }

  function closeSearchPreview() {
    searchPreviewOpen = false;
  }

  /** Commits the current query into the main result list. */
  function showAllSearchResults() {
    searchPreviewOpen = false;
    advancedSearchFilters = null;
    appliedQuery = query;
    replaceUrl(null);
    void refresh();
  }

  /** Opens advanced search seeded from the current simple search text. */
  function openAdvancedSearch() {
    searchPreviewOpen = false;
    if (!advancedSearchFilters) {
      advancedSearchFilters = { ...defaultAdvancedSearchFilters, itemName: query.trim() };
    }
    advancedSearchOpen = true;
  }

  function resetAdvancedSearch() {
    advancedSearchFilters = null;
    appliedQuery = '';
    query = '';
  }

  /** Applies advanced filters through the main list endpoint instead of client-side filtering. */
  function applyAdvancedSearch(filters: AdvancedSearchFilters) {
    advancedSearchFilters = filters;
    advancedSearchOpen = false;
    searchPreviewOpen = false;
    query = filters.itemName.trim();
    appliedQuery = '';
    section = 'recent';
    currentFolderId = null;
    ownerFilterId = 'all';
    typeFilterId = 'all';
    modifiedFilterPreset = 'all';
    modifiedFilterAfter = null;
    modifiedFilterBefore = null;
    clearSelection();
    replaceUrl(null);
    void refresh();
  }

  /** Converts preset date filters into explicit API date bounds. */
  function advancedDateRange(filters: AdvancedSearchFilters) {
    const today = new Date();
    const startOfDay = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate());
    const format = (date: Date) => {
      const year = date.getFullYear();
      const month = `${date.getMonth() + 1}`.padStart(2, '0');
      const day = `${date.getDate()}`.padStart(2, '0');
      return `${year}-${month}-${day}`;
    };
    if (filters.modifiedPreset === 'custom') {
      return { after: filters.modifiedAfter, before: filters.modifiedBefore };
    }
    if (filters.modifiedPreset === 'today') {
      const value = format(startOfDay(today));
      return { after: value, before: value };
    }
    if (filters.modifiedPreset === 'yesterday') {
      const date = startOfDay(today);
      date.setDate(date.getDate() - 1);
      const value = format(date);
      return { after: value, before: value };
    }
    const days = filters.modifiedPreset === '7d' ? 7 : filters.modifiedPreset === '30d' ? 30 : filters.modifiedPreset === '90d' ? 90 : 0;
    if (!days) return { after: '', before: '' };
    const date = startOfDay(today);
    date.setDate(date.getDate() - days);
    return { after: format(date), before: '' };
  }

  /** Builds the API query for advanced search, omitting unset optional filters. */
  function advancedSearchParams() {
    const filters = advancedSearchFilters ?? defaultAdvancedSearchFilters;
    const range = advancedDateRange(filters);
    return {
      ownerId: activeAccountId,
      section: 'recent',
      advanced: true,
      itemType: filters.itemType,
      advancedOwnerId: filters.ownerId === 'any' ? undefined : filters.ownerId,
      name: filters.itemName.trim(),
      content: filters.content.trim(),
      location: filters.location,
      locationFolderId: filters.location === 'folder' ? filters.locationFolderId : undefined,
      modifiedAfter: range.after,
      modifiedBefore: range.before,
      sharedWith: filters.sharedWith.trim()
    };
  }

  /** Resets transient search/folder state when switching primary navigation sections. */
  function selectSection(next: Section) {
    section = next;
    query = '';
    appliedQuery = '';
    advancedSearchFilters = null;
    searchPreviewOpen = false;
    searchPreviewItems = [];
    currentFolderId = null;
    ownerFilterId = 'all';
    previewItem = null;
    clearVisibleList();
    if (next === 'storage') {
      sortField = 'size';
      sortDirection = 'desc';
    } else if (next === 'recent') {
      sortField = 'modified';
      sortDirection = 'desc';
    }
    viewMode = loadStoredViewMode();
    clearSelection();
    pushUrl(null);
    if (next === 'offline') void loadOfflineLibrary();
    else void refresh();
  }

  /** Opens the login flow as an account-add action without destroying the current session. */
  async function showAddAccountLogin() {
    accountDropdownVisible = false;
    profileOpen = false;
    adminOpen = false;
    clearSelection();
    if (currentUser) {
      await refreshAccounts().catch(() => undefined);
    }
    addingAccount = true;
  }

  /** Switches to another locally stored session and refreshes server-backed account state. */
  async function activateStoredSession(accountId: string) {
    const session = setActiveStoredSession(accountId);
    if (!session) return false;
    const switchRun = ++accountSwitchRun;
    currentUser = session.user;
    resetDriveViewForAccount(session.user.id);
    loggedSessions = getStoredSessions();
    authChecked = true;
    try {
      await refreshAccounts();
    } catch (ex) {
      if (switchRun !== accountSwitchRun) return false;
      if (isApiConnectionError(ex)) {
        activeAccountId = session.user.id;
        accounts = [session.user];
        notifyServerOffline();
        loading = false;
        contentReady = true;
        return true;
      }
      error = ex instanceof Error ? ex.message : 'Esta conta precisa entrar novamente.';
      loading = false;
      contentReady = true;
      return false;
    }
    if (switchRun !== accountSwitchRun) return false;
    viewMode = loadStoredViewMode(accountId);
    section = 'drive';
    currentFolderId = null;
    replaceUrl(null);
    await refresh();
    return true;
  }

  /** Logs out one stored account while preserving the remaining local sessions. */
  async function logoutAccount(accountId: string) {
    const sessions = getStoredSessions();
    if (sessions.length <= 1) {
      await handleLogout();
      return;
    }

    const previousActiveId = currentUser?.id ?? '';
    const removingActive = previousActiveId === accountId;
    const session = sessions.find((item) => item.user.id === accountId);
    if (!session) return;

    setActiveStoredSession(accountId);
    await logout();
    removeStoredSession(accountId);
    loggedSessions = getStoredSessions();

    if (!loggedSessions.length) {
      clearAllStoredSessions();
      currentUser = null;
      authChecked = true;
      resetDriveState();
      return;
    }

    if (removingActive) {
      const nextSession = getActiveStoredSession();
      if (nextSession) {
        await activateStoredSession(nextSession.user.id);
      }
      return;
    }

    if (previousActiveId) {
      setActiveStoredSession(previousActiveId);
      loggedSessions = getStoredSessions();
    }
    await refreshAccounts();
  }

  /** Selects either another stored session or the current user's own account workspace. */
  async function selectAccount(accountId: string, closeAdmin = true) {
    if (accountId === currentUser?.id && activeAccountId === accountId) {
      if (closeAdmin) adminOpen = false;
      accountDropdownVisible = false;
      return;
    }
    if (accountId !== currentUser?.id) {
      const switched = await activateStoredSession(accountId);
      if (!switched) error = 'Esta conta precisa entrar novamente.';
      if (closeAdmin) adminOpen = false;
      return;
    }
    activeAccountId = currentUser.id;
    section = 'drive';
    query = '';
    appliedQuery = '';
    searchPreviewOpen = false;
    searchPreviewItems = [];
    currentFolderId = null;
    ownerFilterId = 'all';
    sortField = 'name';
    sortDirection = 'asc';
    viewMode = loadStoredViewMode(accountId);
    if (closeAdmin) adminOpen = false;
    clearSelection();
    pushUrl(null);
    await refresh();
  }

  /** Opens folders, PDF tabs, offline files, or the in-app preview based on item and preferences. */
  function openItem(item: DriveItem) {
    searchPreviewOpen = false;
    searchPreviewItems = [];
    if (section === 'offline') {
      void openOfflineItem(item);
      return;
    }
    if (item.type === 'folder') {
      section = sectionForFolder(item, section);
      query = '';
      appliedQuery = '';
      searchPreviewItems = [];
      typeFilterId = 'all';
      typeFilterMenuOpen = false;
      currentFolderId = item.id;
      breadcrumbs = folderPathFor(item.id, item);
      clearSelection();
      pushUrl(null);
      void refresh();
      return;
    }
    if (shouldOpenPdfInNewTab(item)) {
      ctxVisible = false;
      selectedMenuVisible = false;
      const target = window.open('', '_blank');
      void openPdfInNewTab(item, target);
      return;
    }
    previewItem = item;
    searchPreviewOpen = false;
    searchPreviewItems = [];
    ctxVisible = false;
    selectedMenuVisible = false;
    pushUrl(item.id);
    void markOpenedInBackground(item);
  }

  /** Applies the PDF new-tab preference only for desktop browser sessions. */
  function shouldOpenPdfInNewTab(item: DriveItem) {
    if (nativeMobileApp || drivePreferences.pdfOpening !== 'tab' || item.type !== 'file') return false;
    const extension = (item.extension || item.name.split('.').pop() || '').toLowerCase();
    return extension === 'pdf' || item.mimeType === 'application/pdf' || item.name.toLowerCase().endsWith('.pdf');
  }

  /** Resolves a ticketed PDF URL into a pre-opened tab to avoid popup blocking. */
  async function openPdfInNewTab(item: DriveItem, target: Window | null) {
    try {
      const url = await previewUrl(item.id);
      if (target) target.location.href = url;
      else window.location.href = url;
      void markOpenedInBackground(item);
    } catch (exception) {
      target?.close();
      error = exception instanceof Error ? exception.message : 'Não foi possível abrir o PDF.';
    }
  }

  /** Routes downloads through the Android bridge in-app or a ticketed browser URL on desktop. */
  async function downloadItem(item: DriveItem) {
    if (item.type !== 'file') return;
    if (nativeMobileApp) {
      await downloadItemInAndroidApp(item);
      return;
    }
    const target = window.open('', '_blank');
    try {
      const url = await downloadUrl(item.id);
      if (target) target.location.href = url;
      else window.location.href = url;
    } catch (exception) {
      target?.close();
      error = exception instanceof Error ? exception.message : 'Não foi possível preparar o download.';
    }
  }

  /** Returns the native Android bridge when Ride is running inside the Capacitor shell. */
  function androidDownloadBridge() {
    if (typeof window === 'undefined') return null;
    return (window as unknown as { RideAndroid?: AndroidDownloadBridge }).RideAndroid ?? null;
  }

  /** Converts blobs to base64 payloads for the native Android bridge. */
  async function blobToBase64(blob: Blob) {
    return new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error('Não foi possível preparar o arquivo.'));
      reader.onload = () => {
        const value = typeof reader.result === 'string' ? reader.result : '';
        resolve(value.includes(',') ? value.split(',').pop() ?? '' : value);
      };
      reader.readAsDataURL(blob);
    });
  }

  /** Sends a downloaded file to Android's native save flow. */
  async function downloadItemInAndroidApp(item: DriveItem) {
    const bridge = androidDownloadBridge();
    if (!bridge?.saveBase64) {
      showSnackbar('Download nativo indisponível neste app.');
      return;
    }
    try {
      showSnackbar(`Baixando ${item.name}...`);
      const source = await downloadUrl(item.id);
      const response = await fetch(source, { cache: 'no-store' });
      if (!response.ok) throw new Error('Não foi possível baixar o arquivo.');
      const blob = await response.blob();
      const base64 = await blobToBase64(blob);
      bridge.saveBase64(
        JSON.stringify({
          id: `${item.id}:${Date.now()}`,
          name: item.name,
          mimeType: blob.type || item.mimeType || 'application/octet-stream',
          base64
        })
      );
    } catch (exception) {
      showSnackbar(exception instanceof Error ? exception.message : 'Não foi possível preparar o download.');
    }
  }

  /** Sanitizes ZIP path segments so shared folder exports cannot create unsafe archive names. */
  function safeArchiveSegment(value: string) {
    const safe = value.trim().replace(/[\\/:*?"<>|\u0000-\u001f]+/g, '-');
    return safe || 'item';
  }

  /** Gives shared folder exports a predictable ZIP filename. */
  function folderArchiveName(item: DriveItem) {
    const base = safeArchiveSegment(item.name).replace(/\.zip$/i, '');
    return `${base}.zip`;
  }

  /** Reconstructs a descendant's relative path inside an Android share ZIP. */
  function folderZipPath(root: DriveItem, entry: DriveItem, byId: Map<string, DriveItem>) {
    const segments = [safeArchiveSegment(entry.name)];
    let parentId = entry.parentId;
    while (parentId) {
      const parent = byId.get(parentId) ?? allFolders.find((folder) => folder.id === parentId);
      if (!parent) break;
      segments.unshift(safeArchiveSegment(parent.name));
      if (parent.id === root.id) break;
      parentId = parent.parentId;
    }
    if (segments[0] !== safeArchiveSegment(root.name)) segments.unshift(safeArchiveSegment(root.name));
    return segments.join('/');
  }

  /** Prepares either a direct file blob or a generated folder ZIP for Android sharing. */
  async function itemBlobForAndroidShare(item: DriveItem) {
    if (item.type === 'file') {
      const source = await downloadUrl(item.id);
      const response = await fetch(source, { cache: 'no-store' });
      if (!response.ok) throw new Error('Não foi possível preparar o arquivo.');
      const blob = await response.blob();
      return {
        name: item.name,
        mimeType: blob.type || item.mimeType || 'application/octet-stream',
        blob
      };
    }

    const { default: JSZip } = await import('jszip');
    const zip = new JSZip();
    const sectionForArchive = item.ownerId === activeAccountId ? 'drive' : 'shared-with-me';
    const descendants = await listItems({
      ownerId: activeAccountId,
      section: sectionForArchive,
      parentId: item.id,
      deep: true
    });
    const byId = new Map([item, ...descendants].map((entry) => [entry.id, entry] as const));
    zip.folder(safeArchiveSegment(item.name));
    for (const entry of descendants) {
      const path = folderZipPath(item, entry, byId);
      if (entry.type === 'folder') {
        zip.folder(path);
        continue;
      }
      const source = await downloadUrl(entry.id);
      const response = await fetch(source, { cache: 'no-store' });
      if (!response.ok) throw new Error(`Não foi possível incluir ${entry.name}.`);
      zip.file(path, await response.blob());
    }
    return {
      name: folderArchiveName(item),
      mimeType: 'application/zip',
      blob: await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' })
    };
  }

  /** Opens Android's system share sheet with the selected file or generated folder ZIP. */
  async function sendCopyToAndroid(item: DriveItem) {
    const bridge = androidDownloadBridge();
    if (!bridge?.shareBase64) {
      showSnackbar('Compartilhamento nativo indisponível neste app.');
      return;
    }
    try {
      showSnackbar(item.type === 'folder' ? `Compactando ${item.name}...` : `Preparando ${item.name}...`);
      const prepared = await itemBlobForAndroidShare(item);
      const base64 = await blobToBase64(prepared.blob);
      bridge.shareBase64(
        JSON.stringify({
          id: `${item.id}:${Date.now()}`,
          name: prepared.name,
          mimeType: prepared.mimeType,
          base64
        })
      );
    } catch (exception) {
      showSnackbar(exception instanceof Error ? exception.message : 'Não foi possível compartilhar uma cópia.');
    }
  }

  /** Requests a native launcher shortcut that deep-links back into the selected Ride item. */
  function addAndroidShortcut(item: DriveItem) {
    const bridge = androidDownloadBridge();
    if (!bridge?.requestShortcut) {
      showSnackbar('Atalhos nativos indisponíveis neste app.');
      return;
    }
    bridge.requestShortcut(
      JSON.stringify({
        id: item.id,
        name: item.name,
        type: item.type,
        mimeType: item.mimeType || '',
        extension: item.extension || item.name.split('.').pop() || ''
      })
    );
  }

  async function loadOfflineLibrary(options: { silent?: boolean } = {}) {
    if (!activeAccountId) return;
    if (!options.silent) loading = true;
    try {
      const records = await listOfflineFiles(activeAccountId);
      offlineItems = records.map((record) => ({
        ...record.item,
        parentId: null,
        trashed: false,
        spam: false,
        openedAt: record.storedAt,
        deletedAt: null
      }));
    } catch (ex) {
      error = ex instanceof Error ? ex.message : 'Não foi possível carregar arquivos offline.';
    } finally {
      if (!options.silent) {
        loading = false;
        contentReady = true;
      }
    }
  }

  async function makeAvailableOffline(targets: DriveItem[]) {
    if (!activeAccountId) return;
    const files = targets.filter((item) => item.type === 'file');
    if (!files.length) return;
    selectedMenuVisible = false;
    showSnackbar(files.length === 1 ? `Salvando ${files[0].name} offline...` : `Salvando ${files.length} arquivos offline...`);
    let saved = 0;
    try {
      for (const item of files) {
        const source = await downloadUrl(item.id);
        const response = await fetch(source, { cache: 'no-store' });
        if (!response.ok) throw new Error(`Não foi possível baixar ${item.name}.`);
        const blob = await response.blob();
        const ext = (item.extension || item.name.split('.').pop() || '').toLowerCase();
        const isPdf = item.mimeType === 'application/pdf' || ext === 'pdf';
        let pdfPages: Array<{ page: number; blob: Blob; width: number | null; height: number | null }> | undefined;
        if (isPdf) {
          try {
            const info = await getPdfInfo(item.id);
            const pages = await Promise.all(
              Array.from({ length: info.pages }, async (_, index) => {
                const pageNumber = index + 1;
                const pageSource = await pdfPageUrl(item.id, pageNumber);
                const pageResponse = await fetch(pageSource, { cache: 'no-store' });
                if (!pageResponse.ok) throw new Error('Falha ao salvar página PDF offline.');
                return {
                  page: pageNumber,
                  blob: await pageResponse.blob(),
                  width: info.width,
                  height: info.height
                };
              })
            );
            pdfPages = pages;
          } catch {
            pdfPages = undefined;
          }
        }
        await saveOfflineFile(activeAccountId, item, blob, pdfPages);
        saved += 1;
      }
      await loadOfflineLibrary({ silent: true });
      showSnackbar(saved === 1 ? 'Arquivo disponível offline.' : `${saved} arquivos disponíveis offline.`);
    } catch (ex) {
      showSnackbar(ex instanceof Error ? ex.message : 'Não foi possível salvar offline.');
    }
  }

  function closeOfflinePreview() {
    offlinePreviewItem = null;
    if (offlinePreviewUrl) {
      URL.revokeObjectURL(offlinePreviewUrl);
      offlinePreviewUrl = '';
    }
    for (const url of offlinePreviewPdfUrls) URL.revokeObjectURL(url);
    offlinePreviewPdfUrls = [];
    offlinePreviewPdfWidth = null;
    offlinePreviewPdfHeight = null;
  }

  async function openOfflineItem(item: DriveItem) {
    if (!activeAccountId || item.type !== 'file') return;
    try {
      closeOfflinePreview();
      const record = await getOfflineFile(activeAccountId, item.id);
      if (!record) {
        showSnackbar('Arquivo offline não encontrado no storage do app.');
        await loadOfflineLibrary({ silent: true });
        return;
      }
      offlinePreviewUrl = URL.createObjectURL(record.blob);
      offlinePreviewPdfUrls = (record.pdfPages ?? [])
        .sort((a, b) => a.page - b.page)
        .map((page) => URL.createObjectURL(page.blob));
      offlinePreviewPdfWidth = record.pdfPages?.[0]?.width ?? null;
      offlinePreviewPdfHeight = record.pdfPages?.[0]?.height ?? null;
      offlinePreviewItem = record.item;
    } catch (ex) {
      showSnackbar(ex instanceof Error ? ex.message : 'Não foi possível abrir o arquivo offline.');
    }
  }

  function openFolder(folderId: string | null) {
    section = folderId ? sectionForFolder(folderId, section) : section === 'shared-with-me' ? 'shared-with-me' : 'drive';
    query = '';
    appliedQuery = '';
    searchPreviewOpen = false;
    searchPreviewItems = [];
    typeFilterId = 'all';
    typeFilterMenuOpen = false;
    currentFolderId = folderId;
    breadcrumbs = folderPathFor(folderId);
    previewItem = null;
    clearVisibleList();
    clearSelection();
    pushUrl(null);
    void refresh();
  }

  function openCreateMenuFromTitle(e: MouseEvent) {
    if (!canUseFolderContext) return;
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    if (createMenuFromTitle && ctxVisible && !ctxItem) {
      ctxVisible = false;
      createMenuFromTitle = false;
      return;
    }
    createMenuFromTitle = true;
    showContextMenu(null, rect.left, rect.bottom + 4);
  }

  function clearSelection() {
    selectedIds = [];
    lastSelectedId = null;
    selectedMenuVisible = false;
    closeContextMenu();
  }

  function syncInfoPanelSelection(nextIds: string[]) {
    if (!infoPanelOpen) return;
    infoPanelItemId = nextIds.length === 1 ? nextIds[0] : null;
  }

  function closeContextMenu() {
    ctxVisible = false;
    createMenuFromTitle = false;
  }

  function clearSelectionFromSurface(e: MouseEvent) {
    if (suppressSurfaceClick) {
      suppressSurfaceClick = false;
      return;
    }
    closeContextMenu();
    if (e.ctrlKey || e.metaKey || e.shiftKey || selectedIds.length === 0) return;
    clearSelection();
  }

  function handleSelect(event: { item: DriveItem; mode: 'single' | 'toggle' | 'range' }) {
    closeContextMenu();
    const { item, mode } = event;
    if (mode === 'range' && lastSelectedId) {
      const from = selectableItems.findIndex((entry) => entry.id === lastSelectedId);
      const to = selectableItems.findIndex((entry) => entry.id === item.id);
      if (from !== -1 && to !== -1) {
        const [start, end] = from < to ? [from, to] : [to, from];
        const rangeIds = selectableItems.slice(start, end + 1).map((entry) => entry.id);
        selectedIds = Array.from(new Set([...selectedIds, ...rangeIds]));
        syncInfoPanelSelection(selectedIds);
        return;
      }
    }

    if (mode === 'toggle') {
      selectedIds = selectedIds.includes(item.id)
        ? selectedIds.filter((id) => id !== item.id)
        : [...selectedIds, item.id];
      lastSelectedId = item.id;
      syncInfoPanelSelection(selectedIds);
      return;
    }

    selectedIds = [item.id];
    lastSelectedId = item.id;
    syncInfoPanelSelection(selectedIds);
  }

  function handleMarqueeSelect(ids: string[]) {
    selectedIds = ids;
    lastSelectedId = ids.at(-1) ?? null;
    selectedMenuVisible = false;
    syncInfoPanelSelection(selectedIds);
  }

  function isMarqueeTarget(target: EventTarget | null) {
    return Boolean(
      target instanceof HTMLElement &&
        target.closest('[data-file-marquee-area]') &&
        !target.closest(
          'button,a,input,textarea,select,summary,[role="button"],[role="row"],[role="option"],[data-drive-item-id],[data-no-marquee],[data-search-box],[data-sidebar],[data-dialog],[data-context-menu]'
        )
    );
  }

  function clampToMarqueeBounds(x: number, y: number) {
    if (!marqueeBounds) return { x, y };
    return {
      x: Math.min(Math.max(x, marqueeBounds.left), marqueeBounds.right),
      y: Math.min(Math.max(y, marqueeBounds.top), marqueeBounds.bottom)
    };
  }

  function startFileMarquee(e: PointerEvent) {
    if (section === 'personal' || section === 'storage' || loading || e.button !== 0 || !isMarqueeTarget(e.target))
      return;
    const area = (e.target as HTMLElement).closest<HTMLElement>('[data-file-marquee-area]');
    const rect = area?.getBoundingClientRect();
    if (!rect) return;
    marqueeBounds = {
      left: rect.left,
      top: rect.top,
      right: rect.right,
      bottom: rect.bottom
    };
    const start = clampToMarqueeBounds(e.clientX, e.clientY);
    marqueePending = true;
    marqueeActive = false;
    marqueeStartX = start.x;
    marqueeStartY = start.y;
    marqueeCurrentX = start.x;
    marqueeCurrentY = start.y;
    marqueeBaseIds = [...selectedIds];
    marqueeAdditive = e.ctrlKey || e.metaKey;
  }

  function moveFileMarquee(e: PointerEvent) {
    if (!marqueePending) return;
    const distance = Math.hypot(e.clientX - marqueeStartX, e.clientY - marqueeStartY);
    if (!marqueeActive && distance < 6) return;
    const current = clampToMarqueeBounds(e.clientX, e.clientY);
    marqueeActive = true;
    suppressSurfaceClick = true;
    marqueeCurrentX = current.x;
    marqueeCurrentY = current.y;
    e.preventDefault();
  }

  function finishFileMarquee() {
    if (marqueeActive) suppressSurfaceClick = true;
    marqueePending = false;
    marqueeActive = false;
    marqueeStartX = 0;
    marqueeStartY = 0;
    marqueeCurrentX = 0;
    marqueeCurrentY = 0;
    marqueeBaseIds = [];
    marqueeBounds = null;
  }

  async function handleCreateFolder() {
    if (!activeAccountId) return;
    const name = await showPrompt('Nova pasta', '', 'Nome da pasta');
    if (!name?.trim()) return;
    const created = await createFolder(name.trim(), currentFolderId, activeAccountId);
    recordUndo({ type: 'delete-created', itemIds: [created.id] });
    section = sectionForFolder(currentFolderId, section);
    pushUrl(null);
    await refresh();
  }

  async function handleCreateOffice(kind: OfficeCreateKind) {
    if (!activeAccountId) return;
    const option = officeCreateOption(kind);
    const defaultName = option.fileName.replace(/\.[^.]+$/, '');
    const title =
      kind === 'document' ? 'Novo documento' : kind === 'spreadsheet' ? 'Nova planilha' : 'Nova apresentação';
    const requestedName = await showPrompt(title, defaultName, 'Nome do arquivo');
    if (!requestedName?.trim()) return;
    const fileName = officeCreateFileName(kind, requestedName);
    const editorWindow = nativeMobileApp ? null : window.open('about:blank', '_blank');
    setOfficeCreatingWindow(editorWindow);
    error = '';

    try {
      const file = await createBlankOfficeFile(kind, fileName);
      const created = await uploadFile(file, currentFolderId, activeAccountId);
      recordUndo({ type: 'delete-created', itemIds: [created.id] });

      section = sectionForFolder(currentFolderId, section);
      query = '';
      appliedQuery = '';
      searchPreviewOpen = false;
      searchPreviewItems = [];
      typeFilterId = 'all';
      selectedIds = [created.id];
      lastSelectedId = created.id;
      pushUrl(null);
      await refresh();
      await openCreatedOfficeEditor(created, editorWindow);
    } catch (ex) {
      editorWindow?.close();
      error = ex instanceof Error ? ex.message : 'Não foi possível criar o arquivo.';
      await refresh({ silent: true });
    }
  }

  function setOfficeCreatingWindow(editorWindow: Window | null) {
    try {
      if (!editorWindow?.document) return;
      editorWindow.document.title = 'Ride';
      editorWindow.document.body.style.margin = '0';
      editorWindow.document.body.style.background = '#202124';
      editorWindow.document.body.style.color = '#f1f3f4';
      editorWindow.document.body.style.fontFamily =
        'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
      editorWindow.document.body.innerHTML =
        '<div style="min-height:100vh;display:grid;place-items:center;font-size:14px">Criando arquivo no Ride...</div>';
    } catch {}
  }

  async function openCreatedOfficeEditor(created: DriveItem, editorWindow: Window | null) {
    if (nativeMobileApp) {
      editorWindow?.close();
      previewItem = created;
      pushUrl(created.id);
      return;
    }

    try {
      const response = await getOfficeConfig(created.id, 'edit');
      if (response.enabled && response.documentServerUrl && response.config) {
        const editorUrl = buildOnlyOfficeStandaloneUrl(response.documentServerUrl, response.config);
        const openedWindow = editorWindow ?? window.open(editorUrl, '_blank');
        if (openedWindow) {
          openedWindow.location.href = editorUrl;
          return;
        }

        previewItem = created;
        pushUrl(created.id);
        error = 'Arquivo criado, mas o navegador bloqueou a abertura automática do editor.';
        return;
      }

      editorWindow?.close();
      previewItem = created;
      pushUrl(created.id);
      error = response.reason || 'Arquivo criado, mas o ONLYOFFICE não está disponível agora.';
    } catch (ex) {
      editorWindow?.close();
      previewItem = created;
      pushUrl(created.id);
      error = ex instanceof Error ? ex.message : 'Arquivo criado, mas não foi possível abrir o editor.';
    }
  }

  type UploadFileCollection = FileList | File[] | null;

  /** Parses files delivered by Android share intents from either strings or event objects. */
  function parseAndroidSharedPayload(detail: unknown): AndroidSharedPayload | null {
    if (!detail) return null;
    if (typeof detail === 'string') {
      try {
        return JSON.parse(detail) as AndroidSharedPayload;
      } catch {
        return null;
      }
    }
    if (typeof detail === 'object') return detail as AndroidSharedPayload;
    return null;
  }

  /** Normalizes native download callback payloads into one shape. */
  function parseAndroidDownloadResult(detail: unknown): AndroidDownloadResult {
    if (!detail) return {};
    if (typeof detail === 'string') {
      try {
        return JSON.parse(detail) as AndroidDownloadResult;
      } catch {
        return { message: detail };
      }
    }
    if (typeof detail === 'object') return detail as AndroidDownloadResult;
    return {};
  }

  /** Normalizes shortcut/open-intent payloads into one shape. */
  function parseAndroidOpenPayload(detail: unknown): AndroidOpenPayload {
    if (!detail) return {};
    if (typeof detail === 'string') {
      try {
        return JSON.parse(detail) as AndroidOpenPayload;
      } catch {
        return { id: detail };
      }
    }
    if (typeof detail === 'object') return detail as AndroidOpenPayload;
    return {};
  }

  /** Opens an Android shortcut target immediately or defers it until login is restored. */
  function handleAndroidOpenItem(detail: unknown) {
    const payload = parseAndroidOpenPayload(detail);
    const id = payload.id?.trim();
    if (!id) return;
    if (!currentUser || !activeAccountId) {
      pendingAndroidOpenItemId = id;
      return;
    }
    void openFileRoute(id, true);
  }

  /** Consumes pending native open payloads exposed by the Android bridge on startup. */
  function processAndroidOpenPayload() {
    const bridge = androidDownloadBridge();
    if (!bridge?.consumeOpenPayload) return;
    try {
      const payload = bridge.consumeOpenPayload();
      if (payload) handleAndroidOpenItem(payload);
    } catch {
      // Shortcut events are also delivered through window events.
    }
  }

  /** Converts Android base64 share payloads back into browser File objects. */
  function androidSharedFileToFile(shared: AndroidSharedFile) {
    const binary = atob(shared.base64);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index);
    }
    return new File([bytes], shared.name || 'arquivo-compartilhado', {
      type: shared.mimeType || 'application/octet-stream'
    });
  }

  /** Uploads deferred Android share files once an authenticated Ride account is ready. */
  function processAndroidSharedFiles() {
    if (!pendingAndroidSharedFiles.length) return;
    if (!currentUser || !activeAccountId) {
      showSnackbar('Entre no Ride para enviar os arquivos compartilhados.');
      return;
    }
    const files = pendingAndroidSharedFiles.map(androidSharedFileToFile);
    pendingAndroidSharedFiles = [];
    void handleFiles(files);
  }

  /** Deduplicates Android share intents and offers a user-visible upload action. */
  function handleAndroidSharedFiles(detail: unknown) {
    const payload = parseAndroidSharedPayload(detail);
    const files = payload?.files?.filter((file) => file?.base64) ?? [];
    if (!files.length) return;

    const payloadId = payload?.id ?? `${Date.now()}-${files.length}`;
    if (handledAndroidShareIds.has(payloadId)) return;
    handledAndroidShareIds.add(payloadId);

    pendingAndroidSharedFiles = [...pendingAndroidSharedFiles, ...files];
    showSnackbar(
      files.length === 1
        ? '1 arquivo recebido do Android.'
        : `${files.length} arquivos recebidos do Android.`,
      'Enviar',
      processAndroidSharedFiles
    );
    processAndroidSharedFiles();
  }

  /** Reads browser-specific relative paths used by folder upload APIs. */
  function getFileRelativePath(file: File) {
    return (
      (file as File & { webkitRelativePath?: string; relativePath?: string }).webkitRelativePath ||
      (file as File & { relativePath?: string }).relativePath ||
      file.name
    );
  }

  /** Detects whether a file selection represents a folder tree. */
  function hasFolderPaths(files: UploadFileCollection) {
    return Array.from(files ?? []).some((file) => getFileRelativePath(file).split('/').filter(Boolean).length > 1);
  }

  /** Differentiates OS file drags from Ride internal drag-and-drop moves. */
  function isExternalFileDrag(event: DragEvent) {
    const types = Array.from(event.dataTransfer?.types ?? []);
    return types.includes('Files') && !types.includes('application/x-ride-items');
  }

  function handleAppDragEnter(event: DragEvent) {
    if (isExternalFileDrag(event)) dragActive = true;
  }

  function handleAppDragOver(event: DragEvent) {
    if (!isExternalFileDrag(event)) return;
    event.preventDefault();
    dragActive = true;
  }

  function uploadTaskId(index: number) {
    return `${Date.now()}-${index}-${Math.random().toString(36).slice(2)}`;
  }

  function fileExtension(file: File) {
    return file.name.includes('.') ? (file.name.split('.').pop() ?? '').toLowerCase() : '';
  }

  /** Creates upload task records and one abort controller for the whole batch. */
  function beginUploadBatch(files: File[]) {
    const batch = files.map((file, index) => ({
      file,
      taskId: uploadTaskId(index)
    }));
    uploadTasks = batch.map(({ file, taskId }) => ({
      id: taskId,
      name: file.name,
      mimeType: file.type,
      extension: fileExtension(file),
      status: 'pending'
    }));
    uploadPanelVisible = true;
    uploadPanelCollapsed = false;
    uploadCancelRequested = false;
    uploadAbortController = new AbortController();
    return batch;
  }

  function updateUploadTask(id: string, patch: Partial<UploadTask>) {
    uploadTasks = uploadTasks.map((task) => (task.id === id ? { ...task, ...patch } : task));
  }

  function markPendingUploadsCanceled() {
    uploadTasks = uploadTasks.map((task) =>
      task.status === 'pending' || task.status === 'uploading' ? { ...task, status: 'canceled' } : task
    );
  }

  /** Cancels the active upload batch and marks tasks consistently in the UI. */
  function cancelUploads() {
    uploadCancelRequested = true;
    uploadAbortController?.abort();
    markPendingUploadsCanceled();
    uploading = false;
  }

  function isUploadAbort(ex: unknown) {
    return ex instanceof DOMException
      ? ex.name === 'AbortError'
      : ex instanceof Error && ex.name === 'AbortError';
  }

  function finishUploadBatch() {
    uploadAbortController = null;
    uploading = false;
  }

  async function refreshUploadProgress() {
    await refresh({ silent: true });
  }

  /** Routes dropped selections to flat-file or folder-tree upload handling. */
  async function handleDroppedFiles(files: UploadFileCollection) {
    if (hasFolderPaths(files)) {
      await handleFolderFiles(files);
      return;
    }
    await handleFiles(files);
  }

  /** Uploads a flat file batch with per-file progress, cancellation, undo, and offline handling. */
  async function handleFiles(files: UploadFileCollection) {
    if (!files?.length || !activeAccountId) return;
    const batch = beginUploadBatch(Array.from(files));
    uploading = true;
    error = '';
    try {
      const uploaded: DriveItem[] = [];
      for (const { file, taskId } of batch) {
        if (uploadCancelRequested) {
          updateUploadTask(taskId, { status: 'canceled' });
          continue;
        }

        updateUploadTask(taskId, { status: 'uploading' });
        try {
          uploaded.push(await uploadFile(file, currentFolderId, activeAccountId, uploadAbortController?.signal));
          updateUploadTask(taskId, { status: 'done' });
          await refreshUploadProgress();
        } catch (ex) {
          if (isUploadAbort(ex)) {
            updateUploadTask(taskId, { status: 'canceled' });
            markPendingUploadsCanceled();
            break;
          }
          if (isApiConnectionError(ex)) {
            updateUploadTask(taskId, { status: 'error', error: 'Servidor offline.' });
            notifyServerOffline();
            break;
          }
          updateUploadTask(taskId, {
            status: 'error',
            error: ex instanceof Error ? ex.message : 'Falha ao enviar arquivo.'
          });
          error = ex instanceof Error ? ex.message : 'Falha ao enviar arquivo.';
        }
      }
      if (uploaded.length) recordUndo({ type: 'delete-created', itemIds: uploaded.map((item) => item.id) });
      section = sectionForFolder(currentFolderId, section);
      pushUrl(null);
      await refresh();
    } catch (ex) {
      if (handleApiFailure(ex, 'Falha ao enviar arquivo.')) return;
      error = ex instanceof Error ? ex.message : 'Falha ao enviar arquivo.';
    } finally {
      finishUploadBatch();
      if (fileInput) fileInput.value = '';
    }
  }

  async function handleImageFiles(files: UploadFileCollection) {
    await handleFiles(files);
    if (imageInput) imageInput.value = '';
  }

  function loadAvatarImage(src: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = reject;
      image.src = src;
    });
  }

  /** Crops and compresses avatar images before storing them in the profile payload. */
  async function avatarFileToDataUrl(file: File) {
    if (!file.type.startsWith('image/')) throw new Error('Escolha uma imagem válida.');
    if (file.size > 5 * 1024 * 1024) throw new Error('A imagem deve ter no máximo 5 MB.');

    const objectUrl = URL.createObjectURL(file);
    try {
      const image = await loadAvatarImage(objectUrl);
      const size = 256;
      const canvas = document.createElement('canvas');
      canvas.width = size;
      canvas.height = size;
      const context = canvas.getContext('2d');
      if (!context) throw new Error('Canvas indisponível.');
      const side = Math.min(image.naturalWidth, image.naturalHeight);
      const sx = (image.naturalWidth - side) / 2;
      const sy = (image.naturalHeight - side) / 2;
      context.drawImage(image, sx, sy, side, side, 0, 0, size, size);
      return canvas.toDataURL('image/jpeg', 0.86);
    } finally {
      URL.revokeObjectURL(objectUrl);
    }
  }

  /** Applies profile updates to the current user, stored sessions, account lists, and Android UI. */
  function applyUpdatedAccount(updated: UserAccount) {
    if (currentUser?.id === updated.id) currentUser = { ...currentUser, ...updated };
    loggedSessions = loggedSessions.map((session) =>
      session.user.id === updated.id ? { ...session, user: { ...session.user, ...updated } } : session
    );
    accounts = accounts.some((account) => account.id === updated.id)
      ? accounts.map((account) => (account.id === updated.id ? { ...account, ...updated } : account))
      : [...accounts, updated];
    if (updated.id === activeAccountId) androidAvatarVersion += 1;
  }

  async function handleAvatarImage(files: UploadFileCollection | File) {
    const file = files instanceof File ? files : Array.from(files ?? [])[0];
    if (!file || !currentUser) return;
    try {
      const avatarUrl = await avatarFileToDataUrl(file);
      const optimisticUser = { ...currentUser, avatarUrl, updatedAt: new Date().toISOString() };
      applyUpdatedAccount(optimisticUser);
      const updated = await updateProfile({
        name: optimisticUser.name,
        email: optimisticUser.email,
        avatarColor: optimisticUser.avatarColor,
        avatarUrl
      });
      const mergedUpdated = { ...updated, avatarUrl: updated.avatarUrl || avatarUrl };
      updateStoredSessionUser(mergedUpdated);
      loggedSessions = getStoredSessions();
      applyUpdatedAccount(mergedUpdated);
      showSnackbar('Foto de perfil atualizada.');
    } catch (ex) {
      error = ex instanceof Error ? ex.message : 'Não foi possível atualizar a foto.';
    }
  }

  /** Recreates a dropped folder tree on the server while tracking undo only for top-level creations. */
  async function handleFolderFiles(files: UploadFileCollection) {
    if (!files?.length || !activeAccountId) return;
    const batch = beginUploadBatch(Array.from(files));
    uploading = true;
    error = '';
    try {
      const uploaded: DriveItem[] = [];
      const undoItemIds: string[] = [];
      const folderIdsByPath = new Map<string, string | null>([['', currentFolderId]]);

      for (const { file, taskId } of batch) {
        if (uploadCancelRequested) {
          updateUploadTask(taskId, { status: 'canceled' });
          continue;
        }

        const relativePath = getFileRelativePath(file).split('/').filter(Boolean);
        const fileName = relativePath.pop();
        if (!fileName) {
          updateUploadTask(taskId, { status: 'error', error: 'Nome de arquivo inválido.' });
          continue;
        }

        let parentId = currentFolderId;
        let accumulatedPath = '';
        try {
          for (const folderName of relativePath) {
            if (uploadCancelRequested) break;
            accumulatedPath = accumulatedPath ? `${accumulatedPath}/${folderName}` : folderName;
            if (!folderIdsByPath.has(accumulatedPath)) {
              const created = await createFolder(folderName, parentId, activeAccountId);
              if (!accumulatedPath.includes('/')) undoItemIds.push(created.id);
              folderIdsByPath.set(accumulatedPath, created.id);
              if (parentId === currentFolderId) await refreshUploadProgress();
            }
            parentId = folderIdsByPath.get(accumulatedPath) ?? null;
          }

          if (uploadCancelRequested) {
            updateUploadTask(taskId, { status: 'canceled' });
            continue;
          }

          updateUploadTask(taskId, { status: 'uploading' });
          const uploadedFile = await uploadFile(file, parentId, activeAccountId, uploadAbortController?.signal);
          uploaded.push(uploadedFile);
          updateUploadTask(taskId, { status: 'done' });
          if (relativePath.length === 0) undoItemIds.push(uploadedFile.id);
          if (parentId === currentFolderId) await refreshUploadProgress();
        } catch (ex) {
          if (isUploadAbort(ex)) {
            updateUploadTask(taskId, { status: 'canceled' });
            markPendingUploadsCanceled();
            break;
          }
          if (isApiConnectionError(ex)) {
            updateUploadTask(taskId, { status: 'error', error: 'Servidor offline.' });
            notifyServerOffline();
            break;
          }
          updateUploadTask(taskId, {
            status: 'error',
            error: ex instanceof Error ? ex.message : 'Falha ao enviar arquivo.'
          });
          error = ex instanceof Error ? ex.message : 'Falha ao enviar pasta.';
        }
      }

      if (undoItemIds.length) recordUndo({ type: 'delete-created', itemIds: undoItemIds });
      section = sectionForFolder(currentFolderId, section);
      pushUrl(null);
      await refresh();
    } catch (ex) {
      if (handleApiFailure(ex, 'Falha ao enviar pasta.')) return;
      error = ex instanceof Error ? ex.message : 'Falha ao enviar pasta.';
    } finally {
      finishUploadBatch();
      if (folderInput) folderInput.value = '';
    }
  }

  async function toggleStar(item: DriveItem) {
    const previousStarred = item.starred;
    await updateItem(item.id, { starred: !item.starred });
    recordUndo({ type: 'star', itemId: item.id, starred: previousStarred });
    await refresh();
  }

  async function rename(item: DriveItem) {
    const name = await showPrompt('Renomear', item.name);
    if (!name?.trim() || name.trim() === item.name) return;
    const previousName = item.name;
    await updateItem(item.id, { name: name.trim() });
    recordUndo({ type: 'rename', itemId: item.id, name: previousName });
    await refresh();
  }

  async function openMoveDialog(item: DriveItem) {
    movingItem = item;
    movingItems = [item];
    selectedMoveFolderId = item.parentId;
    moveFolders = await listFolders(item.ownerId);
  }

  async function openMoveSelected() {
    const targets = selectedItems;
    if (!targets.length) return;
    selectedMenuVisible = false;
    movingItem = targets[0];
    movingItems = targets;
    selectedMoveFolderId = targets[0].parentId;
    moveFolders = await listFolders(targets[0].ownerId);
  }

  async function moveTo(folderId: string | null) {
    const targets = movingItems.length > 0 ? movingItems : movingItem ? [movingItem] : [];
    if (!targets.length) return;
    const moved = targets.map((item) => ({ id: item.id, parentId: item.parentId, name: item.name }));
    for (const item of targets) {
      await updateItem(item.id, { parentId: folderId });
    }
    recordUndo({ type: 'move', items: moved });
    movingItem = null;
    movingItems = [];
    selectedMoveFolderId = null;
    await refresh();
  }

  async function moveItemsToFolder(targets: DriveItem[], folder: DriveItem) {
    const movable = topLevelItems(targets).filter(
      (item) => item.ownerId === folder.ownerId && item.id !== folder.id && item.parentId !== folder.id
    );
    if (!movable.length) return;

    try {
      const moved = movable.map((item) => ({ id: item.id, parentId: item.parentId, name: item.name }));
      for (const item of movable) {
        await updateItem(item.id, { parentId: folder.id });
      }
      selectedIds = movable.map((item) => item.id);
      const undo = recordUndo({ type: 'move', items: moved });
      showUndoSnackbar(
        movable.length === 1
          ? `O item ${movable[0].name} foi movido para "${folder.name}".`
          : `${movable.length} itens foram movidos para "${folder.name}".`,
        undo
      );
      await refresh();
    } catch (ex) {
      error = ex instanceof Error ? ex.message : 'Não foi possível mover os itens.';
      await refresh();
    }
  }

  async function trash(item: DriveItem) {
    await deleteItem(item.id);
    selectedIds = selectedIds.filter((id) => id !== item.id);
    await refresh();
    const undo = recordUndo({ type: 'trash', itemIds: [item.id] });
    showUndoSnackbar(
      item.type === 'file' ? 'Arquivo movido para a lixeira.' : 'Item movido para a lixeira.',
      undo
    );
  }

  async function trashSelected() {
    const targets = topLevelItems(selectedItems);
    if (!targets.length) return;
    selectedMenuVisible = false;
    for (const item of targets) {
      await deleteItem(item.id);
    }
    clearSelection();
    await refresh();
    const undo = recordUndo({ type: 'trash', itemIds: targets.map((item) => item.id) });
    showUndoSnackbar(
      targets.length === 1
        ? targets[0].type === 'file'
          ? 'Arquivo movido para a lixeira.'
          : 'Item movido para a lixeira.'
        : `${targets.length} itens movidos para a lixeira.`,
      undo
    );
  }

  async function spam(item: DriveItem) {
    const previousSpam = item.spam;
    await updateItem(item.id, { spam: true });
    recordUndo({ type: 'spam', itemId: item.id, spam: previousSpam });
    await refresh();
  }

  async function restore(item: DriveItem) {
    const previous = { trashed: item.trashed, spam: item.spam };
    await updateItem(item.id, { trashed: false, spam: false });
    recordUndo({ type: 'restore', items: [{ id: item.id, ...previous }] });
    await refresh();
  }

  function hardDeleteOrder(targets: DriveItem[]) {
    const lookup = new Map([...allFolders, ...items, ...targets].map((item) => [item.id, item]));
    const depthFor = (item: DriveItem) => {
      let depth = 0;
      let current = item.parentId ? lookup.get(item.parentId) : undefined;
      while (current) {
        depth += 1;
        current = current.parentId ? lookup.get(current.parentId) : undefined;
      }
      return depth;
    };

    return [...targets].sort((a, b) => {
      if (a.type !== b.type) return a.type === 'file' ? -1 : 1;
      return depthFor(b) - depthFor(a);
    });
  }

  async function restoreSelected() {
    const targets = selectedItems;
    if (!targets.length) return;
    selectedMenuVisible = false;
    const restored = targets.map((item) => ({ id: item.id, trashed: item.trashed, spam: item.spam }));
    for (const item of targets) {
      await updateItem(item.id, { trashed: false, spam: false });
    }
    recordUndo({ type: 'restore', items: restored });
    clearSelection();
    await refresh();
  }

  async function hardDelete(item: DriveItem) {
    const ok = await showConfirm(
      `Excluir "${item.name}" permanentemente?`,
      'Esta ação não pode ser desfeita.',
      true
    );
    if (!ok) return;
    await deleteItem(item.id, true);
    clearStoredUndo();
    await refresh();
  }

  async function hardDeleteSelected() {
    const targets = selectedItems;
    if (!targets.length) return;
    const ok = await showConfirm(
      targets.length === 1
        ? `Excluir "${targets[0].name}" permanentemente?`
        : `Excluir ${targets.length} itens permanentemente?`,
      'Esta ação não pode ser desfeita.',
      true
    );
    if (!ok) return;
    selectedMenuVisible = false;
    for (const item of hardDeleteOrder(targets)) {
      await deleteItem(item.id, true);
    }
    clearStoredUndo();
    clearSelection();
    await refresh();
  }

  async function emptyTrash() {
    const targets = items.filter((item) => item.trashed);
    if (!targets.length) return;
    const ok = await showConfirm(
      'Esvaziar lixeira?',
      'Todos os itens na lixeira serão excluídos permanentemente. Esta ação não pode ser desfeita.',
      true
    );
    if (!ok) return;
    for (const item of hardDeleteOrder(targets)) {
      await deleteItem(item.id, true);
    }
    clearStoredUndo();
    clearSelection();
    await refresh();
  }

  async function share(item: DriveItem) {
    selectedMenuVisible = false;
    ctxVisible = false;
    if (item.ownerId !== activeAccountId) {
      error = 'Apenas o proprietário pode alterar o compartilhamento deste item.';
      return;
    }
    await refreshAccounts();
    shareDialogItem = item;
  }

  async function saveShareAccess(detail: { users: SharePermission[]; linkRole: SharePermission['role'] | null }) {
    if (!shareDialogItem) return;
    const sharingItemId = shareDialogItem.id;
    const updated = await shareItemAccess(sharingItemId, detail.users, detail.linkRole);
    if (shareDialogItem?.id === sharingItemId) {
      shareDialogItem = updated;
    }
    mergeUpdatedItem(updated);
    await refresh();
  }

  async function copyShareLink() {
    if (!shareDialogItem) return;
    let result: { token: string; url: string };
    try {
      result = await shareItem(shareDialogItem.id);
    } catch (exception) {
      showSnackbar(exception instanceof Error ? exception.message : 'Não foi possível copiar o link.');
      return;
    }
    const url = buildShareUrl(result.token);
    const copied = await writeClipboardText(url);
    if (!copied) {
      await showPrompt('Copie o link', url);
    }
    showSnackbar(copied ? 'Link copiado.' : 'Link gerado.');
    await refresh({ silent: true });
  }

  async function writeClipboardText(text: string) {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        return true;
      }
    } catch {
      // Some WebViews reject clipboard writes even from a button press.
    }

    if (typeof document === 'undefined') return false;
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.setAttribute('readonly', '');
    textarea.style.position = 'fixed';
    textarea.style.top = '0';
    textarea.style.left = '-9999px';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();
    textarea.setSelectionRange(0, textarea.value.length);
    try {
      return document.execCommand('copy');
    } catch {
      return false;
    } finally {
      textarea.remove();
    }
  }

  async function copyLinksFor(itemsToCopy: DriveItem[]) {
    if (!itemsToCopy.length) return;
    selectedMenuVisible = false;
    let urls: string[];
    try {
      urls = await Promise.all(itemsToCopy.map((item) => shareItem(item.id).then((result) => buildShareUrl(result.token))));
    } catch (exception) {
      showSnackbar(exception instanceof Error ? exception.message : 'Não foi possível copiar os links.');
      return;
    }
    const text = urls.join('\n');
    const copied = await writeClipboardText(text);
    if (!copied) {
      await showPrompt(itemsToCopy.length === 1 ? 'Copie o link' : 'Copie os links', text);
    }
    showSnackbar(copied ? (itemsToCopy.length === 1 ? 'Link copiado.' : 'Links copiados.') : 'Links gerados.');
    await refresh();
  }

  async function shareSelected() {
    const targets = selectedItems;
    if (!targets.length) return;
    selectedMenuVisible = false;
    if (targets.length === 1) {
      await share(targets[0]);
      return;
    }
    await copyLinksFor(targets);
  }

  function downloadSelected() {
    const targets = selectedItems;
    if (!targets.length) return;
    selectedMenuVisible = false;
    if (targets.length === 1) {
      downloadItem(targets[0]);
      return;
    }
    for (const item of targets) {
      downloadItem(item);
    }
  }

  function openSelectedMenu(e: MouseEvent) {
    e.stopPropagation();
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    selectedMenuX = rect.right - 320;
    selectedMenuY = rect.bottom + 6;
    selectedMenuVisible = !selectedMenuVisible;
  }

  function closeSelectedMenu() {
    selectedMenuVisible = false;
    notificationsOpen = false;
    typeFilterMenuOpen = false;
    peopleFilterMenuOpen = false;
    modifiedFilterMenuOpen = false;
  }

  function openSelected() {
    if (selectedItems.length !== 1) return;
    selectedMenuVisible = false;
    openItem(selectedItems[0]);
  }

  function findInfoItem(id: string | null) {
    if (!id) return null;
    return (
      selectedItems.find((entry) => entry.id === id) ??
      viewItems.find((entry) => entry.id === id) ??
      items.find((entry) => entry.id === id) ??
      allFolders.find((entry) => entry.id === id) ??
      breadcrumbs.find((entry) => entry.id === id) ??
      (previewItem?.id === id ? previewItem : null)
    );
  }

  function infoPanelTargetCandidate() {
    if (selectedItems.length > 1) return null;
    if (selectedItems.length === 1) return selectedItems[0];
    return findInfoItem(infoPanelItemId) ?? (lastSelectedId ? findInfoItem(lastSelectedId) : null);
  }

  function openInfoPanel(item: DriveItem | null = null, tab: InfoPanelTab = 'details') {
    const target = item ?? infoPanelTargetCandidate();
    infoPanelOpen = true;
    infoPanelTab = tab;
    infoPanelItemId = target?.id ?? null;
    selectedMenuVisible = false;
    closeContextMenu();
  }

  function toggleInfoPanel(tab: InfoPanelTab = 'details') {
    const targetId = infoPanelTargetCandidate()?.id ?? null;
    if (infoPanelOpen && infoPanelTab === tab && infoPanelItemId === targetId) {
      closeInfoPanel();
      return;
    }
    openInfoPanel(null, tab);
  }

  function closeInfoPanel() {
    infoPanelOpen = false;
    infoPanelItemId = null;
  }

  function selectedInfo() {
    if (selectedItems.length !== 1) return;
    openInfoPanel(selectedItems[0], 'details');
  }

  function openAndroidActionSheet(item: DriveItem) {
    if (!nativeMobileApp) return;
    androidActionItem = item;
    androidActionItemKey += 1;
  }

  function openPreviewMoreMenu(item: DriveItem) {
    if (nativeMobileApp) {
      openAndroidActionSheet(item);
      return;
    }
    const x = typeof window === 'undefined' ? 24 : Math.max(12, window.innerWidth - 342);
    showContextMenu(item, x, 62);
  }

  function selectAllAndroidVisible() {
    const source =
      section === 'offline'
        ? offlineItems
        : section === 'personal'
          ? modifiedFilteredItems
          : section === 'recent'
            ? recentItems
            : viewItems;
    selectedIds = source.map((item) => item.id);
    lastSelectedId = selectedIds.at(-1) ?? null;
    selectedMenuVisible = false;
    syncInfoPanelSelection(selectedIds);
  }

  async function refreshAdminPanelData(_selectedAccountId?: string) {
    await refreshAccounts();
    if (currentUser) {
      const updatedSelf = accounts.find((account) => account.id === currentUser?.id);
      if (updatedSelf) {
        currentUser = updatedSelf;
        updateStoredSessionUser(updatedSelf);
        loggedSessions = getStoredSessions();
      }
    }
    await refresh();
  }

  // Context menu
  function showContextMenu(item: DriveItem | null, x: number, y: number) {
    ctxItem = item;
    ctxX = x;
    ctxY = y;
    ctxVisible = true;
    if (item) createMenuFromTitle = false;
  }

  function onMainRightClick(e: MouseEvent) {
    e.preventDefault();
    if (canUseFolderContext) {
      showContextMenu(null, e.clientX, e.clientY);
    }
  }
</script>

<svelte:head>
  <title>Ride</title>
  <meta name="description" content="Armazenamento e sincronização de arquivos." />
</svelte:head>

<svelte:window on:keydown={handleGlobalKeydown} on:click={closeSelectedMenu} />

{#if needsServerSetup}
  <ServerSetup
    initialUrl={nativeMobileApp && !hasConfiguredDriveServerUrl() ? '' : getDriveServerDisplayUrl()}
    allowCancel={Boolean(currentUser || getStoredSessions().length)}
    on:configured={handleServerConfigured}
    on:cancel={cancelServerSetup}
  />
{:else if !authChecked}
  <!-- Loading splash -->
  <div class="flex h-screen items-center justify-center bg-white">
    <img src="/design/logo.png" alt="Ride" class="h-28 w-28 animate-pulse object-contain" />
  </div>
{:else if !currentUser || addingAccount}
  {#key loginPageKey}
    <div class="relative min-h-screen">
      {#if nativeMobileApp}
        <button
          class="fixed right-4 top-4 z-10 rounded-full border border-[#dadce0] bg-white px-4 py-2 text-[13px] font-medium text-[#0b57d0] shadow-sm"
          on:click={configureServer}
        >
          Trocar servidor
        </button>
      {/if}
      <LoginPage allowSetup={!addingAccount} knownAccounts={accounts.length ? accounts : loggedSessions.map((session) => session.user)} on:success={handleLoginSuccess} />
    </div>
  {/key}
{:else}
  {#if nativeMobileApp}
    <AndroidDrive
      {section}
      {query}
      items={androidItems}
      {selectedIds}
      {viewMode}
      {sortDirection}
      {loading}
      {error}
      account={activeAccount}
      {accounts}
      {loggedAccounts}
      {activeAccountId}
      {activeAvatarUrl}
      {androidAvatarVersion}
      {summary}
      {serverOffline}
      actionsHidden={androidActionsHidden}
      actionItem={androidActionItem}
      actionItemKey={androidActionItemKey}
      on:search={(e) => handleSearch(e.detail)}
      on:searchSubmit={showAllSearchResults}
      on:open={(e) => openItem(e.detail)}
      on:select={(e) => handleSelect(e.detail)}
      on:clearSelection={clearSelection}
      on:selectAll={selectAllAndroidVisible}
      on:section={(e) => selectSection(e.detail)}
      on:viewMode={(e) => setViewMode(e.detail)}
      on:sort={(e) => setSort(e.detail.field, e.detail.direction)}
      on:upload={() => fileInput.click()}
      on:uploadImages={() => imageInput.click()}
      on:uploadFiles={(e) => void handleFiles(e.detail)}
      on:changeAvatar={(e) => void handleAvatarImage(e.detail)}
      on:uploadFolder={() => folderInput.click()}
      on:newFolder={handleCreateFolder}
      on:share={(e) => share(e.detail)}
      on:download={(e) => void downloadItem(e.detail)}
      on:makeOffline={(e) => void makeAvailableOffline(e.detail)}
      on:star={(e) => toggleStar(e.detail)}
      on:rename={(e) => rename(e.detail)}
      on:move={(e) => openMoveDialog(e.detail)}
      on:moveItemsToFolder={(e) => moveItemsToFolder(e.detail.items, e.detail.folder)}
      on:trash={(e) => trash(e.detail)}
      on:restore={(e) => restore(e.detail)}
      on:hardDelete={(e) => hardDelete(e.detail)}
      on:info={(e) => openInfoPanel(e.detail, 'details')}
      on:sendCopy={(e) => void sendCopyToAndroid(e.detail)}
      on:addShortcut={(e) => addAndroidShortcut(e.detail)}
      on:profile={() => (profileOpen = true)}
      on:settings={openSettingsPanel}
      on:addAccount={showAddAccountLogin}
      on:logout={handleLogout}
      on:selectAccount={(e) => selectAccount(e.detail)}
      on:configureServer={configureServer}
      on:createOffice={(e) => void handleCreateOffice(e.detail)}
    />
  {:else}
  <!-- svelte-ignore a11y-no-static-element-interactions -->
  <div
    data-drive-shell
    class="box-border flex h-screen select-none flex-col overflow-hidden bg-[#f8fafd] pt-1 text-[#1f1f1f]"
    on:contextmenu|preventDefault
    on:pointermove={moveFileMarquee}
    on:pointerup={finishFileMarquee}
    on:dragenter={handleAppDragEnter}
    on:dragover={handleAppDragOver}
  >
    <Topbar
      {query}
      account={currentUser}
      {accounts}
      searchResults={searchPreviewItems}
      searchOpen={searchPreviewOpen}
      showSearch={section !== 'personal'}
      {notifications}
      {notificationsOpen}
      on:search={(e) => handleSearch(e.detail)}
      on:searchFocus={focusSearchPreview}
      on:searchClose={closeSearchPreview}
      on:searchOpenItem={(e) => openItem(e.detail)}
      on:searchAllResults={showAllSearchResults}
      on:advancedSearch={openAdvancedSearch}
      on:notifications={toggleNotifications}
      on:clearNotifications={clearNotifications}
      on:openNotification={(e) => openNotification(e.detail)}
      on:accounts={openSettingsPanel}
      on:profile={() => {
        notificationsOpen = false;
        accountDropdownVisible = !accountDropdownVisible;
      }}
      on:toggleSidebar={() => (sidebarOpen = !sidebarOpen)}
      on:upload={() => fileInput.click()}
    />

    {#if serverOffline}
      <div class="mx-3 mb-2 flex min-h-11 shrink-0 items-center justify-between gap-3 rounded-lg border border-[#fbbc04] bg-[#fef7e0] px-4 py-2 text-[13px] text-[#3c4043]">
        <span class="min-w-0">Servidor offline. A sessão continua salva e o app tenta manter os dados atuais.</span>
        <button
          class="shrink-0 rounded-full px-3 py-1.5 font-medium text-[#0b57d0] hover:bg-[#feefc3]"
          on:click={configureServer}
        >
          Trocar servidor
        </button>
      </div>
    {/if}

    <div data-drive-body class="flex flex-1 overflow-hidden bg-[#f8fafd]">
      {#if sidebarOpen}
        <button
          data-mobile-scrim
          class="hidden"
          aria-label="Fechar navegação"
          on:click={() => (sidebarOpen = false)}
        ></button>
      {/if}
      <div role="presentation" data-sidebar on:click={clearSelectionFromSurface}>
        <Sidebar
          open={sidebarOpen}
          {section}
          {currentFolderId}
          folders={allFolders}
          {summary}
          account={activeAccount}
          on:navigate={(e) => selectSection(e.detail)}
          on:openFolder={(e) => openFolder(e.detail)}
          on:new={handleCreateFolder}
          on:upload={() => fileInput.click()}
          on:uploadFolder={() => folderInput.click()}
          on:createOffice={(e) => void handleCreateOffice(e.detail)}
        />
      </div>

      <!-- svelte-ignore a11y-no-static-element-interactions -->
      <main data-drive-main class="flex-1 overflow-y-auto rounded-tl-[22px] bg-white" on:contextmenu={onMainRightClick}>
        <div
          role="presentation"
          data-drive-content
          class="min-h-full"
          on:pointerdown={startFileMarquee}
          on:click={clearSelectionFromSurface}
          on:dragover={handleAppDragOver}
        >
          {#if section !== 'personal'}
            <div
              class="flex min-h-[126px] items-start justify-between gap-5 px-5 pb-3 pt-5"
              data-no-marquee
            >
              {#if selectedItems.length > 0}
                <div class="flex min-w-0 flex-1 flex-col gap-4">
                  <div class="flex items-center justify-between gap-5">
                    <div class="min-w-0 flex-1">
                      {#if breadcrumbs.length > 0}
                        <Breadcrumbs
                          items={breadcrumbs}
                          title={pageTitle}
                          variant="title"
                          currentHasMenu
                          on:open={(e) => openFolder(e.detail)}
                          on:menu={(e) => openCreateMenuFromTitle(e.detail)}
                        />
                      {:else}
                        <button
                          class="-ml-3 -mt-1.5 flex h-12 max-w-full items-center gap-1 rounded-[24px] pl-3 pr-2.5 text-left focus:outline-none {createMenuFromTitle && ctxVisible && !ctxItem
                            ? 'bg-[#e8eaed]'
                            : 'hover:bg-[#e8eaed]'}"
                          on:click|stopPropagation={openCreateMenuFromTitle}
                          aria-haspopup="menu"
                        >
                          <span class="truncate text-[25px] font-normal leading-8 text-[#1f1f1f]">{pageTitle}</span>
                          <svg
                            xmlns="http://www.w3.org/2000/svg"
                            width="18"
                            height="18"
                            viewBox="0 0 24 24"
                            fill="#1f1f1f"
                          >
                            <path d="M7 10l5 5 5-5z" />
                          </svg>
                        </button>
                      {/if}
                    </div>

                    {#if section !== 'storage'}
                      <div class="flex items-center gap-3">
                        <div class="flex h-10 overflow-hidden rounded-full border border-[#747775]">
                          <button
                            class="flex h-10 w-[64px] items-center justify-center gap-1 border-r border-[#747775] {viewMode ===
                            'list'
                              ? 'bg-[#c2e7ff] text-[#001d35]'
                              : 'bg-white text-[#1f1f1f]'}"
                            on:click={() => setViewMode('list')}
                            aria-label="Visualizar como lista"
                          >
                            {#if viewMode === 'list'}
                              <svg
                                xmlns="http://www.w3.org/2000/svg"
                                width="18"
                                height="18"
                                viewBox="0 0 24 24"
                                fill="currentColor"
                              >
                                <path d="M9 16.17 4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" />
                              </svg>
                            {/if}
                            <svg
                              xmlns="http://www.w3.org/2000/svg"
                              width="22"
                              height="22"
                              viewBox="0 0 24 24"
                              fill="currentColor"
                            >
                              <path
                                d="M4 10.5c.83 0 1.5-.67 1.5-1.5S4.83 7.5 4 7.5 2.5 8.17 2.5 9 3.17 10.5 4 10.5zm0 6c.83 0 1.5-.67 1.5-1.5S4.83 13.5 4 13.5 2.5 14.17 2.5 15 3.17 16.5 4 16.5zM7 8v2h14V8H7zm0 8h14v-2H7v2z"
                              />
                            </svg>
                          </button>
                          <button
                            class="flex h-10 w-[64px] items-center justify-center gap-1 {viewMode === 'grid'
                              ? 'bg-[#c2e7ff] text-[#001d35]'
                              : 'bg-white text-[#1f1f1f]'}"
                            on:click={() => setViewMode('grid')}
                            aria-label="Visualizar como grade"
                          >
                            {#if viewMode === 'grid'}
                              <svg
                                xmlns="http://www.w3.org/2000/svg"
                                width="18"
                                height="18"
                                viewBox="0 0 24 24"
                                fill="currentColor"
                              >
                                <path d="M9 16.17 4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" />
                              </svg>
                            {/if}
                            <svg
                              xmlns="http://www.w3.org/2000/svg"
                              width="22"
                              height="22"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              stroke-width="2"
                            >
                              <rect x="4" y="4" width="6" height="6" />
                              <rect x="14" y="4" width="6" height="6" />
                              <rect x="4" y="14" width="6" height="6" />
                              <rect x="14" y="14" width="6" height="6" />
                            </svg>
                          </button>
                        </div>
                        <button
                          class="flex h-10 w-10 items-center justify-center rounded-full {infoPanelOpen
                            ? 'bg-[#c2e7ff] text-[#001d35]'
                            : 'text-[#3c4043] hover:bg-[#f1f3f4]'}"
                          aria-label="Informações"
                          on:click|stopPropagation={() => toggleInfoPanel('details')}
                        >
                          <svg
                            xmlns="http://www.w3.org/2000/svg"
                            width="22"
                            height="22"
                            viewBox="0 0 24 24"
                            fill="currentColor"
                          >
                            <path
                              d="M11 17h2v-6h-2v6zm0-8h2V7h-2v2zm1-7C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8z"
                            />
                          </svg>
                        </button>
                      </div>
                    {/if}
                  </div>

                <div
                  data-selected-toolbar
                  class="flex h-12 min-w-0 flex-1 items-center gap-3 rounded-full bg-[#edf2fa] px-3 text-[#1f1f1f]"
                >
                  <button
                    class="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-[#3c4043] hover:bg-[#dde3ea]"
                    on:click|stopPropagation={clearSelection}
                    aria-label="Limpar seleção"
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
                  <span data-selected-summary class="min-w-[150px] text-[16px] font-medium">
                    {selectedItems.length}
                    {selectedItems.length === 1 ? 'item selecionado' : 'itens selecionados'}
                  </span>
                  {#if section === 'trash'}
                    <button
                      class="flex h-10 w-10 items-center justify-center rounded-full text-[#3c4043] hover:bg-[#dde3ea]"
                      on:click|stopPropagation={restoreSelected}
                      aria-label="Restaurar"
                    >
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        width="21"
                        height="21"
                        viewBox="0 0 24 24"
                        fill="currentColor"
                      >
                        <path
                          d="M12 5V1L7 6l5 5V7c3.31 0 6 2.69 6 6s-2.69 6-6 6-6-2.69-6-6H4c0 4.42 3.58 8 8 8s8-3.58 8-8-3.58-8-8-8z"
                        />
                      </svg>
                    </button>
                    <button
                      class="flex h-10 w-10 items-center justify-center rounded-full text-[#3c4043] hover:bg-[#dde3ea]"
                      on:click|stopPropagation={hardDeleteSelected}
                      aria-label="Excluir definitivamente"
                    >
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        width="21"
                        height="21"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="2"
                        stroke-linecap="round"
                        stroke-linejoin="round"
                      >
                        <path d="M3 6h18" />
                        <path d="M8 6V4h8v2" />
                        <path d="M19 6v14H5V6" />
                        <path d="m10 11 4 4" />
                        <path d="m14 11-4 4" />
                      </svg>
                    </button>
                  {:else}
                  <button
                    class="flex h-10 w-10 items-center justify-center rounded-full text-[#3c4043] hover:bg-[#dde3ea]"
                    on:click|stopPropagation={shareSelected}
                    aria-label="Compartilhar"
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      width="21"
                      height="21"
                      viewBox="0 0 24 24"
                      fill="currentColor"
                    >
                      <path
                        d="M15 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0-6c1.1 0 2 .9 2 2s-.9 2-2 2-2-.9-2-2 .9-2 2-2zM15 14c-2.67 0-8 1.34-8 4v2h10v-2H9.34c.72-.72 3.08-2 5.66-2 .77 0 1.5.1 2.14.27l1.52-1.52C17.54 14.27 16.2 14 15 14zM6 10V7H3V5h3V2h2v3h3v2H8v3H6zm13 4v3h3v2h-3v3h-2v-3h-3v-2h3v-3h2z"
                      />
                    </svg>
                  </button>
                  <button
                    class="flex h-10 w-10 items-center justify-center rounded-full text-[#3c4043] hover:bg-[#dde3ea]"
                    on:click|stopPropagation={downloadSelected}
                    aria-label="Baixar"
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      width="21"
                      height="21"
                      viewBox="0 0 24 24"
                      fill="currentColor"
                    >
                      <path d="M5 20h14v-2H5v2zM19 9h-4V3H9v6H5l7 7 7-7zm-8-4h2v6h1.17L12 13.17 9.83 11H11V5z" />
                    </svg>
                  </button>
                  <button
                    class="flex h-10 w-10 items-center justify-center rounded-full text-[#3c4043] hover:bg-[#dde3ea]"
                    on:click|stopPropagation={openMoveSelected}
                    aria-label="Mover"
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      width="21"
                      height="21"
                      viewBox="0 0 24 24"
                      fill="currentColor"
                    >
                      <path
                        d="M20 6h-8.17l-2-2H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2zm0 12H4V6h5l2 2h9v10zm-5-8v2H9v2h6v2l4-3-4-3z"
                      />
                    </svg>
                  </button>
                  <button
                    class="flex h-10 w-10 items-center justify-center rounded-full text-[#3c4043] hover:bg-[#dde3ea]"
                    on:click|stopPropagation={trashSelected}
                    aria-label="Mover para lixeira"
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      width="21"
                      height="21"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="2"
                      stroke-linecap="round"
                      stroke-linejoin="round"
                    >
                      <path d="M3 6h18" />
                      <path d="M8 6V4h8v2" />
                      <path d="M19 6v14H5V6" />
                    </svg>
                  </button>
                  <button
                    class="flex h-10 w-10 items-center justify-center rounded-full text-[#3c4043] hover:bg-[#dde3ea]"
                    on:click|stopPropagation={() => copyLinksFor(selectedItems)}
                    aria-label="Copiar link"
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      width="21"
                      height="21"
                      viewBox="0 0 24 24"
                      fill="currentColor"
                    >
                      <path
                        d="M3.9 12c0-1.71 1.39-3.1 3.1-3.1h4V7H7c-2.76 0-5 2.24-5 5s2.24 5 5 5h4v-1.9H7c-1.71 0-3.1-1.39-3.1-3.1zM8 13h8v-2H8v2zm9-6h-4v1.9h4c1.71 0 3.1 1.39 3.1 3.1s-1.39 3.1-3.1 3.1h-4V17h4c2.76 0 5-2.24 5-5s-2.24-5-5-5z"
                      />
                    </svg>
                  </button>
                  <button
                    class="flex h-10 w-10 items-center justify-center rounded-full text-[#3c4043] hover:bg-[#dde3ea]"
                    on:click|stopPropagation={openSelectedMenu}
                    aria-label="Mais ações"
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      width="21"
                      height="21"
                      viewBox="0 0 24 24"
                      fill="currentColor"
                    >
                      <path
                        d="M12 8c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm0 2c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm0 6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z"
                      />
                    </svg>
                  </button>
                  {/if}
                </div>
                </div>
              {:else if section === 'storage'}
                <div class="min-w-0 flex-1">
                  <div class="flex items-center justify-between gap-5">
                    <h1 class="text-[27px] font-normal leading-9 text-[#1f1f1f]">{pageTitle}</h1>
                    <div class="flex items-center gap-5 pr-2">
                      <button class="text-[14px] font-medium text-[#0b57d0] hover:underline">Backups</button>
                      <button
                        class="flex h-10 w-10 items-center justify-center rounded-full {infoPanelOpen
                          ? 'bg-[#c2e7ff] text-[#001d35]'
                          : 'text-[#444746] hover:bg-[#f1f3f4]'}"
                        aria-label="Detalhes de armazenamento"
                        on:click|stopPropagation={() => toggleInfoPanel('details')}
                      >
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          width="22"
                          height="22"
                          viewBox="0 0 24 24"
                          fill="currentColor"
                        >
                          <path
                            d="M11 17h2v-6h-2v6zm0-8h2V7h-2v2zm1-7C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8z"
                          />
                        </svg>
                      </button>
                    </div>
                  </div>

                  <div class="mt-5 flex flex-wrap items-center gap-2">
                    <div class="relative">
                      {#if typeFilterId === 'all'}
                        <button
                          data-filter-chip
                          class="flex h-9 items-center gap-2 rounded-lg border border-[#747775] bg-white px-4 text-[14px] text-[#3c4043] hover:bg-[#f8fafd]"
                          aria-haspopup="menu"
                          aria-expanded={typeFilterMenuOpen}
                          on:click|stopPropagation={toggleTypeFilterMenu}
                        >
                          Tipo
                          <svg
                            xmlns="http://www.w3.org/2000/svg"
                            width="18"
                            height="18"
                            viewBox="0 0 24 24"
                            fill="#3c4043"
                          >
                            <path d="M7 10l5 5 5-5z" />
                          </svg>
                        </button>
                      {:else}
                        <div class="flex h-9 overflow-hidden rounded-lg bg-[#0b5f86] text-[14px] text-[#e8f0fe]">
                          <button
                            class="flex h-9 items-center gap-1.5 pl-4 pr-3 hover:bg-white/10"
                            aria-haspopup="menu"
                            aria-expanded={typeFilterMenuOpen}
                            on:click|stopPropagation={toggleTypeFilterMenu}
                          >
                            {activeTypeFilter?.label ?? 'Tipo'}
                            <svg
                              xmlns="http://www.w3.org/2000/svg"
                              width="18"
                              height="18"
                              viewBox="0 0 24 24"
                              fill="currentColor"
                            >
                              <path d="M7 10l5 5 5-5z" />
                            </svg>
                          </button>
                          <button
                            class="flex h-9 w-10 items-center justify-center border-l border-[#064b70] hover:bg-white/10"
                            aria-label="Limpar filtro de tipo"
                            on:click|stopPropagation={() => setTypeFilter('all')}
                          >
                            <svg
                              xmlns="http://www.w3.org/2000/svg"
                              width="18"
                              height="18"
                              viewBox="0 0 24 24"
                              fill="currentColor"
                            >
                              <path d="M18.3 5.71 12 12l6.3 6.29-1.41 1.41L10.59 13.41 4.29 19.71 2.88 18.3 9.17 12 2.88 5.71 4.29 4.29l6.3 6.3 6.29-6.3z" />
                            </svg>
                          </button>
                        </div>
                      {/if}
                      {#if typeFilterMenuOpen}
                        <div
                          data-type-filter-menu
                          class="absolute left-0 top-11 z-50 w-[205px] overflow-hidden rounded-xl bg-white py-2 text-[#1f1f1f] shadow-[0_4px_14px_rgba(60,64,67,.18)] ring-1 ring-black/10"
                          role="menu"
                          tabindex="-1"
                          on:click|stopPropagation
                          on:keydown|stopPropagation
                        >
                          <button
                            class="flex h-10 w-full items-center gap-4 px-4 text-left text-[14px] hover:bg-[#f8fafd] {typeFilterId ===
                            'all'
                              ? 'bg-[#f8fafd]'
                              : ''}"
                            on:click={() => setTypeFilter('all')}
                          >
                            <span class="flex h-5 w-5 items-center justify-center text-[15px]">✓</span>
                            <span>Todos os tipos</span>
                          </button>
                          {#each visibleTypeFilterOptions as option (option.id)}
                            <button
                              class="flex h-10 w-full items-center gap-4 px-4 text-left text-[14px] hover:bg-[#f8fafd] {typeFilterId ===
                              option.id
                                ? 'bg-[#f8fafd]'
                                : ''}"
                              on:click={() => setTypeFilter(option.id)}
                            >
                              <span class="flex h-5 w-5 items-center justify-center">
                                {#if option.id === 'folders'}
                                  <svg
                                    xmlns="http://www.w3.org/2000/svg"
                                    width="21"
                                    height="21"
                                    viewBox="0 0 24 24"
                                    fill={option.bg}
                                  >
                                    <path
                                      d="M10 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z"
                                    />
                                  </svg>
                                {:else}
                                  <span
                                    class="flex h-[18px] min-w-[18px] items-center justify-center rounded-[3px] px-0.5 text-[8px] font-bold leading-none"
                                    style="background:{option.bg};color:{option.fg}"
                                  >
                                    {option.glyph}
                                  </span>
                                {/if}
                              </span>
                              <span>{option.label}</span>
                            </button>
                          {/each}
                        </div>
                      {/if}
                    </div>
                    <ModifiedFilterMenu
                      bind:open={modifiedFilterMenuOpen}
                      preset={modifiedFilterPreset}
                      after={modifiedFilterAfter}
                      before={modifiedFilterBefore}
                      on:filteropen={handleModifiedFilterOpen}
                      on:apply={(event) => applyModifiedFilter(event.detail)}
                      on:clear={clearModifiedFilter}
                    />
                  </div>
                </div>
              {:else}
                <div class="min-w-0 flex-1">
                  {#if breadcrumbs.length > 0}
                    <Breadcrumbs
                      items={breadcrumbs}
                      title={pageTitle}
                      variant="title"
                      currentHasMenu
                      on:open={(e) => openFolder(e.detail)}
                      on:menu={(e) => openCreateMenuFromTitle(e.detail)}
                    />
                  {:else}
                    <button
                    class="-ml-3 -mt-1.5 flex h-12 max-w-full items-center gap-1 rounded-[24px] pl-3 pr-2.5 text-left focus:outline-none {createMenuFromTitle && ctxVisible && !ctxItem
                      ? 'bg-[#e8eaed]'
                      : 'hover:bg-[#e8eaed]'}"
                      on:click|stopPropagation={openCreateMenuFromTitle}
                      aria-haspopup="menu"
                    >
                      <span class="truncate text-[25px] font-normal leading-8 text-[#1f1f1f]">{pageTitle}</span>
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        width="18"
                        height="18"
                        viewBox="0 0 24 24"
                        fill="#1f1f1f"
                      >
                        <path d="M7 10l5 5 5-5z" />
                      </svg>
                    </button>
                  {/if}

                  <div class="mt-5 flex flex-wrap items-center gap-2">
                    <div class="relative">
                      {#if typeFilterId === 'all'}
                        <button
                          data-filter-chip
                          class="flex h-9 items-center gap-2 rounded-lg border border-[#747775] bg-white px-4 text-[14px] text-[#3c4043] hover:bg-[#f8fafd]"
                          aria-haspopup="menu"
                          aria-expanded={typeFilterMenuOpen}
                          on:click|stopPropagation={toggleTypeFilterMenu}
                        >
                          Tipo
                          <svg
                            xmlns="http://www.w3.org/2000/svg"
                            width="18"
                            height="18"
                            viewBox="0 0 24 24"
                            fill="#3c4043"
                          >
                            <path d="M7 10l5 5 5-5z" />
                          </svg>
                        </button>
                      {:else}
                        <div class="flex h-9 overflow-hidden rounded-lg bg-[#0b5f86] text-[14px] text-[#e8f0fe]">
                          <button
                            class="flex h-9 items-center gap-1.5 pl-4 pr-3 hover:bg-white/10"
                            aria-haspopup="menu"
                            aria-expanded={typeFilterMenuOpen}
                            on:click|stopPropagation={toggleTypeFilterMenu}
                          >
                            {activeTypeFilter?.label ?? 'Tipo'}
                            <svg
                              xmlns="http://www.w3.org/2000/svg"
                              width="18"
                              height="18"
                              viewBox="0 0 24 24"
                              fill="currentColor"
                            >
                              <path d="M7 10l5 5 5-5z" />
                            </svg>
                          </button>
                          <button
                            class="flex h-9 w-10 items-center justify-center border-l border-[#064b70] hover:bg-white/10"
                            aria-label="Limpar filtro de tipo"
                            on:click|stopPropagation={() => setTypeFilter('all')}
                          >
                            <svg
                              xmlns="http://www.w3.org/2000/svg"
                              width="18"
                              height="18"
                              viewBox="0 0 24 24"
                              fill="currentColor"
                            >
                              <path d="M18.3 5.71 12 12l6.3 6.29-1.41 1.41L10.59 13.41 4.29 19.71 2.88 18.3 9.17 12 2.88 5.71 4.29 4.29l6.3 6.3 6.29-6.3z" />
                            </svg>
                          </button>
                        </div>
                      {/if}
                      {#if typeFilterMenuOpen}
                        <div
                          data-type-filter-menu
                          class="absolute left-0 top-11 z-50 w-[205px] overflow-hidden rounded-xl bg-white py-2 text-[#1f1f1f] shadow-[0_4px_14px_rgba(60,64,67,.18)] ring-1 ring-black/10"
                          role="menu"
                          tabindex="-1"
                          on:click|stopPropagation
                          on:keydown|stopPropagation
                        >
                          <button
                            class="flex h-10 w-full items-center gap-4 px-4 text-left text-[14px] hover:bg-[#f8fafd] {typeFilterId ===
                            'all'
                              ? 'bg-[#f8fafd]'
                              : ''}"
                            on:click={() => setTypeFilter('all')}
                          >
                            <span class="flex h-5 w-5 items-center justify-center text-[15px]">✓</span>
                            <span>Todos os tipos</span>
                          </button>
                          {#each visibleTypeFilterOptions as option (option.id)}
                            <button
                              class="flex h-10 w-full items-center gap-4 px-4 text-left text-[14px] hover:bg-[#f8fafd] {typeFilterId ===
                              option.id
                                ? 'bg-[#f8fafd]'
                                : ''}"
                              on:click={() => setTypeFilter(option.id)}
                            >
                              <span class="flex h-5 w-5 items-center justify-center">
                                {#if option.id === 'folders'}
                                  <svg
                                    xmlns="http://www.w3.org/2000/svg"
                                    width="21"
                                    height="21"
                                    viewBox="0 0 24 24"
                                    fill={option.bg}
                                  >
                                    <path
                                      d="M10 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z"
                                    />
                                  </svg>
                                {:else}
                                  <span
                                    class="flex h-[18px] min-w-[18px] items-center justify-center rounded-[3px] px-0.5 text-[8px] font-bold leading-none"
                                    style="background:{option.bg};color:{option.fg}"
                                  >
                                    {option.glyph}
                                  </span>
                                {/if}
                              </span>
                              <span>{option.label}</span>
                            </button>
                          {/each}
                        </div>
                      {/if}
                    </div>
                    <div class="relative">
                      <button
                        data-filter-chip
                        class="flex h-9 items-center gap-2 rounded-lg border border-[#747775] bg-white px-4 text-[14px] text-[#3c4043] hover:bg-[#f8fafd]"
                        aria-haspopup="menu"
                        aria-expanded={peopleFilterMenuOpen}
                        on:click|stopPropagation={togglePeopleFilterMenu}
                      >
                        {personFilterLabel()}
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          width="18"
                          height="18"
                          viewBox="0 0 24 24"
                          fill="#3c4043"
                        >
                          <path d="M7 10l5 5 5-5z" />
                        </svg>
                      </button>
                      {#if peopleFilterMenuOpen}
                        <div
                          data-people-filter-menu
                          class="absolute left-0 top-11 z-50 w-[304px] overflow-hidden rounded-sm bg-white text-[#1f1f1f] shadow-[0_4px_14px_rgba(60,64,67,.18)]"
                          role="menu"
                          tabindex="-1"
                          on:click|stopPropagation
                          on:keydown|stopPropagation
                        >
                          <label
                            class="flex h-12 items-center gap-3 border border-[#8ab4f8] bg-white px-4 text-[#5f6368]"
                          >
                            <svg
                              xmlns="http://www.w3.org/2000/svg"
                              width="22"
                              height="22"
                              viewBox="0 0 24 24"
                              fill="currentColor"
                              class="shrink-0"
                            >
                              <path
                                d="M9.5 3a6.5 6.5 0 0 1 5.17 10.44l4.44 4.45-1.42 1.41-4.44-4.44A6.5 6.5 0 1 1 9.5 3zm0 2a4.5 4.5 0 1 0 0 9 4.5 4.5 0 0 0 0-9z"
                              />
                            </svg>
                            <input
                              class="h-full min-w-0 flex-1 bg-transparent text-[14px] text-[#1f1f1f] outline-none"
                              placeholder="Pesquisar pessoas e grupos"
                              bind:value={peopleSearch}
                            />
                          </label>

                          <div class="py-1">
                            {#each filteredPeopleOptions() as account (account.id)}
                              <button
                                class="flex h-[48px] w-full items-center gap-3 px-4 text-left hover:bg-[#f8fafd] {ownerFilterId ===
                                account.id
                                  ? 'bg-[#f8fafd]'
                                  : ''}"
                                on:click={() => setOwnerFilter(account.id)}
                              >
                                <span
                                  class="flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded-full text-[12px] font-medium text-white"
                                  style="background:{account.avatarColor}"
                                >
                                  {#if account.avatarUrl}
                                    <img src={account.avatarUrl} alt="" class="h-full w-full object-cover" />
                                  {:else}
                                    {account.name.slice(0, 1).toUpperCase()}
                                  {/if}
                                </span>
                                <span class="min-w-0 flex-1">
                                  <span class="block truncate text-[15px] leading-5">
                                    {account.name}{account.id === activeAccountId ? ' (eu)' : ''}
                                  </span>
                                  <span class="block truncate text-[13px] leading-4 text-[#5f6368]">{account.email}</span>
                                </span>
                                <svg
                                  xmlns="http://www.w3.org/2000/svg"
                                  width="22"
                                  height="22"
                                  viewBox="0 0 24 24"
                                  fill="currentColor"
                                  class="shrink-0 text-[#9aa0a6]"
                                >
                                  <path d="m10 6 6 6-6 6-1.41-1.41L13.17 12 8.59 7.41z" />
                                </svg>
                              </button>
                            {/each}
                          </div>

                          <div class="h-px bg-[#3c4043]"></div>
                          <button
                            class="flex h-[56px] w-full items-center gap-3 px-4 text-left hover:bg-[#f8fafd] {ownerFilterId ===
                            'link'
                              ? 'bg-[#f8fafd]'
                              : ''}"
                            on:click={() => setOwnerFilter('link')}
                          >
                            <span
                              class="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#188038] text-white"
                            >
                              <svg
                                xmlns="http://www.w3.org/2000/svg"
                                width="17"
                                height="17"
                                viewBox="0 0 24 24"
                                fill="currentColor"
                              >
                                <path
                                  d="M3.9 12c0-1.71 1.39-3.1 3.1-3.1h4V7H7a5 5 0 0 0 0 10h4v-1.9H7A3.1 3.1 0 0 1 3.9 12zM8 13h8v-2H8v2zm9-6h-4v1.9h4a3.1 3.1 0 0 1 0 6.2h-4V17h4a5 5 0 0 0 0-10z"
                                />
                              </svg>
                            </span>
                            <span class="text-[15px]">Qualquer pessoa com o link</span>
                          </button>
                        </div>
                      {/if}
                    </div>
                    <ModifiedFilterMenu
                      bind:open={modifiedFilterMenuOpen}
                      preset={modifiedFilterPreset}
                      after={modifiedFilterAfter}
                      before={modifiedFilterBefore}
                      on:filteropen={handleModifiedFilterOpen}
                      on:apply={(event) => applyModifiedFilter(event.detail)}
                      on:clear={clearModifiedFilter}
                    />
                  </div>
                </div>
              {/if}

              {#if selectedItems.length === 0 && section !== 'storage'}
                <div class="flex items-center gap-3 pt-0">
                  <div class="flex h-10 overflow-hidden rounded-full border border-[#747775]">
                    <button
                      class="flex h-10 w-[64px] items-center justify-center gap-1 border-r border-[#747775] {viewMode ===
                      'list'
                        ? 'bg-[#c2e7ff] text-[#001d35]'
                        : 'bg-white text-[#1f1f1f]'}"
                      on:click={() => setViewMode('list')}
                      aria-label="Visualizar como lista"
                    >
                      {#if viewMode === 'list'}
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          width="18"
                          height="18"
                          viewBox="0 0 24 24"
                          fill="currentColor"
                        >
                          <path d="M9 16.17 4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" />
                        </svg>
                      {/if}
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        width="22"
                        height="22"
                        viewBox="0 0 24 24"
                        fill="currentColor"
                      >
                        <path
                          d="M4 10.5c.83 0 1.5-.67 1.5-1.5S4.83 7.5 4 7.5 2.5 8.17 2.5 9 3.17 10.5 4 10.5zm0 6c.83 0 1.5-.67 1.5-1.5S4.83 13.5 4 13.5 2.5 14.17 2.5 15 3.17 16.5 4 16.5zM7 8v2h14V8H7zm0 8h14v-2H7v2z"
                        />
                      </svg>
                    </button>
                    <button
                      class="flex h-10 w-[64px] items-center justify-center gap-1 {viewMode === 'grid'
                        ? 'bg-[#c2e7ff] text-[#001d35]'
                        : 'bg-white text-[#1f1f1f]'}"
                      on:click={() => setViewMode('grid')}
                      aria-label="Visualizar como grade"
                    >
                      {#if viewMode === 'grid'}
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          width="18"
                          height="18"
                          viewBox="0 0 24 24"
                          fill="currentColor"
                        >
                          <path d="M9 16.17 4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" />
                        </svg>
                      {/if}
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        width="21"
                        height="21"
                        viewBox="0 0 24 24"
                      fill="currentColor"
                    >
                      <path
                          d="M4 4h7v7H4V4zm2 2v3h3V6H6zm7-2h7v7h-7V4zm2 2v3h3V6h-3zM4 13h7v7H4v-7zm2 2v3h3v-3H6zm7-2h7v7h-7v-7zm2 2v3h3v-3h-3z"
                        />
                      </svg>
                    </button>
                  </div>
                  <button
                    class="flex h-11 w-11 items-center justify-center rounded-full {infoPanelOpen
                      ? 'bg-[#c2e7ff] text-[#001d35]'
                      : 'text-[#444746] hover:bg-[#f1f3f4]'}"
                    aria-label="Detalhes"
                    on:click|stopPropagation={() => toggleInfoPanel('details')}
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      width="22"
                      height="22"
                      viewBox="0 0 24 24"
                      fill="currentColor"
                    >
                      <path
                        d="M11 17h2v-6h-2v6zm0-8h2V7h-2v2zm1-7C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8z"
                      />
                    </svg>
                  </button>
                </div>
              {/if}
            </div>
          {/if}

          {#if section === 'trash' && selectedItems.length === 0}
            <div class="px-5 pb-3">
              <div
                class="flex min-h-14 items-center justify-between gap-4 rounded-md bg-[#edf2fa] px-5 text-[14px] text-[#3c4043]"
              >
                <span>Os itens da lixeira serão excluídos definitivamente após 30 dias</span>
                <button
                  class="shrink-0 px-2 text-[14px] font-medium text-[#0b57d0] hover:underline disabled:pointer-events-none disabled:text-[#9aa0a6]"
                  disabled={items.filter((item) => item.trashed).length === 0}
                  on:click|stopPropagation={emptyTrash}
                >
                  Esvaziar lixeira
                </button>
              </div>
            </div>
          {/if}

          <div class="min-h-[calc(100vh-220px)]" data-file-marquee-area>
          {#if error}
            <div
              class="mb-4 flex items-center gap-3 rounded-lg border border-[#fad2cf] bg-[#fce8e6] px-4 py-3 text-[13px] text-[#d93025]"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="currentColor"
                ><path
                  d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"
                /></svg
              >
              {error}
            </div>
          {/if}

          {#if showInitialLoading}
            <div class="px-5">
              {#each Array(8) as _}
                <div class="mb-2 h-12 animate-pulse rounded bg-[#f0f4f9]"></div>
              {/each}
            </div>
          {:else if section === 'personal'}
            <PersonalView
              items={modifiedFilteredItems}
              folders={modifiedFilteredFolders}
              density={drivePreferences.density}
              {selectedIds}
              owner={activeAccount}
              {accounts}
              searchResults={searchPreviewItems}
              searchOpen={searchPreviewOpen}
              {query}
              {viewMode}
              on:search={(e) => handleSearch(e.detail)}
              on:searchFocus={focusSearchPreview}
              on:searchClose={closeSearchPreview}
              on:searchOpenItem={(e) => openItem(e.detail)}
              on:searchAllResults={showAllSearchResults}
              on:open={(e) => openItem(e.detail)}
              on:reveal={(e) => openFolder(e.detail)}
              on:select={(e) => handleSelect(e.detail)}
              on:viewMode={(e) => setViewMode(e.detail)}
              on:contextMenu={(e) => showContextMenu(e.detail.item, e.detail.x, e.detail.y)}
              on:clearSelection={clearSelection}
              on:shareSelected={shareSelected}
              on:downloadSelected={downloadSelected}
              on:moveSelected={openMoveSelected}
              on:trashSelected={trashSelected}
              on:copyLinks={() => copyLinksFor(selectedItems)}
              on:selectedMenu={(e) => {
                selectedMenuX = e.detail.x;
                selectedMenuY = e.detail.y;
                selectedMenuVisible = true;
              }}
              on:info={() => toggleInfoPanel('details')}
            />
          {:else if section === 'storage'}
            <StorageView
              items={displayedItems}
              {summary}
              {selectedIds}
              on:open={(e) => openItem(e.detail)}
              on:select={(e) => handleSelect(e.detail)}
              on:contextMenu={(e) => showContextMenu(e.detail.item, e.detail.x, e.detail.y)}
            />
          {:else if viewItems.length === 0}
            <EmptyState
              title={appliedQuery || typeFilterId !== 'all' ? 'Nenhum resultado encontrado' : pageTitle + ' está vazio'}
              description={appliedQuery
                ? 'Nenhum item corresponde a essa busca. Tente outro termo.'
                : typeFilterId !== 'all'
                  ? 'Nenhum item corresponde a esse tipo de arquivo.'
                : 'Use o botão "+ Novo" ou arraste arquivos para começar.'}
            />
          {:else}
            <FileGrid
              items={viewItems}
              density={drivePreferences.density}
              {section}
              {viewMode}
              {selectedIds}
              owner={activeAccount}
              {accounts}
              folders={allFolders}
              activeAccountId={activeAccountId}
              {sortField}
              {sortDirection}
              {folderOrder}
              {ownerFilterId}
              showLocation={typeFilterId !== 'all'}
              marquee={marqueeState}
              on:open={(e) => openItem(e.detail)}
              on:download={(e) => downloadItem(e.detail)}
              on:select={(e) => handleSelect(e.detail)}
              on:marqueeHits={(e) => handleMarqueeSelect(e.detail)}
              on:sort={(e) => setSort(e.detail.field, e.detail.direction)}
              on:ownerFilter={(e) => setOwnerFilter(e.detail)}
              on:folderOrder={(e) => setFolderOrder(e.detail)}
              on:star={(e) => toggleStar(e.detail)}
              on:rename={(e) => rename(e.detail)}
              on:move={(e) => openMoveDialog(e.detail)}
              on:moveItems={(e) => moveItemsToFolder(e.detail.items, e.detail.targetFolder)}
              on:spam={(e) => spam(e.detail)}
              on:trash={(e) => trash(e.detail)}
              on:restore={(e) => restore(e.detail)}
              on:hardDelete={(e) => hardDelete(e.detail)}
              on:share={(e) => share(e.detail)}
              on:reveal={(e) => openFolder(e.detail)}
              on:contextMenu={(e) => showContextMenu(e.detail.item, e.detail.x, e.detail.y)}
            />
          {/if}
          </div>
        </div>
      </main>

      {#if marqueeActive}
        <div
          class="pointer-events-none fixed z-[80] border border-[#9aa0a6] bg-[#e8eaed]/60"
          style="left:{Math.min(marqueeStartX, marqueeCurrentX)}px;top:{Math.min(
            marqueeStartY,
            marqueeCurrentY
          )}px;width:{Math.abs(marqueeCurrentX - marqueeStartX)}px;height:{Math.abs(
            marqueeCurrentY - marqueeStartY
          )}px"
        ></div>
      {/if}

      <InfoPanel
        open={infoPanelOpen && !previewItem && !offlinePreviewItem}
        activeTab={infoPanelTab}
        item={infoPanelItem}
        currentFolder={infoPanelCurrentFolder}
        {selectedItems}
        {items}
        {accounts}
        folders={allFolders}
        {activeAccount}
        {summary}
        {section}
        sectionTitle={pageTitle}
        on:close={closeInfoPanel}
        on:tab={(e) => (infoPanelTab = e.detail)}
        on:openItem={(e) => openItem(e.detail)}
        on:share={(e) => share(e.detail)}
        on:location={(e) => openInfoLocation(e.detail)}
        on:saveDescription={(e) => void saveInfoDescription(e.detail)}
      />

    </div>
  </div>
  {/if}

  <input
    bind:this={fileInput}
    class="hidden"
    type="file"
    multiple
    on:change={(e) => handleFiles(e.currentTarget.files)}
  />

  <input
    bind:this={imageInput}
    class="hidden"
    type="file"
    accept="image/*"
    multiple
    on:change={(e) => void handleImageFiles(e.currentTarget.files)}
  />

  <input
    bind:this={folderInput}
    class="hidden"
    type="file"
    multiple
    webkitdirectory
    on:change={(e) => handleFolderFiles(e.currentTarget.files)}
  />

  <UploadDropzone bind:active={dragActive} on:files={(e) => handleDroppedFiles(e.detail)} />

  <UploadStatusPanel
    visible={uploadPanelVisible}
    collapsed={uploadPanelCollapsed}
    tasks={uploadTasks}
    cancelable={uploading && uploadTasks.some((task) => task.status === 'pending' || task.status === 'uploading')}
    on:toggle={() => (uploadPanelCollapsed = !uploadPanelCollapsed)}
    on:close={() => (uploadPanelVisible = false)}
    on:cancel={cancelUploads}
  />

  <AdvancedSearchDialog
    open={advancedSearchOpen}
    filters={advancedSearchFilters ?? defaultAdvancedSearchFilters}
    {accounts}
    folders={allFolders}
    {activeAccountId}
    on:close={() => (advancedSearchOpen = false)}
    on:reset={resetAdvancedSearch}
    on:search={(e) => applyAdvancedSearch(e.detail)}
  />

  <MoveDialog
    item={movingItem}
    items={movingItems}
    folders={moveFolders}
    bind:selectedFolderId={selectedMoveFolderId}
    on:close={() => {
      movingItem = null;
      movingItems = [];
    }}
    on:move={(e) => moveTo(e.detail)}
  />

  {#if snackbarVisible}
    <div
      data-snackbar
      class="fixed bottom-4 left-4 z-[150] flex min-h-14 max-w-[620px] items-center gap-4 rounded-sm bg-[#202124] px-6 py-3 text-[14px] text-white shadow-[0_2px_8px_rgba(0,0,0,.35)]"
      role="status"
    >
      <span class="min-w-0 whitespace-normal leading-5">{snackbarMessage}</span>
      {#if snackbarActionLabel}
        <button
          class="shrink-0 px-1 font-medium text-[#d2e3fc] hover:underline"
          on:click|stopPropagation={runSnackbarAction}
        >
          {snackbarActionLabel}
        </button>
      {/if}
      <button
        class="ml-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[#bdc1c6] hover:bg-white/10"
        on:click|stopPropagation={closeSnackbar}
        aria-label="Fechar aviso"
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
          <path
            d="M18.3 5.71 12 12l6.3 6.29-1.41 1.41L10.59 13.41 4.29 19.71 2.88 18.3 9.17 12 2.88 5.71 4.29 4.29l6.3 6.3 6.29-6.3z"
          />
        </svg>
      </button>
    </div>
  {/if}

  {#if selectedMenuVisible && selectedItems.length > 0}
    <div
      data-selected-menu
      class="fixed z-[120] w-80 overflow-hidden rounded bg-white py-1 text-[14px] text-[#202124] shadow-[0_2px_8px_rgba(60,64,67,.35)] ring-1 ring-black/10"
      style="left:{selectedMenuX}px;top:{selectedMenuY}px"
      role="menu"
      tabindex="-1"
      on:click|stopPropagation
      on:keydown|stopPropagation
    >
      <button
        class="flex h-10 w-full items-center justify-between px-4 text-left {selectedItems.length === 1
          ? 'hover:bg-[#e8eaed]'
          : 'cursor-not-allowed text-[#b8b8b8]'}"
        disabled={selectedItems.length !== 1}
        on:click={openSelected}
      >
        <span class="flex items-center gap-4">
          <svg xmlns="http://www.w3.org/2000/svg" width="21" height="21" viewBox="0 0 24 24" fill="#5f6368">
            <path d="M19 19H5V5h7V3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2v-7h-2v7z" />
          </svg>
          Abrir com
        </span>
        <span>›</span>
      </button>
      <div class="my-1 h-px bg-[#dadce0]"></div>
      <button
        class="flex h-10 w-full items-center gap-4 px-4 text-left hover:bg-[#e8eaed]"
        on:click={downloadSelected}
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="21" height="21" viewBox="0 0 24 24" fill="#5f6368">
          <path d="M5 20h14v-2H5v2zM19 9h-4V3H9v6H5l7 7 7-7zm-8-4h2v6h1.17L12 13.17 9.83 11H11V5z" />
        </svg>
        Baixar
      </button>
      <button
        class="flex h-10 w-full items-center justify-between px-4 text-left {selectedItems.length === 1
          ? 'hover:bg-[#e8eaed]'
          : 'cursor-not-allowed text-[#b8b8b8]'}"
        disabled={selectedItems.length !== 1}
        on:click={() => {
          if (selectedItems.length === 1) {
            selectedMenuVisible = false;
            rename(selectedItems[0]);
          }
        }}
      >
        <span class="flex items-center gap-4">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="21"
            height="21"
            viewBox="0 0 24 24"
            fill="currentColor"
          >
            <path
              d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34a.9959.9959 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"
            />
          </svg>
          Renomear
        </span>
        <span class="text-[12px]">F2</span>
      </button>
      <button
        class="flex h-10 w-full cursor-not-allowed items-center gap-4 px-4 text-left text-[#b8b8b8]"
        disabled
      >
        <svg
          class="shrink-0 text-[#5f6368]"
          xmlns="http://www.w3.org/2000/svg"
          width="21"
          height="21"
          viewBox="0 0 24 24"
          fill="currentColor"
        >
          <path
            d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v16h13c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"
          />
        </svg>
        Fazer uma cópia
      </button>
      <button
        class="flex h-10 w-full items-center gap-4 px-4 text-left hover:bg-[#e8eaed]"
        on:click={() => copyLinksFor(selectedItems)}
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="21" height="21" viewBox="0 0 24 24" fill="#5f6368">
          <path
            d="M3.9 12c0-1.71 1.39-3.1 3.1-3.1h4V7H7c-2.76 0-5 2.24-5 5s2.24 5 5 5h4v-1.9H7c-1.71 0-3.1-1.39-3.1-3.1zM8 13h8v-2H8v2zm9-6h-4v1.9h4c1.71 0 3.1 1.39 3.1 3.1s-1.39 3.1-3.1 3.1h-4V17h4c2.76 0 5-2.24 5-5s-2.24-5-5-5z"
          />
        </svg>
        Copiar link
      </button>
      <div class="my-1 h-px bg-[#dadce0]"></div>
      <button
        class="flex h-10 w-full items-center justify-between px-4 text-left hover:bg-[#e8eaed]"
        on:click={shareSelected}
      >
        <span class="flex items-center gap-4">
          <svg xmlns="http://www.w3.org/2000/svg" width="21" height="21" viewBox="0 0 24 24" fill="#5f6368">
            <path
              d="M15 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0-6c1.1 0 2 .9 2 2s-.9 2-2 2-2-.9-2-2 .9-2 2-2zM15 14c-2.67 0-8 1.34-8 4v2h10v-2H9.34c.72-.72 3.08-2 5.66-2 .77 0 1.5.1 2.14.27l1.52-1.52C17.54 14.27 16.2 14 15 14zM6 10V7H3V5h3V2h2v3h3v2H8v3H6zm13 4v3h3v2h-3v3h-2v-3h-3v-2h3v-3h2z"
            />
          </svg>
          Compartilhar
        </span>
        <span>›</span>
      </button>
      <button
        class="flex h-10 w-full items-center justify-between px-4 text-left hover:bg-[#e8eaed]"
        on:click={openMoveSelected}
      >
        <span class="flex items-center gap-4">
          <svg xmlns="http://www.w3.org/2000/svg" width="21" height="21" viewBox="0 0 24 24" fill="#5f6368">
            <path d="M20 6h-8.17l-2-2H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2zm0 12H4V6h5l2 2h9v10zm-5-8v2H9v2h6v2l4-3-4-3z" />
          </svg>
          Organizar
        </span>
        <span>›</span>
      </button>
      <button
        class="flex h-10 w-full items-center gap-4 px-4 text-left {selectedItems.length === 1
          ? 'hover:bg-[#e8eaed]'
          : 'cursor-not-allowed text-[#b8b8b8]'}"
        disabled={selectedItems.length !== 1}
        on:click={selectedInfo}
      >
        <svg
          class="shrink-0 text-[#5f6368]"
          xmlns="http://www.w3.org/2000/svg"
          width="21"
          height="21"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <circle cx="12" cy="12" r="9" />
          <path d="M12 11v6" />
          <path d="M12 7h.01" />
        </svg>
        Informações sobre o arquivo
      </button>
      <div class="my-1 h-px bg-[#dadce0]"></div>
      <button
        class="flex h-10 w-full items-center justify-between px-4 text-left hover:bg-[#e8eaed]"
        on:click={trashSelected}
      >
        <span class="flex items-center gap-4">
          <svg xmlns="http://www.w3.org/2000/svg" width="21" height="21" viewBox="0 0 24 24" fill="#5f6368">
            <path
              d="M16 9v10H8V9h8m-1.5-6h-5l-1 1H5v2h14V4h-3.5l-1-1zM18 7H6v12c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7z"
            />
          </svg>
          Mover para a lixeira
        </span>
        <span class="text-[12px]">Delete</span>
      </button>
    </div>
  {/if}

  {#if preferencesOpen && currentUser && (!isAdmin || nativeMobileApp)}
    <PreferencesPanel
      compact={nativeMobileApp}
      accountId={activeAccountId}
      user={currentUser}
      {summary}
      on:change={(e) => applyDrivePreferences(e.detail)}
      on:close={() => (preferencesOpen = false)}
      on:profile={() => {
        preferencesOpen = false;
        accountDropdownVisible = true;
      }}
      on:server={() => {
        preferencesOpen = false;
        configureServer();
      }}
      on:logout={() => {
        preferencesOpen = false;
        void handleLogout();
      }}
    />
  {/if}

  {#if isAdmin}
    <AdminPanel
      open={adminOpen}
      initialTab={adminInitialTab}
      {accounts}
      accountId={activeAccountId}
      stats={adminStats}
      on:preferences={(e) => applyDrivePreferences(e.detail)}
      on:close={() => (adminOpen = false)}
      on:accountDeleted={(event) => {
        removeStoredSession(event.detail.id);
        loggedSessions = getStoredSessions();
        accounts = accounts.filter((account) => account.id !== event.detail.id);
        if (event.detail.setupRequired) handleProjectResetToSetup();
      }}
      on:refresh={(e) => refreshAdminPanelData(e.detail)}
      on:account={() => {
        adminOpen = false;
        accountDropdownVisible = true;
      }}
      on:logout={handleLogout}
    />
  {/if}

  {#if profileOpen && currentUser}
    <ProfileModal
      user={currentUser}
      compact={nativeMobileApp}
      on:close={() => (profileOpen = false)}
      on:updated={(e) => {
        applyUpdatedAccount(e.detail);
        updateStoredSessionUser(e.detail);
        loggedSessions = getStoredSessions();
      }}
      on:logout={() => {
        profileOpen = false;
        handleLogout();
      }}
      on:deleted={(event) => {
        profileOpen = false;
        if (event.detail.setupRequired) handleProjectResetToSetup();
        else handleLogout();
      }}
    />
  {/if}

  <AccountDropdown
    user={currentUser}
    {loggedAccounts}
    {activeAccountId}
    {summary}
    visible={accountDropdownVisible}
    on:close={() => (accountDropdownVisible = false)}
    on:select={(e) => selectAccount(e.detail)}
    on:profile={() => {
      accountDropdownVisible = false;
      profileOpen = true;
    }}
    on:settings={() => {
      accountDropdownVisible = false;
      openSettingsPanel();
    }}
    on:admin={() => {
      accountDropdownVisible = false;
      void openAdminPanel();
    }}
    on:addAccount={showAddAccountLogin}
    on:logout={handleLogout}
    on:logoutAccount={(e) => {
      void logoutAccount(e.detail);
    }}
  />

  {#if previewItem}
    {#key previewItem.id}
      {#await previewUrl(previewItem.id)}
        <div class="fixed inset-0 z-[90] grid place-items-center bg-black/70 text-sm text-[#e8eaed]">
          Carregando preview...
        </div>
      {:then privatePreviewUrl}
        <FilePreview
          item={previewItem}
          files={previewFiles}
          url={privatePreviewUrl}
          autoOpenOfficeEditor={nativeMobileApp}
          on:close={() => {
            previewItem = null;
            pushUrl(null);
            void refresh();
          }}
          on:navigate={(e) => {
            previewItem = e.detail;
            pushUrl(e.detail.id);
            void markOpenedInBackground(e.detail);
          }}
          on:download={(e) => void downloadItem(e.detail)}
          on:share={(e) => share(e.detail)}
          on:more={(e) => openPreviewMoreMenu(e.detail)}
          on:refresh={() => void refresh()}
          on:updated={(e) => {
            previewItem = e.detail;
            mergeUpdatedItem(e.detail);
          }}
        />
      {:catch previewError}
        <div class="fixed inset-0 z-[90] grid place-items-center bg-black/70 px-6 text-center text-sm text-[#e8eaed]">
          {previewError instanceof Error ? previewError.message : 'Não foi possível carregar o preview.'}
        </div>
      {/await}
    {/key}
  {/if}

  {#if offlinePreviewItem && offlinePreviewUrl}
    {#key offlinePreviewItem.id + offlinePreviewUrl}
      <FilePreview
        item={offlinePreviewItem}
        files={offlineItems}
        url={offlinePreviewUrl}
        rawPdfUrl={offlinePreviewUrl}
        offlinePdfPageUrls={offlinePreviewPdfUrls}
        offlinePdfWidth={offlinePreviewPdfWidth}
        offlinePdfHeight={offlinePreviewPdfHeight}
        canEditText={false}
        canShare={false}
        on:close={closeOfflinePreview}
        on:navigate={(e) => void openOfflineItem(e.detail)}
        on:download={(e) => void downloadItem(e.detail)}
        on:more={(e) => openPreviewMoreMenu(e.detail)}
      />
    {/key}
  {/if}

  {#if infoPanelOpen && (previewItem || offlinePreviewItem)}
    <div class="fixed bottom-0 right-0 top-0 z-[130] flex max-w-full justify-end">
      <InfoPanel
        open={true}
        activeTab={infoPanelTab}
        item={infoPanelItem}
        currentFolder={infoPanelCurrentFolder}
        {selectedItems}
        {items}
        {accounts}
        folders={allFolders}
        {activeAccount}
        {summary}
        {section}
        sectionTitle={pageTitle}
        on:close={closeInfoPanel}
        on:tab={(e) => (infoPanelTab = e.detail)}
        on:openItem={(e) => openItem(e.detail)}
        on:share={(e) => share(e.detail)}
        on:location={(e) => openInfoLocation(e.detail)}
        on:saveDescription={(e) => void saveInfoDescription(e.detail)}
      />
    </div>
  {/if}

  <ShareDialog
    item={shareDialogItem}
    {accounts}
    currentUser={activeAccount}
    on:close={() => (shareDialogItem = null)}
    on:save={(e) => saveShareAccess(e.detail)}
    on:copyLink={copyShareLink}
  />

  <Dialog
    visible={dlgVisible}
    type={dlgType}
    title={dlgTitle}
    message={dlgMessage}
    defaultValue={dlgDefault}
    placeholder={dlgPlaceholder}
    confirmLabel={dlgConfirmLabel}
    danger={dlgDanger}
    on:confirm={(e) => dlgConfirm(e.detail)}
    on:cancel={dlgCancel}
  />

  <ContextMenu
    visible={ctxVisible}
    x={ctxX}
    y={ctxY}
    item={ctxItem}
    {section}
    on:close={() => {
      ctxVisible = false;
      createMenuFromTitle = false;
    }}
    on:open={(e) => openItem(e.detail)}
    on:star={(e) => toggleStar(e.detail)}
    on:rename={(e) => rename(e.detail)}
    on:move={(e) => openMoveDialog(e.detail)}
    on:share={(e) => share(e.detail)}
    on:infoDetails={(e) => openInfoPanel(e.detail, 'details')}
    on:infoActivity={(e) => openInfoPanel(e.detail, 'activity')}
    on:spam={(e) => spam(e.detail)}
    on:trash={(e) => trash(e.detail)}
    on:restore={(e) => restore(e.detail)}
    on:hardDelete={(e) => hardDelete(e.detail)}
    on:newFolder={handleCreateFolder}
    on:upload={() => fileInput.click()}
    on:uploadFolder={() => folderInput.click()}
    on:createOffice={(e) => void handleCreateOffice(e.detail)}
  />
{/if}
