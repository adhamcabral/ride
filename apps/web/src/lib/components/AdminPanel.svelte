<script lang="ts">
  import { createEventDispatcher, onMount } from 'svelte';
  import { formatBytes } from '$lib/format';
  import { getStoredAppearance, setAppearance, type Appearance } from '$lib/theme';
  import {
    adminSetPassword,
    auditStorage,
    backupDatabase,
    browseServerDirectories,
    createAccount,
    deleteAdminAccount,
    deleteDatabaseBackup,
    getSecuritySessions,
    getMaintenanceOverview,
    getSettings,
    revokeSecuritySession,
    restoreDatabaseBackup,
    restoreUploadedBackup,
    updateAccount,
    updateSettings
  } from '$lib/api';
  import type {
    AdminStats,
    BackupScheduleSettings,
    MaintenanceArtifact,
    SecurityDeviceGroup,
    SecuritySession,
    ServerDirectoryListing,
    StorageAuditReport,
    UserAccount
  } from '$lib/types';
  import {
    readDrivePreferences,
    writeDrivePreferences,
    type DriveDensity,
    type DrivePdfOpening,
    type DrivePreferences,
    type DriveStartPage
  } from '$lib/preferences';

  export let open = false;
  export let accounts: UserAccount[] = [];
  export let stats: AdminStats | null = null;
  export let accountId = '';

  type Tab = 'overview' | 'users' | 'security' | 'jobs' | 'backups';
  export let initialTab: Tab = 'overview';
  type BackupStatus = BackupScheduleSettings['lastStatus'];
  type ArtifactConfirm = {
    kind: 'backup';
    action: 'restore' | 'delete';
    artifact: MaintenanceArtifact;
  };

  let tab: Tab = 'overview';

  // Create user form
  let createName = '';
  let createEmail = '';
  let createRole: 'admin' | 'user' = 'user';
  let createQuotaGb = 15;
  let createPassword = '';
  let createError = '';
  let createLoading = false;
  let showCreateForm = false;

  // Edit user modal
  let editingAccount: UserAccount | null = null;
  let editName = '';
  let editEmail = '';
  let editRole: 'admin' | 'user' = 'user';
  let editQuotaGb = 15;
  let editError = '';
  let editNewPassword = '';
  let editLoading = false;
  let editPasswordLoading = false;
  let editPasswordSuccess = '';
  let deleteConfirmAccount: UserAccount | null = null;
  let deleteConfirmEmail = '';
  let deleteError = '';
  let deleteLoading = false;

  // Settings
  let trashRetentionDays = 30;
  let backupScheduleEnabled = false;
  let backupIntervalHours = 24;
  let backupRetentionCount = 7;
  let backupLastRunAt: string | null = null;
  let backupLastStatus: BackupStatus = 'never';
  let backupLastError: string | null = null;
  let backupDirectory = '';
  let backupUploadInput: HTMLInputElement | null = null;
  let directoryBrowserOpen = false;
  let directoryBrowserLoading = false;
  let directoryBrowserError = '';
  let directoryBrowser: ServerDirectoryListing | null = null;
  let settingsLoading = false;
  let settingsSaved = false;
  let settingsError = '';
  let settingsFeedbackTarget: 'trash' | 'backup' | '' = '';
  let settingsLoaded = false;
  let lastOpen = false;
  let maintenanceLoading: 'audit' | 'repair' | 'backup' | 'upload' | '' = '';
  let maintenanceMessage = '';
  let maintenanceError = '';
  let maintenanceMessageTimer: ReturnType<typeof setTimeout> | null = null;
  let maintenanceLoaded = false;
  let artifactAction = '';
  let artifactConfirm: ArtifactConfirm | null = null;
  let backups: MaintenanceArtifact[] = [];
  let lastAudit: StorageAuditReport | null = null;
  let startPage: DriveStartPage = 'personal';
  let appearance: Appearance = 'light';
  let density: DriveDensity = 'low';
  let pdfOpening: DrivePdfOpening = 'preview';
  let emailNotifications = true;
  let browserNotifications = false;
  let appearanceReady = false;
  let drivePreferencesReady = false;
  let loadedPreferenceAccountId = '';
  let sessionsLoading = false;
  let sessionsLoaded = false;
  let sessionsError = '';
  let deviceGroups: SecurityDeviceGroup[] = [];
  let selectedDevice: SecurityDeviceGroup | null = null;
  let selectedSession: SecuritySession | null = null;
  let revokingSessionId = '';

  const dispatch = createEventDispatcher<{
    close: void;
    account: void;
    refresh: string | undefined;
    accountDeleted: { id: string; setupRequired: boolean };
    logout: void;
    preferences: DrivePreferences;
  }>();

  const tabs: Array<{ id: Tab; label: string }> = [
    { id: 'overview', label: 'Geral' },
    { id: 'users', label: 'Usuários' },
    { id: 'security', label: 'Segurança e login' },
    { id: 'jobs', label: 'Processos' },
    { id: 'backups', label: 'Backups' }
  ];

  $: usagePercent = stats?.quotaBytes ? Math.min(100, (stats.usedBytes / stats.quotaBytes) * 100) : 0;
  $: atRiskItems = stats?.atRiskItems ?? (stats?.trashedItems ?? 0) + (stats?.spamItems ?? 0);
  $: headerAccount = accounts.find((account) => account.id === accountId) ?? accounts.find((account) => account.role === 'admin') ?? accounts[0] ?? null;
  $: headerAccountInitial = (headerAccount?.name?.trim() || headerAccount?.email?.trim() || 'A').slice(0, 1).toUpperCase();
  $: usedStorageLabel = stats ? formatBytes(stats.usedBytes) : '0 B';
  $: quotaStorageLabel = stats ? formatBytes(stats.quotaBytes) : '0 B';
  $: accountsWithoutPassword = stats?.accountsWithoutPassword ?? 0;

  $: if (open && !lastOpen) {
    tab = initialTab;
    settingsLoaded = false;
    maintenanceLoaded = false;
  }
  $: lastOpen = open;
  $: if (open && tab === 'backups' && !settingsLoaded && !settingsLoading) loadSettings();
  $: if (open && loadedPreferenceAccountId !== accountId) loadDrivePreferences();
  $: if (open && drivePreferencesReady && loadedPreferenceAccountId === accountId)
    saveDrivePreferences(density, startPage, pdfOpening, emailNotifications, browserNotifications);
  $: if (open && tab === 'backups' && !maintenanceLoaded && !maintenanceLoading) loadMaintenanceOverview();
  $: if (open && tab === 'security' && !sessionsLoaded && !sessionsLoading) loadSecuritySessions();
  $: if (appearanceReady) setAppearance(appearance);
  $: latestBackup = backups[0] ?? null;
  $: nextBackupAt =
    backupScheduleEnabled && backupLastRunAt
      ? new Date(new Date(backupLastRunAt).getTime() + Number(backupIntervalHours) * 60 * 60 * 1000).toISOString()
      : null;
  $: maintenanceStatusLabel =
    backupLastStatus === 'error'
      ? 'Atenção'
      : backupScheduleEnabled
        ? 'Automático'
        : 'Manual';
  $: maintenanceStatusClass =
    backupLastStatus === 'error'
      ? 'bg-[#fce8e6] text-[#d93025] border-[#fad2cf]'
      : backupScheduleEnabled
        ? 'bg-[#e8f0fe] text-[#1967d2] border-[#d2e3fc]'
        : 'bg-[#f1f3f4] text-[#5f6368] border-[#dadce0]';
  $: lastAuditProblems = lastAudit
    ? lastAudit.missingObjects.length +
      lastAudit.orphanObjects.length +
      lastAudit.checksumMismatches.length +
      lastAudit.sizeMismatches.length
    : null;

  /** Loads persisted admin settings only when the settings panel needs them. */
  async function loadSettings() {
    try {
      const s = await getSettings();
      trashRetentionDays = s.trashRetentionDays;
      applyBackupSchedule(s.backupSchedule);
      settingsLoaded = true;
    } catch {}
  }

  /** Refreshes backup artifacts and maintenance status shown in the backup panel. */
  async function loadMaintenanceOverview() {
    maintenanceLoaded = true;
    try {
      const overview = await getMaintenanceOverview();
      backupDirectory = overview.backupDirectory;
      backups = overview.backups;
    } catch (ex) {
      maintenanceError = ex instanceof Error ? ex.message : 'Erro ao carregar manutenção.';
    }
  }

  /** Saves either trash retention or backup policy while keeping one feedback channel active. */
  async function saveSettings(target: 'trash' | 'backup') {
    settingsLoading = true;
    settingsSaved = false;
    settingsError = '';
    settingsFeedbackTarget = target;
    try {
      const saved = await updateSettings({
        trashRetentionDays: Number(trashRetentionDays),
        backupScheduleEnabled,
        backupIntervalHours: Number(backupIntervalHours),
        backupRetentionCount: Number(backupRetentionCount) || 7,
        backupDirectory,
        backupTargetPaths: []
      });
      trashRetentionDays = saved.trashRetentionDays;
      applyBackupSchedule(saved.backupSchedule);
      settingsSaved = true;
      setTimeout(() => {
        settingsSaved = false;
        if (settingsFeedbackTarget === target) settingsFeedbackTarget = '';
      }, 3000);
    } catch (ex) {
      settingsError = ex instanceof Error ? ex.message : 'Erro ao salvar.';
    } finally {
      settingsLoading = false;
    }
  }

  /** Runs long maintenance actions with one shared loading/error state. */
  async function runMaintenance(action: 'audit' | 'repair' | 'backup') {
    maintenanceLoading = action;
    clearMaintenanceNotice();
    try {
      if (action === 'audit' || action === 'repair') {
        const report = await auditStorage({
          repair: action === 'repair',
          removeOrphans: action === 'repair'
        });
        lastAudit = report;
        setMaintenanceMessage(
          action === 'repair'
            ? `Reparo concluído: ${report.repairedChecksums} checksums, ${report.repairedSizes} tamanhos e ${report.removedOrphans} órfãos removidos.`
            : `Auditoria concluída: ${report.checkedFiles} arquivos, ${report.missingObjects.length} ausentes, ${report.orphanObjects.length} órfãos, ${report.checksumMismatches.length} divergências.`
        );
      } else if (action === 'backup') {
        const backup = await backupDatabase();
        backups = [backup, ...backups.filter((entry) => entry.path !== backup.path)].slice(0, 12);
        backupLastRunAt = backup.createdAt;
        backupLastStatus = 'ok';
        backupLastError = null;
        setMaintenanceMessage(`Backup completo criado (${formatBytes(backup.bytes)}).`);
      }
      await loadMaintenanceOverview();
      dispatch('refresh', undefined);
    } catch (ex) {
      maintenanceError = ex instanceof Error ? ex.message : 'Falha na manutenção.';
    } finally {
      maintenanceLoading = '';
    }
  }

  /** Opens the confirmation state for destructive or full-restore backup actions. */
  function askArtifactAction(
    kind: 'backup',
    action: 'restore' | 'delete',
    artifact: MaintenanceArtifact
  ) {
    artifactConfirm = { kind, action, artifact };
  }

  /** Executes the selected backup restore/delete operation after confirmation. */
  async function confirmArtifactAction() {
    if (!artifactConfirm) return;
    const { kind, action, artifact } = artifactConfirm;
    artifactAction = `${action}-${kind}-${artifact.id}`;
    clearMaintenanceNotice();
    try {
      if (kind === 'backup' && action === 'restore') await restoreDatabaseBackup(artifact.id);
      if (kind === 'backup' && action === 'delete') await deleteDatabaseBackup(artifact.id);

      setMaintenanceMessage(
        action === 'restore'
          ? 'Backup completo restaurado.'
          : 'Backup completo excluído.'
      );
      artifactConfirm = null;
      await loadSettings();
      await loadMaintenanceOverview();
      dispatch('refresh', undefined);
    } catch (ex) {
      maintenanceError = ex instanceof Error ? ex.message : 'Falha no ponto de recuperação.';
    } finally {
      artifactAction = '';
    }
  }

  /** Shows transient maintenance feedback and clears older timers. */
  function setMaintenanceMessage(message: string) {
    maintenanceMessage = message;
    maintenanceError = '';
    if (maintenanceMessageTimer) clearTimeout(maintenanceMessageTimer);
    maintenanceMessageTimer = setTimeout(() => {
      maintenanceMessage = '';
      maintenanceMessageTimer = null;
    }, 8000);
  }

  /** Clears maintenance success/error notices before a new operation starts. */
  function clearMaintenanceNotice() {
    maintenanceMessage = '';
    maintenanceError = '';
    if (maintenanceMessageTimer) {
      clearTimeout(maintenanceMessageTimer);
      maintenanceMessageTimer = null;
    }
  }

  function artifactConfirmTitle() {
    if (!artifactConfirm) return '';
    return artifactConfirm.action === 'restore' ? 'Restaurar backup completo' : 'Excluir backup completo';
  }

  function artifactConfirmDescription() {
    if (!artifactConfirm) return '';
    if (artifactConfirm.action === 'delete') {
      return 'Este ponto de recuperação será removido permanentemente.';
    }
    return 'Todo o Ride atual será substituído pelo conteúdo deste backup: usuários, sessões, metadados, histórico e arquivos físicos.';
  }

  function artifactConfirmButton() {
    if (!artifactConfirm) return '';
    return artifactConfirm.action === 'restore' ? 'Restaurar' : 'Excluir';
  }

  function formatArtifactDate(value?: string | null) {
    if (!value) return 'Nunca';
    return new Intl.DateTimeFormat('pt-BR', {
      dateStyle: 'short',
      timeStyle: 'short'
    }).format(new Date(value));
  }

  function artifactAge(value?: string | null) {
    if (!value) return 'Sem registro';
    const diffMs = Date.now() - new Date(value).getTime();
    const minutes = Math.max(0, Math.floor(diffMs / 60000));
    if (minutes < 1) return 'agora';
    if (minutes < 60) return `${minutes} min atrás`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours} h atrás`;
    const days = Math.floor(hours / 24);
    return `${days} d atrás`;
  }

  /** Applies server-normalized backup policy fields back into the form. */
  function applyBackupSchedule(schedule: BackupScheduleSettings) {
    backupScheduleEnabled = schedule.enabled;
    backupIntervalHours = schedule.intervalHours || 24;
    backupRetentionCount = schedule.retentionCount || 7;
    backupDirectory = schedule.directory || backupDirectory;
    backupLastRunAt = schedule.lastRunAt;
    backupLastStatus = schedule.lastStatus;
    backupLastError = schedule.lastError;
  }

  /** Produces the short status line below the backup scheduler toggle. */
  function backupPolicyDescription() {
    if (!backupScheduleEnabled) return 'Backups automáticos desligados.';
    if (backupLastStatus === 'error') return backupLastError ?? 'O último backup automático falhou.';
    if (nextBackupAt) return `Próximo backup em ${formatArtifactDate(nextBackupAt)}.`;
    return 'Primeiro backup será criado na próxima verificação do serviço.';
  }

  function openBackupFilePicker() {
    backupUploadInput?.click();
  }

  /** Opens the server directory picker at the current backup directory. */
  async function openDirectoryBrowser() {
    directoryBrowserOpen = true;
    await loadServerDirectories(backupDirectory || null);
  }

  /** Loads one level of server directories for choosing the backup path. */
  async function loadServerDirectories(path?: string | null) {
    directoryBrowserLoading = true;
    directoryBrowserError = '';
    try {
      directoryBrowser = await browseServerDirectories(path);
    } catch (ex) {
      directoryBrowserError = ex instanceof Error ? ex.message : 'Erro ao listar diretórios do servidor.';
    } finally {
      directoryBrowserLoading = false;
    }
  }

  /** Uses either the clicked directory or the current browser path as the backup target. */
  function chooseServerDirectory(path?: string) {
    const selectedPath = path ?? directoryBrowser?.path;
    if (!selectedPath) return;
    backupDirectory = selectedPath;
    directoryBrowserOpen = false;
  }

  /** Restores an uploaded backup archive after explicit confirmation. */
  async function handleBackupFileSelected(event: Event) {
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    const confirmed = window.confirm(
      'Restaurar este backup vai substituir todo o Ride atual, incluindo usuários, sessões, metadados, histórico e arquivos. Continuar?'
    );
    if (!confirmed) return;

    maintenanceLoading = 'upload';
    clearMaintenanceNotice();
    try {
      await restoreUploadedBackup(file);
      setMaintenanceMessage('Backup externo restaurado. Se a sessão atual não existir no backup, faça login novamente.');
      await loadSettings();
      await loadMaintenanceOverview();
      dispatch('refresh', undefined);
    } catch (ex) {
      maintenanceError = ex instanceof Error ? ex.message : 'Falha ao restaurar backup externo.';
    } finally {
      maintenanceLoading = '';
    }
  }

  /** Creates a user account and refreshes the admin list in place. */
  async function submitCreate() {
    createError = '';
    if (createLoading) return;
    if (!createName.trim()) {
      createError = 'Nome é obrigatório.';
      return;
    }
    if (!createEmail.trim() || !createEmail.includes('@')) {
      createError = 'E-mail inválido.';
      return;
    }
    if (createQuotaGb < 1) {
      createError = 'Cota mínima é 1 GB.';
      return;
    }
    if (createPassword.length < 6) {
      createError = 'Senha inicial deve ter ao menos 6 caracteres.';
      return;
    }

    createLoading = true;
    try {
      const account = await createAccount({
        name: createName.trim(),
        email: createEmail.trim(),
        role: createRole,
        storageQuotaGb: createQuotaGb,
        password: createPassword
      });
      createName = '';
      createEmail = '';
      createRole = 'user';
      createQuotaGb = 15;
      createPassword = '';
      showCreateForm = false;
      dispatch('refresh', undefined);
    } catch (ex) {
      createError = ex instanceof Error ? ex.message : 'Erro ao criar usuário.';
    } finally {
      createLoading = false;
    }
  }

  /** Seeds the edit modal from the selected account. */
  function openEdit(account: UserAccount) {
    editingAccount = account;
    editName = account.name;
    editEmail = account.email;
    editRole = account.role;
    editQuotaGb = Math.round(account.storageQuotaBytes / 1024 / 1024 / 1024);
    editError = '';
    editNewPassword = '';
    editPasswordSuccess = '';
    deleteError = '';
    deleteConfirmEmail = '';
  }

  /** Saves account profile, role, and quota changes from the edit modal. */
  async function submitEdit() {
    editError = '';
    if (editLoading) return;
    if (!editingAccount) return;
    if (!editName.trim()) {
      editError = 'Nome é obrigatório.';
      return;
    }
    if (!editEmail.trim() || !editEmail.includes('@')) {
      editError = 'E-mail inválido.';
      return;
    }
    if (editQuotaGb < 1) {
      editError = 'Cota mínima é 1 GB.';
      return;
    }
    editLoading = true;
    try {
      await updateAccount(editingAccount.id, {
        name: editName.trim(),
        email: editEmail.trim(),
        role: editRole,
        storageQuotaGb: editQuotaGb
      });
      editingAccount = null;
      dispatch('refresh', undefined);
    } catch (ex) {
      editError = ex instanceof Error ? ex.message : 'Erro ao salvar usuário.';
    } finally {
      editLoading = false;
    }
  }

  /** Sets a new password for the account currently being edited. */
  async function submitSetPassword() {
    if (!editingAccount || !editNewPassword) return;
    if (editNewPassword.length < 6) {
      editError = 'Senha deve ter ao menos 6 caracteres.';
      return;
    }
    editPasswordLoading = true;
    editError = '';
    editPasswordSuccess = '';
    try {
      await adminSetPassword(editingAccount.id, editNewPassword);
      editNewPassword = '';
      editPasswordSuccess = 'Senha definida com sucesso!';
      dispatch('refresh', undefined);
      setTimeout(() => (editPasswordSuccess = ''), 3000);
    } catch (ex) {
      editError = ex instanceof Error ? ex.message : 'Erro ao definir senha.';
    } finally {
      editPasswordLoading = false;
    }
  }

  /** Opens the delete confirmation and clears stale confirmation input. */
  function askDeleteAccount() {
    if (!editingAccount) return;
    deleteConfirmAccount = editingAccount;
    deleteConfirmEmail = '';
    deleteError = '';
  }

  /** Deletes an account after matching the confirmation email. */
  async function confirmDeleteAccount() {
    if (!deleteConfirmAccount || deleteLoading) return;
    deleteError = '';
    if (deleteConfirmEmail.trim().toLowerCase() !== deleteConfirmAccount.email.toLowerCase()) {
      deleteError = 'Digite o e-mail exatamente como exibido para confirmar.';
      return;
    }

    deleteLoading = true;
    try {
      const result = await deleteAdminAccount(deleteConfirmAccount.id);
      const deletedId = result.deletedAccountId ?? deleteConfirmAccount.id;
      accounts = accounts.filter((account) => account.id !== deletedId);
      dispatch('accountDeleted', { id: deletedId, setupRequired: result.setupRequired });
      deleteConfirmAccount = null;
      editingAccount = null;
      deleteConfirmEmail = '';
      dispatch('refresh', undefined);
    } catch (ex) {
      deleteError = ex instanceof Error ? ex.message : 'Erro ao excluir conta.';
    } finally {
      deleteLoading = false;
    }
  }

  /** Loads session/device groups for the security tab. */
  async function loadSecuritySessions() {
    if (sessionsLoading) return;
    sessionsLoading = true;
    sessionsError = '';
    try {
      deviceGroups = await getSecuritySessions();
      sessionsLoaded = true;
      if (selectedDevice) {
        selectedDevice = deviceGroups.find((device) => device.id === selectedDevice?.id) ?? null;
        selectedSession =
          selectedDevice?.sessions.find((session) => session.id === selectedSession?.id) ??
          selectedDevice?.sessions[0] ??
          null;
      }
    } catch (ex) {
      sessionsError = ex instanceof Error ? ex.message : 'Erro ao carregar sessões.';
    } finally {
      sessionsLoading = false;
    }
  }

  function formatSessionDate(value: string | number) {
    const date = typeof value === 'number' ? new Date(value) : new Date(value);
    if (Number.isNaN(date.getTime())) return 'Data indisponível';
    return new Intl.DateTimeFormat('pt-BR', {
      dateStyle: 'medium',
      timeStyle: 'short'
    }).format(date);
  }

  /** Labels expired sessions separately from active ones. */
  function sessionStatus(session: SecuritySession) {
    if (session.current) return 'Sua sessão atual';
    return session.active ? 'Autenticado' : 'Sem acesso ativo';
  }

  /** Builds a privacy-preserving map URL only when coordinates are available. */
  function mapEmbedUrl(session: SecuritySession) {
    if (session.latitude === null || session.longitude === null) return '';
    const lat = session.latitude;
    const lon = session.longitude;
    const bbox = [lon - 0.04, lat - 0.025, lon + 0.04, lat + 0.025].join(',');
    return `https://www.openstreetmap.org/export/embed.html?bbox=${encodeURIComponent(bbox)}&layer=mapnik&marker=${encodeURIComponent(`${lat},${lon}`)}`;
  }

  function deviceCountLabel(device: SecurityDeviceGroup) {
    return `${device.sessions.length} ${device.sessions.length === 1 ? 'sessão' : 'sessões'} em ${device.os}`;
  }

  function deviceSubtitle(device: SecurityDeviceGroup) {
    const browsers = Array.from(new Set(device.sessions.map((session) => session.browser))).slice(0, 2);
    const suffix = device.sessions.length > browsers.length ? ` +${device.sessions.length - browsers.length}` : '';
    return `${device.location}${browsers.length ? ` · ${browsers.join(', ')}${suffix}` : ''}`;
  }

  function selectDevice(device: SecurityDeviceGroup) {
    selectedDevice = device;
    selectedSession = device.sessions[0] ?? null;
  }

  function clearSelectedDevice() {
    selectedDevice = null;
    selectedSession = null;
  }

  /** Revokes one session and keeps the selected device panel in sync. */
  async function revokeSession(session: SecuritySession) {
    revokingSessionId = session.id;
    sessionsError = '';
    try {
      await revokeSecuritySession(session.id);
      if (session.current) {
        dispatch('logout');
        return;
      }
      await loadSecuritySessions();
    } catch (ex) {
      sessionsError = ex instanceof Error ? ex.message : 'Erro ao sair da sessão.';
    } finally {
      revokingSessionId = '';
    }
  }

  /** Maps backend job status into the compact admin status chip palette. */
  function jobStatusColor(status: 'healthy' | 'idle' | 'warning') {
    if (status === 'healthy') return { bg: '#e6f4ea', text: '#188038', ring: '#a8d5b5' };
    if (status === 'warning') return { bg: '#fef7e0', text: '#e37400', ring: '#f5d78e' };
    return { bg: '#f1f3f4', text: '#5f6368', ring: '#dadce0' };
  }

  onMount(() => {
    appearance = getStoredAppearance();
    appearanceReady = true;
  });

  /** Loads desktop view preferences for the active account when admin settings open. */
  function loadDrivePreferences() {
    const preferences = readDrivePreferences(accountId);
    density = preferences.density;
    startPage = preferences.startPage;
    pdfOpening = preferences.pdfOpening;
    emailNotifications = preferences.emailNotifications;
    browserNotifications = preferences.browserNotifications;
    loadedPreferenceAccountId = accountId;
    drivePreferencesReady = true;
  }

  /** Persists admin-side preference changes through the same session preference store as Drive. */
  function saveDrivePreferences(
    nextDensity: DriveDensity,
    nextStartPage: DriveStartPage,
    nextPdfOpening: DrivePdfOpening,
    nextEmailNotifications: boolean,
    nextBrowserNotifications: boolean
  ) {
    const current = readDrivePreferences(accountId);
    const preferences = {
      ...current,
      density: nextDensity,
      startPage: nextStartPage,
      pdfOpening: nextPdfOpening,
      emailNotifications: nextEmailNotifications,
      browserNotifications: nextBrowserNotifications
    };
    writeDrivePreferences(accountId, preferences);
    dispatch('preferences', preferences);
  }
