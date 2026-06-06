<script lang="ts">
  import { createEventDispatcher, onMount } from 'svelte';
  import {
    collectClientSessionMetadata,
    getSetupStatus,
    getStoredSessions,
    lookupLoginAccount,
    login,
    saveStoredSession,
    setupFirstAccount
  } from '$lib/api';
  import LoginFloatingInput from './LoginFloatingInput.svelte';
  import type { UserAccount } from '$lib/types';

  export let allowSetup = true;
  export let knownAccounts: UserAccount[] = [];

  const dispatch = createEventDispatcher<{ success: { user: UserAccount; token: string } }>();

  type LoginStep = 'email' | 'password';
  type SetupStep = 'name' | 'email' | 'password';

  let setupRequired = false;
  let checkingSetup = true;
  let loginStep: LoginStep = 'email';
  let setupStep: SetupStep = 'name';
  let firstName = '';
  let lastName = '';
  let name = '';
  let email = '';
  let password = '';
  let confirmPassword = '';
  let showPassword = false;
  let loading = false;
  let error = '';
  let loginDisplayName = '';
  let loginDisplayNameEmail = '';

  $: displayName = [firstName.trim(), lastName.trim()].filter(Boolean).join(' ').trim();
  $: canCreateFirstAccount = allowSetup && setupRequired;
  $: isLoginMode = !canCreateFirstAccount;
  $: normalizedEmail = email.trim().toLowerCase();
  $: knownLoginUser =
    knownAccounts.find((account) => account.email.toLowerCase() === normalizedEmail) ??
    getStoredSessions().find((session) => session.user.email.toLowerCase() === normalizedEmail)?.user;
  $: loginTitle =
    (loginDisplayNameEmail === normalizedEmail ? loginDisplayName : '') || knownLoginUser?.name || email.trim();

  onMount(async () => {
    if (!allowSetup) {
      setupRequired = false;
      checkingSetup = false;
      setupStep = 'name';
      loginStep = 'email';
      return;
    }

    try {
      const status = await getSetupStatus();
      setupRequired = status.setupRequired;
    } catch {
      setupRequired = false;
    } finally {
      checkingSetup = false;
    }
  });

  async function resolveLoginDisplayName() {
    loginDisplayNameEmail = normalizedEmail;
    loginDisplayName = knownLoginUser?.name ?? '';
    if (loginDisplayName || !normalizedEmail) return;

    try {
      const account = await lookupLoginAccount(normalizedEmail);
      loginDisplayName = account?.name ?? '';
    } catch {
      loginDisplayName = '';
    }
  }

  async function nextLoginEmail() {
    error = '';
    if (!email.trim()) {
      error = 'Digite seu e-mail.';
      return;
    }
    await resolveLoginDisplayName();
    loginStep = 'password';
  }

  async function submitLoginPassword() {
    error = '';
    if (!email.trim() || !password) {
      error = 'Digite seu e-mail e senha.';
      return;
    }
    loading = true;
    try {
      const sessionMetadata = await collectClientSessionMetadata();
      const result = await login(email.trim(), password, sessionMetadata);
      saveStoredSession(result.token, result.user);
      dispatch('success', result);
    } catch (ex) {
      error = ex instanceof Error ? ex.message : 'Erro ao entrar.';
    } finally {
      loading = false;
    }
  }

  function nextSetupName() {
    error = '';
    if (!firstName.trim()) {
      error = 'Digite seu nome.';
      return;
    }
    name = displayName;
    setupStep = 'email';
  }

  function nextSetupEmail() {
    error = '';
    if (!email.trim()) {
      error = 'Digite seu e-mail.';
      return;
    }
    setupStep = 'password';
  }

  async function submitSetupPassword() {
    error = '';
    name = displayName || name;
    if (!name.trim() || !email.trim() || !password) {
      error = 'Preencha todos os campos.';
      return;
    }
    if (password.length < 6) {
      error = 'A senha precisa ter pelo menos 6 caracteres.';
      return;
    }
    if (password !== confirmPassword) {
      error = 'As senhas não coincidem.';
      return;
    }
    loading = true;
    try {
      const sessionMetadata = await collectClientSessionMetadata();
      const result = await setupFirstAccount({ name: name.trim(), email: email.trim(), password, sessionMetadata });
      saveStoredSession(result.token, result.user);
      dispatch('success', result);
    } catch (ex) {
      error = ex instanceof Error ? ex.message : 'Erro ao criar conta.';
    } finally {
      loading = false;
    }
  }

  function submitCurrent() {
    if (loading || checkingSetup) return;
    if (canCreateFirstAccount) {
      if (setupStep === 'name') nextSetupName();
      else if (setupStep === 'email') nextSetupEmail();
      else void submitSetupPassword();
      return;
    }

    if (loginStep === 'email') void nextLoginEmail();
    else void submitLoginPassword();
  }
