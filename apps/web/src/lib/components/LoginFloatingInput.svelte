<script lang="ts">
  import { createEventDispatcher } from 'svelte';

  export let id: string;
  export let label: string;
  export let type = 'text';
  export let autocomplete: any = '';
  export let value = '';
  export let disabled = false;

  const dispatch = createEventDispatcher<{ enter: void }>();

  function handleKeydown(event: KeyboardEvent) {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    dispatch('enter');
  }
</script>

<label class="float-field" for={id}>
  <input
    {id}
    {type}
    {autocomplete}
    placeholder=" "
    bind:value
    {disabled}
    on:keydown={handleKeydown}
  />
  <span>{label}</span>
</label>

<style>
  .float-field {
    position: relative;
    display: block;
  }

  .float-field input {
    width: 100%;
    height: 56px;
    border: 1px solid #8e918f;
    border-radius: 4px;
    background: transparent;
    color: #e8eaed;
    font: inherit;
    font-size: 16px;
    outline: none;
    padding: 16px 14px 8px;
  }

  .float-field span {
    position: absolute;
    left: 14px;
    top: 17px;
    color: #c4c7c5;
    font-size: 16px;
    line-height: 20px;
    pointer-events: none;
    transform-origin: left top;
    transition:
      transform 120ms ease,
      color 120ms ease,
      background 120ms ease,
      padding 120ms ease;
  }

  .float-field input:focus {
    border-color: #a8c7fa;
    border-width: 2px;
    padding-left: 13px;
  }

  .float-field input:focus + span,
  .float-field input:not(:placeholder-shown) + span {
    transform: translateY(-27px) scale(0.75);
    color: #a8c7fa;
    background: #0e0e0e;
    padding: 0 6px;
  }
</style>
