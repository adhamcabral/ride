<script lang="ts">
  import { createEventDispatcher, tick } from 'svelte';

  export let visible = false;
  export let title = '';
  export let message = '';
  export let defaultValue = '';
  export let placeholder = '';
  export let type: 'prompt' | 'confirm' = 'confirm';
  export let confirmLabel = 'OK';
  export let cancelLabel = 'Cancelar';
  export let danger = false;

  let inputValue = '';
  let inputEl: HTMLInputElement;

  const dispatch = createEventDispatcher<{ confirm: string; cancel: void }>();

  $: if (visible) {
    inputValue = defaultValue;
    if (type === 'prompt') tick().then(() => inputEl?.focus());
  }

  function handleConfirm() {
    dispatch('confirm', type === 'prompt' ? inputValue : 'ok');
  }

  function handleCancel() {
    dispatch('cancel');
  }
</script>

<svelte:window
  on:keydown={(e) => {
    if (!visible) return;
    if (e.key === 'Enter' && type === 'prompt') handleConfirm();
    if (e.key === 'Escape') handleCancel();
  }}
/>

{#if visible}
  <div
    data-dialog
    class="fixed inset-0 z-[200] flex items-center justify-center bg-black/40 p-4"
    role="dialog"
    aria-modal="true"
    tabindex="-1"
    on:click|self={handleCancel}
    on:keydown={(e) => {
      if (e.key === 'Escape') handleCancel();
    }}
  >
    <div class="w-full max-w-sm overflow-hidden rounded-2xl bg-white shadow-[0_8px_30px_rgba(0,0,0,.2)]">
      <div class="px-6 pt-6 pb-2">
        <h3 class="text-[18px] font-normal text-[#202124]">{title}</h3>
        {#if message}
          <p class="mt-2 text-[14px] text-[#5f6368]">{message}</p>
        {/if}
        {#if type === 'prompt'}
          <input
            bind:this={inputEl}
            bind:value={inputValue}
            {placeholder}
            class="mt-5 h-10 w-full rounded-lg border border-[#dadce0] px-3 text-[14px] outline-none focus:border-[#1a73e8] focus:ring-1 focus:ring-[#1a73e8]"
          />
        {/if}
      </div>
      <div class="flex justify-end gap-1 px-4 py-4">
        <button
          class="rounded-full px-5 py-2 text-[14px] font-medium text-[#1a73e8] hover:bg-[#e8f0fe]"
          on:click={handleCancel}>{cancelLabel}</button
        >
        <button
          class="rounded-full px-5 py-2 text-[14px] font-medium text-white {danger
            ? 'bg-[#d93025] hover:bg-[#b5261e]'
            : 'bg-[#1a73e8] hover:bg-[#1557b0]'}"
          on:click={handleConfirm}>{confirmLabel}</button
        >
      </div>
    </div>
  </div>
{/if}
