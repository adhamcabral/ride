<script lang="ts">
  import { createEventDispatcher, onMount } from 'svelte';
  import { getDriveServerDisplayUrl } from '$lib/api';
  import { formatBytes } from '$lib/format';
  import {
    readDrivePreferences,
    writeDrivePreferences,
    type DrivePreferences,
    type DriveDensity,
    type DrivePdfOpening,
    type DriveStartPage
  } from '$lib/preferences';
  import { getStoredAppearance, setAppearance, type Appearance } from '$lib/theme';
  import type { StorageSummary, UserAccount } from '$lib/types';

  type AdminSettingsTab = 'users' | 'security' | 'backups';

  const dispatch = createEventDispatcher<{
    close: void;
    server: void;
    admin: AdminSettingsTab;
    logout: void;
    profile: void;
    change: DrivePreferences;
  }>();

  export let compact = false;
  export let showAdminTools = false;
  export let summary: StorageSummary | null = null;
  export let user: UserAccount | null = null;
  export let accountId = '';

  let appearance: Appearance = 'light';
  let appearanceReady = false;
  let resolvedTheme: 'light' | 'dark' = 'light';
  let systemPrefersDark = false;
  type SectionId = 'general' | 'privacy' | 'notifications' | 'apps' | 'admin-users' | 'admin-security' | 'backups';

  let activeSection: SectionId = 'general';
  let density: DriveDensity = 'low';
  let startPage: DriveStartPage = 'personal';
  let pdfOpening: DrivePdfOpening = 'preview';
  let showQuickAccess = true;
  let showActivity = true;
  let emailNotifications = false;
  let browserNotifications = false;
  let officePreview = true;
  let usageReports = false;
  let loadedPreferenceAccountId = '';
  let currentPreferences: DrivePreferences = readDrivePreferences();

  $: sections = [
    { id: 'general' as const, label: 'Geral' },
    ...(showAdminTools
      ? [
          { id: 'admin-users' as const, label: 'Usuários' },
          { id: 'admin-security' as const, label: 'Segurança e login' },
          { id: 'backups' as const, label: 'Backups' }
        ]
      : [])
  ];
  $: if (!sections.some((section) => section.id === activeSection)) activeSection = 'general';

  onMount(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const syncSystemTheme = () => {
      systemPrefersDark = media.matches;
    };

    syncSystemTheme();
    media.addEventListener('change', syncSystemTheme);
    appearance = getStoredAppearance();
    loadDesktopPreferences();
    appearanceReady = true;

    return () => media.removeEventListener('change', syncSystemTheme);
  });

  $: resolvedTheme = appearance === 'system' ? (systemPrefersDark ? 'dark' : 'light') : appearance;
  $: currentPreferences = {
    density,
    startPage,
    pdfOpening,
    showQuickAccess,
    showActivity,
    emailNotifications,
    browserNotifications,
    officePreview,
    usageReports
  };
  $: if (appearanceReady) setAppearance(appearance);
  $: if (appearanceReady && loadedPreferenceAccountId !== accountId) loadDesktopPreferences();
  $: if (appearanceReady && !compact && loadedPreferenceAccountId === accountId)
    saveDesktopPreferences(currentPreferences);
  $: storageUsed = summary?.usedBytes ?? 0;
  $: storageTotal = summary?.totalBytes ?? 15 * 1024 * 1024 * 1024;
  $: storagePercent = storageTotal > 0 ? Math.min(100, (storageUsed / storageTotal) * 100) : 0;
  $: avatarInitial = (user?.name?.trim() || user?.email?.trim() || 'U').slice(0, 1).toUpperCase();

  function loadDesktopPreferences() {
    const stored = readDrivePreferences(accountId);
    density = stored.density;
    startPage = stored.startPage;
    pdfOpening = stored.pdfOpening;
    showQuickAccess = stored.showQuickAccess;
    showActivity = stored.showActivity;
    emailNotifications = stored.emailNotifications;
    browserNotifications = stored.browserNotifications;
    officePreview = stored.officePreview;
    usageReports = stored.usageReports;
    loadedPreferenceAccountId = accountId;
  }

  function saveDesktopPreferences(preferences: DrivePreferences) {
    writeDrivePreferences(accountId, preferences);
    dispatch('change', preferences);
  }

  function close() {
    dispatch('close');
  }

  function changeServer() {
    dispatch('server');
  }

  function handleDialogKeydown(event: KeyboardEvent) {
    if (event.key === 'Escape') close();
  }
</script>

