<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import { updateProfile } from '$lib/api';
  import type { UserAccount } from '$lib/types';

  export let user: UserAccount;
  export let compact = false;

  const dispatch = createEventDispatcher<{
    close: void;
    updated: UserAccount;
    logout: void;
    deleted: { setupRequired: boolean };
  }>();

  const colors = ['#1a73e8', '#188038', '#d93025', '#f9ab00', '#9334e6', '#00796b', '#e91e63', '#ff6d00'];

  type Tab = 'profile' | 'password' | 'account';

  let tab: Tab = 'profile';
  let loading = false;
  let error = '';
  let success = '';

  // Profile fields
  let name = user.name;
  let email = user.email;
  let avatarColor = user.avatarColor;
  let avatarUrl = user.avatarUrl ?? '';
  let avatarInput: HTMLInputElement;

  // Password fields
  let currentPassword = '';
  let newPassword = '';
  let confirmPassword = '';

  // Delete account flow
  let deleteStep = 0; // 0 = hidden, 1 = confirm, 2 = enter password
  let deletePassword = '';
  let deleteLoading = false;
  let deleteError = '';

  function loadImage(src: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = src;
    });
  }

  async function chooseAvatar(file: File | undefined) {
    resetMessages();
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      error = 'Escolha uma imagem válida.';
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      error = 'A imagem deve ter no máximo 5 MB.';
      return;
    }

    const objectUrl = URL.createObjectURL(file);
    try {
      const image = await loadImage(objectUrl);
      const size = 256;
      const canvas = document.createElement('canvas');
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Canvas indisponível.');
      const side = Math.min(image.naturalWidth, image.naturalHeight);
      const sx = (image.naturalWidth - side) / 2;
      const sy = (image.naturalHeight - side) / 2;
      ctx.drawImage(image, sx, sy, side, side, 0, 0, size, size);
      avatarUrl = canvas.toDataURL('image/jpeg', 0.86);
    } catch {
      error = 'Não foi possível carregar essa imagem.';
    } finally {
      URL.revokeObjectURL(objectUrl);
      if (avatarInput) avatarInput.value = '';
    }
  }

  function resetMessages() {
    error = '';
    success = '';
  }

  function chooseTab(next: Tab) {
    tab = next;
    resetMessages();
    deleteStep = 0;
  }

  async function saveProfile() {
    resetMessages();
    if (!name.trim()) {
      error = 'Nome obrigatório.';
      return;
    }
    if (!email.trim() || !email.includes('@')) {
      error = 'E-mail inválido.';
      return;
    }
    loading = true;
    try {
      const updated = await updateProfile({
        name: name.trim(),
        email: email.trim(),
        avatarColor,
        avatarUrl: avatarUrl || null
      });
      success = 'Perfil atualizado!';
      dispatch('updated', updated);
    } catch (ex) {
      error = ex instanceof Error ? ex.message : 'Erro ao salvar.';
    } finally {
      loading = false;
    }
  }

  async function savePassword() {
    resetMessages();
    if (!newPassword) {
      error = 'Nova senha obrigatória.';
      return;
    }
    if (newPassword.length < 6) {
      error = 'Senha deve ter ao menos 6 caracteres.';
      return;
    }
    if (newPassword !== confirmPassword) {
      error = 'As senhas não coincidem.';
      return;
    }
    loading = true;
    try {
      await updateProfile({ currentPassword, newPassword });
      success = 'Senha alterada com sucesso!';
      currentPassword = '';
      newPassword = '';
      confirmPassword = '';
    } catch (ex) {
      error = ex instanceof Error ? ex.message : 'Erro ao alterar senha.';
    } finally {
      loading = false;
    }
  }

  async function confirmDelete() {
    if (!deletePassword) {
      deleteError = 'Informe sua senha.';
      return;
    }
    deleteLoading = true;
    deleteError = '';
    try {
      const { deleteAccount } = await import('$lib/api');
      const result = await deleteAccount(deletePassword);
      dispatch('deleted', { setupRequired: result.setupRequired });
    } catch (ex) {
      deleteError = ex instanceof Error ? ex.message : 'Erro ao excluir conta.';
    } finally {
      deleteLoading = false;
    }
  }
</script>

<div
  class="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
  role="dialog"
  aria-modal="true"
  aria-label="Meu perfil"
