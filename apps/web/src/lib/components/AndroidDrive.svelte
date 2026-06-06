<script lang="ts">
  import { createEventDispatcher, onDestroy, onMount } from 'svelte';
  import FileIcon from '$lib/components/FileIcon.svelte';
  import FileThumbnail from '$lib/components/FileThumbnail.svelte';
  import { getDriveServerDisplayUrl } from '$lib/api/server';
  import { formatBytes } from '$lib/format';
  import type { OfficeCreateKind } from '$lib/office-create';
  import type {
    DriveItem,
    Section,
    SortDirection,
    SortField,
    StorageSummary,
    UserAccount,
    ViewMode
  } from '$lib/types';

  export let section: Section = 'personal';
  export let query = '';
  export let items: DriveItem[] = [];
  export let selectedIds: string[] = [];
  export let viewMode: ViewMode = 'list';
  export let sortDirection: SortDirection = 'asc';
  export let loading = false;
  export let error = '';
  export let account: UserAccount | null = null;
  export let accounts: UserAccount[] = [];
  export let loggedAccounts: UserAccount[] = [];
  export let activeAccountId = '';
  export let activeAvatarUrl: string | null = null;
  export let androidAvatarVersion = 0;
  export let summary: StorageSummary | null = null;
  export let serverOffline = false;
  export let actionsHidden = false;
  export let actionItem: DriveItem | null = null;
  export let actionItemKey = 0;

  const dispatch = createEventDispatcher<{
    search: string;
    searchSubmit: void;
    open: DriveItem;
    select: { item: DriveItem; mode: 'single' | 'toggle' | 'range' };
    clearSelection: void;
    selectAll: void;
    section: Section;
    viewMode: ViewMode;
    sort: { field: SortField; direction?: SortDirection };
    upload: void;
    uploadImages: void;
    uploadFiles: File[];
    changeAvatar: File;
    moveItemsToFolder: { items: DriveItem[]; folder: DriveItem };
    makeOffline: DriveItem[];
    uploadFolder: void;
    newFolder: void;
    share: DriveItem;
    download: DriveItem;
    star: DriveItem;
    rename: DriveItem;
    move: DriveItem;
    trash: DriveItem;
    restore: DriveItem;
    hardDelete: DriveItem;
    info: DriveItem;
    sendCopy: DriveItem;
    addShortcut: DriveItem;
    closeRequest: boolean;
    profile: void;
    settings: void;
    addAccount: void;
    logout: void;
    selectAccount: string;
    configureServer: void;
    createOffice: OfficeCreateKind;
  }>();

  type AndroidTab = 'suggested' | 'activity';

  let drawerOpen = false;
  let accountPanelOpen = false;
  let createMenuOpen = false;
  let sheetItem: DriveItem | null = null;
  let infoItem: DriveItem | null = null;
  let selectionSheetOpen = false;
  let homeTab: AndroidTab = 'suggested';
  let longPressTimer: ReturnType<typeof setTimeout> | null = null;
  let longPressTriggered = false;
  let mainScrolled = false;
  let cameraOpen = false;
  let cameraVideo: HTMLVideoElement;
  let cameraStream: MediaStream | null = null;
  let cameraError = '';
  let cameraStarting = false;
  let cameraReady = false;
  let cameraFlashOn = false;
  let captureBusy = false;
  let recording = false;
  let mediaRecorder: MediaRecorder | null = null;
  let recordedChunks: Blob[] = [];
  let moveDragActive = false;
  let moveDragX = 0;
  let moveDragY = 0;
  let moveDragTargetId = '';
  let moveDragItems: DriveItem[] = [];
  let moveDragPointerId: number | null = null;
  let moveDragPointerTarget: HTMLElement | null = null;
  let handledActionItemKey = 0;

  type StorageCategory = StorageSummary['categories'][number];

  const storageColors: Record<StorageCategory['id'], string> = {
    pdfs: '#ea4335',
    sheets: '#34a853',
    docs: '#4285f4',
    archives: '#7f858c',
    images: '#fbbc04',
    videos: '#a142f4',
    trash: '#5f6368',
    other: '#9aa0a6'
  };

  $: selectedLookup = new Set(selectedIds);
  $: selectionMode = selectedIds.length > 0;
  $: accountList = loggedAccounts.length ? loggedAccounts : account ? [account] : accounts;
  $: displayAccount =
    account?.id === activeAccountId
      ? account
      : (accountList.find((entry) => entry.id === activeAccountId) ?? account ?? accountList[0] ?? null);
  $: storagePercent = summary ? Math.min(100, Math.round((summary.usedBytes / summary.totalBytes) * 100)) : 0;
  $: storageCategories = summary?.categories.filter((category) => category.bytes > 0) ?? [];
  $: storageUsedBytes = Math.max(0, summary?.usedBytes ?? 0);
  $: storageTotalBytes = Math.max(1, summary?.totalBytes ?? 1);
  $: visibleItems = section === 'personal' ? homeItems(items) : items;
  $: primaryTitle = section === 'drive' ? 'My Ride' : section === 'shared-with-me' ? 'Shared' : titleForSection(section);
  $: if (!selectionMode) selectionSheetOpen = false;
  $: if (actionsHidden || accountPanelOpen || drawerOpen || selectionMode) createMenuOpen = false;
  $: if (actionItem && actionItemKey !== handledActionItemKey) {
    handledActionItemKey = actionItemKey;
    sheetItem = actionItem;
    infoItem = null;
    accountPanelOpen = false;
    drawerOpen = false;
    createMenuOpen = false;
  }

  /** Builds the compact home list without trash/spam noise. */
  function homeItems(source: DriveItem[]) {
    return [...source].sort((a, b) => {
      const aTime = Date.parse(a.openedAt || a.updatedAt || a.createdAt);
      const bTime = Date.parse(b.openedAt || b.updatedAt || b.createdAt);
      return bTime - aTime;
    });
  }

  function titleForSection(value: Section) {
    if (value === 'personal') return 'Home';
    if (value === 'starred') return 'Starred';
    if (value === 'offline') return 'Offline';
    if (value === 'shared-with-me') return 'Shared';
    if (value === 'recent') return 'Recent';
    if (value === 'trash') return 'Trash';
    if (value === 'spam') return 'Spam';
    if (value === 'storage') return 'Storage';
    return 'Files';
  }

  /** Converts storage bytes into a percentage for the mobile storage summary. */
  function storageCategoryPercent(category: StorageCategory) {
    if (!storageUsedBytes) return '0%';
    return `${((category.bytes / storageUsedBytes) * 100).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`;
  }

  function storageWidth(category: StorageCategory) {
    return Math.max(1.5, Math.min(100, (category.bytes / storageTotalBytes) * 100));
  }

  /** Produces the secondary line for mobile file rows. */
  function itemSubtitle(item: DriveItem) {
    const date = shortDate(item.openedAt || item.updatedAt || item.createdAt);
    if (section === 'offline') return `Available offline • ${date}`;
    if (section === 'trash') return `Trashed ${shortDate(item.deletedAt || item.updatedAt || item.createdAt)}`;
    if (section === 'drive') return `Modified ${date}`;
    if (section === 'shared-with-me') return `Shared ${date}`;
    if (item.updatedById && item.updatedById === activeAccountId && item.openedAt !== item.updatedAt) return `You modified • ${date}`;
    return `You opened • ${date}`;
  }

  function shortDate(value: string) {
    const date = new Date(value);
    const now = new Date();
    if (date.toDateString() === now.toDateString()) {
      return new Intl.DateTimeFormat('en-US', { hour: '2-digit', minute: '2-digit', hour12: false }).format(date);
    }
    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      ...(date.getFullYear() !== now.getFullYear() ? { year: 'numeric' } : {})
    }).format(date);
  }

  function detailDate(value: string | null | undefined) {
    if (!value) return 'Unknown';
    return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(new Date(value));
  }

  /** Chooses the human file type label shown in mobile details. */
  function fileKind(item: DriveItem) {
    if (item.type === 'folder') return 'Folder';
    const mime = item.mimeType ?? '';
    const ext = (item.extension ?? '').toLowerCase();
    if (mime.includes('pdf') || ext === 'pdf') return 'PDF';
    if (mime.includes('spreadsheet') || ['xls', 'xlsx', 'csv', 'ods'].includes(ext)) return 'Sheets';
    if (mime.includes('presentation') || ['ppt', 'pptx', 'odp'].includes(ext)) return 'Slides';
    if (mime.includes('word') || ['doc', 'docx', 'odt', 'txt', 'rtf'].includes(ext)) return 'Docs';
    if (mime.startsWith('image/')) return 'Image';
    if (mime.startsWith('video/')) return 'Video';
    if (mime.startsWith('audio/')) return 'Audio';
    return 'File';
  }

  function accountName(id: string | null | undefined) {
    if (!id) return firstName(displayAccount);
    return accounts.find((entry) => entry.id === id)?.name ?? accountList.find((entry) => entry.id === id)?.name ?? firstName(displayAccount);
  }

  function activityText(type: string) {
    if (type === 'trashed') return 'Removed this file';
    if (type === 'restored') return 'Restored this file';
    if (type === 'created' || type === 'uploaded') return 'Created this file';
    if (type === 'edited') return 'Modified this file';
    if (type === 'renamed') return 'Renamed this file';
    if (type === 'moved') return 'Moved this file';
    return 'Updated this file';
  }

  function firstName(user: UserAccount | null) {
    return user?.name?.trim().split(/\s+/)[0] || 'User';
  }

  function initials(user: UserAccount | null) {
    return user?.name?.slice(0, 1).toUpperCase() || 'U';
  }

  /** Switches mobile sections and clears selection-specific state. */
  function navTo(next: Section) {
    drawerOpen = false;
    accountPanelOpen = false;
    sheetItem = null;
    createMenuOpen = false;
    dispatch('section', next);
  }

  /** Opens items normally unless the app is already in multi-select mode. */
  function openOrSelect(item: DriveItem) {
    if (longPressTriggered) {
      longPressTriggered = false;
      return;
    }
    if (selectionMode) {
      dispatch('select', { item, mode: 'toggle' });
      return;
    }
    dispatch('open', item);
  }

  function selectedVisibleItems() {
    return visibleItems.filter((item) => selectedLookup.has(item.id));
  }

  /** Starts long-press selection and prepares drag-to-folder movement without losing touch capture. */
  function startLongPress(item: DriveItem, event: PointerEvent) {
    clearLongPress();
    longPressTriggered = false;
    moveDragPointerId = event.pointerId;
    moveDragPointerTarget = event.currentTarget instanceof HTMLElement ? event.currentTarget : null;
    if (selectionMode && selectedLookup.has(item.id)) event.preventDefault();
    try {
      moveDragPointerTarget?.setPointerCapture(event.pointerId);
    } catch {
      // Some WebViews do not allow pointer capture for every pointer type.
    }
    longPressTimer = setTimeout(() => {
      longPressTriggered = true;
      if (selectionMode && selectedLookup.has(item.id)) {
        beginMoveDrag(event);
        return;
      }
      dispatch('select', { item, mode: selectedLookup.has(item.id) ? 'toggle' : 'toggle' });
      if (navigator.vibrate) navigator.vibrate(18);
    }, selectionMode && selectedLookup.has(item.id) ? 280 : 430);
  }

  /** Promotes a long press into a move drag that can leave the selected row bounds. */
  function beginMoveDrag(event: PointerEvent) {
    const selected = selectedVisibleItems();
    if (!selected.length) return;
    event.preventDefault();
    moveDragActive = true;
    moveDragItems = selected;
    moveDragX = event.clientX;
    moveDragY = event.clientY;
    updateMoveDragTarget(event.clientX, event.clientY);
    if (navigator.vibrate) navigator.vibrate(22);
  }

  function cancelLongPress(event?: PointerEvent) {
    clearLongPress();
    releaseMovePointer(event?.pointerId);
  }

  function clearLongPress() {
    if (longPressTimer) {
      clearTimeout(longPressTimer);
      longPressTimer = null;
    }
  }

  /** Finds the folder currently under the finger during mobile move drag. */
  function updateMoveDragTarget(x: number, y: number) {
    if (!moveDragActive) return;
    const target = document
      .elementFromPoint(x, y)
      ?.closest<HTMLElement>('[data-android-folder-id]');
    const targetId = target?.dataset.androidFolderId ?? '';
    const folder = visibleItems.find((item) => item.id === targetId && item.type === 'folder');
    const invalid =
      !folder ||
      moveDragItems.some((item) => item.id === folder.id || item.parentId === folder.id || item.ownerId !== folder.ownerId);
    moveDragTargetId = invalid ? '' : folder.id;
  }

  /** Tracks pointer-based move dragging and keeps the hover target current. */
  function handleMoveDrag(event: PointerEvent) {
    if (!moveDragActive) return;
    if (moveDragPointerId !== null && event.pointerId !== moveDragPointerId) return;
    event.preventDefault();
    moveDragX = event.clientX;
    moveDragY = event.clientY;
    updateMoveDragTarget(event.clientX, event.clientY);
  }

  /** Mirrors move dragging for touch events on browsers that do not keep pointer capture reliably. */
  function handleMoveDragTouch(event: TouchEvent) {
    if (!moveDragActive) return;
    const touch = event.touches[0] ?? event.changedTouches[0];
    if (!touch) return;
    event.preventDefault();
    moveDragX = touch.clientX;
    moveDragY = touch.clientY;
    updateMoveDragTarget(touch.clientX, touch.clientY);
  }

  /** Drops selected items onto the hovered folder or cancels the drag cleanly. */
  function finishMoveDrag(event?: PointerEvent) {
    if (!moveDragActive) return;
    if (event && moveDragPointerId !== null && event.pointerId !== moveDragPointerId) return;
    const folder = visibleItems.find((item) => item.id === moveDragTargetId && item.type === 'folder');
    const targets = moveDragItems;
    cancelMoveDrag(event);
    if (folder && targets.length) dispatch('moveItemsToFolder', { items: targets, folder });
  }

  function finishMoveDragTouch(event: TouchEvent) {
    if (!moveDragActive) return;
    const touch = event.changedTouches[0] ?? event.touches[0];
    if (touch) updateMoveDragTarget(touch.clientX, touch.clientY);
    finishMoveDrag();
  }

  /** Cancels mobile move dragging while preserving current selection. */
  function cancelMoveDrag(event?: PointerEvent) {
    moveDragActive = false;
    moveDragTargetId = '';
    moveDragItems = [];
    releaseMovePointer(event?.pointerId);
  }

  function handleMovePointerCancel(event: PointerEvent) {
    clearLongPress();
    if (!moveDragActive) {
      cancelMoveDrag(event);
      return;
    }
    releaseMovePointer(event.pointerId);
  }

  function cancelMoveDragTouch() {
    if (moveDragActive) cancelMoveDrag();
  }

  /** Releases pointer capture defensively after drag completion or cancellation. */
  function releaseMovePointer(pointerId = moveDragPointerId) {
    if (pointerId === null) return;
    try {
      if (moveDragPointerTarget?.hasPointerCapture(pointerId)) moveDragPointerTarget.releasePointerCapture(pointerId);
    } catch {
      // Ignore stale pointer capture state after the browser has ended the gesture.
    }
    if (pointerId === moveDragPointerId) {
      moveDragPointerId = null;
      moveDragPointerTarget = null;
    }
  }

  /** Opens the bottom action sheet without triggering row navigation. */
  function openSheet(item: DriveItem, event: MouseEvent | TouchEvent) {
    event.preventDefault();
    event.stopPropagation();
    clearLongPress();
    sheetItem = item;
  }

  /** Dispatches one bottom-sheet action and closes the sheet first for mobile feedback. */
  function sheetAction(name: 'share' | 'download' | 'star' | 'rename' | 'move' | 'trash' | 'restore' | 'hardDelete' | 'info') {
    if (!sheetItem) return;
    const target = sheetItem;
    sheetItem = null;
    if (name === 'info') {
      infoItem = target;
      return;
    }
    dispatch(name, target);
  }

  function selectedSheetAction(name: 'star' | 'trash' | 'hardDelete' | 'restore') {
    selectionSheetOpen = false;
    const selected = visibleItems.filter((item) => selectedLookup.has(item.id));
    for (const item of selected) {
      if (name === 'star' && item.starred) continue;
      dispatch(name, item);
    }
  }

  function sendCopy(item: DriveItem) {
    sheetItem = null;
    dispatch('sendCopy', item);
  }

  function addShortcut(item: DriveItem) {
    sheetItem = null;
    dispatch('addShortcut', item);
  }

  function makeOffline(items: DriveItem[]) {
    sheetItem = null;
    selectionSheetOpen = false;
    const files = items.filter((item) => item.type === 'file');
    if (files.length) dispatch('makeOffline', files);
  }

  function resolveAvatarUrl(value: string | null | undefined, bustCache = false) {
    const raw = value?.trim();
    if (!raw) return '';
    if (/^(data:|blob:)/i.test(raw)) return raw;
    if (/^https?:\/\//i.test(raw)) {
      if (!bustCache) return raw;
      const separator = raw.includes('?') ? '&' : '?';
      return `${raw}${separator}_avatar=${androidAvatarVersion}`;
    }
    const resolved = `${getDriveServerDisplayUrl()}${raw.startsWith('/') ? raw : `/${raw}`}`;
    if (!bustCache) return resolved;
    const separator = resolved.includes('?') ? '&' : '?';
    return `${resolved}${separator}_avatar=${androidAvatarVersion}`;
  }

  function accountAvatar(user = displayAccount) {
    const id = user?.id ?? activeAccountId;
    if (id === activeAccountId) {
      const activeAvatar = resolveAvatarUrl(activeAvatarUrl, true);
      if (activeAvatar) return activeAvatar;
    }
    const candidates = [
      account,
      user,
      loggedAccounts.find((entry) => entry.id === id),
      accounts.find((entry) => entry.id === id),
      accountList.find((entry) => entry.id === id),
      displayAccount
    ];
    for (const candidate of candidates) {
      const avatar = resolveAvatarUrl(candidate?.avatarUrl, candidate?.id === activeAccountId);
      if (avatar) return avatar;
    }
    return '';
  }

  function hideBrokenAvatar(event: Event) {
    (event.currentTarget as HTMLImageElement).style.display = 'none';
  }

  function avatarKey(user = displayAccount) {
    return `${user?.id ?? activeAccountId}-${androidAvatarVersion}-${accountAvatar(user)}`;
  }

  function toggleViewMode(next: ViewMode) {
    dispatch('viewMode', next);
  }

  function selectAllOrClear() {
    if (selectedIds.length === visibleItems.length) {
      dispatch('clearSelection');
      return;
    }
    dispatch('selectAll');
  }

  function submitSearch(event: KeyboardEvent) {
    if (event.key === 'Enter') dispatch('searchSubmit');
  }

  function updateMainScroll(event: Event) {
    mainScrolled = (event.currentTarget as HTMLElement).scrollTop > 8;
    if (mainScrolled) createMenuOpen = false;
  }

  /** Opens the mobile camera flow and starts media capture only after the UI is mounted. */
  async function openCamera() {
    createMenuOpen = false;
    cameraOpen = true;
    await startCamera();
  }

  function createOffice(kind: OfficeCreateKind) {
    createMenuOpen = false;
    dispatch('createOffice', kind);
  }

  function openProfileFromAccountPanel() {
    accountPanelOpen = false;
    dispatch('profile');
  }

  /** Starts the rear camera stream with graceful fallback when constraints are unavailable. */
  async function startCamera() {
    if (!cameraOpen || cameraStarting) return;
    cameraStarting = true;
    cameraReady = false;
    cameraError = '';
    stopCameraStream();

    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error('Camera unavailable.');
      cameraStream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          facingMode: { ideal: 'environment' },
          width: { ideal: 1920 },
          height: { ideal: 1080 }
        }
      });

      if (cameraVideo) {
        cameraVideo.srcObject = cameraStream;
        await cameraVideo.play();
        cameraReady = true;
      }
    } catch (ex) {
      cameraError = ex instanceof Error ? ex.message : 'Could not open camera.';
    } finally {
      cameraStarting = false;
    }
  }

  /** Stops all camera tracks so the device camera is released immediately. */
  function stopCameraStream() {
    discardRecording();
    cameraStream?.getTracks().forEach((track) => track.stop());
    cameraStream = null;
    cameraFlashOn = false;
    cameraReady = false;
    setNativeTorch(false);
  }

  function closeCamera() {
    cameraOpen = false;
    cameraError = '';
    stopCameraStream();
  }

  async function toggleFlash() {
    const track = cameraStream?.getVideoTracks()[0];
    if (!track) return;

    const next = !cameraFlashOn;
    let webTorch = false;
    try {
      await track.applyConstraints({ advanced: [{ torch: next }] } as unknown as MediaTrackConstraints);
      webTorch = true;
    } catch {
      webTorch = false;
    }
    const nativeTorch = setNativeTorch(next);
    cameraFlashOn = next ? webTorch || nativeTorch : false;
  }

  function setNativeTorch(enabled: boolean) {
    try {
      const bridge = (window as unknown as { RideAndroid?: { setTorch?: (enabled: boolean) => boolean } }).RideAndroid;
      return Boolean(bridge?.setTorch?.(enabled));
    } catch {
      return false;
    }
  }

  function photoFileName() {
    const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, '');
    return `IMG_${stamp}.jpg`;
  }

  function videoFileName() {
    const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, '');
    return `VID_${stamp}.webm`;
  }

  /** Captures the current camera frame and uploads it as an image file. */
  async function capturePhoto() {
    if (!cameraVideo || captureBusy || cameraVideo.readyState < 2) return;
    captureBusy = true;
    cameraError = '';

    try {
      const width = cameraVideo.videoWidth || 1280;
      const height = cameraVideo.videoHeight || 720;
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext('2d');
      if (!context) throw new Error('Camera unavailable.');
      context.drawImage(cameraVideo, 0, 0, width, height);

      const blob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob((value) => (value ? resolve(value) : reject(new Error('Could not capture photo.'))), 'image/jpeg', 0.92);
      });
      const file = new File([blob], photoFileName(), { type: 'image/jpeg' });
      closeCamera();
      dispatch('uploadFiles', [file]);
    } catch (ex) {
      cameraError = ex instanceof Error ? ex.message : 'Could not capture photo.';
    } finally {
      captureBusy = false;
    }
  }

  function openImageGallery() {
    closeCamera();
    dispatch('uploadImages');
  }

  function preferredVideoMimeType() {
    const options = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'];
    return options.find((type) => MediaRecorder.isTypeSupported(type)) ?? '';
  }

  function toggleRecording() {
    if (recording) {
      mediaRecorder?.stop();
      return;
    }
    startRecording();
  }

  /** Starts video recording and buffers chunks until the user stops or discards it. */
  function startRecording() {
    if (!cameraStream || recording) return;
    cameraError = '';
    recordedChunks = [];
    try {
      const mimeType = preferredVideoMimeType();
      mediaRecorder = new MediaRecorder(cameraStream, mimeType ? { mimeType } : undefined);
      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) recordedChunks = [...recordedChunks, event.data];
      };
      mediaRecorder.onstop = () => {
        const type = mediaRecorder?.mimeType || 'video/webm';
        const chunks = recordedChunks;
        recordedChunks = [];
        mediaRecorder = null;
        recording = false;
        if (!chunks.length) return;
        const file = new File([new Blob(chunks, { type })], videoFileName(), { type });
        closeCamera();
        dispatch('uploadFiles', [file]);
      };
      mediaRecorder.start();
      recording = true;
    } catch (ex) {
      cameraError = ex instanceof Error ? ex.message : 'Could not start recording.';
      recording = false;
      mediaRecorder = null;
      recordedChunks = [];
    }
  }

  function discardRecording() {
    if (!mediaRecorder) return;
    const recorder = mediaRecorder;
    mediaRecorder = null;
    recordedChunks = [];
    recording = false;
    recorder.ondataavailable = null;
    recorder.onstop = null;
    if (recorder.state !== 'inactive') recorder.stop();
  }

  /** Handles Android back/close behavior by dismissing the topmost mobile overlay first. */
  function closeTopLayer() {
    if (moveDragActive) {
      cancelMoveDrag();
      return true;
    }
    if (cameraOpen) {
      closeCamera();
      return true;
    }
    if (selectionSheetOpen) {
      selectionSheetOpen = false;
      return true;
    }
    if (infoItem) {
      infoItem = null;
      return true;
    }
    if (sheetItem) {
      sheetItem = null;
      return true;
    }
    if (createMenuOpen) {
      createMenuOpen = false;
      return true;
    }
    if (accountPanelOpen) {
      accountPanelOpen = false;
      return true;
    }
    if (drawerOpen) {
      drawerOpen = false;
      return true;
    }
    if (selectionMode) {
      dispatch('clearSelection');
      return true;
    }
    return false;
  }

  function requestClose(event: CustomEvent<{ handled: boolean }>) {
    event.detail.handled = closeTopLayer();
  }

  onMount(() => {
    const closeHandler = (event: Event) => requestClose(event as CustomEvent<{ handled: boolean }>);
    window.addEventListener('ride-android-close', closeHandler);
    return () => window.removeEventListener('ride-android-close', closeHandler);
  });

  onDestroy(stopCameraStream);