</script>

{#if open}
  <div
    data-admin-panel
    class="fixed inset-0 z-[200] overflow-hidden bg-[#f8fafd] text-[#202124]"
    role="dialog"
    aria-modal="true"
    aria-label="Configurações"
  >
    <header class="flex h-14 items-center justify-between px-5">
      <div class="flex items-center gap-4">
        <button
          class="flex h-10 w-10 items-center justify-center rounded-full text-[#3c4043] hover:bg-[#e8eaed]"
          on:click={() => dispatch('close')}
          aria-label="Voltar"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
            <path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.42-1.41L7.83 13H20v-2z" />
          </svg>
        </button>
        <h1 class="text-[22px] font-normal leading-7 text-[#202124]">Configurações</h1>
      </div>

      <div class="flex items-center gap-4">
        <button
          class="grid h-8 w-8 place-items-center overflow-hidden rounded-full text-[13px] font-medium text-white ring-2 ring-transparent hover:ring-[#1a73e8]"
          style="background:{headerAccount?.avatarColor ?? '#1a73e8'}"
          aria-label="Conta"
          title={headerAccount?.name ?? 'Conta'}
          on:click={() => dispatch('account')}
        >
          {#if headerAccount?.avatarUrl}
            <img src={headerAccount.avatarUrl} alt="" class="h-full w-full object-cover" />
          {:else}
            {headerAccountInitial}
          {/if}
        </button>
      </div>
    </header>

    <div data-admin-body class="flex h-[calc(100vh-56px)] overflow-hidden">
      <aside data-admin-nav class="w-[252px] shrink-0 bg-[#f8fafd] pt-4">
        <nav class="px-3">
          {#each tabs as t}
            <button
              class="mb-1 flex h-8 w-full items-center rounded-full px-6 text-left text-[14px] {tab === t.id
                ? 'bg-[#c2e7ff] text-[#174ea6]'
                : 'text-[#202124] hover:bg-[#e8eaed]'}"
              on:click={() => (tab = t.id)}
            >
              {t.label}
            </button>
          {/each}
        </nav>
      </aside>

      <main data-admin-main class="flex min-w-0 flex-1 overflow-hidden">
        <div class="min-w-0 flex-1 overflow-y-auto rounded-tl-[14px] bg-white">
          {#if tab === 'overview'}
            <section class="w-full max-w-[780px] px-12 pb-20 pt-4">
              <div>
                <h2 class="text-[24px] font-normal leading-8">Armazenamento</h2>
                <div class="mt-2 h-1 w-[174px] overflow-hidden rounded-full bg-[#dadce0]">
                  <div class="h-full bg-[#0b57d0]" style="width:{usagePercent}%"></div>
                </div>
                <p class="mt-2 text-[14px] text-[#202124]">
                  {stats ? `${usedStorageLabel} de ${quotaStorageLabel} usados` : 'Carregando…'}
                </p>
              </div>

              <div class="my-6 h-px bg-[#8f8f8f]"></div>

              <section>
                <h2 class="text-[23px] font-normal leading-8">Página inicial</h2>
                <label class="mt-4 flex h-8 items-center gap-5 text-[14px]">
                  <input class="h-5 w-5 accent-[#0b57d0]" type="radio" bind:group={startPage} value="personal" />
                  <span>Pessoal</span>
                </label>
                <label class="mt-4 flex h-8 items-center gap-5 text-[14px]">
                  <input class="h-5 w-5 accent-[#0b57d0]" type="radio" bind:group={startPage} value="drive" />
                  <span>Meu Ride</span>
                </label>
              </section>

              <div class="my-6 h-px bg-[#8f8f8f]"></div>

              <section>
                <h2 class="text-[23px] font-normal leading-8">Aparência</h2>
                <label class="mt-4 flex h-8 items-center gap-5 text-[14px]">
                  <input class="h-5 w-5 accent-[#0b57d0]" type="radio" bind:group={appearance} value="light" />
                  <span>Claro</span>
                </label>
                <label class="mt-4 flex h-8 items-center gap-5 text-[14px]">
                  <input class="h-5 w-5 accent-[#0b57d0]" type="radio" bind:group={appearance} value="dark" />
                  <span>Escuro</span>
                </label>
                <label class="mt-4 flex h-8 items-center gap-5 text-[14px]">
                  <input class="h-5 w-5 accent-[#0b57d0]" type="radio" bind:group={appearance} value="system" />
                  <span>Padrão do dispositivo</span>
                </label>
              </section>

              <div class="my-6 h-px bg-[#8f8f8f]"></div>

              <section>
                <h2 class="text-[23px] font-normal leading-8">Densidade</h2>
                <label class="mt-4 flex h-8 items-center gap-5 text-[14px]">
                  <input class="h-5 w-5 accent-[#0b57d0]" type="radio" bind:group={density} value="low" />
                  <span>Baixa</span>
                </label>
                <label class="mt-4 flex h-8 items-center gap-5 text-[14px]">
                  <input class="h-5 w-5 accent-[#0b57d0]" type="radio" bind:group={density} value="medium" />
                  <span>Média</span>
                </label>
                <label class="mt-4 flex h-8 items-center gap-5 text-[14px]">
                  <input class="h-5 w-5 accent-[#0b57d0]" type="radio" bind:group={density} value="high" />
                  <span>Alta</span>
                </label>
              </section>

              <div class="my-6 h-px bg-[#8f8f8f]"></div>

              <section>
                <h2 class="text-[23px] font-normal leading-8">Abrir PDFs</h2>
                <label class="mt-4 flex h-8 items-center gap-5 text-[14px]">
                  <input class="h-5 w-5 accent-[#0b57d0]" type="radio" bind:group={pdfOpening} value="tab" />
                  <span>Nova guia</span>
                </label>
                <label class="mt-4 flex h-8 items-center gap-5 text-[14px]">
                  <input class="h-5 w-5 accent-[#0b57d0]" type="radio" bind:group={pdfOpening} value="preview" />
                  <span>Visualizar</span>
                </label>
              </section>

            </section>
          {:else if tab === 'users'}
            <section class="w-full max-w-[860px] px-12 pb-20 pt-4">
              <div class="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <h2 class="text-[24px] font-normal leading-8">Usuários</h2>
                  <p class="mt-4 text-[14px] leading-6 text-[#202124]">
                    Crie contas, altere papéis, defina senhas e ajuste cotas de armazenamento.
                  </p>
                </div>
                <button
                  type="button"
                  class="h-10 shrink-0 rounded-full border border-[#747775] px-6 text-[14px] font-medium text-[#0b57d0] hover:bg-[#f8fafd]"
                  on:click={() => (showCreateForm = true)}
                >
                  Novo usuário
                </button>
              </div>
              <div class="my-6 h-px bg-[#8f8f8f]"></div>
              <div class="overflow-hidden rounded-2xl border border-[#dadce0] bg-white">
                <div
                  class="grid border-b border-[#e0e0e0] px-5 py-3 text-[12px] font-medium uppercase tracking-wide text-[#5f6368]"
                  style="grid-template-columns:minmax(0,1fr) 110px 150px 110px"
                >
                  <span>Usuário</span>
                  <span>Papel</span>
                  <span>Cota</span>
                  <span>Ações</span>
                </div>
                {#each accounts as account (account.id)}
                  <div
                    class="grid items-center border-b border-[#f1f3f4] px-5 py-3 last:border-0"
                    style="grid-template-columns:minmax(0,1fr) 110px 150px 110px"
                  >
                    <div class="flex min-w-0 items-center gap-3">
                      <div
                        class="grid h-10 w-10 shrink-0 place-items-center rounded-full text-[14px] font-medium text-white"
                        style="background:{account.avatarColor}"
                      >
                        {account.name.slice(0, 1).toUpperCase()}
                      </div>
                      <div class="min-w-0">
                        <p class="truncate text-[14px] font-medium text-[#202124]">{account.name}</p>
                        <p class="truncate text-[12px] text-[#5f6368]">{account.email}</p>
                      </div>
                    </div>
                    <span>
                      <span class="rounded-full bg-[#f1f3f4] px-3 py-1 text-[12px] capitalize text-[#5f6368]">
                        {account.role}
                      </span>
                    </span>
                    <span class="text-[13px] text-[#5f6368]">{formatBytes(account.storageQuotaBytes)}</span>
                    <button
                      type="button"
                      class="justify-self-start rounded-full border border-[#dadce0] bg-white px-4 py-1.5 text-[13px] font-medium text-[#202124] hover:bg-[#f1f3f4]"
                      on:click={() => openEdit(account)}
                    >
                      Editar
                    </button>
                  </div>
                {/each}
              </div>
              {#if accountsWithoutPassword}
                <p class="mt-4 rounded bg-[#fef7e0] px-4 py-3 text-[13px] text-[#b06000]">
                  {accountsWithoutPassword}
                  {accountsWithoutPassword === 1 ? 'conta ainda não tem senha definida.' : 'contas ainda não têm senha definida.'}
                </p>
              {/if}
            </section>
          {:else if tab === 'security'}
            <section class="w-full max-w-[980px] px-12 pb-20 pt-4">
              <div class="flex items-start justify-between gap-6">
                <div>
                  <h2 class="text-[24px] font-normal leading-8">Segurança e login</h2>
                  <p class="mt-4 text-[14px] leading-6 text-[#202124]">
                    Controle as sessões autenticadas do administrador atual.
                  </p>
                </div>
                <button
                  type="button"
                  class="mt-1 h-10 shrink-0 rounded-full border border-[#747775] px-6 text-[14px] font-medium text-[#0b57d0] hover:bg-[#f8fafd] disabled:opacity-60"
                  disabled={sessionsLoading}
                  on:click={loadSecuritySessions}
                >
                  Atualizar
                </button>
              </div>

              <div class="my-6 h-px bg-[#8f8f8f]"></div>

              <div class="overflow-hidden rounded-[28px] bg-[#1f1f1f] text-[#e8eaed]">
                {#if selectedDevice}
                  <div class="border-b border-[#3c4043] px-6 py-5">
                    <button
                      type="button"
                      class="mb-4 inline-flex h-9 items-center gap-2 rounded-full px-3 text-[14px] hover:bg-[#303134]"
                      on:click={clearSelectedDevice}
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.42-1.41L7.83 13H20v-2z" />
                      </svg>
                      Seus dispositivos
                    </button>
                    <div class="flex items-start gap-5">
                      <div class="grid h-20 w-20 shrink-0 place-items-center rounded-full bg-[#3c4043]">
                        <svg xmlns="http://www.w3.org/2000/svg" width="46" height="46" viewBox="0 0 24 24" fill="#bdc1c6">
                          <path d="M20 18c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2H4c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2H0v2h24v-2h-4zM4 6h16v10H4V6z" />
                        </svg>
                      </div>
                      <div class="min-w-0 flex-1">
                        <h3 class="text-[20px] font-normal">{selectedDevice.os}</h3>
                        <p class="mt-1 text-[14px] text-[#bdc1c6]">{selectedDevice.location}</p>
                        <p class="mt-1 text-[14px] text-[#bdc1c6]">{deviceCountLabel(selectedDevice)}</p>
                      </div>
                    </div>
                  </div>

                  {#if sessionsError}
                    <div class="mx-6 mt-4 rounded-lg bg-[#5f2120] px-4 py-3 text-[13px] text-[#fddad6]">{sessionsError}</div>
                  {/if}

                  <div class="grid gap-0 lg:grid-cols-[minmax(0,1fr)_360px]">
                    <div class="divide-y divide-[#3c4043]">
                      {#each selectedDevice.sessions as session (session.id)}
                        <button
                          type="button"
                          class="grid w-full grid-cols-[minmax(0,1fr)_24px] gap-4 px-6 py-4 text-left hover:bg-[#303134] {selectedSession?.id === session.id ? 'bg-[#2b2c2f]' : ''}"
                          on:click={() => (selectedSession = session)}
                        >
                          <span class="min-w-0">
                            <span class="block truncate text-[15px]">{session.os}</span>
                            <span class="mt-1 block truncate text-[13px] text-[#bdc1c6]">{formatSessionDate(session.createdAt)}</span>
                            <span class="mt-2 flex items-center gap-2 text-[13px] {session.active ? 'text-[#8ab4f8]' : 'text-[#fdd663]'}">
                              <span class="grid h-4 w-4 place-items-center rounded-full {session.active ? 'bg-[#8ab4f8] text-[#202124]' : 'bg-[#fdd663] text-[#202124]'}">
                                {session.active ? '✓' : '!'}
                              </span>
                              {sessionStatus(session)}
                            </span>
                          </span>
                          <span class="self-center text-[#bdc1c6]">›</span>
                        </button>
                      {/each}
                    </div>

                    {#if selectedSession}
                      <div class="border-t border-[#3c4043] p-5 lg:border-l lg:border-t-0">
                        <h4 class="text-[13px] font-medium uppercase tracking-wide text-[#bdc1c6]">Detalhes de segurança</h4>
                        <dl class="mt-4 space-y-3 text-[13px]">
                          <div>
                            <dt class="text-[#bdc1c6]">Primeiro login</dt>
                            <dd class="mt-0.5">{formatSessionDate(selectedSession.createdAt)}</dd>
                          </div>
                          <div>
                            <dt class="text-[#bdc1c6]">Última atividade</dt>
                            <dd class="mt-0.5">{formatSessionDate(selectedSession.lastSeenAt)}</dd>
                          </div>
                          <div>
                            <dt class="text-[#bdc1c6]">Expira em</dt>
                            <dd class="mt-0.5">{formatSessionDate(selectedSession.expiresAt)}</dd>
                          </div>
                          <div>
                            <dt class="text-[#bdc1c6]">IP</dt>
                            <dd class="mt-0.5 break-all">{selectedSession.ipAddress ?? 'Indisponível'}</dd>
                          </div>
                          <div>
                            <dt class="text-[#bdc1c6]">Navegador e sistema</dt>
                            <dd class="mt-0.5">{selectedSession.browser} · {selectedSession.os}</dd>
                          </div>
                          <div>
                            <dt class="text-[#bdc1c6]">Idioma</dt>
                            <dd class="mt-0.5 break-all">{selectedSession.language ?? 'Indisponível'}</dd>
                          </div>
                          <div>
                            <dt class="text-[#bdc1c6]">Rede / operadora</dt>
                            <dd class="mt-0.5">{selectedSession.isp ?? selectedSession.network ?? 'Indisponível'}</dd>
                          </div>
                          <div>
                            <dt class="text-[#bdc1c6]">Wi-Fi / conexão</dt>
                            <dd class="mt-0.5">{selectedSession.wifiSsid ?? selectedSession.network ?? 'SSID não exposto pelo navegador/HTTP'}</dd>
                          </div>
                          <div>
                            <dt class="text-[#bdc1c6]">Mapa</dt>
                            <dd class="mt-2">
                              {#if selectedSession.latitude !== null && selectedSession.longitude !== null}
                                <iframe
                                  title="Mapa aproximado da sessão"
                                  class="h-40 w-full rounded-xl border border-[#3c4043] bg-[#303134]"
                                  src={mapEmbedUrl(selectedSession)}
                                  loading="lazy"
                                ></iframe>
                                <p class="mt-2 text-[12px] text-[#bdc1c6]">
                                  Localização aproximada por IP: {selectedSession.latitude}, {selectedSession.longitude}
                                </p>
                              {:else}
                                <div class="grid h-28 place-items-center rounded-xl border border-[#3c4043] bg-[#303134] px-4 text-center text-[12px] text-[#bdc1c6]">
                                  Mapa indisponível sem latitude/longitude da infraestrutura.
                                </div>
                              {/if}
                            </dd>
                          </div>
                        </dl>
                        <button
                          type="button"
                          class="mt-5 inline-flex h-10 items-center gap-2 rounded-full border border-[#5f6368] px-4 text-[14px] font-medium hover:bg-[#303134] disabled:opacity-60"
                          disabled={revokingSessionId === selectedSession.id}
                          on:click={() => revokeSession(selectedSession as SecuritySession)}
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="#8ab4f8">
                            <path d="M17 7l-1.41 1.41L18.17 11H8v2h10.17l-2.58 2.58L17 17l5-5zM4 5h8V3H4c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h8v-2H4V5z" />
                          </svg>
                          {revokingSessionId === selectedSession.id ? 'Saindo...' : 'Sair desta sessão'}
                        </button>
                      </div>
                    {/if}
                  </div>
                {:else}
                  <div class="px-6 py-5">
                    <h3 class="text-[18px] font-normal">Seus dispositivos</h3>
                    <p class="mt-1 text-[13px] leading-5 text-[#bdc1c6]">
                      Sessões ativas agrupadas por dispositivo, navegador e IP.
                    </p>
                  </div>
                  {#if sessionsError}
                    <div class="mx-6 mb-4 rounded-lg bg-[#5f2120] px-4 py-3 text-[13px] text-[#fddad6]">{sessionsError}</div>
                  {/if}
                  {#if sessionsLoading && !sessionsLoaded}
                    <div class="px-6 pb-6 text-[13px] text-[#bdc1c6]">Carregando sessões...</div>
                  {:else if deviceGroups.length === 0}
                    <div class="px-6 pb-6 text-[13px] text-[#bdc1c6]">Nenhuma sessão ativa encontrada.</div>
                  {:else}
                    <div class="divide-y divide-[#202124] overflow-hidden rounded-b-[28px]">
                      {#each deviceGroups as device (device.id)}
                        <button
                          type="button"
                          class="grid w-full grid-cols-[44px_minmax(0,1fr)_24px] items-center gap-4 bg-[#3c4043] px-6 py-4 text-left hover:bg-[#45474a]"
                          on:click={() => selectDevice(device)}
                        >
                          <span class="grid h-10 w-10 place-items-center rounded-full bg-[#4b4f52]">
                            <svg xmlns="http://www.w3.org/2000/svg" width="25" height="25" viewBox="0 0 24 24" fill="#bdc1c6">
                              <path d="M20 18c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2H4c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2H0v2h24v-2h-4zM4 6h16v10H4V6z" />
                            </svg>
                          </span>
                          <span class="min-w-0">
                            <span class="block truncate text-[15px] font-medium">{deviceCountLabel(device)}</span>
                            <span class="mt-1 block truncate text-[13px] text-[#bdc1c6]">{deviceSubtitle(device)}</span>
                          </span>
                          <span class="text-[24px] text-[#bdc1c6]">›</span>
                        </button>
                      {/each}
                    </div>
                  {/if}
                {/if}
              </div>
            </section>
          {:else if tab === 'jobs'}
            <section class="w-full max-w-[780px] px-12 pb-20 pt-4">
              <h2 class="text-[24px] font-normal leading-8">Processos</h2>
              <div class="mt-4 divide-y divide-[#dadce0]">
                {#each stats?.jobs ?? [] as job}
                  <div class="flex items-center justify-between py-3 text-[14px]">
                    <div>
                      <p>{job.name}</p>
                      <p class="mt-1 text-[12px] text-[#5f6368]">Na fila: {job.queued} · Concluídos: {job.completed}</p>
                    </div>
                    <span class="capitalize text-[#5f6368]">{job.status}</span>
                  </div>
                {/each}
              </div>
            </section>
          {:else}
            <section class="w-full max-w-[1120px] px-12 pb-20 pt-4">
              <div class="flex items-start justify-between gap-6">
                <div>
                  <h2 class="text-[24px] font-normal leading-8">Backups</h2>
                  <p class="mt-4 text-[14px] leading-6 text-[#202124]">
                    Crie e restaure um backup completo do Ride: usuários, login, metadados, histórico e arquivos.
                  </p>
                </div>
                <button
                  class="mt-1 h-10 shrink-0 rounded-full border border-[#747775] px-6 text-[14px] font-medium text-[#0b57d0] hover:bg-[#f8fafd] disabled:opacity-60"
                  disabled={Boolean(maintenanceLoading)}
                  on:click={loadMaintenanceOverview}
                >
                  Atualizar
                </button>
              </div>

              <div class="my-6 h-px bg-[#8f8f8f]"></div>

              {#if maintenanceError}
                <p class="mb-5 rounded bg-[#fce8e6] px-4 py-3 text-[13px] text-[#d93025]">{maintenanceError}</p>
              {/if}
              {#if maintenanceMessage}
                <p class="mb-5 rounded bg-[#e6f4ea] px-4 py-3 text-[13px] text-[#188038]">{maintenanceMessage}</p>
              {/if}

              <div class="grid gap-x-14 gap-y-8 lg:grid-cols-[minmax(0,1fr)_360px]">
                <section>
                  <h3 class="text-[23px] font-normal leading-8">Agendamento</h3>
                  <div class="mt-5 space-y-6">
                    <div class="grid gap-4 md:grid-cols-[minmax(0,1fr)_150px_120px] md:items-start">
                      <label class="flex items-start gap-5 text-[14px]">
                        <input class="mt-1 h-5 w-5 accent-[#0b57d0]" type="checkbox" bind:checked={backupScheduleEnabled} />
                        <span>
                          <span class="block">Backup completo automático</span>
                          <span class="mt-1 block text-[12px] text-[#5f6368]">{backupPolicyDescription()}</span>
                        </span>
                      </label>
                      <label class="block text-[13px]">
                        <span class="block text-[#5f6368]">Intervalo (horas)</span>
                        <input class="mt-1 h-10 w-full rounded border border-[#747775] px-3 outline-none focus:border-[#0b57d0]" type="number" min="1" max="720" bind:value={backupIntervalHours} />
                      </label>
                      <label class="block text-[13px]">
                        <span class="block text-[#5f6368]">Reter</span>
                        <input class="mt-1 h-10 w-full rounded border border-[#747775] px-3 outline-none focus:border-[#0b57d0]" type="number" min="1" max="365" bind:value={backupRetentionCount} />
                      </label>
                    </div>
                  </div>

                  <div class="mt-8">
                    <h3 class="text-[23px] font-normal leading-8">Local padrão</h3>
                    <p class="mt-2 text-[13px] leading-5 text-[#5f6368]">
                      Diretório do servidor onde os backups completos serão gravados.
                    </p>
                    <div class="mt-4 flex gap-2">
                      <input
                        class="h-10 min-w-0 flex-1 rounded border border-[#747775] px-3 text-[14px] outline-none focus:border-[#0b57d0]"
                        placeholder="/mnt/backup-ride"
                        bind:value={backupDirectory}
                        on:keydown={(event) => event.key === 'Enter' && saveSettings('backup')}
                      />
                      <button
                        type="button"
                        class="h-10 rounded-full border border-[#747775] px-5 text-[14px] font-medium text-[#0b57d0] hover:bg-[#f8fafd]"
                        on:click={openDirectoryBrowser}>Procurar</button
                      >
                    </div>
                  </div>

                  <div class="mt-6 flex flex-wrap gap-2">
                    <button class="h-10 rounded-full border border-[#747775] px-5 text-[14px] font-medium text-[#0b57d0] hover:bg-[#f8fafd] disabled:opacity-60" disabled={settingsLoading} on:click={() => saveSettings('backup')}>
                      Salvar política
                    </button>
                  </div>
                </section>

                <aside>
                  <h3 class="text-[23px] font-normal leading-8">Ações rápidas</h3>
                  <div class="mt-5 space-y-3">
                    <button class="h-10 w-full rounded-full border border-[#747775] px-5 text-[14px] font-medium text-[#0b57d0] hover:bg-[#f8fafd] disabled:opacity-60" disabled={Boolean(maintenanceLoading)} on:click={() => runMaintenance('audit')}>
                      {maintenanceLoading === 'audit' ? 'Auditando…' : 'Auditar'}
                    </button>
                    <button class="h-10 w-full rounded-full border border-[#747775] px-5 text-[14px] font-medium text-[#0b57d0] hover:bg-[#f8fafd] disabled:opacity-60" disabled={Boolean(maintenanceLoading)} on:click={() => runMaintenance('backup')}>
                      {maintenanceLoading === 'backup' ? 'Criando…' : 'Backup'}
                    </button>
                    <button class="h-10 w-full rounded-full border border-[#747775] px-5 text-[14px] font-medium text-[#0b57d0] hover:bg-[#f8fafd] disabled:opacity-60" disabled={Boolean(maintenanceLoading)} on:click={openBackupFilePicker}>
                      {maintenanceLoading === 'upload' ? 'Restaurando…' : 'Restaurar'}
                    </button>
                    <input
                      class="hidden"
                      type="file"
                      accept=".tar.xz,.tar.gz,.tgz,.txz,application/gzip,application/x-xz"
                      bind:this={backupUploadInput}
                      on:change={handleBackupFileSelected}
                    />
                  </div>

                  <div class="mt-8">
                    <h3 class="text-[23px] font-normal leading-8">Lixeira</h3>
                    <div class="mt-4 flex items-center gap-3">
                      <input
                        id="trash-days"
                        type="number"
                        min="1"
                        max="365"
                        class="h-10 w-24 rounded border border-[#747775] px-3 text-[14px] outline-none focus:border-[#0b57d0]"
                        bind:value={trashRetentionDays}
                      />
                      <button
                        class="h-10 rounded-full border border-[#747775] px-5 text-[14px] font-medium text-[#0b57d0] hover:bg-[#f8fafd] disabled:opacity-60"
                        disabled={settingsLoading}
                        on:click={() => saveSettings('trash')}
                      >
                        Salvar
                      </button>
                    </div>
                    <p class="mt-3 text-[13px] text-[#5f6368]">
                      Exclusão definitiva após {trashRetentionDays} dias.
                    </p>
                  </div>
                </aside>
              </div>

              <div class="my-8 h-px bg-[#8f8f8f]"></div>

              <section>
                <h3 class="text-[23px] font-normal leading-8">Histórico</h3>
                <div class="mt-5">
                  <div>
                    <div class="flex items-baseline justify-between">
                      <h4 class="text-[18px] font-normal">Backups completos recentes</h4>
                      <span class="text-[12px] text-[#5f6368]">{backups.length}</span>
                    </div>
                    <div class="mt-3 divide-y divide-[#dadce0]">
                      {#each backups.slice(0, 5) as backup}
                        <div class="flex items-center justify-between gap-4 py-3">
                          <div class="min-w-0">
                            <p class="truncate text-[13px]">{backup.id}</p>
                            <p class="text-[12px] text-[#5f6368]">{formatArtifactDate(backup.createdAt)} · {formatBytes(backup.bytes)}</p>
                          </div>
                          <div class="flex shrink-0 gap-1">
                            <button class="rounded-full px-3 py-1 text-[12px] font-medium text-[#0b57d0] hover:bg-[#e8f0fe]" on:click={() => askArtifactAction('backup', 'restore', backup)}>Restaurar</button>
                            <button class="rounded-full px-3 py-1 text-[12px] font-medium text-[#d93025] hover:bg-[#fce8e6]" on:click={() => askArtifactAction('backup', 'delete', backup)}>Excluir</button>
                          </div>
                        </div>
                      {:else}
                        <p class="py-3 text-[13px] text-[#5f6368]">Nenhum backup ainda.</p>
                      {/each}
                    </div>
                  </div>
                </div>
              </section>
            </section>
          {/if}
        </div>

      </main>
    </div>
  </div>
{:else if false}
  <!-- Overlay -->
  <div
    class="fixed inset-0 z-50 flex items-start justify-center bg-black/40 p-0"
    role="dialog"
    aria-modal="true"
    aria-label="Painel de administração"
  >
    <div
      class="flex h-screen w-full max-w-7xl overflow-hidden bg-white shadow-modal sm:h-[calc(100vh-24px)] sm:m-3 sm:rounded-2xl"
    >
      <!-- Sidebar nav -->
      <aside class="hidden w-64 shrink-0 flex-col border-r border-[#e0e0e0] bg-[#f8f9fa] py-4 md:flex">
        <!-- Logo + title -->
        <div class="flex items-center gap-3 px-5 pb-4">
          <div class="flex h-10 w-10 items-center justify-center rounded-lg bg-[#1a73e8]">
            <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="white">
              <path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4z" />
            </svg>
          </div>
          <div>
            <p class="text-[15px] font-medium text-[#202124]">Administração</p>
            <p class="text-[12px] text-[#5f6368]">Painel de controle</p>
          </div>
        </div>

        <nav class="flex-1 px-3">
          {#each tabs as t}
            <button
              class="mb-0.5 flex h-9 w-full items-center rounded-full px-4 text-[14px] transition-colors {tab ===
              t.id
                ? 'bg-[#e8f0fe] font-medium text-[#1967d2]'
                : 'text-[#202124] hover:bg-[#e8eaed]'}"
              on:click={() => (tab = t.id)}>{t.label}</button
            >
          {/each}
        </nav>

        <!-- Storage summary -->
        <div class="mx-3 mt-auto rounded-2xl bg-white p-4 ring-1 ring-[#dadce0]">
          <p class="text-[13px] font-medium text-[#202124]">Uso de armazenamento</p>
          <div class="mt-3 h-2 overflow-hidden rounded-full bg-[#dadce0]">
            <div class="h-2 rounded-full bg-[#1a73e8] transition-all" style="width:{usagePercent}%"></div>
          </div>
          <p class="mt-2 text-[12px] text-[#5f6368]">
            {stats ? `${usedStorageLabel} de ${quotaStorageLabel}` : 'Carregando…'}
          </p>
        </div>
      </aside>

      <!-- Main content -->
      <div class="flex min-w-0 flex-1 flex-col">
        <!-- Header -->
        <header class="flex shrink-0 items-center justify-between border-b border-[#e0e0e0] px-6 py-4">
          <div class="flex items-center gap-3">
            <!-- Mobile tab select -->
            <select
              class="h-9 rounded-full border border-[#dadce0] bg-white px-3 text-[14px] md:hidden"
              bind:value={tab}
            >
              {#each tabs as t}<option value={t.id}>{t.label}</option>{/each}
            </select>
            <h1 class="hidden text-[22px] font-normal text-[#202124] md:block">
              {tabs.find((t) => t.id === tab)?.label}
            </h1>
          </div>
          <button
            class="flex h-9 w-9 items-center justify-center rounded-full hover:bg-[#f1f3f4]"
            on:click={() => dispatch('close')}
            aria-label="Fechar"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="#5f6368">
              <path
                d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"
              />
            </svg>
          </button>
        </header>

        <!-- Tab content -->
        <div class="flex-1 overflow-y-auto p-6">
          {#if tab === 'overview'}
            <!-- Stats cards -->
            <div class="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              {#each [{ label: 'Usuários', value: stats?.users ?? accounts.length, sub: `${stats?.admins ?? accounts.filter((account) => account.role === 'admin').length} administradores` }, { label: 'Arquivos', value: stats?.files ?? 0, sub: `${stats?.folders ?? 0} pastas` }, { label: 'Compartilhados', value: stats?.sharedItems ?? 0, sub: 'links e acessos ativos' }, { label: 'Em risco', value: atRiskItems, sub: `${stats?.trashedItems ?? 0} na lixeira · ${stats?.spamItems ?? 0} spam` }] as card}
                <div class="rounded-2xl border border-[#dadce0] bg-white p-5">
                  <p class="text-[13px] text-[#5f6368]">{card.label}</p>
                  <p class="mt-3 text-[32px] font-light text-[#202124]">{card.value}</p>
                  <p class="mt-1 text-[12px] text-[#5f6368]">{card.sub}</p>
                </div>
              {/each}
            </div>

            <!-- Storage usage bar -->
            <div class="mt-6 rounded-2xl border border-[#dadce0] bg-white p-6">
              <div class="flex items-center justify-between">
                <h3 class="text-[16px] font-medium text-[#202124]">Armazenamento total</h3>
                <span
                  class="rounded-full bg-[#e6f4ea] px-3 py-1 text-[12px] font-medium text-[#188038] ring-1 ring-[#a8d5b5]"
                  >Online</span
                >
              </div>
              <div class="mt-5 h-3 overflow-hidden rounded-full bg-[#f1f3f4]">
                <div class="h-3 rounded-full bg-[#1a73e8] transition-all" style="width:{usagePercent}%"></div>
              </div>
              <div class="mt-3 flex justify-between text-[13px] text-[#5f6368]">
                <span>{usedStorageLabel} usados</span>
                <span>{quotaStorageLabel} de cota total</span>
              </div>
            </div>

            <!-- Accounts quick list -->
            <div class="mt-6 rounded-2xl border border-[#dadce0] bg-white">
              <div class="flex items-center justify-between border-b border-[#e0e0e0] px-5 py-4">
                <h3 class="text-[15px] font-medium text-[#202124]">Contas ativas</h3>
                <span class="text-[12px] text-[#5f6368]">
                  {stats?.activeSessions ?? 0} {stats?.activeSessions === 1 ? 'sessão' : 'sessões'}
                </span>
              </div>
              {#each accounts.slice(0, 5) as account (account.id)}
                <div class="flex items-center gap-4 border-b border-[#f1f3f4] px-5 py-3 last:border-0">
                  <div
                    class="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[13px] font-medium text-white"
                    style="background:{account.avatarColor}"
                  >
                    {account.name.slice(0, 1).toUpperCase()}
                  </div>
                  <div class="min-w-0 flex-1">
                    <p class="truncate text-[14px] font-medium text-[#202124]">{account.name}</p>
                    <p class="truncate text-[12px] text-[#5f6368]">{account.email}</p>
                  </div>
                  <span class="rounded-full bg-[#f1f3f4] px-3 py-1 text-[12px] text-[#5f6368] capitalize"
                    >{account.role}</span
                  >
                </div>
              {/each}
              {#if accountsWithoutPassword}
                <div class="border-t border-[#f1f3f4] px-5 py-3 text-[12px] text-[#b06000]">
                  {accountsWithoutPassword}
                  {accountsWithoutPassword === 1 ? 'conta ainda não tem senha definida.' : 'contas ainda não têm senha definida.'}
                </div>
              {/if}
            </div>
          {:else if tab === 'users'}
            <!-- Header with create button -->
            <div class="mb-4 flex items-center justify-between">
              <p class="text-[13px] text-[#5f6368]">
                {accounts.length}
                {accounts.length === 1 ? 'usuário' : 'usuários'}
              </p>
              <button
                type="button"
                class="flex items-center gap-2 rounded-full bg-[#1a73e8] px-5 py-2 text-[14px] font-medium text-white hover:bg-[#1557b0]"
                on:click={() => (showCreateForm = true)}
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="white"
                >
                  <path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z" />
                </svg>
                Novo usuário
              </button>
            </div>

            <!-- Users table -->
            <div class="overflow-hidden rounded-2xl border border-[#dadce0] bg-white">
              <div
                class="grid border-b border-[#e0e0e0] px-5 py-3 text-[12px] font-medium uppercase tracking-wide text-[#5f6368]"
                style="grid-template-columns:1fr 100px 140px 120px"
              >
                <span>Usuário</span>
                <span class="hidden sm:block">Papel</span>
                <span class="hidden md:block">Cota</span>
                <span>Ações</span>
              </div>
              {#each accounts as account (account.id)}
                <div
                  class="grid items-center border-b border-[#f1f3f4] px-5 py-3 last:border-0"
                  style="grid-template-columns:1fr 100px 140px 120px"
                >
                  <div class="flex min-w-0 items-center gap-3">
                    <div
                      class="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-[14px] font-medium text-white"
                      style="background:{account.avatarColor}"
                    >
                      {account.name.slice(0, 1).toUpperCase()}
                    </div>
                    <div class="min-w-0">
                      <p class="truncate text-[14px] font-medium text-[#202124]">{account.name}</p>
                      <p class="truncate text-[12px] text-[#5f6368]">{account.email}</p>
                    </div>
                  </div>

                  <span class="hidden sm:block">
                    <span class="rounded-full bg-[#f1f3f4] px-3 py-1 text-[12px] capitalize text-[#5f6368]"
                      >{account.role}</span
                    >
                  </span>

                  <span class="hidden text-[13px] text-[#5f6368] md:block"
                    >{formatBytes(account.storageQuotaBytes)}</span
                  >

                  <button
                    type="button"
                    class="justify-self-start rounded-full border border-[#dadce0] bg-white px-4 py-1.5 text-[13px] font-medium text-[#202124] hover:bg-[#f1f3f4]"
                    on:click={() => openEdit(account)}>Editar</button
                  >
                </div>
              {/each}
            </div>
          {:else if tab === 'jobs'}
            <div class="grid gap-4 sm:grid-cols-2">
              {#each stats?.jobs ?? [] as job}
                {@const col = jobStatusColor(job.status)}
                <div class="rounded-2xl border border-[#dadce0] bg-white p-5">
                  <div class="flex items-start justify-between gap-4">
                    <div>
                      <h3 class="text-[15px] font-medium text-[#202124]">{job.name}</h3>
                      <p class="mt-1 text-[13px] text-[#5f6368]">
                        Na fila: {job.queued} · Concluídos: {job.completed}
                      </p>
                    </div>
                    <span
                      class="rounded-full px-3 py-1 text-[12px] font-medium ring-1"
                      style="background:{col.bg};color:{col.text};--tw-ring-color:{col.ring}"
                      >{job.status}</span
                    >
                  </div>
                  <div class="mt-5 h-2 overflow-hidden rounded-full bg-[#f1f3f4]">
                    <div
                      class="h-2 rounded-full bg-[#1a73e8] transition-all"
                      style="width:{job.completed || job.queued
                        ? Math.max(
                            4,
                            Math.min(100, (job.completed / Math.max(1, job.completed + job.queued)) * 100)
                          )
                        : 4}%"
                    ></div>
                  </div>
                </div>
              {/each}
            </div>
          {:else}
            <!-- Settings tab -->
            <div class="max-w-5xl space-y-6">
              <!-- Trash retention -->
              <div class="rounded-2xl border border-[#dadce0] bg-white p-6">
                <h3 class="text-[16px] font-medium text-[#202124]">Política da lixeira</h3>
                <p class="mt-1 text-[13px] text-[#5f6368]">
                  Defina por quantos dias os itens ficam na lixeira antes de serem excluídos permanentemente.
                </p>

                {#if settingsError && settingsFeedbackTarget === 'trash'}
                  <div class="mt-4 rounded-lg bg-[#fce8e6] px-4 py-3 text-[13px] text-[#d93025]">
                    {settingsError}
                  </div>
                {/if}
                {#if settingsSaved && settingsFeedbackTarget === 'trash'}
                  <div class="mt-4 rounded-lg bg-[#e6f4ea] px-4 py-3 text-[13px] text-[#188038]">
                    Configurações salvas com sucesso!
                  </div>
                {/if}

                <div class="mt-5 flex items-end gap-4">
                  <div class="flex-1">
                    <label class="mb-1.5 block text-[13px] font-medium text-[#202124]" for="trash-days"
                      >Dias até exclusão permanente</label
                    >
                    <input
                      id="trash-days"
                      type="number"
                      min="1"
                      max="365"
                      class="h-10 w-full rounded-lg border border-[#dadce0] px-3 text-[14px] outline-none transition focus:border-[#1a73e8] focus:ring-1 focus:ring-[#1a73e8]"
                      bind:value={trashRetentionDays}
                    />
                  </div>
                  <button
                    class="h-10 rounded-full bg-[#1a73e8] px-6 text-[14px] font-medium text-white hover:bg-[#1557b0] disabled:opacity-60"
                    disabled={settingsLoading}
                    on:click={() => saveSettings('trash')}>{settingsLoading ? 'Salvando…' : 'Salvar'}</button
                  >
                </div>
                <p class="mt-3 text-[12px] text-[#5f6368]">
                  Atualmente configurado para <strong>{trashRetentionDays} dias</strong>. Após esse período,
                  os arquivos são removidos permanentemente do servidor.
                </p>
              </div>

              <div class="overflow-hidden rounded-2xl border border-[#dadce0] bg-white">
                <div class="flex flex-col gap-4 border-b border-[#e0e0e0] px-6 py-5 lg:flex-row lg:items-center lg:justify-between">
                  <div>
                    <h3 class="text-[16px] font-medium text-[#202124]">Backup e integridade</h3>
                    <p class="mt-1 max-w-2xl text-[13px] text-[#5f6368]">
                      Configure o backup completo do Ride e execute verificações manuais quando precisar.
                    </p>
                  </div>
                  <div class="flex items-center gap-2">
                    <span class="rounded-full border px-3 py-1 text-[12px] font-medium {maintenanceStatusClass}">
                      {maintenanceStatusLabel}
                    </span>
                    <button
                      class="h-9 rounded-full border border-[#dadce0] px-4 text-[13px] font-medium text-[#202124] hover:bg-[#f8f9fa] disabled:opacity-60"
                      disabled={Boolean(maintenanceLoading)}
                      on:click={loadMaintenanceOverview}>Atualizar</button
                    >
                  </div>
                </div>

                {#if maintenanceError}
                  <div class="mx-6 mt-4 flex items-center justify-between gap-3 rounded-lg bg-[#fce8e6] px-4 py-3 text-[13px] text-[#d93025]">
                    <span>{maintenanceError}</span>
                    <button
                      type="button"
                      class="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[#d93025] hover:bg-[#fad2cf]"
                      aria-label="Fechar aviso"
                      on:click={clearMaintenanceNotice}>×</button
                    >
                  </div>
                {/if}
                {#if maintenanceMessage}
                  <div class="mx-6 mt-4 flex items-center justify-between gap-3 rounded-lg bg-[#e6f4ea] px-4 py-3 text-[13px] text-[#188038]">
                    <span>{maintenanceMessage}</span>
                    <button
                      type="button"
                      class="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[#188038] hover:bg-[#ceead6]"
                      aria-label="Fechar aviso"
                      on:click={clearMaintenanceNotice}>×</button
                    >
                  </div>
                {/if}
                {#if settingsError && settingsFeedbackTarget === 'backup'}
                  <div class="mx-6 mt-4 rounded-lg bg-[#fce8e6] px-4 py-3 text-[13px] text-[#d93025]">
                    {settingsError}
                  </div>
                {/if}
                {#if settingsSaved && settingsFeedbackTarget === 'backup'}
                  <div class="mx-6 mt-4 rounded-lg bg-[#e6f4ea] px-4 py-3 text-[13px] text-[#188038]">
                    Política de manutenção salva.
                  </div>
                {/if}

                <div class="grid lg:grid-cols-[minmax(0,1fr)_300px]">
                  <div class="grid">
                    <div class="space-y-5 p-6">
                      <div class="flex items-center justify-between gap-4">
                        <div>
                          <p class="text-[14px] font-medium text-[#202124]">Backup completo</p>
                          <p class="mt-1 text-[13px] text-[#5f6368]">{backupPolicyDescription()}</p>
                        </div>
                        <label class="relative inline-flex cursor-pointer items-center">
                          <input type="checkbox" class="peer sr-only" bind:checked={backupScheduleEnabled} />
                          <span
                            class="h-6 w-11 rounded-full transition"
                            style:background={backupScheduleEnabled ? '#1a73e8' : '#dadce0'}
                          ></span>
                          <span
                            class="absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow transition"
                            style:transform={backupScheduleEnabled ? 'translateX(20px)' : 'translateX(0)'}
                          ></span>
                        </label>
                      </div>

                      <div class="grid gap-3">
                        <label class="block">
                          <span class="mb-1.5 block text-[13px] font-medium text-[#202124]">Intervalo</span>
                          <div class="flex h-10 items-center rounded-lg border border-[#dadce0] focus-within:border-[#1a73e8] focus-within:ring-1 focus-within:ring-[#1a73e8]">
                            <input
                              type="number"
                              min="1"
                              max="720"
                              class="h-full w-20 shrink-0 rounded-lg px-3 text-[14px] outline-none"
                              bind:value={backupIntervalHours}
                            />
                            <span class="pr-3 text-[13px] text-[#5f6368]">horas</span>
                          </div>
                        </label>
                        <label class="block">
                          <span class="mb-1.5 block text-[13px] font-medium text-[#202124]">Manter últimos</span>
                          <div class="flex h-10 items-center rounded-lg border border-[#dadce0] focus-within:border-[#1a73e8] focus-within:ring-1 focus-within:ring-[#1a73e8]">
                            <input
                              type="number"
                              min="1"
                              max="365"
                              class="h-full w-20 shrink-0 rounded-lg px-3 text-[14px] outline-none"
                              bind:value={backupRetentionCount}
                            />
                            <span class="pr-3 text-[13px] text-[#5f6368]">backups</span>
                          </div>
                        </label>
                      </div>
                    </div>

                    <div class="space-y-4 border-t border-[#e0e0e0] p-6">
                      <div>
                        <p class="text-[14px] font-medium text-[#202124]">Local padrão</p>
                        <p class="mt-1 text-[13px] text-[#5f6368]">Diretório do servidor onde os backups completos serão gravados.</p>
                      </div>
                      <div class="flex gap-2">
                        <input
                          class="h-10 min-w-0 flex-1 rounded-lg border border-[#dadce0] px-3 text-[14px] outline-none transition focus:border-[#1a73e8] focus:ring-1 focus:ring-[#1a73e8]"
                          placeholder="/mnt/backup-ride"
                          bind:value={backupDirectory}
                          on:keydown={(event) => event.key === 'Enter' && saveSettings('backup')}
                        />
                        <button
                          type="button"
                          class="h-10 rounded-full border border-[#dadce0] px-4 text-[13px] font-medium text-[#1a73e8] hover:bg-[#f8fafd]"
                          on:click={openDirectoryBrowser}>Procurar</button
                        >
                      </div>
                    </div>

                    <div class="border-t border-[#e0e0e0] p-6 lg:col-span-2">
                      <div class="flex flex-wrap items-center gap-3">
                      <button
                        class="h-10 rounded-full bg-[#1a73e8] px-5 text-[14px] font-medium text-white hover:bg-[#1557b0] disabled:opacity-60"
                        disabled={settingsLoading}
                        on:click={() => saveSettings('backup')}>{settingsLoading ? 'Salvando…' : 'Salvar política'}</button
                      >
                      <p class="text-[12px] text-[#5f6368]">
                        Depois do limite, os pontos mais antigos daquela rotina são removidos.
                      </p>
                      </div>
                    </div>
                  </div>

                  <div class="border-t border-[#e0e0e0] bg-[#f8fafd] p-6 lg:border-l lg:border-t-0">
                    <p class="text-[12px] font-medium uppercase text-[#5f6368]">Resumo</p>
                    <dl class="mt-3 space-y-3 text-[13px]">
                      <div>
                        <dt class="text-[#5f6368]">Último backup</dt>
                        <dd class="mt-0.5 font-medium text-[#202124]">{artifactAge(backupLastRunAt ?? latestBackup?.createdAt)}</dd>
                      </div>
                      <div>
                        <dt class="text-[#5f6368]">Próximo backup</dt>
                        <dd class="mt-0.5 font-medium text-[#202124]">
                          {backupScheduleEnabled ? formatArtifactDate(nextBackupAt) : 'Manual'}
                        </dd>
                      </div>
                      <div>
                        <dt class="text-[#5f6368]">Local padrão</dt>
                        <dd class="mt-0.5 break-all font-medium text-[#202124]">{backupDirectory || 'Carregando...'}</dd>
                      </div>
                    </dl>
                  </div>
                </div>

                <div class="border-t border-[#e0e0e0] px-6 py-5">
                  <div class="flex flex-wrap gap-3">
                    <button
                      class="h-10 rounded-full border border-[#dadce0] px-4 text-[14px] font-medium text-[#202124] hover:bg-[#f8f9fa] disabled:opacity-60"
                      disabled={Boolean(maintenanceLoading)}
                      on:click={() => runMaintenance('audit')}
                      >{maintenanceLoading === 'audit' ? 'Auditando…' : 'Auditar'}</button
                    >
                    <button
                      class="h-10 rounded-full border border-[#dadce0] px-4 text-[14px] font-medium text-[#202124] hover:bg-[#f8f9fa] disabled:opacity-60"
                      disabled={Boolean(maintenanceLoading)}
                      on:click={() => runMaintenance('backup')}
                      >{maintenanceLoading === 'backup' ? 'Criando…' : 'Backup'}</button
                    >
                    <button
                      class="h-10 rounded-full border border-[#dadce0] px-4 text-[14px] font-medium text-[#202124] hover:bg-[#f8f9fa] disabled:opacity-60"
                      disabled={Boolean(maintenanceLoading)}
                      on:click={openBackupFilePicker}
                      >{maintenanceLoading === 'upload' ? 'Restaurando…' : 'Restaurar'}</button
                    >
                    <input
                      class="hidden"
                      type="file"
                      accept=".tar.xz,.tar.gz,.tgz,.txz,application/gzip,application/x-xz"
                      bind:this={backupUploadInput}
                      on:change={handleBackupFileSelected}
                    />
                  </div>
                  {#if lastAudit}
                    <p class="mt-3 text-[12px] text-[#5f6368]">
                      Última auditoria: {lastAudit?.checkedFiles ?? 0} arquivos, {lastAuditProblems} achados.
                    </p>
                  {/if}
                </div>

                <div class="border-t border-[#e0e0e0]">
                  <div class="p-6">
                    <div class="flex items-center justify-between">
                      <p class="text-[14px] font-medium text-[#202124]">Backups completos recentes</p>
                      <span class="text-[12px] text-[#5f6368]">{backups.length}</span>
                    </div>
                    <div class="mt-2 divide-y divide-[#f1f3f4]">
                      {#each backups.slice(0, 3) as backup}
                        <div class="flex items-center justify-between gap-3 py-2">
                          <div class="min-w-0">
                            <p class="truncate text-[13px] font-medium text-[#202124]">{backup.id}</p>
                            <p class="truncate text-[12px] text-[#5f6368]">{formatArtifactDate(backup.createdAt)}</p>
                          </div>
                          <div class="flex shrink-0 items-center gap-2">
                            <span class="text-[12px] text-[#5f6368]">{formatBytes(backup.bytes)}</span>
                            <button
                              class="rounded-full px-2.5 py-1 text-[12px] font-medium text-[#1a73e8] hover:bg-[#e8f0fe] disabled:opacity-60"
                              disabled={Boolean(artifactAction)}
                              on:click={() => askArtifactAction('backup', 'restore', backup)}
                              >Restaurar</button
                            >
                            <button
                              class="rounded-full px-2.5 py-1 text-[12px] font-medium text-[#d93025] hover:bg-[#fce8e6] disabled:opacity-60"
                              disabled={Boolean(artifactAction)}
                              on:click={() => askArtifactAction('backup', 'delete', backup)}
                              >Excluir</button
                            >
                          </div>
                        </div>
                      {:else}
                        <p class="py-4 text-[13px] text-[#5f6368]">Nenhum backup ainda.</p>
                      {/each}
                    </div>
                  </div>
                </div>
              </div>

              <!-- Info cards -->
              <div class="grid gap-4 sm:grid-cols-2">
                {#each [{ title: 'Gestão de usuários', desc: 'Crie, edite e gerencie cotas de armazenamento. As alterações de papel entram em vigor imediatamente.' }, { title: 'Compartilhamentos', desc: 'Links públicos são gerados por arquivo. O compartilhamento interno usa e-mail de outras contas.' }] as card}
                  <div class="rounded-2xl border border-[#dadce0] bg-white p-5">
                    <h3 class="text-[15px] font-medium text-[#202124]">{card.title}</h3>
                    <p class="mt-2 text-[13px] text-[#5f6368]">{card.desc}</p>
                  </div>
                {/each}
              </div>
            </div>
          {/if}
        </div>
      </div>
    </div>
  </div>
{/if}

{#if artifactConfirm}
  <div
    class="fixed inset-0 z-[300] flex items-center justify-center bg-[#202124]/35 p-4"
    role="alertdialog"
    aria-modal="true"
    aria-labelledby="artifact-confirm-title"
  >
    <div class="w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-modal">
      <div class="border-b border-[#e0e0e0] px-6 py-5">
        <p id="artifact-confirm-title" class="text-[18px] font-normal text-[#202124]">
          {artifactConfirmTitle()}
        </p>
        <p class="mt-2 text-[13px] leading-5 text-[#5f6368]">
          {artifactConfirmDescription()}
        </p>
      </div>

      <div class="px-6 py-4">
        <div class="rounded-xl bg-[#f8f9fa] px-4 py-3">
          <p class="truncate text-[13px] font-medium text-[#202124]">{artifactConfirm.artifact.id}</p>
          <p class="mt-1 text-[12px] text-[#5f6368]">
            {formatArtifactDate(artifactConfirm.artifact.createdAt)} · {formatBytes(artifactConfirm.artifact.bytes)}
          </p>
        </div>
      </div>

      <div class="flex justify-end gap-2 px-6 pb-5">
        <button
          type="button"
          class="h-10 rounded-full px-5 text-[14px] font-medium text-[#1a73e8] hover:bg-[#e8f0fe] disabled:opacity-60"
          disabled={Boolean(artifactAction)}
          on:click={() => (artifactConfirm = null)}>Cancelar</button
        >
        <button
          type="button"
          class="h-10 rounded-full px-5 text-[14px] font-medium text-white disabled:opacity-60 {artifactConfirm.action ===
          'delete'
            ? 'bg-[#d93025] hover:bg-[#b3261e]'
            : 'bg-[#1a73e8] hover:bg-[#1557b0]'}"
          disabled={Boolean(artifactAction)}
          on:click={confirmArtifactAction}
          >{artifactAction ? 'Processando…' : artifactConfirmButton()}</button
        >
      </div>
    </div>
  </div>
{/if}

{#if directoryBrowserOpen}
  <div
    class="fixed inset-0 z-[300] flex items-center justify-center bg-[#202124]/35 p-4"
    role="dialog"
    aria-modal="true"
    aria-label="Escolher pasta do servidor"
  >
    <div class="w-full max-w-2xl overflow-hidden rounded-2xl bg-white shadow-modal">
      <div class="border-b border-[#e0e0e0] px-6 py-5">
        <p class="text-[18px] font-normal text-[#202124]">Escolher pasta do servidor</p>
        <p class="mt-2 break-all text-[13px] leading-5 text-[#5f6368]">
          {directoryBrowser?.path ?? 'Carregando diretórios...'}
        </p>
      </div>

      <div class="max-h-[52vh] overflow-auto px-6 py-4">
        {#if directoryBrowserError}
          <div class="rounded-lg bg-[#fce8e6] px-4 py-3 text-[13px] text-[#d93025]">
            {directoryBrowserError}
          </div>
        {/if}

        <div class="space-y-2">
          {#if directoryBrowser?.parentPath}
            <button
              type="button"
              class="flex w-full items-center justify-between rounded-lg border border-[#dadce0] px-4 py-3 text-left text-[14px] hover:bg-[#f8fafd]"
              disabled={directoryBrowserLoading}
              on:click={() => loadServerDirectories(directoryBrowser?.parentPath)}
            >
              <span class="min-w-0 truncate">..</span>
              <span class="text-[12px] text-[#5f6368]">Subir</span>
            </button>
          {/if}

          {#each directoryBrowser?.directories ?? [] as directory}
            <div class="flex items-center gap-2 rounded-lg border border-[#dadce0] px-3 py-2">
              <button
                type="button"
                class="min-w-0 flex-1 truncate px-1 py-2 text-left text-[14px] text-[#202124]"
                disabled={directoryBrowserLoading}
                on:click={() => loadServerDirectories(directory.path)}
              >
                {directory.name}
              </button>
              <button
                type="button"
                class="shrink-0 rounded-full px-3 py-1.5 text-[13px] font-medium text-[#0b57d0] hover:bg-[#e8f0fe]"
                on:click={() => chooseServerDirectory(directory.path)}
              >
                Usar
              </button>
            </div>
          {:else}
            {#if !directoryBrowserLoading && !directoryBrowserError}
              <p class="rounded-lg bg-[#f8f9fa] px-4 py-5 text-[13px] text-[#5f6368]">
                Nenhuma subpasta encontrada neste diretório.
              </p>
            {/if}
          {/each}
        </div>
      </div>

      <div class="flex flex-wrap justify-end gap-2 border-t border-[#e0e0e0] px-6 py-4">
        <button
          type="button"
          class="h-10 rounded-full px-5 text-[14px] font-medium text-[#1a73e8] hover:bg-[#e8f0fe]"
          on:click={() => (directoryBrowserOpen = false)}>Cancelar</button
        >
        <button
          type="button"
          class="h-10 rounded-full bg-[#1a73e8] px-5 text-[14px] font-medium text-white hover:bg-[#1557b0] disabled:opacity-60"
          disabled={!directoryBrowser?.path || directoryBrowserLoading}
          on:click={() => chooseServerDirectory()}
        >
          Usar pasta atual
        </button>
      </div>
    </div>
  </div>
{/if}

<!-- Create user modal -->
{#if showCreateForm}
  <div
    class="fixed inset-0 z-[300] flex items-center justify-center bg-black/40 p-4"
    role="dialog"
    aria-modal="true"
    aria-label="Criar usuário"
  >
    <div class="w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-modal">
      <div class="flex items-center justify-between border-b border-[#e0e0e0] px-6 py-4">
        <h2 class="text-[18px] font-normal text-[#202124]">Novo usuário</h2>
        <button
          class="flex h-9 w-9 items-center justify-center rounded-full hover:bg-[#f1f3f4]"
          aria-label="Fechar"
          on:click={() => (showCreateForm = false)}
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="#5f6368"
            ><path
              d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"
            /></svg
          >
        </button>
      </div>

      <form class="px-6 py-5" on:submit|preventDefault={submitCreate}>
        {#if createError}
          <div class="mb-4 rounded-lg bg-[#fce8e6] px-4 py-3 text-[13px] text-[#d93025]">{createError}</div>
        {/if}

        <div class="space-y-4">
          <div>
            <label class="mb-1.5 block text-[13px] font-medium text-[#202124]" for="create-name"
              >Nome completo</label
            >
            <input
              id="create-name"
              class="h-10 w-full rounded-lg border border-[#dadce0] px-3 text-[14px] outline-none transition focus:border-[#1a73e8] focus:ring-1 focus:ring-[#1a73e8]"
              placeholder="Ex: Maria Silva"
              bind:value={createName}
              required
            />
          </div>
          <div>
            <label class="mb-1.5 block text-[13px] font-medium text-[#202124]" for="create-email"
              >E-mail</label
            >
            <input
              id="create-email"
              type="email"
              class="h-10 w-full rounded-lg border border-[#dadce0] px-3 text-[14px] outline-none transition focus:border-[#1a73e8] focus:ring-1 focus:ring-[#1a73e8]"
              placeholder="usuario@exemplo.com"
              bind:value={createEmail}
              required
            />
          </div>
          <div>
            <label class="mb-1.5 block text-[13px] font-medium text-[#202124]" for="create-password"
              >Senha inicial</label
            >
            <input
              id="create-password"
              type="password"
              autocomplete="new-password"
              class="h-10 w-full rounded-lg border border-[#dadce0] px-3 text-[14px] outline-none transition focus:border-[#1a73e8] focus:ring-1 focus:ring-[#1a73e8]"
              placeholder="Mínimo de 6 caracteres"
              bind:value={createPassword}
              required
            />
          </div>
          <div class="grid grid-cols-2 gap-4">
            <div>
              <label class="mb-1.5 block text-[13px] font-medium text-[#202124]" for="create-role"
                >Papel</label
              >
              <select
                id="create-role"
                class="h-10 w-full rounded-lg border border-[#dadce0] px-3 text-[14px] outline-none transition focus:border-[#1a73e8]"
                bind:value={createRole}
              >
                <option value="user">Usuário</option>
                <option value="admin">Administrador</option>
              </select>
            </div>
            <div>
              <label class="mb-1.5 block text-[13px] font-medium text-[#202124]" for="create-quota"
                >Cota (GB)</label
              >
              <input
                id="create-quota"
                type="number"
                min="1"
                max="1000"
                class="h-10 w-full rounded-lg border border-[#dadce0] px-3 text-[14px] outline-none transition focus:border-[#1a73e8] focus:ring-1 focus:ring-[#1a73e8]"
                bind:value={createQuotaGb}
              />
            </div>
          </div>
        </div>

        <div class="mt-6 flex justify-end gap-2">
          <button
            type="button"
            class="rounded-full px-6 py-2 text-[14px] font-medium text-[#1a73e8] hover:bg-[#e8f0fe]"
            on:click={() => (showCreateForm = false)}>Cancelar</button
          >
          <button
            type="submit"
            class="rounded-full bg-[#1a73e8] px-6 py-2 text-[14px] font-medium text-white hover:bg-[#1557b0] disabled:opacity-60"
            disabled={createLoading}>{createLoading ? 'Criando…' : 'Criar'}</button
          >
        </div>
      </form>
    </div>
  </div>
{/if}

<!-- Edit user modal -->
{#if editingAccount}
  <div
    class="fixed inset-0 z-[300] flex items-center justify-center bg-black/40 p-4"
    role="dialog"
    aria-modal="true"
    aria-label="Editar usuário"
  >
    <div class="w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-modal">
      <div class="flex items-center justify-between border-b border-[#e0e0e0] px-6 py-4">
        <h2 class="text-[18px] font-normal text-[#202124]">Editar usuário</h2>
        <button
          class="flex h-9 w-9 items-center justify-center rounded-full hover:bg-[#f1f3f4]"
          aria-label="Fechar"
          on:click={() => (editingAccount = null)}
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="#5f6368"
            ><path
              d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"
            /></svg
          >
        </button>
      </div>

      <div class="max-h-[80vh] overflow-y-auto px-6 py-5">
        {#if editError}
          <div class="mb-4 rounded-lg bg-[#fce8e6] px-4 py-3 text-[13px] text-[#d93025]">{editError}</div>
        {/if}
        {#if editPasswordSuccess}
          <div class="mb-4 rounded-lg bg-[#e6f4ea] px-4 py-3 text-[13px] text-[#188038]">
            {editPasswordSuccess}
          </div>
        {/if}

        <!-- Avatar preview -->
        <div class="mb-5 flex items-center gap-4">
          <div
            class="flex h-14 w-14 shrink-0 items-center justify-center rounded-full text-[20px] font-medium text-white"
            style="background:{editingAccount.avatarColor}"
          >
            {editingAccount.name.slice(0, 1).toUpperCase()}
          </div>
          <div>
            <p class="text-[14px] font-medium text-[#202124]">{editingAccount.name}</p>
            <p class="text-[12px] text-[#5f6368]">
              Criado em {new Date(editingAccount.createdAt).toLocaleDateString('pt-BR')}
            </p>
          </div>
        </div>

        <form on:submit|preventDefault={submitEdit}>
          <div class="space-y-4">
            <div>
              <label class="mb-1.5 block text-[13px] font-medium text-[#202124]" for="edit-name"
                >Nome completo</label
              >
              <input
                id="edit-name"
                class="h-10 w-full rounded-lg border border-[#dadce0] px-3 text-[14px] outline-none transition focus:border-[#1a73e8] focus:ring-1 focus:ring-[#1a73e8]"
                bind:value={editName}
                required
              />
            </div>
            <div>
              <label class="mb-1.5 block text-[13px] font-medium text-[#202124]" for="edit-email"
                >E-mail</label
              >
              <input
                id="edit-email"
                type="email"
                class="h-10 w-full rounded-lg border border-[#dadce0] px-3 text-[14px] outline-none transition focus:border-[#1a73e8] focus:ring-1 focus:ring-[#1a73e8]"
                bind:value={editEmail}
                required
              />
            </div>
            <div class="grid grid-cols-2 gap-4">
              <div>
                <label class="mb-1.5 block text-[13px] font-medium text-[#202124]" for="edit-role"
                  >Papel</label
                >
                <select
                  id="edit-role"
                  class="h-10 w-full rounded-lg border border-[#dadce0] px-3 text-[14px] outline-none transition focus:border-[#1a73e8]"
                  bind:value={editRole}
                >
                  <option value="user">Usuário</option>
                  <option value="admin">Administrador</option>
                </select>
              </div>
              <div>
                <label class="mb-1.5 block text-[13px] font-medium text-[#202124]" for="edit-quota"
                  >Cota (GB)</label
                >
                <input
                  id="edit-quota"
                  type="number"
                  min="1"
                  max="1000"
                  class="h-10 w-full rounded-lg border border-[#dadce0] px-3 text-[14px] outline-none transition focus:border-[#1a73e8] focus:ring-1 focus:ring-[#1a73e8]"
                  bind:value={editQuotaGb}
                />
              </div>
            </div>
          </div>

          <div class="mt-6 flex justify-end gap-2">
            <button
              type="button"
              class="rounded-full px-6 py-2 text-[14px] font-medium text-[#1a73e8] hover:bg-[#e8f0fe]"
              on:click={() => (editingAccount = null)}>Cancelar</button
            >
            <button
              type="submit"
              class="rounded-full bg-[#1a73e8] px-6 py-2 text-[14px] font-medium text-white hover:bg-[#1557b0] disabled:opacity-60"
              disabled={editLoading}>{editLoading ? 'Salvando…' : 'Salvar'}</button
            >
          </div>
        </form>

        <!-- Password reset section -->
        <div class="mt-6 border-t border-[#e0e0e0] pt-5">
          <h3 class="text-[14px] font-medium text-[#202124]">Definir nova senha</h3>
          <p class="mt-1 text-[12px] text-[#5f6368]">O usuário deverá usar esta senha no próximo login.</p>
          <div class="mt-3 flex gap-2">
            <input
              type="password"
              placeholder="Nova senha (mín. 6 caracteres)"
              autocomplete="new-password"
              class="h-10 flex-1 rounded-lg border border-[#dadce0] px-3 text-[14px] outline-none transition focus:border-[#1a73e8] focus:ring-1 focus:ring-[#1a73e8]"
              bind:value={editNewPassword}
            />
            <button
              type="button"
              class="h-10 rounded-full border border-[#dadce0] px-4 text-[13px] font-medium text-[#202124] hover:bg-[#f1f3f4] disabled:opacity-60"
              disabled={!editNewPassword || editPasswordLoading}
              on:click={submitSetPassword}>{editPasswordLoading ? '…' : 'Definir'}</button
            >
          </div>
        </div>

        <div class="mt-6 border-t border-[#f1d7d5] pt-5">
          <h3 class="text-[14px] font-medium text-[#b3261e]">Excluir conta</h3>
          <p class="mt-1 text-[12px] leading-5 text-[#5f6368]">
            Remove a conta, encerra as sessões e apaga os arquivos pertencentes a este usuário.
          </p>
          <button
            type="button"
            class="mt-3 h-10 rounded-full border border-[#d93025] px-5 text-[13px] font-medium text-[#d93025] hover:bg-[#fce8e6] disabled:opacity-60"
            disabled={deleteLoading}
            on:click={askDeleteAccount}
          >
            Excluir conta
          </button>
        </div>
      </div>
    </div>
  </div>
{/if}

{#if deleteConfirmAccount}
  <div
    class="fixed inset-0 z-[320] flex items-center justify-center bg-black/45 p-4"
    role="alertdialog"
    aria-modal="true"
    aria-labelledby="delete-account-title"
  >
    <div class="w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-modal">
      <div class="border-b border-[#e0e0e0] px-6 py-5">
        <h2 id="delete-account-title" class="text-[18px] font-normal text-[#202124]">Excluir conta</h2>
        <p class="mt-2 text-[13px] leading-5 text-[#5f6368]">
          Esta ação remove permanentemente a conta de {deleteConfirmAccount.name}, seus arquivos e sessões.
        </p>
      </div>

      <div class="px-6 py-5">
        {#if deleteError}
          <div class="mb-4 rounded-lg bg-[#fce8e6] px-4 py-3 text-[13px] text-[#d93025]">{deleteError}</div>
        {/if}
        <div class="rounded-xl bg-[#f8f9fa] px-4 py-3">
          <p class="truncate text-[14px] font-medium text-[#202124]">{deleteConfirmAccount.name}</p>
          <p class="mt-1 truncate text-[12px] text-[#5f6368]">{deleteConfirmAccount.email}</p>
        </div>
        <label class="mt-4 block text-[13px] font-medium text-[#202124]" for="delete-account-email">
          Digite o e-mail para confirmar
        </label>
        <input
          id="delete-account-email"
          class="mt-1.5 h-10 w-full rounded-lg border border-[#dadce0] px-3 text-[14px] outline-none transition focus:border-[#d93025] focus:ring-1 focus:ring-[#d93025]"
          placeholder={deleteConfirmAccount.email}
          bind:value={deleteConfirmEmail}
        />
      </div>

      <div class="flex justify-end gap-2 px-6 pb-5">
        <button
          type="button"
          class="h-10 rounded-full px-5 text-[14px] font-medium text-[#1a73e8] hover:bg-[#e8f0fe] disabled:opacity-60"
          disabled={deleteLoading}
          on:click={() => {
            deleteConfirmAccount = null;
            deleteConfirmEmail = '';
            deleteError = '';
          }}
        >
          Cancelar
        </button>
        <button
          type="button"
          class="h-10 rounded-full bg-[#d93025] px-5 text-[14px] font-medium text-white hover:bg-[#b3261e] disabled:opacity-60"
          disabled={deleteLoading || deleteConfirmEmail.trim().toLowerCase() !== deleteConfirmAccount.email.toLowerCase()}
          on:click={confirmDeleteAccount}
        >
          {deleteLoading ? 'Excluindo...' : 'Excluir permanentemente'}
        </button>
      </div>
    </div>
  </div>
{/if}