>
  <div class="w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-[0_8px_30px_rgba(0,0,0,.2)]">
    <!-- Header -->
    <div class="flex items-center justify-between border-b border-[#e0e0e0] px-6 py-4">
      <h2 class="text-[18px] font-normal text-[#202124]">Meu perfil</h2>
      <button
        class="flex h-9 w-9 items-center justify-center rounded-full hover:bg-[#f1f3f4]"
        aria-label="Fechar"
        on:click={() => dispatch('close')}
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="#5f6368"
          ><path
            d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"
          /></svg
        >
      </button>
    </div>

    <!-- Avatar area -->
    <div class="flex flex-col items-center gap-2 border-b border-[#e0e0e0] py-5">
      <div
        class="flex h-20 w-20 items-center justify-center overflow-hidden rounded-full text-[32px] font-medium text-white"
        style="background:{avatarColor}"
      >
        {#if avatarUrl}
          <img src={avatarUrl} alt="" class="h-full w-full object-cover" />
        {:else}
          {name.slice(0, 1).toUpperCase()}
        {/if}
      </div>
      {#if !compact}
        <input
          bind:this={avatarInput}
          class="hidden"
          type="file"
          accept="image/*"
          on:change={(e) => chooseAvatar(e.currentTarget.files?.[0])}
        />
        <div class="flex gap-2">
          <button
            type="button"
            class="rounded-full border border-[#dadce0] px-4 py-1.5 text-[13px] font-medium text-[#202124] hover:bg-[#f1f3f4]"
            on:click={() => avatarInput.click()}>Escolher foto</button
          >
          {#if avatarUrl}
            <button
              type="button"
              class="rounded-full px-4 py-1.5 text-[13px] font-medium text-[#d93025] hover:bg-[#fce8e6]"
              on:click={() => (avatarUrl = '')}>Remover foto</button
            >
          {/if}
        </div>
      {/if}
      <p class="text-[15px] font-medium text-[#202124]">{name}</p>
      <p class="text-[13px] text-[#5f6368]">{user.email}</p>
    </div>

    <!-- Tabs -->
    <div class="flex border-b border-[#e0e0e0]">
      {#each [['profile', 'Perfil'], ['password', 'Senha'], ['account', 'Conta']] as const as [id, label]}
        <button
          class="flex-1 py-3 text-[13px] font-medium transition-colors {tab === id
            ? 'border-b-2 border-[#1a73e8] text-[#1a73e8]'
            : 'text-[#5f6368] hover:text-[#202124]'}"
          on:click={() => {
            chooseTab(id);
          }}>{label}</button
        >
      {/each}
    </div>

    <!-- Content -->
    <div class="max-h-[60vh] overflow-y-auto px-6 py-5">
      {#if error}<div class="mb-4 rounded-lg bg-[#fce8e6] px-4 py-3 text-[13px] text-[#d93025]">
          {error}
        </div>{/if}
      {#if success}<div class="mb-4 rounded-lg bg-[#e6f4ea] px-4 py-3 text-[13px] text-[#188038]">
          {success}
        </div>{/if}

      {#if tab === 'profile'}
        <form class="space-y-4" on:submit|preventDefault={saveProfile}>
          <div>
            <label class="mb-1.5 block text-[13px] font-medium text-[#202124]" for="p-name"
              >Nome de exibição</label
            >
            <input
              id="p-name"
              class="h-10 w-full rounded-lg border border-[#dadce0] px-3 text-[14px] outline-none focus:border-[#1a73e8] focus:ring-1 focus:ring-[#1a73e8]"
              bind:value={name}
              required
            />
          </div>
          <div>
            <label class="mb-1.5 block text-[13px] font-medium text-[#202124]" for="p-email">E-mail</label>
            <input
              id="p-email"
              type="email"
              class="h-10 w-full rounded-lg border border-[#dadce0] px-3 text-[14px] outline-none focus:border-[#1a73e8] focus:ring-1 focus:ring-[#1a73e8]"
              bind:value={email}
              required
            />
          </div>
          <div>
            <p class="mb-2 text-[13px] font-medium text-[#202124]">Cor do avatar</p>
            <div class="flex flex-wrap gap-2">
              {#each colors as color}
                <button
                  type="button"
                  class="h-8 w-8 rounded-full transition-transform hover:scale-110 {avatarColor === color
                    ? 'ring-2 ring-[#1a73e8] ring-offset-2'
                    : ''}"
                  style="background:{color}"
                  on:click={() => (avatarColor = color)}
                  aria-label="Selecionar cor"
                ></button>
              {/each}
            </div>
          </div>
          <div class="flex justify-end gap-2 pt-2">
            <button
              type="button"
              class="rounded-full px-6 py-2 text-[14px] font-medium text-[#1a73e8] hover:bg-[#e8f0fe]"
              on:click={() => dispatch('close')}>Cancelar</button
            >
            <button
              type="submit"
              disabled={loading}
              class="rounded-full bg-[#1a73e8] px-6 py-2 text-[14px] font-medium text-white hover:bg-[#1557b0] disabled:opacity-60"
            >
              {loading ? 'Salvando…' : 'Salvar'}
            </button>
          </div>
        </form>
      {:else if tab === 'password'}
        <form class="space-y-4" on:submit|preventDefault={savePassword}>
          <div>
            <label class="mb-1.5 block text-[13px] font-medium text-[#202124]" for="cur-pwd"
              >Senha atual</label
            >
            <input
              id="cur-pwd"
              type="password"
              autocomplete="current-password"
              class="h-10 w-full rounded-lg border border-[#dadce0] px-3 text-[14px] outline-none focus:border-[#1a73e8] focus:ring-1 focus:ring-[#1a73e8]"
              bind:value={currentPassword}
            />
          </div>
          <div>
            <label class="mb-1.5 block text-[13px] font-medium text-[#202124]" for="new-pwd">Nova senha</label
            >
            <input
              id="new-pwd"
              type="password"
              autocomplete="new-password"
              class="h-10 w-full rounded-lg border border-[#dadce0] px-3 text-[14px] outline-none focus:border-[#1a73e8] focus:ring-1 focus:ring-[#1a73e8]"
              bind:value={newPassword}
            />
          </div>
          <div>
            <label class="mb-1.5 block text-[13px] font-medium text-[#202124]" for="conf-pwd"
              >Confirmar nova senha</label
            >
            <input
              id="conf-pwd"
              type="password"
              autocomplete="new-password"
              class="h-10 w-full rounded-lg border border-[#dadce0] px-3 text-[14px] outline-none focus:border-[#1a73e8] focus:ring-1 focus:ring-[#1a73e8]"
              bind:value={confirmPassword}
            />
          </div>
          <div class="flex justify-end gap-2 pt-2">
            <button
              type="button"
              class="rounded-full px-6 py-2 text-[14px] font-medium text-[#1a73e8] hover:bg-[#e8f0fe]"
              on:click={() => dispatch('close')}>Cancelar</button
            >
            <button
              type="submit"
              disabled={loading}
              class="rounded-full bg-[#1a73e8] px-6 py-2 text-[14px] font-medium text-white hover:bg-[#1557b0] disabled:opacity-60"
            >
              {loading ? 'Salvando…' : 'Alterar senha'}
            </button>
          </div>
        </form>
      {:else}
        <!-- Account tab -->
        <div class="space-y-4">
          <div class="rounded-xl border border-[#dadce0] p-4">
            <p class="text-[14px] font-medium text-[#202124]">Sessão</p>
            <p class="mt-1 text-[13px] text-[#5f6368]">Encerra sua sessão atual neste dispositivo.</p>
            <button
              class="mt-3 flex items-center gap-2 rounded-full border border-[#dadce0] px-4 py-2 text-[13px] font-medium text-[#202124] hover:bg-[#f1f3f4]"
              on:click={() => dispatch('logout')}
            >
              Sair da conta
            </button>
          </div>

          <!-- Delete account -->
          <div class="rounded-xl border border-[#fad2cf] bg-[#fef7f7] p-4">
            <p class="text-[14px] font-medium text-[#d93025]">Zona de perigo</p>
            <p class="mt-1 text-[13px] text-[#5f6368]">
              A exclusão é permanente e não pode ser desfeita. Todos os seus arquivos serão removidos.
            </p>

            {#if deleteStep === 0}
              <button
                class="mt-3 rounded-full border border-[#d93025] px-4 py-2 text-[13px] font-medium text-[#d93025] hover:bg-[#fce8e6]"
                on:click={() => (deleteStep = 1)}>Excluir minha conta</button
              >
            {:else if deleteStep === 1}
              <div class="mt-3 rounded-lg bg-[#fce8e6] px-4 py-3 text-[13px] text-[#d93025]">
                Tem certeza? Esta ação é <strong>irreversível</strong>. Todos os arquivos, pastas e
                configurações serão apagados.
              </div>
              <div class="mt-3 flex gap-2">
                <button
                  class="rounded-full px-4 py-2 text-[13px] font-medium text-[#5f6368] hover:bg-[#f1f3f4]"
                  on:click={() => (deleteStep = 0)}>Cancelar</button
                >
                <button
                  class="rounded-full bg-[#d93025] px-4 py-2 text-[13px] font-medium text-white hover:bg-[#b5261e]"
                  on:click={() => (deleteStep = 2)}>Sim, continuar</button
                >
              </div>
            {:else}
              {#if deleteError}<div class="mb-3 rounded-lg bg-[#fce8e6] px-4 py-3 text-[13px] text-[#d93025]">
                  {deleteError}
                </div>{/if}
              <div class="mt-3">
                <label class="mb-1.5 block text-[13px] font-medium text-[#202124]" for="del-pwd"
                  >Confirme sua senha para excluir</label
                >
                <input
                  id="del-pwd"
                  type="password"
                  autocomplete="current-password"
                  class="h-10 w-full rounded-lg border border-[#dadce0] px-3 text-[14px] outline-none focus:border-[#d93025] focus:ring-1 focus:ring-[#d93025]"
                  bind:value={deletePassword}
                  placeholder="Sua senha atual"
                />
              </div>
              <div class="mt-3 flex gap-2">
                <button
                  class="rounded-full px-4 py-2 text-[13px] font-medium text-[#5f6368] hover:bg-[#f1f3f4]"
                  on:click={() => {
                    deleteStep = 0;
                    deletePassword = '';
                    deleteError = '';
                  }}>Cancelar</button
                >
                <button
                  class="rounded-full bg-[#d93025] px-4 py-2 text-[13px] font-medium text-white hover:bg-[#b5261e] disabled:opacity-60"
                  disabled={!deletePassword || deleteLoading}
                  on:click={confirmDelete}>{deleteLoading ? 'Excluindo…' : 'Excluir permanentemente'}</button
                >
              </div>
            {/if}
          </div>
        </div>
      {/if}
    </div>
  </div>
</div>