{#if compact}
  <div
    data-dialog
    data-preferences-panel
    class="fixed inset-0 z-[210] flex items-center justify-center bg-black/35 p-4"
    role="dialog"
    aria-modal="true"
    aria-label="Configurações"
    tabindex="-1"
    on:click|self={close}
    on:keydown={handleDialogKeydown}
  >
    <section class="w-full max-w-md overflow-hidden rounded-2xl bg-white text-[#202124] shadow-[0_12px_42px_rgba(0,0,0,.28)]">
      <header class="flex h-14 items-center justify-between border-b border-[#e0e0e0] px-5">
        <h2 class="text-[18px] font-normal">Configurações</h2>
        <button
          class="flex h-10 w-10 items-center justify-center rounded-full text-[#5f6368] hover:bg-[#f1f3f4]"
          aria-label="Fechar"
          on:click={close}
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
            <path d="M18.3 5.71 12 12l6.3 6.29-1.41 1.41L10.59 13.41 4.29 19.71 2.88 18.3 9.17 12 2.88 5.71 4.29 4.29l6.3 6.3 6.29-6.3z" />
          </svg>
        </button>
      </header>

      <div class="max-h-[calc(92dvh-56px)] overflow-y-auto px-5 py-5">
        <section>
          <h3 class="text-[16px] font-medium">Tema</h3>
          <label class="mt-4 flex min-h-11 items-center gap-4 rounded-xl px-2 text-[14px] hover:bg-[#f8fafd]">
            <input class="h-5 w-5 accent-[#0b57d0]" type="radio" bind:group={appearance} value="light" />
            <span>Claro</span>
          </label>
          <label class="mt-2 flex min-h-11 items-center gap-4 rounded-xl px-2 text-[14px] hover:bg-[#f8fafd]">
            <input class="h-5 w-5 accent-[#0b57d0]" type="radio" bind:group={appearance} value="dark" />
            <span>Escuro</span>
          </label>
          <label class="mt-2 flex min-h-11 items-center gap-4 rounded-xl px-2 text-[14px] hover:bg-[#f8fafd]">
            <input class="h-5 w-5 accent-[#0b57d0]" type="radio" bind:group={appearance} value="system" />
            <span>Padrão do dispositivo</span>
          </label>
        </section>

        <div class="my-5 h-px bg-[#e0e0e0]"></div>

        <section>
          <h3 class="text-[16px] font-medium">Servidor</h3>
          <p class="mt-2 break-words text-[13px] leading-5 text-[#5f6368]">{getDriveServerDisplayUrl()}</p>
          <p class="mt-2 text-[13px] leading-5 text-[#5f6368]">
            Ao trocar o servidor, sua sessão atual fica salva até você confirmar outro endereço.
          </p>
          <button
            class="mt-4 h-11 rounded-full border border-[#747775] px-5 text-[14px] font-medium text-[#0b57d0] hover:bg-[#f8fafd]"
            on:click={changeServer}
          >
            Trocar servidor
          </button>
        </section>

        <div class="my-5 h-px bg-[#e0e0e0]"></div>

        <button
          class="h-11 rounded-full px-5 text-[14px] font-medium text-[#d93025] hover:bg-[#fce8e6]"
          on:click={() => dispatch('logout')}
        >
          Sair deste Ride
        </button>
      </div>
    </section>
  </div>
{:else}
  <div
    data-preferences-desktop
    data-preferences-theme={resolvedTheme}
    class="fixed inset-0 z-[210] flex flex-col overflow-hidden bg-[#1b1b1b] text-[#e8eaed]"
    role="dialog"
    aria-modal="true"
    aria-label="Configurações"
    tabindex="-1"
    on:keydown={handleDialogKeydown}
  >
    <header data-pref-bg class="flex h-16 shrink-0 items-center justify-between bg-[#1b1b1b] px-5">
      <div class="flex min-w-0 items-center gap-5">
        <button
          data-pref-icon-button
          class="flex h-10 w-10 items-center justify-center rounded-full text-[#f1f3f4] hover:bg-white/10"
          aria-label="Voltar"
          on:click={close}
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="26" height="26" viewBox="0 0 24 24" fill="currentColor">
            <path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.42-1.41L7.83 13H20v-2z" />
          </svg>
        </button>
        <h2 class="truncate text-[22px] font-normal">Configurações</h2>
      </div>
      <div class="flex items-center gap-4 text-[#e8eaed]">
        <button
          class="grid h-9 w-9 place-items-center overflow-hidden rounded-full text-[14px] font-medium text-white ring-2 ring-transparent hover:ring-[#a8c7fa]"
          style="background:{user?.avatarColor ?? '#1a73e8'}"
          aria-label="Gerenciar conta"
          title={user?.name ?? 'Conta'}
          on:click={() => dispatch('profile')}
        >
          {#if user?.avatarUrl}
            <img src={user.avatarUrl} alt="" class="h-full w-full object-cover" />
          {:else}
            {avatarInitial}
          {/if}
        </button>
      </div>
    </header>

    <div class="flex min-h-0 flex-1">
      <aside data-pref-bg class="w-[254px] shrink-0 bg-[#1b1b1b] px-3 pt-4">
        {#each sections as section}
          <button
            data-pref-nav-item
            data-pref-nav-active={activeSection === section.id}
            class="mb-1 flex h-9 w-full items-center rounded-full px-6 text-left text-[14px] {activeSection === section.id
              ? 'bg-[#0b57d0] text-[#e8f0fe]'
              : 'text-[#e8eaed] hover:bg-white/10'}"
            on:click={() => (activeSection = section.id)}
          >
            {section.label}
          </button>
        {/each}
      </aside>

      <main data-pref-surface class="min-w-0 flex-1 overflow-hidden rounded-tl-2xl bg-[#111315]">
        <div class="h-full overflow-y-auto px-12 py-5">
          <div class="max-w-[778px] pb-20">
            {#if activeSection === 'general'}
              <section data-pref-divider class="border-b border-[#777] pb-6">
                <h3 class="text-[22px] font-normal">Armazenamento</h3>
                <div data-pref-progress-track class="mt-2 h-1 w-[174px] rounded-full bg-[#5f6368]">
                  <div data-pref-progress-value class="h-full rounded-full bg-[#a8c7fa]" style="width:{storagePercent}%"></div>
                </div>
                <p class="mt-2 text-[14px] text-[#e8eaed]">
                  {formatBytes(storageUsed)} de {formatBytes(storageTotal)} usados
                </p>
              </section>

              <section data-pref-divider class="border-b border-[#777] py-6">
                <h3 class="text-[22px] font-normal">Página inicial</h3>
                <label class="mt-5 flex h-9 items-center gap-5 text-[14px]">
                  <input class="h-5 w-5 accent-[#a8c7fa]" type="radio" bind:group={startPage} value="personal" />
                  <span>Pessoal</span>
                </label>
                <label class="mt-3 flex h-9 items-center gap-5 text-[14px]">
                  <input class="h-5 w-5 accent-[#a8c7fa]" type="radio" bind:group={startPage} value="drive" />
                  <span>Meu Ride</span>
                </label>
              </section>

              <section data-pref-divider class="border-b border-[#777] py-6">
                <h3 class="text-[22px] font-normal">Aparência</h3>
                <label class="mt-5 flex h-9 items-center gap-5 text-[14px]">
                  <input class="h-5 w-5 accent-[#a8c7fa]" type="radio" bind:group={appearance} value="light" />
                  <span>Claro</span>
                </label>
                <label class="mt-3 flex h-9 items-center gap-5 text-[14px]">
                  <input class="h-5 w-5 accent-[#a8c7fa]" type="radio" bind:group={appearance} value="dark" />
                  <span>Escuro</span>
                </label>
                <label class="mt-3 flex h-9 items-center gap-5 text-[14px]">
                  <input class="h-5 w-5 accent-[#a8c7fa]" type="radio" bind:group={appearance} value="system" />
                  <span>Padrão do dispositivo</span>
                </label>
              </section>

              <section data-pref-divider class="border-b border-[#777] py-6">
                <h3 class="text-[22px] font-normal">Densidade</h3>
                <label class="mt-5 flex h-9 items-center gap-5 text-[14px]">
                  <input class="h-5 w-5 accent-[#a8c7fa]" type="radio" bind:group={density} value="low" />
                  <span>Baixa</span>
                </label>
                <label class="mt-3 flex h-9 items-center gap-5 text-[14px]">
                  <input class="h-5 w-5 accent-[#a8c7fa]" type="radio" bind:group={density} value="medium" />
                  <span>Média</span>
                </label>
                <label class="mt-3 flex h-9 items-center gap-5 text-[14px]">
                  <input class="h-5 w-5 accent-[#a8c7fa]" type="radio" bind:group={density} value="high" />
                  <span>Alta</span>
                </label>
              </section>

              <section data-pref-divider class="border-b border-[#777] py-6">
                <h3 class="text-[22px] font-normal">Abrir PDFs</h3>
                <label class="mt-5 flex h-9 items-center gap-5 text-[14px]">
                  <input class="h-5 w-5 accent-[#a8c7fa]" type="radio" bind:group={pdfOpening} value="tab" />
                  <span>Nova guia</span>
                </label>
                <label class="mt-3 flex h-9 items-center gap-5 text-[14px]">
                  <input class="h-5 w-5 accent-[#a8c7fa]" type="radio" bind:group={pdfOpening} value="preview" />
                  <span>Visualizar</span>
                </label>
              </section>

            {:else if activeSection === 'privacy'}
              <section class="pb-6">
                <h3 class="text-[22px] font-normal">Privacidade</h3>
                <label class="mt-5 flex items-start gap-5 text-[14px]">
                  <input class="mt-1 h-5 w-5 accent-[#a8c7fa]" type="checkbox" bind:checked={usageReports} />
                  <span>
                    <span class="block">Enviar diagnósticos locais</span>
                    <span data-pref-muted class="mt-1 block text-[13px] text-[#bdc1c6]">Ajuda a detectar falhas de renderização, rede e sincronização.</span>
                  </span>
                </label>
              </section>
            {:else if activeSection === 'notifications'}
              <section data-pref-divider class="border-b border-[#777] pb-6">
                <h3 class="text-[22px] font-normal">Notificações</h3>
                <label class="mt-5 flex items-start gap-5 text-[14px]">
                  <input class="mt-1 h-5 w-5 accent-[#a8c7fa]" type="checkbox" bind:checked={browserNotifications} />
                  <span>Receber notificações no navegador</span>
                </label>
                <label class="mt-5 flex items-start gap-5 text-[14px]">
                  <input class="mt-1 h-5 w-5 accent-[#a8c7fa]" type="checkbox" bind:checked={emailNotifications} />
                  <span>Receber resumos por e-mail</span>
                </label>
              </section>
            {:else if activeSection === 'apps'}
              <section data-pref-divider class="border-b border-[#777] pb-6">
                <h3 class="text-[22px] font-normal">Gerenciar apps</h3>
                <label class="mt-5 flex items-start gap-5 text-[14px]">
                  <input class="mt-1 h-5 w-5 accent-[#a8c7fa]" type="checkbox" bind:checked={officePreview} />
                  <span>Abrir arquivos Office no visualizador integrado quando possível</span>
                </label>
                <label class="mt-5 flex items-start gap-5 text-[14px]">
                  <input class="mt-1 h-5 w-5 accent-[#a8c7fa]" type="checkbox" bind:checked={showQuickAccess} />
                  <span>Mostrar acesso rápido e sugestões</span>
                </label>
                <label class="mt-5 flex items-start gap-5 text-[14px]">
                  <input class="mt-1 h-5 w-5 accent-[#a8c7fa]" type="checkbox" bind:checked={showActivity} />
                  <span>Mostrar atividade no painel lateral</span>
                </label>
              </section>
              <section class="py-6">
                <button data-pref-danger-button class="h-10 rounded-full px-6 text-[14px] font-medium text-[#f28b82] hover:bg-white/10" on:click={() => dispatch('logout')}>
                  Sair deste Ride
                </button>
              </section>
            {:else if activeSection === 'backups'}
              <section class="pb-6">
                <h3 class="text-[22px] font-normal">Backups</h3>
                <p data-pref-muted class="mt-3 text-[14px] leading-6 text-[#bdc1c6]">
                  Crie backup completo agora, configure backups automáticos, escolha pastas de destino e restaure backups do Ride.
                </p>
                <button
                  data-pref-outline-button
                  class="mt-5 h-10 rounded-full border border-[#8b8d90] px-6 text-[14px] font-medium text-[#a8c7fa] hover:bg-white/10"
                  on:click={() => dispatch('admin', 'backups')}
                >
                  Abrir sistema de backup
                </button>
              </section>
            {:else if activeSection === 'admin-users'}
              <section class="pb-6">
                <h3 class="text-[22px] font-normal">Usuários</h3>
                <p data-pref-muted class="mt-3 text-[14px] leading-6 text-[#bdc1c6]">
                  Crie contas, altere papéis, defina senhas e ajuste cotas de armazenamento.
                </p>
                <button
                  data-pref-outline-button
                  class="mt-5 h-10 rounded-full border border-[#8b8d90] px-6 text-[14px] font-medium text-[#a8c7fa] hover:bg-white/10"
                  on:click={() => dispatch('admin', 'users')}
                >
                  Abrir gerenciador de usuários
                </button>
              </section>
            {:else if activeSection === 'admin-security'}
              <section class="pb-6">
                <h3 class="text-[22px] font-normal">Segurança e login</h3>
                <p data-pref-muted class="mt-3 text-[14px] leading-6 text-[#bdc1c6]">
                  Veja sessões ativas, dispositivos conectados e encerre logins quando necessário.
                </p>
                <button
                  data-pref-outline-button
                  class="mt-5 h-10 rounded-full border border-[#8b8d90] px-6 text-[14px] font-medium text-[#a8c7fa] hover:bg-white/10"
                  on:click={() => dispatch('admin', 'security')}
                >
                  Abrir gestão de logins
                </button>
              </section>
            {/if}
          </div>
        </div>
      </main>
    </div>
  </div>
{/if}

<style>
  :global([data-preferences-desktop]) {
    --pref-bg: #1b1b1b;
    --pref-surface: #111315;
    --pref-text: #e8eaed;
    --pref-muted: #bdc1c6;
    --pref-border: #777;
    --pref-button-border: #8b8d90;
    --pref-accent: #a8c7fa;
    --pref-active-bg: #0b57d0;
    --pref-active-text: #e8f0fe;
    --pref-hover: rgb(255 255 255 / 0.1);
    --pref-progress-track: #5f6368;
    --pref-danger: #f28b82;
    background-color: var(--pref-bg) !important;
    color: var(--pref-text) !important;
  }

  :global([data-preferences-desktop][data-preferences-theme='light']) {
    --pref-bg: #f8fafd;
    --pref-surface: #ffffff;
    --pref-text: #202124;
    --pref-muted: #5f6368;
    --pref-border: #dadce0;
    --pref-button-border: #747775;
    --pref-accent: #0b57d0;
    --pref-active-bg: #c2e7ff;
    --pref-active-text: #001d35;
    --pref-hover: #edf2fa;
    --pref-progress-track: #dadce0;
    --pref-danger: #b3261e;
  }

  :global([data-preferences-desktop] [data-pref-bg]) {
    background-color: var(--pref-bg) !important;
    color: var(--pref-text) !important;
  }

  :global([data-preferences-desktop] [data-pref-surface]) {
    background-color: var(--pref-surface) !important;
    color: var(--pref-text) !important;
  }

  :global([data-preferences-desktop] [data-pref-muted]) {
    color: var(--pref-muted) !important;
  }

  :global([data-preferences-desktop] [data-pref-divider]) {
    border-color: var(--pref-border) !important;
  }

  :global([data-preferences-desktop] [data-pref-progress-track]) {
    background-color: var(--pref-progress-track) !important;
  }

  :global([data-preferences-desktop] [data-pref-progress-value]) {
    background-color: var(--pref-accent) !important;
  }

  :global([data-preferences-desktop] [data-pref-outline-button]) {
    border-color: var(--pref-button-border) !important;
    color: var(--pref-accent) !important;
  }

  :global([data-preferences-desktop] [data-pref-danger-button]) {
    color: var(--pref-danger) !important;
  }

  :global([data-preferences-desktop] [data-pref-icon-button]),
  :global([data-preferences-desktop] [data-pref-nav-item]) {
    color: var(--pref-text) !important;
  }

  :global([data-preferences-desktop] [data-pref-icon-button]:hover),
  :global([data-preferences-desktop] [data-pref-outline-button]:hover),
  :global([data-preferences-desktop] [data-pref-nav-item]:hover),
  :global([data-preferences-desktop] [data-pref-danger-button]:hover) {
    background-color: var(--pref-hover) !important;
  }

  :global([data-preferences-desktop] [data-pref-nav-active='true']) {
    background-color: var(--pref-active-bg) !important;
    color: var(--pref-active-text) !important;
  }

  :global([data-preferences-desktop] input[type='radio']),
  :global([data-preferences-desktop] input[type='checkbox']) {
    accent-color: var(--pref-accent);
  }

  :global([data-preferences-desktop] [class*='text-[#e8eaed]']) {
    color: var(--pref-text) !important;
  }

  :global([data-preferences-desktop] [class*='text-[#bdc1c6]']) {
    color: var(--pref-muted) !important;
  }

  :global([data-preferences-desktop] [class*='text-[#a8c7fa]']) {
    color: var(--pref-accent) !important;
  }

  :global([data-preferences-desktop] [class*='border-[#777]']) {
    border-color: var(--pref-border) !important;
  }

  :global([data-preferences-desktop] [class*='border-[#8b8d90]']) {
    border-color: var(--pref-button-border) !important;
  }
</style>