</script>

<svelte:window
  on:pointermove={handleMoveDrag}
  on:pointerup={finishMoveDrag}
  on:pointercancel={handleMovePointerCancel}
  on:touchmove|nonpassive={handleMoveDragTouch}
  on:touchend={finishMoveDragTouch}
  on:touchcancel={cancelMoveDragTouch}
/>

<!-- svelte-ignore a11y-no-static-element-interactions -->
<div class="android-drive" role="application" on:contextmenu|preventDefault>
  {#if drawerOpen}
    <button class="android-scrim" aria-label="Close menu" on:click={() => (drawerOpen = false)}></button>
    <aside class="android-drawer">
      <div class="android-drawer-title">Ride</div>
      <nav class="android-drawer-nav">
        <button on:click={() => navTo('recent')}>{@render Svg('recent')}<span>Recent</span></button>
        <button on:click={() => dispatch('upload')}>{@render Svg('upload')}<span>Uploads</span></button>
        <button on:click={() => navTo('offline')}>{@render Svg('offline')}<span>Offline</span></button>
        <button on:click={() => navTo('trash')}>{@render Svg('trash')}<span>Trash</span></button>
        <button on:click={() => navTo('spam')}>{@render Svg('spam')}<span>Spam</span></button>
        <button on:click={() => dispatch('settings')}>{@render Svg('settings')}<span>Settings</span></button>
        <button on:click={() => navTo('storage')}>{@render Svg('storage')}<span>Storage</span></button>
      </nav>
      <div class="android-drawer-storage">
        <div class="android-storage-bar"><span style="width:{storagePercent}%"></span></div>
        <p>{summary ? `${formatBytes(summary.usedBytes)} of ${formatBytes(summary.totalBytes)} used` : 'Storage unavailable'}</p>
      </div>
    </aside>
  {/if}

  {#if accountPanelOpen}
    <section class="android-account-panel">
      <header>
        <span>{displayAccount?.email ?? ''}</span>
        <button aria-label="Close" on:click={() => (accountPanelOpen = false)}>{@render Svg('close')}</button>
      </header>
      <div class="android-account-hero">
        <div class="android-account-photo" style="background:{displayAccount?.avatarColor ?? '#4167b2'}">
          {#key avatarKey()}
            {#if accountAvatar()}
              <img src={accountAvatar()} alt="" />
            {:else}
              {initials(displayAccount)}
            {/if}
          {/key}
        </div>
        <h1>Hi, {firstName(displayAccount)}!</h1>
        <button class="android-account-manage" on:click={openProfileFromAccountPanel}>Manage your Ride Account</button>
      </div>
      <div class="android-account-card">
        <div class="android-account-card-title">
          <span>Switch account</span>
          <span class="android-round-icon">{@render Svg('chevronUp')}</span>
        </div>
        {#each accountList as entry (entry.id)}
          <button
            class="android-account-row"
            on:click={() => {
              accountPanelOpen = false;
              dispatch('selectAccount', entry.id);
            }}
          >
            <span class="android-mini-avatar" style="background:{entry.avatarColor}">
              {#key avatarKey(entry)}
                {#if accountAvatar(entry)}<img src={accountAvatar(entry)} alt="" />{:else}{initials(entry)}{/if}
              {/key}
            </span>
            <span><strong>{entry.name}</strong><small>{entry.email}</small></span>
          </button>
        {/each}
        <button class="android-account-row" on:click={() => dispatch('addAccount')}>
          <span class="android-add-account">{@render Svg('plus')}</span>
          <span><strong>Add another account</strong></span>
        </button>
      </div>
      <div class="android-account-storage">
        <div><span class="android-cloud">{@render Svg('cloud')}</span><strong>{storagePercent}% of {summary ? formatBytes(summary.totalBytes) : 'storage'} used</strong></div>
        <div class="android-storage-bar"><span style="width:{storagePercent}%"></span></div>
        <p>{summary ? `${formatBytes(summary.usedBytes)} of ${formatBytes(summary.totalBytes)}` : 'Storage unavailable'}</p>
      </div>
    </section>
  {/if}

  {#if cameraOpen}
    <section class="android-camera-screen" aria-label="Camera">
      <video
        class:ready={cameraReady}
        bind:this={cameraVideo}
        autoplay
        muted
        playsinline
        on:playing={() => (cameraReady = true)}
      ></video>
      <div class="android-camera-top">
        <button aria-label="Close camera" on:click={closeCamera}>{@render Svg('close')}</button>
        <h1>Ride</h1>
        <button
          class:active={cameraFlashOn}
          aria-label={cameraFlashOn ? 'Turn flash off' : 'Turn flash on'}
          on:click={toggleFlash}
        >
          {@render Svg(cameraFlashOn ? 'flash' : 'flashOff')}
        </button>
      </div>
      {#if cameraError}
        <div class="android-camera-error">{cameraError}</div>
      {/if}
      <div class="android-camera-controls">
        <button class="gallery" aria-label="Open gallery" on:click={openImageGallery}>{@render Svg('imageAdd')}</button>
        <button class="shutter" aria-label="Take photo" disabled={captureBusy || cameraStarting} on:click={capturePhoto}></button>
        <button
          class:recording
          class="record"
          aria-label={recording ? 'Stop recording' : 'Record video'}
          disabled={!cameraReady || cameraStarting}
          on:click={toggleRecording}
        >
          <span></span>
        </button>
      </div>
    </section>
  {/if}

  {#if infoItem}
    <section class="android-info-screen">
      <header class="android-titlebar">
        <button aria-label="Back" on:click={() => (infoItem = null)}>{@render Svg('arrowBack')}</button>
        <h1>{infoItem.name}</h1>
      </header>
      <main class="android-info-main">
        <div class="android-info-preview"><FileThumbnail item={infoItem} iconSize={92} /></div>
        <dl class="android-info-facts">
          <div>
            <dt>Type</dt>
            <dd>{fileKind(infoItem)}</dd>
          </div>
          {#if infoItem.trashed}
            <div>
              <dt>Removed from</dt>
              <dd class="android-info-icon-row">{@render Svg('driveFile')}<span>My Ride</span></dd>
            </div>
          {/if}
          <div class="two">
            <span><dt>Size</dt><dd>{formatBytes(infoItem.size)}</dd></span>
            <span><dt>Storage used</dt><dd>{formatBytes(infoItem.size)}</dd></span>
          </div>
          <div>
            <dt>Location</dt>
            <dd class="android-info-icon-row">{@render Svg(infoItem.trashed ? 'trash' : 'folderNav')}<span>{infoItem.trashed ? 'Trash' : 'My Ride'}</span></dd>
          </div>
          <div>
            <dt>Created</dt>
            <dd>{detailDate(infoItem.createdAt)}</dd>
          </div>
          <div>
            <dt>Modified</dt>
            <dd>{detailDate(infoItem.updatedAt)} by {accountName(infoItem.updatedById || infoItem.ownerId)}</dd>
          </div>
        </dl>
        <section class="android-info-access">
          <h2>Who has access <span>{@render Svg('chevronRight')}</span></h2>
          <div><span class="android-lock">{@render Svg('lock')}</span><strong>{infoItem.sharedWith.length || infoItem.linkRole ? 'Shared' : 'Not shared'}</strong></div>
        </section>
        <section class="android-info-activity">
          <h2>Activity</h2>
          {#each (infoItem.activity?.length ? infoItem.activity : [
            { id: 'synthetic-removed', type: infoItem.trashed ? 'trashed' : 'edited', actorId: infoItem.updatedById || infoItem.ownerId, createdAt: infoItem.deletedAt || infoItem.updatedAt, itemId: infoItem.id, itemName: infoItem.name, itemType: infoItem.type, parentId: infoItem.parentId, parentName: 'My Ride' }
          ]).slice(0, 3) as event (event.id)}
            <div class="android-info-event">
              <span class="android-mini-avatar" style="background:{displayAccount?.avatarColor ?? '#4167b2'}">
                {#if accountAvatar()}<img src={accountAvatar()} alt="" />{:else}{initials(displayAccount)}{/if}
              </span>
              <span><strong>{accountName(event.actorId)}</strong><small>{activityText(event.type)}</small></span>
              <time>{detailDate(event.createdAt)}</time>
            </div>
          {/each}
          <p>No recorded activity before {detailDate(infoItem.createdAt)}, {new Date(infoItem.createdAt).getFullYear()}</p>
        </section>
      </main>
    </section>
  {:else if section === 'trash'}
    {#if selectionMode}
      <header class="android-titlebar selection trash-selection">
        <button aria-label="Clear selection" on:click={() => dispatch('clearSelection')}>{@render Svg('close')}</button>
        <h1>{selectedIds.length} selected</h1>
        <button aria-label="Delete forever" on:click={() => selectedSheetAction('hardDelete')}>{@render Svg('deleteForever')}</button>
        <button aria-label="Select all" on:click={selectAllOrClear}>{@render Svg('selectAll')}</button>
        <button aria-label="More selected actions" on:click={() => (selectionSheetOpen = true)}>{@render Svg('more')}</button>
      </header>
    {:else}
      <header class="android-titlebar">
        <button aria-label="Back" on:click={() => navTo('personal')}>{@render Svg('arrowBack')}</button>
        <h1>Trash</h1>
        <button aria-label="Search">{@render Svg('search')}</button>
      </header>
    {/if}
    <main class="android-trash-main" on:scroll={updateMainScroll}>
      <section class="android-trash-notice">
        <p>Items in trash will be deleted forever after 30 days</p>
        <button>Empty trash</button>
      </section>
      <section class="android-list-shell">
        <div class="android-sort-row">
          <button on:click={() => dispatch('sort', { field: 'modified' })}>Date trashed <span class="android-sort-bubble">{@render Svg('arrowUp')}</span></button>
          {@render ViewToggle()}
        </div>
        {#if viewMode === 'grid'}{@render ItemGrid(visibleItems, false)}{:else}{@render ItemList(visibleItems)}{/if}
      </section>
    </main>
  {:else}
  <header class:selection={selectionMode} class="android-topbar">
    {#if selectionMode}
      <button aria-label="Clear selection" on:click={() => dispatch('clearSelection')}>{@render Svg('close')}</button>
      <span>{selectedIds.length} selected</span>
      <button class="android-topbar-spacer" aria-label="Select all" on:click={selectAllOrClear}>{@render Svg('selectAll')}</button>
      <button aria-label="More selected actions" on:click={() => (selectionSheetOpen = true)}>{@render Svg('more')}</button>
    {:else}
      <button aria-label="Menu" on:click={() => (drawerOpen = true)}>{@render Svg('menu')}</button>
      <div class="android-search">
        {@render Svg('search')}
        <input
          value={query}
          placeholder="Search in Ride"
          on:input={(event) => dispatch('search', event.currentTarget.value)}
          on:keydown={submitSearch}
        />
      </div>
      <button class="android-avatar-button" aria-label="Account" on:click={() => (accountPanelOpen = true)}>
        {#key avatarKey()}
          <span class="android-avatar-fallback">{initials(displayAccount)}</span>
          {#if accountAvatar()}
            <img src={accountAvatar()} alt="" on:error={hideBrokenAvatar} />
          {/if}
        {/key}
      </button>
    {/if}
  </header>

  {#if serverOffline}
    <button class="android-offline" on:click={() => dispatch('configureServer')}>Server offline. Tap to change server.</button>
  {/if}

  <main class="android-main {selectionMode ? 'is-selecting' : ''}" on:scroll={updateMainScroll}>
    {#if section === 'personal'}
      <div class="android-tabs">
        <button class:active={homeTab === 'suggested'} on:click={() => (homeTab = 'suggested')}>Suggested</button>
        <button class:active={homeTab === 'activity'} on:click={() => (homeTab = 'activity')}>Activity</button>
      </div>
      {#if homeTab === 'activity'}
        <div class="android-activity-stack">
          {#each visibleItems.filter((item) => item.type === 'file').slice(0, 8) as item (item.id)}
            {@const selected = selectedLookup.has(item.id)}
            <div
              class:selected
              class="android-activity-card"
              role="button"
              tabindex="0"
              on:pointerdown={(event) => startLongPress(item, event)}
              on:pointermove={handleMoveDrag}
              on:pointerup={cancelLongPress}
              on:pointercancel={handleMovePointerCancel}
              on:click={() => openOrSelect(item)}
              on:keydown={(event) => event.key === 'Enter' && openOrSelect(item)}
            >
              <div class="android-activity-title">
                <FileIcon {item} size={28} />
                <strong>{item.name}</strong>
                <button on:click={(event) => openSheet(item, event)}>{@render Svg('more')}</button>
              </div>
              <div class="android-activity-preview"><FileThumbnail {item} iconSize={64} /></div>
              <div class="android-activity-meta">
                <span class="android-mini-avatar" style="background:{displayAccount?.avatarColor ?? '#4167b2'}">
                  {#if accountAvatar()}<img src={accountAvatar()} alt="" />{:else}{initials(displayAccount)}{/if}
                </span>
                <span>You opened<br />{shortDate(item.openedAt || item.updatedAt)}</span>
              </div>
            </div>
          {/each}
        </div>
      {:else}
        <section class="android-list-shell">
          {@render AndroidListHeader('Files')}
          {#if viewMode === 'grid'}{@render ItemGrid(visibleItems)}{:else}{@render ItemList(visibleItems)}{/if}
        </section>
      {/if}
    {:else if section === 'drive' || section === 'workspace'}
      <div class="android-tabs">
        <button class:active={true} on:click={() => navTo('drive')}>My Ride</button>
      </div>
      <section class="android-list-shell">
        <div class="android-sort-row">
          <button on:click={() => dispatch('sort', { field: 'name' })}>Name <span class="android-sort-bubble">{@render Svg(sortDirection === 'asc' ? 'arrowUp' : 'arrowDown')}</span></button>
          {@render ViewToggle()}
        </div>
        {#if viewMode === 'grid'}{@render ItemGrid(visibleItems, false)}{:else}{@render ItemList(visibleItems)}{/if}
      </section>
    {:else if section === 'shared-with-me'}
      <section class="android-list-shell">
        <div class="android-sort-row">
          <button>Date shared <span class="android-sort-bubble">{@render Svg('arrowDown')}</span></button>
          {@render ViewToggle()}
        </div>
        <h2 class="android-year-title">Earlier this year</h2>
        {#if viewMode === 'grid'}{@render ItemGrid(visibleItems, true)}{:else}{@render ItemList(visibleItems)}{/if}
      </section>
    {:else if section === 'storage'}
      <section class="android-list-shell">
        {@render AndroidStorageSummary()}
        <div class="android-sort-row">
          <button on:click={() => dispatch('sort', { field: 'size' })}>Largest files <span class="android-sort-bubble">{@render Svg(sortDirection === 'asc' ? 'arrowUp' : 'arrowDown')}</span></button>
          {@render ViewToggle()}
        </div>
        {#if viewMode === 'grid'}{@render ItemGrid(visibleItems, false)}{:else}{@render ItemList(visibleItems)}{/if}
      </section>
    {:else}
      <section class="android-list-shell">
        {@render AndroidListHeader(primaryTitle)}
        {@render ItemList(visibleItems)}
      </section>
    {/if}

    {#if loading}
      <div class="android-loading">Loading...</div>
    {/if}
    {#if error}
      <div class="android-error">{error}</div>
    {/if}
  </main>

  {#if createMenuOpen}
    <button class="android-create-scrim" aria-label="Close create menu" on:click={() => (createMenuOpen = false)}></button>
  {/if}

  {#if moveDragActive}
    <div class:over-target={Boolean(moveDragTargetId)} class="android-move-float" style="left:{moveDragX}px;top:{moveDragY}px">
      {#if moveDragItems[0]}
        <div class="android-move-preview">
          <span class="android-move-preview-icon">
            <FileIcon item={moveDragItems[0]} size={22} />
          </span>
          <strong>{moveDragItems[0].name}</strong>
        </div>
      {/if}
      {#if moveDragItems.length > 1}
        <span class="android-move-count">{moveDragItems.length}</span>
      {/if}
    </div>
  {/if}

  {#if !selectionMode && !drawerOpen && !actionsHidden && !accountPanelOpen && !sheetItem && !infoItem && !cameraOpen}
    <div class:create-open={createMenuOpen} class:scrolled={mainScrolled} class="android-fabs">
      {#if createMenuOpen}
        <div class="android-create-actions">
          <button on:click={() => createOffice('presentation')}><span>{@render Svg('slides')}</span>Slides</button>
          <button on:click={() => createOffice('spreadsheet')}><span>{@render Svg('sheet')}</span>Sheets</button>
          <button on:click={() => createOffice('document')}><span>{@render Svg('doc')}</span>Docs</button>
          <button on:click={openCamera}><span>{@render Svg('camera')}</span>Scan</button>
          <button on:click={() => { createMenuOpen = false; dispatch('upload'); }}><span>{@render Svg('upload')}</span>Upload</button>
          <button on:click={() => { createMenuOpen = false; dispatch('newFolder'); }}><span>{@render Svg('folderNav')}</span>Folder</button>
        </div>
      {:else}
        <button class="camera" aria-label="Scan" on:click={openCamera}>{@render Svg('camera')}</button>
      {/if}
      <button class="create" aria-label="Create" on:click={() => (createMenuOpen = !createMenuOpen)}>
        {@render Svg(createMenuOpen ? 'close' : 'plusLarge')}
      </button>
    </div>
  {/if}

  <nav class="android-bottom-nav">
    <button class:active={section === 'personal'} on:click={() => navTo('personal')}><span class="android-nav-icon">{@render Svg('home')}</span><span>Home</span></button>
    <button class:active={section === 'starred'} on:click={() => navTo('starred')}><span class="android-nav-icon">{@render Svg('star')}</span><span>Starred</span></button>
    <button class:active={section === 'shared-with-me'} on:click={() => navTo('shared-with-me')}><span class="android-nav-icon">{@render Svg('shared')}</span><span>Shared</span></button>
    <button class:active={section === 'drive' || section === 'workspace'} on:click={() => navTo('drive')}><span class="android-nav-icon">{@render Svg('folderNav')}</span><span>Files</span></button>
  </nav>
  {/if}

  {#if sheetItem}
    <button class="android-sheet-scrim" aria-label="Close actions" on:click={() => (sheetItem = null)}></button>
    <section class="android-bottom-sheet">
      <div class="android-sheet-handle"></div>
      <div class="android-sheet-title">
        <FileIcon item={sheetItem} size={34} />
        <strong>{sheetItem.name}</strong>
      </div>
      {#if sheetItem.trashed || section === 'trash'}
        <button on:click={() => (sheetItem = null)}>{@render Svg('folderNav')}<span>Show file location</span></button>
        <button on:click={() => sheetAction('info')}>{@render Svg('info')}<span>View information</span></button>
        <button on:click={() => sheetAction('restore')}>{@render Svg('recent')}<span>Restore</span></button>
        <button class="danger" on:click={() => sheetAction('hardDelete')}>{@render Svg('trash')}<span>Delete forever</span></button>
      {:else}
        <button on:click={() => sheetAction('share')}>{@render Svg('personAdd')}<span>Share</span></button>
        <button on:click={() => sheetAction('share')}>{@render Svg('shared')}<span>Manage access</span></button>
        <button on:click={() => sheetAction('star')}>{@render Svg('star')}<span>{sheetItem.starred ? 'Remove from starred' : 'Add to starred'}</span></button>
        <button on:click={() => sheetItem && makeOffline([sheetItem])}>{@render Svg('offline')}<span>Make available offline</span></button>
        <hr />
        <button on:click={() => sheetAction('share')}>{@render Svg('link')}<span>Copy link</span></button>
        <button>{@render Svg('copy')}<span>Make a copy</span></button>
        <button on:click={() => sheetItem && sendCopy(sheetItem)}>{@render Svg('send')}<span>Send a copy</span></button>
        <hr />
        <button
          on:click={() => {
            const target = sheetItem;
            sheetItem = null;
            if (target) dispatch('open', target);
          }}
        >
          {@render Svg('openWith')}<span>Open with</span>
        </button>
        <button on:click={() => sheetAction('download')}>{@render Svg('download')}<span>Download</span></button>
        <button on:click={() => sheetAction('rename')}>{@render Svg('rename')}<span>Rename</span></button>
        <button on:click={() => sheetAction('info')}>{@render Svg('info')}<span>View information</span></button>
        <button on:click={() => sheetItem && addShortcut(sheetItem)}>{@render Svg('shortcut')}<span>Add shortcut</span></button>
        <button on:click={() => sheetAction('move')}>{@render Svg('move')}<span>Move</span></button>
        <button class="danger" on:click={() => sheetAction('trash')}>{@render Svg('trash')}<span>Move to trash</span></button>
      {/if}
    </section>
  {/if}

  {#if selectionSheetOpen}
    <button class="android-sheet-scrim" aria-label="Close selected actions" on:click={() => (selectionSheetOpen = false)}></button>
    <section class="android-bottom-sheet selected-actions">
      <div class="android-sheet-handle"></div>
      {#if section === 'trash'}
        <button on:click={() => selectedSheetAction('restore')}>{@render Svg('recent')}<span>Restore</span></button>
        <button class="danger" on:click={() => selectedSheetAction('hardDelete')}>{@render Svg('deleteForever')}<span>Delete forever</span></button>
      {:else}
        <button on:click={() => selectedSheetAction('star')}>{@render Svg('star')}<span>Add to starred</span></button>
        <button on:click={() => makeOffline(visibleItems.filter((item) => selectedLookup.has(item.id)))}>
          {@render Svg('offline')}<span>Make available offline</span>
        </button>
        <button class="danger" on:click={() => selectedSheetAction('trash')}>{@render Svg('trash')}<span>Move to trash</span></button>
        <hr />
        <button
          on:click={() => {
            const target = selectedVisibleItems()[0];
            selectionSheetOpen = false;
            if (target) dispatch('addShortcut', target);
          }}
        >
          {@render Svg('shortcut')}<span>Add shortcut</span>
        </button>
      {/if}
    </section>
  {/if}
</div>

{#snippet AndroidListHeader(title: string)}
  <div class="android-section-header">
    <h1>{title}</h1>
    {@render ViewToggle()}
  </div>
{/snippet}

{#snippet AndroidStorageSummary()}
  <div class="android-storage-summary">
    <div class="android-storage-summary-head">
      <span>Storage used</span>
      <strong>{formatBytes(summary?.usedBytes ?? 0)}</strong>
      <small>of {formatBytes(summary?.totalBytes ?? 0)}</small>
    </div>
    <div class="android-storage-meter" aria-label="Storage usage by file type">
      {#if storageCategories.length}
        {#each storageCategories as category (category.id)}
          <span
            style="width:{storageWidth(category)}%;background:{storageColors[category.id]}"
            title={`${category.label}: ${formatBytes(category.bytes)}`}
          ></span>
        {/each}
      {:else}
        <span class="empty" style="width:100%"></span>
      {/if}
    </div>
    <div class="android-storage-categories">
      {#each storageCategories as category (category.id)}
        <div>
          <span class="dot" style="background:{storageColors[category.id]}"></span>
          <span class="label">{category.label}</span>
          <strong>{storageCategoryPercent(category)}</strong>
          <small>{formatBytes(category.bytes)}</small>
        </div>
      {/each}
      {#if !storageCategories.length}
        <p>No storage usage yet</p>
      {/if}
    </div>
  </div>
{/snippet}

{#snippet ViewToggle()}
  <div class="android-view-toggle" aria-label="View mode">
    <button class:active={viewMode === 'list'} on:click={() => toggleViewMode('list')}>{@render Svg('list')}</button>
    <button class:active={viewMode === 'grid'} on:click={() => toggleViewMode('grid')}>{@render Svg('grid')}</button>
  </div>
{/snippet}

{#snippet ItemList(source: DriveItem[])}
  <div class="android-list">
    {#each source as item (item.id)}
      {@const selected = selectedLookup.has(item.id)}
      <div
        class:selected
        class:move-target-active={item.id === moveDragTargetId}
        class="android-list-item"
        data-android-folder-id={item.type === 'folder' ? item.id : undefined}
        role="button"
        tabindex="0"
        on:pointerdown={(event) => startLongPress(item, event)}
        on:pointermove={handleMoveDrag}
        on:pointerup={cancelLongPress}
        on:pointercancel={handleMovePointerCancel}
        on:click={() => openOrSelect(item)}
        on:keydown={(event) => event.key === 'Enter' && openOrSelect(item)}
      >
        <div class="android-item-icon" class:folder-item-icon={item.type === 'folder'}>{@render AndroidFileIcon(item, 34)}</div>
        <div class="android-item-text">
          <strong>{item.name}</strong>
          <span>{itemSubtitle(item)}</span>
        </div>
        {#if selectionMode}
          <button class="android-check" class:checked={selected} on:click|stopPropagation={() => dispatch('select', { item, mode: 'toggle' })}>
            {#if selected}{@render Svg('check')}{/if}
          </button>
        {:else}
          <button class="android-more" on:click={(event) => openSheet(item, event)} aria-label="More actions">{@render Svg('more')}</button>
        {/if}
      </div>
    {/each}
  </div>
{/snippet}

{#snippet ItemGrid(source: DriveItem[], shared = false)}
  <div class="android-grid">
    {#each source as item (item.id)}
      {@const selected = selectedLookup.has(item.id)}
      <div
        class:selected
        class:move-target-active={item.id === moveDragTargetId}
        class="android-grid-item"
        data-android-folder-id={item.type === 'folder' ? item.id : undefined}
        role="button"
        tabindex="0"
        on:pointerdown={(event) => startLongPress(item, event)}
        on:pointermove={handleMoveDrag}
        on:pointerup={cancelLongPress}
        on:pointercancel={handleMovePointerCancel}
        on:click={() => openOrSelect(item)}
        on:keydown={(event) => event.key === 'Enter' && openOrSelect(item)}
      >
        <header>
          {@render AndroidFileIcon(item, 26)}
          <strong>{item.name}</strong>
          <button on:click={(event) => openSheet(item, event)}>{@render Svg('more')}</button>
        </header>
        <div class="android-grid-preview">
          {#if item.type === 'folder'}
            {@render AndroidFileIcon(item, 84)}
          {:else}
            <FileThumbnail {item} iconSize={74} />
          {/if}
          {#if shared}<span class="android-shared-badge">{@render Svg('shared')}</span>{/if}
        </div>
        {#if selectionMode}
          <span class="android-check grid-check" class:checked={selected}>{#if selected}{@render Svg('check')}{/if}</span>
        {/if}
      </div>
    {/each}
  </div>
{/snippet}

{#snippet AndroidFileIcon(item: DriveItem, size = 40)}
  {#if item.type === 'folder'}
    <svg class="android-folder-icon" style={`width:${size}px;height:${size}px`} viewBox="0 0 24 24" aria-hidden="true">
      <path d="M10 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z" />
    </svg>
  {:else}
    <FileIcon {item} {size} />
  {/if}
{/snippet}

{#snippet Svg(name: string)}
  <svg viewBox="0 0 24 24" aria-hidden="true">
    {#if name === 'menu'}<path d="M3 6h18v2H3V6zm0 5h18v2H3v-2zm0 5h18v2H3v-2z" />
    {:else if name === 'arrowBack'}<path d="M20 11H7.83l5.58-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z" />
    {:else if name === 'search'}<path d="M9.5 3a6.5 6.5 0 0 1 5.16 10.45l4.45 4.44-1.42 1.42-4.44-4.45A6.5 6.5 0 1 1 9.5 3zm0 2a4.5 4.5 0 1 0 0 9 4.5 4.5 0 0 0 0-9z" />
    {:else if name === 'close'}<path d="M18.3 5.71 12 12l6.3 6.29-1.41 1.41L10.59 13.41 4.29 19.71 2.88 18.3 9.17 12 2.88 5.71 4.29 4.29l6.3 6.3 6.29-6.3z" />
    {:else if name === 'more'}<path d="M12 8a2 2 0 1 0 0-4 2 2 0 0 0 0 4zm0 2a2 2 0 1 0 0 4 2 2 0 0 0 0-4zm0 6a2 2 0 1 0 0 4 2 2 0 0 0 0-4z" />
    {:else if name === 'list'}<path d="M4 7h2v2H4V7zm4 0h12v2H8V7zM4 11h2v2H4v-2zm4 0h12v2H8v-2zm-4 4h2v2H4v-2zm4 0h12v2H8v-2z" />
    {:else if name === 'grid'}<path d="M4 4h7v7H4V4zm2 2v3h3V6H6zm7-2h7v7h-7V4zm2 2v3h3V6h-3zM4 13h7v7H4v-7zm2 2v3h3v-3H6zm7-2h7v7h-7v-7zm2 2v3h3v-3h-3z" />
    {:else if name === 'home'}<path d="M12 3 3 11h2v9h5v-6h4v6h5v-9h2L12 3z" />
    {:else if name === 'star'}<path d="m12 2.7 2.86 6.01 6.58.87-4.82 4.55 1.2 6.54L12 17.5l-5.82 3.17 1.2-6.54-4.82-4.55 6.58-.87L12 2.7zm0 4.55-1.53 3.22-3.53.47 2.58 2.43-.64 3.5L12 15.18l3.12 1.7-.64-3.5 2.58-2.43-3.53-.47L12 7.25z" />
    {:else if name === 'shared'}<path d="M16 11c1.66 0 3-1.57 3-3.5S17.66 4 16 4s-3 1.57-3 3.5S14.34 11 16 11zM8 11c1.66 0 3-1.57 3-3.5S9.66 4 8 4 5 5.57 5 7.5 6.34 11 8 11zm0 2c-2.67 0-6 1.34-6 3v2h12v-2c0-1.66-3.33-3-6-3zm8 0c-.31 0-.66.02-1.03.06 1.16.84 2.03 1.96 2.03 3.44V18h5v-2c0-1.66-3.33-3-6-3z" />
    {:else if name === 'folderNav'}<path d="M10 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z" />
    {:else if name === 'doc'}<path d="M14 2H6c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V8l-6-6zM8 12h8v2H8v-2zm0 4h8v2H8v-2zm6-12.5L18.5 8H14V3.5z" />
    {:else if name === 'sheet'}<path d="M14 2H6c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V8l-6-6zM8 11h3V8h2v3h3v2h-3v3h-2v-3H8v-2zm6-7.5L18.5 8H14V3.5z" />
    {:else if name === 'slides'}<path d="M14 2H6c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V8l-6-6zM8 11h8v6H8v-6zm6-7.5L18.5 8H14V3.5z" />
    {:else if name === 'driveFile'}<path d="M14 2H6c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V8l-6-6zm1 14H9l3-7 3 7zm-1-12.5L18.5 8H14V3.5z" />
    {:else if name === 'info'}<path d="M11 17h2v-6h-2v6zm1-14a9 9 0 1 0 0 18 9 9 0 0 0 0-18zm0 16a7 7 0 1 1 0-14 7 7 0 0 1 0 14zm-1-10h2V7h-2v2z" />
    {:else if name === 'lock'}<path d="M17 9h-1V7a4 4 0 0 0-8 0v2H7c-1.1 0-2 .9-2 2v8c0 1.1.9 2 2 2h10c1.1 0 2-.9 2-2v-8c0-1.1-.9-2-2-2zm-7-2a2 2 0 1 1 4 0v2h-4V7zm7 12H7v-8h10v8z" />
    {:else if name === 'chevronRight'}<path d="m9.29 6.71 1.42-1.42L17.41 12l-6.7 6.71-1.42-1.42L14.59 12 9.29 6.71z" />
    {:else if name === 'plusLarge' || name === 'plus'}<path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z" />
    {:else if name === 'camera' || name === 'cameraSmall'}<path d="M20 5h-3.17l-1.84-2H9.01L7.17 5H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm-8 13a5 5 0 1 1 0-10 5 5 0 0 1 0 10zm0-2a3 3 0 1 0 0-6 3 3 0 0 0 0 6z" />
    {:else if name === 'imageAdd'}<path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V9h-2v10H5V5h10V3H5zm-2 0v2h-2v2h2v2h2V7h2V5h-2V3h-2zM8.5 11.5 6 15h12l-3.5-4.5-2.5 3.01-1.5-2.01-2 0z" />
    {:else if name === 'flash'}<path d="M7 2v11h3v9l7-12h-4l4-8H7z" />
    {:else if name === 'flashOff'}<path d="m3.27 2 18.02 18.02-1.27 1.27-4.32-4.32L10 22v-9H7V8.27L2 3.27 3.27 2zM9 4.1 12.9 8H17l-2.3 4.6L8.52 6.42 9 4.1z" />
    {:else if name === 'recent'}<path d="M12 3a9 9 0 1 1-8.49 6H1l4-4 4 4H6.63A7 7 0 1 0 12 5V3zm1 4h-2v6l5 3 1-1.73-4-2.27V7z" />
    {:else if name === 'upload'}<path d="M5 20h14v-2H5v2zM19 9h-4V3H9v6H5l7 7 7-7z" />
    {:else if name === 'offline'}<path d="M12 2a10 10 0 1 0 10 10h-2a8 8 0 1 1-2.34-5.66L12 12l-3-3-1.42 1.41L12 14.83l7.07-7.07A9.96 9.96 0 0 0 12 2z" />
    {:else if name === 'trash'}<path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM8.5 4l1-1h5l1 1H19v2H5V4h3.5z" />
    {:else if name === 'deleteForever'}<path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zm3.46-8.12 1.41-1.41L12 10.59l1.12-1.12 1.41 1.41L13.41 12l1.12 1.12-1.41 1.41L12 13.41l-1.13 1.12-1.41-1.41L10.59 12l-1.13-1.12zM8.5 4l1-1h5l1 1H19v2H5V4h3.5z" />
    {:else if name === 'spam'}<path d="M15.73 3H8.27L3 8.27v7.46L8.27 21h7.46L21 15.73V8.27L15.73 3zM11 7h2v6h-2V7zm0 8h2v2h-2v-2z" />
    {:else if name === 'settings'}<path d="m19.43 12.98.04-.98-.04-.98 2.11-1.65-2-3.46-2.49 1a8.3 8.3 0 0 0-1.69-.98L15 3.25h-4l-.36 2.68c-.6.24-1.17.57-1.69.98l-2.49-1-2 3.46 2.11 1.65-.04.98.04.98-2.11 1.65 2 3.46 2.49-1c.52.41 1.09.74 1.69.98L11 20.75h4l.36-2.68c.6-.24 1.17-.57 1.69-.98l2.49 1 2-3.46-2.11-1.65zM13 15.5a3.5 3.5 0 1 1 0-7 3.5 3.5 0 0 1 0 7z" />
    {:else if name === 'help'}<path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm1 17h-2v-2h2v2zm2.07-7.75-.9.92C13.45 12.9 13 13.5 13 15h-2v-.5c0-1.1.45-2.1 1.17-2.83l1.24-1.26c.37-.36.59-.86.59-1.41a2 2 0 0 0-4 0H8a4 4 0 1 1 7.07 2.25z" />
    {:else if name === 'storage' || name === 'cloud'}<path d="M19.35 10.04A7.5 7.5 0 0 0 5.35 8.04 6 6 0 0 0 6 20h13a5 5 0 0 0 .35-9.96z" />
    {:else if name === 'selectAll'}<path d="M3 3h6v2H5v4H3V3zm12 0h6v6h-2V5h-4V3zM3 15h2v4h4v2H3v-6zm16 0h2v6h-6v-2h4v-4zM8 8h8v8H8V8z" />
    {:else if name === 'check'}<path d="M9 16.2 4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4L9 16.2z" />
    {:else if name === 'arrowUp'}<path d="M4 12l1.41 1.41L11 7.83V20h2V7.83l5.59 5.58L20 12 12 4l-8 8z" />
    {:else if name === 'arrowDown'}<path d="M4 12l1.41-1.41L11 16.17V4h2v12.17l5.59-5.58L20 12l-8 8-8-8z" />
    {:else if name === 'chevronUp'}<path d="M7.41 14.59 12 10l4.59 4.59L18 13.17l-6-6-6 6z" />
    {:else if name === 'personAdd'}<path d="M15 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zM6 10V7H3V5h3V2h2v3h3v2H8v3H6zm9 4c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" />
    {:else if name === 'link'}<path d="M3.9 12a3.1 3.1 0 0 1 3.1-3.1h4V7H7a5 5 0 0 0 0 10h4v-1.9H7A3.1 3.1 0 0 1 3.9 12zM8 13h8v-2H8v2zm9-6h-4v1.9h4a3.1 3.1 0 0 1 0 6.2h-4V17h4a5 5 0 0 0 0-10z" />
    {:else if name === 'copy'}<path d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v16h13c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2z" />
    {:else if name === 'send'}<path d="M2 12 22 3l-4 18-6-6-4 4-1-7-5 0zm7.2-1.2.5 3.5 7.4-7.4-7.9 3.9z" />
    {:else if name === 'openWith'}<path d="M10 3H3v7h2V6.41l4.3 4.3 1.4-1.42L6.42 5H10V3zm4 0v2h3.59l-4.3 4.3 1.42 1.4 4.29-4.28V10h2V3h-7zM5 14H3v7h7v-2H6.41l4.3-4.3-1.42-1.4L5 17.58V14zm14 3.59-4.3-4.3-1.4 1.42 4.28 4.29H14v2h7v-7h-2v3.59z" />
    {:else if name === 'download'}<path d="M5 20h14v-2H5v2zM19 9h-4V3H9v6H5l7 7 7-7z" />
    {:else if name === 'rename'}<path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04a1 1 0 0 0 0-1.41l-2.34-2.34a1 1 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z" />
    {:else if name === 'shortcut'}<path d="M10.59 13.41 8 10.83 5.41 13.41 4 12l4-4 4 4-1.41 1.41zM18 20H8v-7h2v5h8V6h-5V4h5c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2z" />
    {:else if name === 'move'}<path d="M20 6h-8.17l-2-2H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2zm-5 10v-2H9v-2h6v-2l4 3-4 3z" />
    {:else if name === 'manage'}<path d="M16 11c1.66 0 3-1.57 3-3.5S17.66 4 16 4s-3 1.57-3 3.5S14.34 11 16 11zM8 11c1.66 0 3-1.57 3-3.5S9.66 4 8 4 5 5.57 5 7.5 6.34 11 8 11zm7.5 4.5 1.2-1.2 1.4 1.4-1.2 1.2c.1.3.1.6.1.9s0 .6-.1.9l1.2 1.2-1.4 1.4-1.2-1.2c-.3.1-.6.1-.9.1s-.6 0-.9-.1l-1.2 1.2-1.4-1.4 1.2-1.2c-.1-.3-.1-.6-.1-.9s0-.6.1-.9l-1.2-1.2 1.4-1.4 1.2 1.2c.3-.1.6-.1.9-.1s.6 0 .9.1z" />
    {/if}
  </svg>
{/snippet}

<style>
  :global(html:has(.android-drive)),
  :global(body:has(.android-drive)) {
    background: #191b21;
  }

  .android-drive {
    --bg: #191b21;
    --surface: #101116;
    --surface-2: #202126;
    --surface-3: #2a2c35;
    --selected: #4b5366;
    --text: #eff0f7;
    --muted: #c4c6d1;
    --blue: #b9c7ff;
    --blue-dark: #334a82;
    min-height: 100dvh;
    background: var(--bg);
    color: var(--text);
    font-family: Roboto, system-ui, sans-serif;
    overflow: hidden;
    user-select: none;
    -webkit-user-select: none;
    touch-action: manipulation;
  }

  :global([data-theme='light']) .android-drive {
    --bg: #f8fafd;
    --surface: #ffffff;
    --surface-2: #edf2fa;
    --surface-3: #dfe5ef;
    --selected: #d3e3fd;
    --text: #202124;
    --muted: #5f6368;
    --blue: #0b57d0;
    --blue-dark: #d3e3fd;
  }

  :global([data-theme='light']:has(.android-drive)),
  :global([data-theme='light'] body:has(.android-drive)) {
    background: #f8fafd;
  }

  :global([data-theme='light']) .android-topbar,
  :global([data-theme='light']) .android-titlebar,
  :global([data-theme='light']) .android-camera-top,
  :global([data-theme='light']) .android-drive {
    background: var(--bg);
    color: var(--text);
  }

  :global([data-theme='light']) .android-search,
  :global([data-theme='light']) .android-item-icon,
  :global([data-theme='light']) .android-loading,
  :global([data-theme='light']) .android-error {
    background: #edf2fa;
    color: #3c4043;
  }

  :global([data-theme='light']) .android-search input {
    color: #202124;
  }

  :global([data-theme='light']) .android-search input::placeholder,
  :global([data-theme='light']) .android-item-text span,
  :global([data-theme='light']) .android-account-row small,
  :global([data-theme='light']) .android-account-storage p {
    color: #5f6368;
  }

  :global([data-theme='light']) .android-list,
  :global([data-theme='light']) .android-grid,
  :global([data-theme='light']) .android-activity-stack {
    background: #f8fafd;
  }

  :global([data-theme='light']) .android-list-item,
  :global([data-theme='light']) .android-grid-item,
  :global([data-theme='light']) .android-activity-card,
  :global([data-theme='light']) .android-list-shell,
  :global([data-theme='light']) .android-storage-summary {
    background: #ffffff;
    color: #202124;
  }

  :global([data-theme='light']) .android-list-item.selected,
  :global([data-theme='light']) .android-grid-item.selected,
  :global([data-theme='light']) .android-activity-card.selected {
    background: #d3e3fd;
  }

  :global([data-theme='light']) .android-list-item.move-target-active,
  :global([data-theme='light']) .android-grid-item.move-target-active {
    background: #e8f0fe;
    box-shadow: inset 0 0 0 1.5px #0b57d0, 0 5px 14px rgb(60 64 67 / 0.18);
  }

  :global([data-theme='light']) .android-section-header,
  :global([data-theme='light']) .android-sort-row,
  :global([data-theme='light']) .android-storage-summary {
    border-color: #e0e0e0;
  }

  :global([data-theme='light']) .android-section-header h1,
  :global([data-theme='light']) .android-sort-row button:first-child,
  :global([data-theme='light']) .android-tabs button.active,
  :global([data-theme='light']) .android-item-text strong,
  :global([data-theme='light']) .android-grid-item strong,
  :global([data-theme='light']) .android-activity-title strong,
  :global([data-theme='light']) .android-storage-summary-head strong,
  :global([data-theme='light']) .android-storage-categories .label,
  :global([data-theme='light']) .android-storage-categories strong {
    color: #202124;
  }

  :global([data-theme='light']) .android-tabs button,
  :global([data-theme='light']) .android-storage-summary-head,
  :global([data-theme='light']) .android-storage-summary-head small,
  :global([data-theme='light']) .android-storage-categories small,
  :global([data-theme='light']) .android-storage-categories p {
    color: #5f6368;
  }

  :global([data-theme='light']) .android-bottom-nav,
  :global([data-theme='light']) .android-drawer,
  :global([data-theme='light']) .android-bottom-sheet,
  :global([data-theme='light']) .android-account-panel {
    background: #ffffff;
    color: #202124;
  }

  :global([data-theme='light']) .android-bottom-nav {
    border-top: 1px solid #e0e0e0;
  }

  :global([data-theme='light']) .android-bottom-nav button.active .android-nav-icon,
  :global([data-theme='light']) .android-round-icon,
  :global([data-theme='light']) .android-add-account,
  :global([data-theme='light']) .android-storage-meter,
  :global([data-theme='light']) .android-account-card,
  :global([data-theme='light']) .android-account-storage,
  :global([data-theme='light']) .android-storage-categories div {
    background: #edf2fa;
  }

  :global([data-theme='light']) .android-bottom-nav button,
  :global([data-theme='light']) .android-drawer-nav button,
  :global([data-theme='light']) .android-bottom-sheet button,
  :global([data-theme='light']) .android-account-card-title,
  :global([data-theme='light']) .android-account-row {
    color: #202124;
  }

  :global([data-theme='light']) .android-drawer-title,
  :global([data-theme='light']) .android-account-row,
  :global([data-theme='light']) .android-bottom-sheet hr {
    border-color: #e0e0e0 !important;
  }

  :global([data-theme='light']) .android-more,
  :global([data-theme='light']) .android-bottom-sheet button svg,
  :global([data-theme='light']) .android-drawer-nav svg {
    color: #5f6368;
  }

  :global([data-theme='light']) .android-bottom-sheet button,
  :global([data-theme='light']) .android-bottom-sheet button span {
    color: #202124;
  }

  :global([data-theme='light']) .android-bottom-sheet button:active {
    background: #e8f0fe;
  }

  :global([data-theme='light']) .android-bottom-sheet button.danger,
  :global([data-theme='light']) .android-bottom-sheet button.danger span,
  :global([data-theme='light']) .android-bottom-sheet button.danger svg {
    color: #b3261e;
  }

  :global([data-theme='light']) .android-info-screen,
  :global([data-theme='light']) .android-info-main {
    background: #f8fafd;
    color: #202124;
  }

  :global([data-theme='light']) .android-info-screen .android-titlebar h1,
  :global([data-theme='light']) .android-info-screen .android-titlebar button {
    color: #202124;
  }

  :global([data-theme='light']) .android-info-preview {
    background: #edf2fa;
  }

  :global([data-theme='light']) .android-info-facts dt,
  :global([data-theme='light']) .android-info-event small,
  :global([data-theme='light']) .android-info-event time,
  :global([data-theme='light']) .android-info-activity p {
    color: #5f6368;
  }

  :global([data-theme='light']) .android-info-facts dd,
  :global([data-theme='light']) .android-info-facts dd span,
  :global([data-theme='light']) .android-info-access h2,
  :global([data-theme='light']) .android-info-activity h2,
  :global([data-theme='light']) .android-info-access strong,
  :global([data-theme='light']) .android-info-event strong {
    color: #202124;
  }

  :global([data-theme='light']) .android-info-icon-row svg,
  :global([data-theme='light']) .android-info-access h2 svg {
    color: #5f6368;
  }

  :global([data-theme='light']) .android-lock {
    background: #edf2fa;
    color: #0b57d0;
  }

  :global([data-theme='light']) .android-info-event {
    border-color: #dadce0;
  }

  @keyframes android-select-pop {
    0% {
      transform: scale(0.985);
    }
    65% {
      transform: scale(1.012);
    }
    100% {
      transform: scale(1);
    }
  }

  @keyframes android-sheet-up {
    from {
      opacity: 0;
      transform: translateY(34px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  @keyframes android-panel-fade {
    from {
      opacity: 0;
      transform: translateY(10px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  @keyframes android-drawer-in {
    from {
      opacity: 0.7;
      transform: translateX(-18px);
    }
    to {
      opacity: 1;
      transform: translateX(0);
    }
  }

  @keyframes android-move-float-in {
    from {
      opacity: 0;
      transform: translate(4px, -50%) scale(0.94);
    }
    to {
      opacity: 1;
      transform: translate(12px, -50%) scale(1);
    }
  }

  .android-drive button {
    border: 0;
    background: transparent;
    color: inherit;
    font: inherit;
    -webkit-tap-highlight-color: transparent;
  }

  .android-drive * {
    -webkit-tap-highlight-color: transparent;
    -webkit-touch-callout: none;
  }

  .android-drive svg {
    width: 24px;
    height: 24px;
    fill: currentColor;
    display: block;
  }

  .android-folder-icon {
    color: #c7c9d4;
  }

  .android-camera-screen {
    position: fixed;
    inset: 0;
    z-index: 120;
    overflow: hidden;
    background:
      radial-gradient(circle at 50% 34%, rgb(32 34 40 / 0.42), transparent 34%),
      linear-gradient(180deg, #050507 0%, #0a0b0d 58%, #101114 100%);
    color: #f4f6fb;
  }

  .android-camera-screen video {
    position: absolute;
    inset: 0 0 auto;
    width: 100%;
    height: min(72dvh, 760px);
    object-fit: cover;
    opacity: 0;
    border-radius: 0 0 28px 28px;
    background: #111;
    transition: opacity 160ms ease-out;
  }

  .android-camera-screen video.ready {
    opacity: 1;
  }

  .android-camera-top {
    position: relative;
    z-index: 2;
    display: grid;
    grid-template-columns: 64px minmax(0, 1fr) 64px;
    align-items: center;
    gap: 8px;
    padding: max(16px, env(safe-area-inset-top)) 20px 0;
  }

  .android-camera-top h1 {
    margin: 0;
    overflow: hidden;
    text-align: center;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 24px;
    font-weight: 400;
    text-shadow: 0 1px 8px rgb(0 0 0 / 0.45);
  }

  .android-camera-top button,
  .android-camera-controls .gallery,
  .android-camera-controls .record {
    display: grid;
    place-items: center;
    width: 54px;
    height: 54px;
    border-radius: 999px !important;
    background: rgb(0 0 0 / 0.64) !important;
    color: #f3f5fa;
  }

  .android-camera-top button.active {
    background: rgb(245 245 245 / 0.92) !important;
    color: #111827;
  }

  .android-camera-top svg,
  .android-camera-controls svg {
    width: 32px;
    height: 32px;
  }

  .android-camera-error {
    position: absolute;
    left: 22px;
    right: 22px;
    top: 128px;
    z-index: 3;
    border-radius: 18px;
    background: rgb(0 0 0 / 0.7);
    color: #f4d3d3;
    padding: 14px 16px;
    text-align: center;
    font-size: 15px;
  }

  .android-camera-controls {
    position: absolute;
    left: 0;
    right: 0;
    bottom: calc(54px + env(safe-area-inset-bottom));
    z-index: 2;
    display: grid;
    grid-template-columns: 1fr 1fr 1fr;
    align-items: center;
    justify-items: center;
    padding: 0 26px;
  }

  .android-camera-controls .gallery {
    justify-self: start;
    width: 70px;
    height: 70px;
    background: #075a8d !important;
  }

  .android-camera-controls .shutter {
    width: 102px;
    height: 102px;
    border: 4px solid #f7f7f7 !important;
    border-radius: 999px !important;
    background: #fff !important;
    box-shadow: inset 0 0 0 4px #090a0c, 0 0 0 2px #fff;
  }

  .android-camera-controls .shutter:disabled {
    opacity: 0.55;
  }

  .android-camera-controls .record {
    justify-self: end;
    width: 78px;
    height: 78px;
    border: 5px solid #f7f7f7 !important;
    background: #0a0a0b !important;
  }

  .android-camera-controls .record span {
    width: 28px;
    height: 28px;
    border-radius: 999px;
    background: #fff;
    transition:
      width 140ms ease,
      height 140ms ease,
      border-radius 140ms ease,
      background 140ms ease;
  }

  .android-camera-controls .record.recording span {
    width: 24px;
    height: 24px;
    border-radius: 6px;
    background: #e94335;
  }

  .android-camera-controls .record:disabled {
    opacity: 0.45;
  }

  .android-topbar {
    position: sticky;
    top: 0;
    z-index: 30;
    display: grid;
    grid-template-columns: 44px minmax(0, 1fr) 44px;
    align-items: center;
    gap: 8px;
    min-height: 68px;
    padding: max(8px, env(safe-area-inset-top)) 14px 6px;
    background: var(--bg);
  }

  .android-topbar.selection {
    grid-template-columns: 44px minmax(0, 1fr) 44px 40px;
    color: var(--blue);
    font-size: 20px;
  }

  .android-topbar > button {
    display: grid;
    place-items: center;
    min-width: 40px;
    height: 42px;
    color: #d4d7e6;
  }

  .android-topbar-spacer {
    margin-left: auto;
  }

  .android-search {
    display: flex;
    align-items: center;
    height: 48px;
    min-width: 0;
    border-radius: 28px;
    background: #292a31;
    padding: 0 16px;
    color: #c6c8d4;
  }

  .android-search svg {
    display: none;
  }

  .android-search input {
    width: 100%;
    min-width: 0;
    border: 0;
    outline: 0;
    background: transparent;
    color: #eef0f6;
    text-align: center;
    font-size: 19px;
  }

  .android-search input::placeholder {
    color: #c6c8d4;
    opacity: 1;
  }

  .android-avatar-button {
    position: relative;
    display: grid;
    place-items: center;
    overflow: hidden;
    width: 42px;
    height: 42px;
    border-radius: 999px;
    background: #4167b2;
    color: #fff;
    font-size: 18px;
    font-weight: 700;
  }

  .android-avatar-fallback {
    position: relative;
    z-index: 0;
  }

  .android-avatar-button img {
    position: absolute;
    inset: 0;
    z-index: 1;
    border-radius: inherit;
  }

  .android-avatar-button img,
  .android-mini-avatar img,
  .android-account-photo img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .android-offline {
    display: block;
    width: calc(100% - 32px);
    margin: 0 16px 8px;
    border-radius: 14px !important;
    background: #3d3016 !important;
    color: #ffdf8a !important;
    padding: 10px 14px;
    text-align: left;
  }

  .android-main {
    height: calc(100dvh - 68px);
    overflow-y: auto;
    padding: 0 10px 96px;
    scrollbar-width: none;
  }

  .android-main.is-selecting {
    height: calc(100dvh - 68px);
  }

  .android-main::-webkit-scrollbar {
    display: none;
  }

  .android-titlebar {
    position: sticky;
    top: 0;
    z-index: 30;
    display: grid;
    grid-template-columns: 48px minmax(0, 1fr) 48px;
    align-items: center;
    min-height: 78px;
    padding: max(10px, env(safe-area-inset-top)) 18px 8px;
    background: var(--bg);
    color: #dfe1ea;
  }

  .android-titlebar.selection {
    grid-template-columns: 48px minmax(0, 1fr) 48px 48px 36px;
    color: var(--blue);
  }

  .android-titlebar button {
    display: grid;
    place-items: center;
    width: 44px;
    height: 44px;
    color: #d9dbe5;
  }

  .android-titlebar h1 {
    overflow: hidden;
    margin: 0;
    color: #e8eaf3;
    font-size: 24px;
    font-weight: 400;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .android-titlebar.selection h1 {
    color: var(--blue);
  }

  .android-trash-main {
    height: calc(100dvh - 78px);
    overflow-y: auto;
    padding: 0 10px calc(18px + env(safe-area-inset-bottom));
    scrollbar-width: none;
  }

  .android-trash-main::-webkit-scrollbar {
    display: none;
  }

  .android-trash-notice {
    display: grid;
    gap: 10px;
    min-height: 92px;
    margin: 8px 0 16px;
    border-radius: 28px;
    background: #292a31;
    padding: 20px 34px;
  }

  .android-trash-notice p {
    margin: 0;
    color: #d7d9e2;
    font-size: 16.5px;
    line-height: 1.2;
    white-space: nowrap;
  }

  .android-trash-notice button {
    width: fit-content;
    color: var(--blue);
    font-size: 16.5px;
    font-weight: 600;
  }

  .android-info-screen {
    min-height: 100dvh;
    background: var(--bg);
    color: #e8eaf3;
  }

  .android-info-main {
    height: calc(100dvh - 78px);
    overflow-y: auto;
    padding: 22px 20px calc(24px + env(safe-area-inset-bottom));
    scrollbar-width: none;
  }

  .android-info-main::-webkit-scrollbar {
    display: none;
  }

  .android-info-preview {
    display: grid;
    place-items: center;
    height: 222px;
    overflow: hidden;
    border-radius: 8px;
    background: #303030;
  }

  .android-info-preview > :global(*) {
    width: min(80vw, 340px);
    height: 170px;
  }

  .android-info-facts {
    display: grid;
    gap: 24px;
    margin: 18px 0 0;
  }

  .android-info-facts div,
  .android-info-facts span {
    min-width: 0;
  }

  .android-info-facts .two {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 28px;
  }

  .android-info-facts dt {
    margin: 0 0 4px;
    color: #b8bbc6;
    font-size: 16px;
  }

  .android-info-facts dd {
    margin: 0;
    color: #eef0f7;
    font-size: 19px;
    line-height: 1.35;
  }

  .android-info-icon-row {
    display: flex;
    align-items: center;
    gap: 14px;
  }

  .android-info-icon-row svg {
    width: 28px;
    height: 28px;
    color: #d7d9e2;
  }

  .android-info-access {
    margin-top: 42px;
  }

  .android-info-access h2,
  .android-info-activity h2 {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin: 0 0 28px;
    color: #eef0f7;
    font-size: 22px;
    font-weight: 500;
  }

  .android-info-access h2 svg {
    width: 30px;
    height: 30px;
    color: #d7d9e2;
  }

  .android-info-access > div {
    display: flex;
    align-items: center;
    gap: 20px;
  }

  .android-lock {
    display: grid;
    place-items: center;
    width: 52px;
    height: 52px;
    border-radius: 999px;
    background: #4a4d50;
    color: #dfe1ea;
  }

  .android-lock svg {
    width: 30px;
    height: 30px;
  }

  .android-info-access strong {
    color: #e8eaf3;
    font-size: 21px;
    font-weight: 500;
  }

  .android-info-activity {
    margin-top: 42px;
  }

  .android-info-event {
    display: grid;
    grid-template-columns: 48px minmax(0, 1fr) auto;
    gap: 14px;
    align-items: center;
    min-height: 76px;
    border-bottom: 1px solid #4a4d50;
  }

  .android-info-event strong,
  .android-info-event small {
    display: block;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .android-info-event strong {
    color: #eef0f7;
    font-size: 20px;
    font-weight: 400;
  }

  .android-info-event small,
  .android-info-event time,
  .android-info-activity p {
    color: #c0c3cc;
    font-size: 16px;
  }

  .android-info-activity p {
    margin: 28px 0 0;
    line-height: 1.35;
  }

  .android-tabs {
    display: flex;
    align-items: end;
    justify-content: center;
    margin: 14px 0 0;
    min-width: 0;
    gap: clamp(46px, 17vw, 84px);
  }

  .android-tabs:has(button:only-child) {
    justify-content: flex-start;
    gap: 0;
    padding-left: 24px;
  }

  .android-tabs button {
    position: relative;
    height: 38px;
    color: #c8c9d3;
    font-size: 18px;
    font-weight: 500;
    white-space: nowrap;
  }

  .android-tabs button.active {
    color: var(--blue);
  }

  .android-tabs button.active::after {
    content: '';
    position: absolute;
    left: 0;
    right: 0;
    bottom: -1px;
    height: 4px;
    border-radius: 999px 999px 0 0;
    background: var(--blue);
  }

  .android-list-shell {
    overflow: hidden;
    margin-top: 0;
    border-radius: 15px;
    background: var(--surface);
  }

  .android-storage-summary {
    display: grid;
    gap: 14px;
    padding: 18px 14px 20px;
    border-bottom: 2px solid var(--bg);
    background: var(--surface);
  }

  .android-storage-summary-head {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 4px 8px;
    color: var(--muted);
    font-size: 13px;
  }

  .android-storage-summary-head strong {
    color: var(--text);
    font-size: clamp(24px, 7vw, 34px);
    font-weight: 500;
    line-height: 1;
  }

  .android-storage-summary-head small {
    color: var(--muted);
    font-size: 13px;
  }

  .android-storage-meter {
    display: flex;
    height: 10px;
    overflow: hidden;
    border-radius: 999px;
    background: var(--surface-3);
  }

  .android-storage-meter span {
    min-width: 2px;
    height: 100%;
  }

  .android-storage-meter .empty {
    background: var(--surface-3);
  }

  .android-storage-categories {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 10px 12px;
  }

  .android-storage-categories div {
    display: grid;
    grid-template-columns: 10px minmax(0, 1fr) auto;
    align-items: center;
    gap: 6px;
    min-width: 0;
    border-radius: 12px;
    background: var(--surface-2);
    padding: 8px 10px;
  }

  .android-storage-categories .dot {
    width: 9px;
    height: 9px;
    border-radius: 999px;
  }

  .android-storage-categories .label {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: var(--text);
    font-size: 13px;
  }

  .android-storage-categories strong {
    color: var(--text);
    font-size: 13px;
  }

  .android-storage-categories small {
    grid-column: 2 / 4;
    color: var(--muted);
    font-size: 12px;
  }

  .android-storage-categories p {
    grid-column: 1 / -1;
    margin: 0;
    color: var(--muted);
    font-size: 13px;
  }

  .android-section-header,
  .android-sort-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    min-height: 64px;
    padding: 0 14px;
    border-bottom: 2px solid #191b21;
  }

  .android-sort-row {
    gap: 10px;
  }

  .android-section-header h1,
  .android-sort-row button:first-child {
    display: flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
    margin: 0;
    color: #f0f1f7;
    font-size: 20px;
    font-weight: 500;
  }

  .android-sort-row button:first-child {
    flex: 1 1 auto;
    justify-content: flex-start;
    text-align: left;
  }

  .android-sort-bubble {
    display: grid;
    place-items: center;
    width: 38px;
    height: 38px;
    border-radius: 999px;
    background: #4b5265;
    color: #dbe1f6;
  }

  .android-view-toggle {
    display: flex;
    flex: 0 0 auto;
    overflow: hidden;
    border-radius: 30px;
    background: #3b4150;
    padding: 0;
  }

  .android-view-toggle button {
    display: grid;
    place-items: center;
    flex: 0 0 56px;
    width: 56px;
    height: 42px;
    padding: 0;
    color: #dce0ef;
    line-height: 0;
    transition:
      background 150ms ease,
      color 150ms ease,
      transform 150ms ease;
  }

  .android-view-toggle svg {
    width: 24px;
    height: 24px;
    margin: auto;
  }

  .android-view-toggle button.active {
    background: #c4cae0;
    color: #303441;
    border-radius: 28px;
    transform: scale(1.02);
  }

  .android-list {
    display: grid;
    gap: 4px;
    background: #15171d;
  }

  .android-list-item {
    display: grid;
    grid-template-columns: 50px minmax(0, 1fr) 34px;
    align-items: center;
    min-height: 56px;
    padding: 6px 8px 6px 12px;
    background: var(--surface);
    color: var(--text);
    transition:
      background 160ms ease,
      border-radius 160ms ease,
      transform 160ms ease,
      box-shadow 160ms ease;
  }

  .android-list-item:active {
    transform: scale(0.992);
  }

  .android-list-item.selected {
    border-radius: 20px;
    background: var(--selected);
    animation: android-select-pop 180ms ease-out;
  }

  .android-main.is-selecting .android-list-item.selected,
  .android-main.is-selecting .android-grid-item.selected,
  .android-main.is-selecting .android-activity-card.selected {
    touch-action: none;
  }

  .android-list-item.move-target-active {
    border-radius: 14px;
    background: #2e3e68;
    box-shadow: inset 0 0 0 1.5px var(--blue), 0 5px 14px rgb(0 0 0 / 0.26);
    transform: scale(1.006);
  }

  .android-item-icon {
    display: grid;
    place-items: center;
    width: 38px;
    height: 38px;
    border-radius: 12px;
    background: #202127;
  }

  .android-item-icon.folder-item-icon {
    background: transparent;
  }

  .android-item-text {
    min-width: 0;
    display: grid;
    gap: 2px;
  }

  .android-item-text strong {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 17.2px;
    font-weight: 400;
    line-height: 1.15;
  }

  .android-item-text span {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: var(--muted);
    font-size: 12.8px;
  }

  .android-more {
    display: grid;
    place-items: center;
    width: 34px;
    height: 34px;
    color: #cfd1dc;
  }

  .android-check {
    display: grid;
    place-items: center;
    width: 30px;
    height: 30px;
    margin-left: auto;
    border: 2px solid #e0e2eb !important;
    border-radius: 999px;
    color: #252933;
    background: transparent !important;
  }

  .android-check.checked {
    border-color: #e5e8f3 !important;
    background: #e5e8f3 !important;
    color: #20242e !important;
  }

  .android-check.checked svg {
    width: 19px;
    height: 19px;
    color: #20242e !important;
  }

  .android-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 18px 12px;
    padding: 20px 12px 22px;
    background: #111319;
  }

  .android-grid-item {
    position: relative;
    min-width: 0;
    min-height: 154px;
    border-radius: 12px;
    background: var(--surface-2);
    padding: 12px;
    transition:
      background 160ms ease,
      transform 160ms ease,
      box-shadow 160ms ease;
  }

  .android-grid-item:active {
    transform: scale(0.985);
  }

  .android-grid-item.selected {
    animation: android-select-pop 180ms ease-out;
    background: #3f485c;
  }

  .android-grid-item.move-target-active {
    background: #2e3e68;
    box-shadow: inset 0 0 0 1.5px var(--blue), 0 5px 14px rgb(0 0 0 / 0.26);
    transform: scale(1.012);
  }

  .android-grid-item header {
    display: grid;
    grid-template-columns: 30px minmax(0, 1fr) 28px;
    gap: 7px;
    align-items: start;
    min-height: 48px;
  }

  .android-grid-item strong {
    overflow: hidden;
    display: -webkit-box;
    line-clamp: 2;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    font-size: 17px;
    font-weight: 400;
    line-height: 1.25;
  }

  .android-grid-preview {
    position: relative;
    display: grid;
    place-items: center;
    height: 88px;
    overflow: hidden;
    border-radius: 8px;
    background: #181a20;
  }

  .android-shared-badge {
    position: absolute;
    right: 10px;
    bottom: 10px;
    display: grid;
    place-items: center;
    width: 30px;
    height: 30px;
    border-radius: 999px;
    background: #c8cbd7;
    color: #111319;
  }

  .grid-check {
    position: absolute;
    right: 10px;
    top: 10px;
  }

  .android-year-title {
    margin: 14px 14px 10px;
    color: #d6d8e2;
    font-size: 18px;
    font-weight: 500;
  }

  .android-activity-stack {
    display: grid;
    gap: 4px;
    margin-top: 0;
    overflow: hidden;
    border-radius: 15px;
    background: #111319;
  }

  .android-activity-card {
    display: grid;
    gap: 10px;
    background: var(--surface);
    padding: 14px 14px 18px;
  }

  .android-activity-card.selected {
    background: var(--selected);
  }

  .android-activity-title {
    display: grid;
    grid-template-columns: 34px minmax(0, 1fr) 36px;
    gap: 10px;
    align-items: center;
  }

  .android-activity-title strong {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 19px;
    font-weight: 400;
  }

  .android-activity-preview {
    height: 190px;
    overflow: hidden;
    border: 1px solid #777a86;
    border-radius: 14px;
    background: #fff;
  }

  .android-activity-meta {
    display: flex;
    align-items: center;
    gap: 12px;
    color: #d7d9e4;
    font-size: 16px;
    line-height: 1.4;
  }

  .android-mini-avatar {
    display: grid;
    place-items: center;
    overflow: hidden;
    width: 38px;
    height: 38px;
    border-radius: 999px;
    color: white;
    font-weight: 700;
  }

  .android-fabs {
    position: fixed;
    right: 18px;
    bottom: calc(82px + env(safe-area-inset-bottom));
    z-index: 82;
    display: grid;
    justify-items: end;
    gap: 14px;
    transform-origin: right bottom;
    transition:
      opacity 180ms ease,
      transform 180ms ease;
  }

  .android-fabs.scrolled {
    opacity: 0;
    pointer-events: none;
    transform: translateY(18px) scale(0.94);
  }

  .android-fabs.create-open {
    right: 20px;
    bottom: calc(30px + env(safe-area-inset-bottom));
    gap: 12px;
  }

  .android-fabs > button {
    display: grid;
    place-items: center;
    box-shadow: 0 6px 16px rgb(0 0 0 / 0.32);
  }

  .android-fabs .camera {
    width: 64px;
    height: 64px;
    border-radius: 18px;
    background: #6b4169;
    color: #ffe6fb;
  }

  .android-fabs .create {
    width: 86px;
    height: 86px;
    border-radius: 24px;
    background: var(--blue-dark);
    color: #e6ecff;
  }

  .android-fabs .create svg {
    width: 42px;
    height: 42px;
  }

  .android-fabs.create-open .create {
    width: 70px;
    height: 70px;
    border-radius: 999px;
    background: #bfd0ff;
    color: #122a57;
  }

  .android-move-float {
    position: fixed;
    z-index: 118;
    display: block;
    max-width: min(78vw, 360px);
    color: #303134;
    pointer-events: none;
    transform: translate(12px, -50%);
    transition:
      box-shadow 120ms ease,
      transform 120ms ease;
    animation: android-move-float-in 130ms ease-out;
  }

  .android-move-float.over-target {
    transform: translate(12px, -50%) scale(1.03);
  }

  .android-move-preview {
    display: grid;
    grid-template-columns: 34px minmax(0, 1fr);
    align-items: center;
    gap: 12px;
    min-width: 210px;
    max-width: min(78vw, 360px);
    min-height: 50px;
    padding: 8px 16px 8px 12px;
    border-radius: 10px;
    background: #ffffff;
    box-shadow: 0 7px 18px rgb(0 0 0 / 0.34);
  }

  .android-move-float.over-target .android-move-preview {
    box-shadow: 0 9px 22px rgb(0 0 0 / 0.4), inset 0 0 0 2px #8ab4f8;
  }

  .android-move-preview-icon {
    display: grid;
    place-items: center;
    width: 34px;
    height: 34px;
    overflow: hidden;
    border-radius: 8px;
  }

  .android-move-preview strong {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 14px;
    font-weight: 400;
    line-height: 1.2;
  }

  .android-move-count {
    position: absolute;
    top: -10px;
    right: -10px;
    display: grid;
    place-items: center;
    min-width: 26px;
    height: 26px;
    padding: 0 7px;
    border-radius: 999px;
    background: #1a73e8;
    color: #ffffff;
    font-size: 13px;
    font-weight: 700;
    box-shadow: 0 4px 12px rgb(0 0 0 / 0.28);
  }

  .android-create-scrim {
    position: fixed;
    inset: 0;
    z-index: 81;
    background: rgb(0 0 0 / 0.72) !important;
  }

  .android-create-actions {
    display: grid;
    justify-items: end;
    gap: 8px;
    animation: android-panel-fade 160ms ease-out;
  }

  .android-create-actions button {
    display: grid;
    grid-template-columns: 34px auto;
    align-items: center;
    gap: 14px;
    min-width: 150px;
    min-height: 54px;
    border-radius: 999px !important;
    background: var(--blue-dark) !important;
    color: #e7ecff;
    padding: 0 22px;
    font-size: 20px;
    box-shadow: 0 6px 16px rgb(0 0 0 / 0.32);
  }

  .android-create-actions button:nth-child(-n + 3) {
    min-width: 232px;
  }

  .android-create-actions button:nth-child(4),
  .android-create-actions button:nth-child(5),
  .android-create-actions button:nth-child(6) {
    min-width: 148px;
  }

  .android-create-actions span {
    display: grid;
    place-items: center;
  }

  .android-create-actions svg {
    width: 28px;
    height: 28px;
  }

  .android-bottom-nav {
    position: fixed;
    left: 0;
    right: 0;
    bottom: 0;
    z-index: 34;
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    height: calc(78px + env(safe-area-inset-bottom));
    padding: 6px 8px env(safe-area-inset-bottom);
    background: #1b1d24;
    color: #d6d8e5;
  }

  .android-bottom-nav button {
    display: grid;
    justify-items: center;
    align-content: center;
    gap: 4px;
    font-size: 14px;
    transition: color 140ms ease;
  }

  .android-nav-icon {
    display: grid;
    place-items: center;
    width: 62px;
    height: 34px;
    border-radius: 999px;
    transition:
      background 150ms ease,
      transform 150ms ease;
  }

  .android-nav-icon svg {
    width: 27px;
    height: 27px;
  }

  .android-bottom-nav button.active .android-nav-icon {
    background: #4b5265;
    transform: scale(1.01);
  }

  .android-bottom-nav button.active .android-nav-icon svg {
    width: 27px;
    height: 27px;
    color: #eef2ff;
  }

  .android-scrim,
  .android-sheet-scrim {
    position: fixed;
    inset: 0;
    z-index: 70;
    background: rgb(0 0 0 / 0.62) !important;
  }

  .android-drawer {
    position: fixed;
    inset: 0 auto 0 0;
    z-index: 80;
    width: min(76vw, 330px);
    border-radius: 0 22px 22px 0;
    background: #1b1d24;
    color: #e8eaf4;
    padding: max(22px, env(safe-area-inset-top)) 22px 22px;
    box-shadow: 10px 0 34px rgb(0 0 0 / 0.42);
    animation: android-drawer-in 180ms ease-out;
  }

  .android-drawer-title {
    padding: 22px 0 30px;
    border-bottom: 1px solid #474b58;
    font-size: 24px;
  }

  .android-drawer-nav {
    display: grid;
    gap: 1px;
    padding: 20px 0;
  }

  .android-drawer-nav button {
    display: grid;
    grid-template-columns: 34px minmax(0, 1fr);
    align-items: center;
    min-height: 48px;
    gap: 16px;
    color: #e0e2ec;
    text-align: left;
    font-size: 17px;
    transition:
      color 140ms ease,
      transform 140ms ease;
  }

  .android-drawer-nav button:active {
    transform: translateX(3px);
  }

  .android-drawer-nav svg {
    width: 23px;
    height: 23px;
    color: #c8cbd8;
  }

  .android-drawer-storage {
    display: grid;
    gap: 10px;
    color: #c8cbd8;
    font-size: 14px;
  }

  .android-storage-bar {
    height: 5px;
    overflow: hidden;
    border-radius: 999px;
    background: #51586d;
  }

  .android-storage-bar span {
    display: block;
    height: 100%;
    border-radius: inherit;
    background: var(--blue);
  }

  .android-bottom-sheet {
    position: fixed;
    left: 0;
    right: 0;
    bottom: 0;
    z-index: 90;
    max-height: 92dvh;
    overflow-y: auto;
    border-radius: 24px 24px 0 0;
    background: #1b1d24;
    color: #edeff8;
    padding: 10px 0 calc(18px + env(safe-area-inset-bottom));
    animation: android-sheet-up 180ms ease-out;
  }

  .android-sheet-handle {
    width: 40px;
    height: 4px;
    border-radius: 999px;
    background: #c5c8d4;
    margin: 0 auto 18px;
  }

  .android-sheet-title {
    display: grid;
    grid-template-columns: 48px minmax(0, 1fr);
    align-items: center;
    padding: 0 20px 14px;
  }

  .android-sheet-title strong {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 20px;
    font-weight: 400;
  }

  .android-bottom-sheet button {
    display: grid;
    grid-template-columns: 48px minmax(0, 1fr);
    align-items: center;
    width: 100%;
    min-height: 44px;
    padding: 0 20px;
    color: #e3e5ef;
    text-align: left;
    font-size: 18px;
    transition:
      background 140ms ease,
      transform 140ms ease;
  }

  .android-bottom-sheet button:active {
    background: rgb(255 255 255 / 0.06);
    transform: translateX(2px);
  }

  .android-bottom-sheet button svg {
    color: #c8cbd8;
    width: 23px;
    height: 23px;
  }

  .android-bottom-sheet button.danger {
    color: #ffb4ab;
  }

  .android-bottom-sheet hr {
    border: 0;
    border-top: 1px solid #464a56;
    margin: 10px 0;
  }

  .android-bottom-sheet.selected-actions {
    padding-top: 12px;
  }

  .android-account-panel {
    position: fixed;
    inset: 0;
    z-index: 100;
    overflow-y: auto;
    background: #202126;
    color: #edeff8;
    padding: max(14px, env(safe-area-inset-top)) 20px calc(22px + env(safe-area-inset-bottom));
    animation: android-panel-fade 170ms ease-out;
  }

  .android-account-panel header {
    display: grid;
    grid-template-columns: 44px minmax(0, 1fr) 44px;
    align-items: center;
    min-height: 50px;
    font-size: 17px;
    font-weight: 600;
    text-align: center;
  }

  .android-account-panel header span {
    grid-column: 2;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .android-account-panel header button {
    grid-column: 3;
  }

  .android-account-hero {
    display: grid;
    justify-items: center;
    gap: 10px;
    padding: 16px 0 24px;
  }

  .android-account-photo {
    position: relative;
    display: grid;
    place-items: center;
    width: 88px;
    height: 88px;
    overflow: visible;
    border-radius: 999px;
    font-size: 32px;
    font-weight: 700;
  }

  .android-account-photo img {
    border-radius: inherit;
  }

  .android-account-hero h1 {
    margin: 4px 0 0;
    font-size: 27px;
    font-weight: 400;
  }

  .android-account-manage {
    border: 1px solid #7d828f !important;
    border-radius: 999px !important;
    padding: 10px 22px;
    color: var(--blue) !important;
    font-size: 17px !important;
    font-weight: 600 !important;
  }

  .android-account-card,
  .android-account-storage {
    overflow: hidden;
    border-radius: 22px;
    background: #111319;
  }

  .android-account-card-title {
    display: flex;
    justify-content: space-between;
    align-items: center;
    min-height: 58px;
    padding: 0 18px;
    font-size: 18px;
    font-weight: 700;
  }

  .android-round-icon {
    display: grid;
    place-items: center;
    width: 36px;
    height: 36px;
    border-radius: 999px;
    background: #23252d;
  }

  .android-account-row {
    display: grid;
    grid-template-columns: 46px minmax(0, 1fr);
    align-items: center;
    width: 100%;
    min-height: 60px;
    gap: 12px;
    border-top: 1px solid #252832 !important;
    padding: 8px 18px;
    text-align: left;
  }

  .android-account-row strong,
  .android-account-row small {
    display: block;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .android-account-row strong {
    font-size: 17px;
    font-weight: 700;
  }

  .android-account-row small {
    color: #c7cad5;
    font-size: 14px;
  }

  .android-add-account {
    display: grid;
    place-items: center;
    width: 32px;
    height: 32px;
    border-radius: 999px;
    background: #232735;
    color: var(--blue);
  }

  .android-account-storage {
    margin-top: 22px;
    padding: 18px;
  }

  .android-account-storage > div:first-child {
    display: flex;
    align-items: center;
    gap: 12px;
    font-size: 17px;
  }

  .android-cloud {
    color: #7db3ff;
  }

  .android-account-storage .android-storage-bar {
    margin-top: 14px;
  }

  .android-account-storage p {
    color: #c7cad5;
    font-size: 14px;
  }

  .android-loading,
  .android-error {
    margin: 18px 0;
    border-radius: 16px;
    padding: 14px 16px;
    background: #262831;
    color: #d6d8e2;
  }

  .android-error {
    color: #ffb4ab;
  }

  :global([data-theme='light']) .android-avatar-button {
    background: #0b57d0;
    color: #ffffff;
    box-shadow: inset 0 0 0 2px #ffffff, 0 1px 4px rgb(60 64 67 / 0.28);
  }

  :global([data-theme='light']) .android-avatar-button img {
    background: #0b57d0;
  }

  :global([data-theme='light']) .android-fabs .create {
    background: #0b57d0;
    color: #ffffff;
    box-shadow: 0 8px 18px rgb(11 87 208 / 0.32);
  }

  :global([data-theme='light']) .android-fabs.create-open .create {
    background: #174ea6;
    color: #ffffff;
  }

  :global([data-theme='light']) .android-fabs .camera,
  :global([data-theme='light']) .android-create-actions button {
    background: #e8f0fe !important;
    color: #174ea6;
    box-shadow: 0 7px 18px rgb(60 64 67 / 0.2);
  }

  :global([data-theme='light']) .android-bottom-nav {
    background: #ffffff;
    color: #3c4043;
    border-top: 1px solid #dadce0;
  }

  :global([data-theme='light']) .android-bottom-nav button {
    color: #5f6368;
  }

  :global([data-theme='light']) .android-bottom-nav button.active {
    color: #174ea6;
  }

  :global([data-theme='light']) .android-bottom-nav button.active .android-nav-icon {
    background: #d3e3fd;
    color: #174ea6;
  }

  :global([data-theme='light']) .android-bottom-nav button.active .android-nav-icon svg {
    color: #174ea6;
  }

  :global([data-theme='light']) .android-bottom-nav button:active .android-nav-icon {
    background: #c2d7fb;
    color: #174ea6;
  }

  @media (max-width: 430px) {
    .android-tabs {
      margin-left: 0;
      margin-right: 0;
      gap: 42px;
    }

    .android-item-text strong {
      font-size: 18.5px;
    }

    .android-grid {
      gap: 16px 10px;
    }
  }
</style>