</script>

<div class="login-shell">
  <main class="login-stage" aria-busy={checkingSetup || loading}>
    {#if checkingSetup}
      <section class="login-card">
        <div class="login-left">
          {@render AppLogo()}
          <h1>Faça login</h1>
          <p>Verificando o Ride...</p>
        </div>
      </section>
    {:else}
      <form class="login-card" on:submit|preventDefault={submitCurrent}>
        <section class="login-left">
          {@render AppLogo()}

          {#if canCreateFirstAccount}
            {#if setupStep === 'name'}
              <h1>Crie uma Conta do<br />Ride</h1>
              <p>Insira seu nome</p>
            {:else if setupStep === 'email'}
              <h1>Adicione seu endereço<br />de e-mail</h1>
              <p>Use seu e-mail para entrar no Ride</p>
            {:else}
              <h1>Crie uma senha forte</h1>
              <p>Crie uma senha forte com uma combinação de letras, números<br />e símbolos</p>
            {/if}
          {:else if loginStep === 'password'}
            <h1>{loginTitle}</h1>
            <button class="account-chip" type="button" on:click={() => (loginStep = 'email')}>
              <span class="avatar-dot">{email.trim().slice(0, 1).toUpperCase()}</span>
              <span>{email.trim()}</span>
              <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
                <path d="M7 10l5 5 5-5z" fill="currentColor" />
              </svg>
            </button>
          {:else}
            <h1>Faça login</h1>
            <p>Prosseguir para o Ride</p>
          {/if}
        </section>

        <section class="login-right">
          {#if error}
            <div class="form-error">{error}</div>
          {/if}

          {#if canCreateFirstAccount}
            {#if setupStep === 'name'}
              <div class="field-stack">
                <LoginFloatingInput id="setup-first-name" label="Nome" autocomplete="given-name" bind:value={firstName} disabled={loading} />
                <LoginFloatingInput
                  id="setup-last-name"
                  label="Sobrenome (opcional)"
                  autocomplete="family-name"
                  bind:value={lastName}
                  disabled={loading}
                />
              </div>
            {:else if setupStep === 'email'}
              <div class="email-choice">
                <label><span></span><input type="radio" disabled /> cabraladham2@gmail.com</label>
                <label><span></span><input type="radio" disabled /> adhamcabral383@gmail.com</label>
                <label class="active"><span></span><input type="radio" checked readonly /> Usar seu e-mail atual</label>
              </div>
              <LoginFloatingInput id="setup-email" label="Seu e-mail atual" type="email" autocomplete="email" bind:value={email} disabled={loading} />
              <p class="field-help">Use um endereço de e-mail que você já possui.</p>
            {:else}
              <div class="field-stack">
                <LoginFloatingInput
                  id="setup-password"
                  label="Senha"
                  type={showPassword ? 'text' : 'password'}
                  autocomplete="new-password"
                  bind:value={password}
                  disabled={loading}
                />
                <LoginFloatingInput
                  id="setup-confirm"
                  label="Confirmar"
                  type={showPassword ? 'text' : 'password'}
                  autocomplete="new-password"
                  bind:value={confirmPassword}
                  disabled={loading}
                />
              </div>
              <label class="show-password">
                <input type="checkbox" bind:checked={showPassword} />
                <span>Mostrar senha</span>
              </label>
            {/if}
          {:else if loginStep === 'password'}
            <p class="identity-copy">Para continuar, primeiro confirme sua identidade</p>
            <LoginFloatingInput
              id="login-password"
              label="Digite sua senha"
              type={showPassword ? 'text' : 'password'}
              autocomplete="current-password"
              bind:value={password}
              disabled={loading}
            />
            <label class="show-password">
              <input type="checkbox" bind:checked={showPassword} />
              <span>Mostrar senha</span>
            </label>
          {:else}
            <LoginFloatingInput id="login-email" label="E-mail ou telefone" type="email" autocomplete="email" bind:value={email} disabled={loading} />
            <p class="login-email-guidance">Preencha com o e-mail cadastrado anteriormente.</p>
          {/if}

          <div class="actions">
            <span></span>

            <button class="primary-button" type="button" disabled={loading || checkingSetup} on:click={submitCurrent}>
              {loading ? (canCreateFirstAccount ? 'Criando...' : 'Entrando...') : 'Avançar'}
            </button>
          </div>
        </section>
      </form>
    {/if}

  </main>
</div>

{#snippet AppLogo()}
  <img class="app-logo" src="/ride.png" alt="Ride" />
{/snippet}

<style>
  :global(body) {
    background: #202124;
  }

  .login-shell {
    min-height: 100vh;
    background: #202124;
    color: #e8eaed;
    font-family:
      Roboto,
      Arial,
      sans-serif;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 24px;
  }

  .login-stage {
    width: min(1040px, calc(100vw - 48px));
  }

  .login-card {
    min-height: 400px;
    width: 100%;
    border: 0;
    border-radius: 28px;
    background: #0e0e0e;
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 46px;
    padding: 38px 36px 36px;
    box-shadow: none;
  }

  .login-left,
  .login-right {
    min-width: 0;
  }

  .login-left {
    padding: 2px 0 0 2px;
  }

  .app-logo {
    width: 112px;
    height: 112px;
    display: block;
    margin-bottom: 24px;
    object-fit: contain;
  }

  h1 {
    color: #e8eaed;
    font-size: 44px;
    line-height: 1.17;
    font-weight: 400;
    letter-spacing: 0;
    margin: 0;
  }

  p {
    margin: 12px 0 0;
    color: #e8eaed;
    font-size: 16px;
    line-height: 1.45;
    font-weight: 400;
  }

  .login-right {
    padding-top: 70px;
  }

  .identity-copy {
    margin: -2px 0 48px;
    color: #e8eaed;
    font-size: 14px;
  }

  .login-email-guidance {
    margin-top: 34px;
    max-width: 360px;
    color: #c4c7c5;
    font-size: 14px;
    line-height: 21px;
  }

  .field-stack {
    display: grid;
    gap: 24px;
  }

  .actions {
    min-height: 40px;
    margin-top: 42px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
  }

  .primary-button {
    border: 0;
    border-radius: 999px;
    background: #a8c7fa;
    color: #062e6f;
    font: inherit;
    font-size: 14px;
    font-weight: 500;
    min-width: 102px;
    height: 40px;
    padding: 0 24px;
    cursor: pointer;
  }

  .primary-button:disabled {
    opacity: 0.65;
    cursor: default;
  }

  .show-password {
    margin-top: 12px;
    display: inline-flex;
    align-items: center;
    gap: 16px;
    color: #e8eaed;
    font-size: 14px;
  }

  .show-password input {
    width: 18px;
    height: 18px;
    margin: 0;
    accent-color: #a8c7fa;
  }

  .account-chip {
    margin-top: 18px;
    max-width: 100%;
    height: 34px;
    border: 1px solid #8e918f;
    border-radius: 999px;
    background: transparent;
    color: #e8eaed;
    display: inline-flex;
    align-items: center;
    gap: 8px;
    padding: 0 10px 0 4px;
    font: inherit;
    font-size: 14px;
    cursor: pointer;
  }

  .account-chip span:nth-child(2) {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .avatar-dot {
    width: 26px;
    height: 26px;
    border-radius: 999px;
    background: #0b57d0;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    color: #fff;
    font-size: 12px;
    font-weight: 500;
    flex: 0 0 auto;
  }

  .form-error {
    margin: -34px 0 18px;
    color: #f2b8b5;
    font-size: 13px;
    line-height: 18px;
  }

  .email-choice {
    margin-top: -16px;
    display: grid;
    border-bottom: 1px solid #3c4043;
  }

  .email-choice label {
    height: 58px;
    border-top: 1px solid #3c4043;
    color: #e8eaed;
    display: flex;
    align-items: center;
    gap: 18px;
    font-size: 16px;
  }

  .email-choice input {
    appearance: none;
    width: 20px;
    height: 20px;
    border: 2px solid #e8eaed;
    border-radius: 999px;
    margin: 0;
  }

  .email-choice .active input {
    border-color: #a8c7fa;
    box-shadow: inset 0 0 0 4px #0e0e0e;
    background: #a8c7fa;
  }

  .field-help {
    margin: 4px 0 0 14px;
    color: #c4c7c5;
    font-size: 12px;
  }

  @media (max-width: 760px) {
    .login-shell {
      align-items: stretch;
      padding: 0;
    }

    .login-stage {
      width: 100%;
      min-height: 100vh;
      display: flex;
      flex-direction: column;
    }

    .login-card {
      flex: 1;
      min-height: auto;
      border-radius: 0;
      grid-template-columns: 1fr;
      gap: 32px;
      padding: 32px 24px;
    }

    .login-right {
      padding-top: 0;
    }

    h1 {
      font-size: 36px;
    }

  }
</style>
