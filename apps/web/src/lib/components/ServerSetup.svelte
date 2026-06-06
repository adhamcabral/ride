<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import {
    clearAllStoredSessions,
    getDriveServerDisplayUrl,
    getSetupStatus,
    normalizeDriveServerUrl,
    setDriveServerUrl
  } from '$lib/api';

  export let initialUrl = getDriveServerDisplayUrl();

  export let allowCancel = false;

  const dispatch = createEventDispatcher<{ configured: string; cancel: void }>();

  let serverUrl = initialUrl;
  let loading = false;
  let error = '';

  $: normalizedPreview = previewServerUrl(serverUrl);

  function previewServerUrl(value: string) {
    try {
      return normalizeDriveServerUrl(value);
    } catch {
      return '';
    }
  }

  async function saveServer() {
    error = '';
    loading = true;
    try {
      const normalized = setDriveServerUrl(serverUrl);
      await getSetupStatus();
      clearAllStoredSessions();
      dispatch('configured', normalized);
    } catch (ex) {
      error = ex instanceof Error ? ex.message : 'Não foi possível conectar ao servidor.';
    } finally {
      loading = false;
    }
  }
</script>

<div class="server-shell">
  <main class="server-card" aria-busy={loading}>
    {#if allowCancel}
      <button class="server-close" type="button" aria-label="Voltar ao Ride" on:click={() => dispatch('cancel')}>
        <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
          <path d="M18.3 5.71 12 12l6.3 6.29-1.41 1.41L10.59 13.41 4.29 19.71 2.88 18.3 9.17 12 2.88 5.71 4.29 4.29l6.3 6.3 6.29-6.3z" />
        </svg>
      </button>
    {/if}

    <section class="server-brand">
      <img src="/design/logo.png" alt="Ride" />
      <div>
        <h1>Conectar ao Ride</h1>
        <p>Informe o endereço do servidor para acessar seus arquivos neste celular.</p>
      </div>
    </section>

    <form class="server-form" on:submit|preventDefault={saveServer}>
      {#if error}
        <div class="server-error">{error}</div>
      {/if}

      <label for="server-url">Servidor</label>
      <input
        id="server-url"
        bind:value={serverUrl}
        inputmode="url"
        autocomplete="url"
        placeholder="http://192.168.0.10:3333"
        disabled={loading}
      />

      <p class="server-help">
        Use o IP, domínio ou porta onde a API do Ride está acessível pelo Android. Se você informar a raiz do
        servidor, o app adiciona <strong>/api</strong> automaticamente.
      </p>

      {#if normalizedPreview}
        <div class="server-preview">
          <span>API</span>
          <strong>{normalizedPreview}</strong>
        </div>
      {/if}

      <button type="submit" disabled={loading}>
        {loading ? 'Conectando...' : 'Continuar'}
      </button>
    </form>
  </main>
</div>

<style>
  .server-shell {
    min-height: 100dvh;
    display: grid;
    place-items: center;
    background: #f8fafd;
    padding: max(24px, env(safe-area-inset-top)) 18px max(24px, env(safe-area-inset-bottom));
    color: #202124;
  }

  .server-card {
    position: relative;
    width: min(100%, 920px);
    min-height: 360px;
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(320px, 420px);
    gap: 40px;
    border-radius: 28px;
    background: #fff;
    padding: 42px;
    box-shadow: 0 18px 48px rgb(60 64 67 / 0.16);
  }

  .server-close {
    position: absolute;
    right: 16px;
    top: 16px;
    display: flex;
    height: 42px;
    width: 42px;
    align-items: center;
    justify-content: center;
    border: 0;
    border-radius: 999px;
    background: transparent;
    color: #5f6368;
  }

  .server-close:hover,
  .server-close:active {
    background: #f1f3f4;
  }

  .server-brand {
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    gap: 34px;
  }

  .server-brand img {
    width: 86px;
    height: 86px;
    object-fit: contain;
  }

  .server-brand h1 {
    margin: 0;
    font-size: 34px;
    line-height: 1.15;
    font-weight: 400;
    letter-spacing: 0;
  }

  .server-brand p,
  .server-help {
    margin: 12px 0 0;
    color: #5f6368;
    font-size: 15px;
    line-height: 1.55;
  }

  .server-form {
    align-self: center;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .server-form label {
    color: #3c4043;
    font-size: 13px;
    font-weight: 500;
  }

  .server-form input {
    height: 52px;
    width: 100%;
    border: 1px solid #747775;
    border-radius: 8px;
    padding: 0 14px;
    font-size: 16px;
    color: #202124;
    outline: none;
    background: #fff;
  }

  .server-form input:focus {
    border-color: #0b57d0;
    box-shadow: 0 0 0 1px #0b57d0;
  }

  .server-preview {
    min-width: 0;
    display: grid;
    gap: 4px;
    border-radius: 10px;
    background: #f1f3f4;
    padding: 12px 14px;
  }

  .server-preview span {
    font-size: 12px;
    color: #5f6368;
  }

  .server-preview strong {
    min-width: 0;
    overflow-wrap: anywhere;
    color: #202124;
    font-size: 13px;
    font-weight: 500;
  }

  .server-error {
    border-radius: 10px;
    background: #fce8e6;
    color: #b3261e;
    padding: 12px 14px;
    font-size: 14px;
    line-height: 1.45;
  }

  .server-form button {
    align-self: flex-end;
    min-width: 128px;
    height: 44px;
    border: 0;
    border-radius: 999px;
    background: #0b57d0;
    color: #fff;
    padding: 0 24px;
    font-size: 15px;
    font-weight: 500;
  }

  .server-form button:disabled {
    opacity: 0.7;
  }

  :global([data-theme='dark']) .server-shell {
    background: #1b1b1b;
    color: #e8eaed;
  }

  :global([data-theme='dark']) .server-card {
    background: #131314;
    box-shadow: 0 18px 48px rgb(0 0 0 / 0.42);
  }

  :global([data-theme='dark']) .server-brand p,
  :global([data-theme='dark']) .server-help,
  :global([data-theme='dark']) .server-form label,
  :global([data-theme='dark']) .server-preview span,
  :global([data-theme='dark']) .server-close {
    color: #bdc1c6;
  }

  :global([data-theme='dark']) .server-form input {
    border-color: #5f6368;
    background: #1f1f1f;
    color: #e8eaed;
  }

  :global([data-theme='dark']) .server-preview {
    background: #2b2c2f;
  }

  :global([data-theme='dark']) .server-preview strong {
    color: #e8eaed;
  }

  :global([data-theme='dark']) .server-close:hover,
  :global([data-theme='dark']) .server-close:active {
    background: #2b2c2f;
  }

  @media (max-width: 767px) {
    .server-shell {
      align-items: stretch;
      padding: max(18px, env(safe-area-inset-top)) 12px max(18px, env(safe-area-inset-bottom));
    }

    .server-card {
      min-height: calc(100dvh - 36px - env(safe-area-inset-top) - env(safe-area-inset-bottom));
      grid-template-columns: 1fr;
      align-content: start;
      gap: 28px;
      border-radius: 24px;
      padding: 26px 18px;
    }

    .server-brand {
      gap: 22px;
      justify-content: flex-start;
    }

    .server-brand img {
      width: 68px;
      height: 68px;
    }

    .server-brand h1 {
      font-size: 28px;
    }

    .server-form button {
      width: 100%;
    }
  }
</style>
