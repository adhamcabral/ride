<script context="module" lang="ts">
  export type ModifiedFilterPreset =
    | 'all'
    | 'today'
    | 'last7'
    | 'last30'
    | 'thisYear'
    | 'lastYear'
    | 'custom';
</script>

<script lang="ts">
  import { createEventDispatcher } from 'svelte';

  export let open = false;
  export let preset: ModifiedFilterPreset = 'all';
  export let after: string | null = null;
  export let before: string | null = null;

  const dispatch = createEventDispatcher<{
    apply: { preset: ModifiedFilterPreset; after: string | null; before: string | null };
    clear: void;
    filteropen: void;
  }>();

  const today = new Date();
  const currentYear = today.getFullYear();
  const monthNames = [
    'janeiro',
    'fevereiro',
    'março',
    'abril',
    'maio',
    'junho',
    'julho',
    'agosto',
    'setembro',
    'outubro',
    'novembro',
    'dezembro'
  ];
  const weekdays = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];

  let draftPreset: ModifiedFilterPreset = preset;
  let draftAfter: string | null = after;
  let draftBefore: string | null = before;
  let customOpen = false;
  let activeInput: 'after' | 'before' | null = null;
  let calendarMonth = new Date(today.getFullYear(), today.getMonth(), 1);
  let calendarDays: Array<Date | null> = [];
  let yearPickerOpen = false;

  $: if (open) {
    draftPreset = preset;
    draftAfter = after;
    draftBefore = before;
    customOpen = preset === 'custom';
  }

  $: active = preset !== 'all';
  $: canApply = draftPreset !== 'all' && (draftPreset !== 'custom' || Boolean(draftAfter || draftBefore));
  $: yearList = Array.from({ length: 17 }, (_, index) => currentYear - 8 + index);
  $: calendarDays = buildMonthDays(calendarMonth);

  function toggle() {
    if (!open) dispatch('filteropen');
    open = !open;
  }

  function presetLabel(value: ModifiedFilterPreset) {
    if (value === 'today') return 'Hoje';
    if (value === 'last7') return 'Últimos sete dias';
    if (value === 'last30') return 'Últimos 30 dias';
    if (value === 'thisYear') return `Este ano (${currentYear})`;
    if (value === 'lastYear') return `Ano passado (${currentYear - 1})`;
    if (value === 'custom') {
      if (after && before) return `${formatInput(after, '')} - ${formatInput(before, '')}`;
      if (after) return `Depois de ${formatInput(after, '')}`;
      if (before) return `Antes de ${formatInput(before, '')}`;
      return 'Período personalizado';
    }
    return 'Modificado';
  }

  function closeCalendarFromWindow() {
    if (open) activeInput = null;
  }

  function choosePreset(next: ModifiedFilterPreset) {
    if (next !== 'custom') {
      dispatch('apply', { preset: next, after: null, before: null });
      open = false;
      return;
    }
    draftPreset = next;
    customOpen = true;
  }

  function openCustom() {
    draftPreset = 'custom';
    customOpen = true;
  }

  function apply() {
    if (!canApply) return;
    dispatch('apply', {
      preset: draftPreset,
      after: draftPreset === 'custom' ? draftAfter : null,
      before: draftPreset === 'custom' ? draftBefore : null
    });
    open = false;
  }

  function clear() {
    draftPreset = 'all';
    draftAfter = null;
    draftBefore = null;
    dispatch('clear');
    open = false;
  }

  function cancel() {
    open = false;
    activeInput = null;
  }

  function isoDate(date: Date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  function selectDate(date: Date) {
    const next = isoDate(date);
    if (activeInput === 'before') draftBefore = next;
    else draftAfter = next;
    draftPreset = 'custom';
    activeInput = null;
    yearPickerOpen = false;
  }

  function clearDate(input: 'after' | 'before') {
    if (input === 'after') draftAfter = null;
    else draftBefore = null;
    draftPreset = 'custom';
    activeInput = null;
  }

  function selectedDateFor(input: 'after' | 'before') {
    const value = input === 'after' ? draftAfter : draftBefore;
    if (!value) return null;
    const [year, month, day] = value.split('-').map(Number);
    if (!year || !month || !day) return null;
    return new Date(year, month - 1, day);
  }

  function openCalendar(input: 'after' | 'before') {
    activeInput = input;
    draftPreset = 'custom';
    customOpen = true;
    yearPickerOpen = false;
    const selected = selectedDateFor(input);
    if (selected) calendarMonth = new Date(selected.getFullYear(), selected.getMonth(), 1);
  }

  function buildMonthDays(month: Date) {
    const first = new Date(month.getFullYear(), month.getMonth(), 1);
    const daysInMonth = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
    const blanks = first.getDay();
    return [
      ...Array.from({ length: blanks }, () => null),
      ...Array.from({ length: daysInMonth }, (_, index) => new Date(first.getFullYear(), first.getMonth(), index + 1))
    ];
  }

  function moveMonth(delta: number) {
    calendarMonth = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + delta, 1);
  }

  function chooseYear(year: number) {
    calendarMonth = new Date(year, calendarMonth.getMonth(), 1);
    yearPickerOpen = false;
  }

  function sameDay(a: Date | null, b: Date | null) {
    return Boolean(
      a &&
        b &&
        a.getFullYear() === b.getFullYear() &&
        a.getMonth() === b.getMonth() &&
        a.getDate() === b.getDate()
    );
  }

  function formatInput(value: string | null, fallback: string) {
    if (!value) return fallback;
    const [year, month, day] = value.split('-');
    return `${day}/${month}/${year}`;
  }

  function fieldValue(value: string | null, fallback: string) {
    return value ?? fallback;
  }
</script>

<svelte:window on:click={closeCalendarFromWindow} />

<div class="relative">
  {#if active}
    <div class="flex h-9 overflow-hidden rounded-lg bg-[#0b5f86] text-[14px] text-[#e8f0fe]">
      <button
        class="flex h-9 max-w-[230px] items-center gap-1.5 pl-4 pr-3 hover:bg-white/10"
        aria-haspopup="menu"
        aria-expanded={open}
        on:click|stopPropagation={toggle}
      >
        <span class="truncate">{presetLabel(preset)}</span>
        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
          <path d="M7 10l5 5 5-5z" />
        </svg>
      </button>
      <button
        class="flex h-9 w-10 items-center justify-center border-l border-[#064b70] hover:bg-white/10"
        aria-label="Limpar filtro de modificação"
        on:click|stopPropagation={clear}
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
          <path d="M18.3 5.71 12 12l6.3 6.29-1.41 1.41L10.59 13.41 4.29 19.71 2.88 18.3 9.17 12 2.88 5.71 4.29 4.29l6.3 6.3 6.29-6.3z" />
        </svg>
      </button>
    </div>
  {:else}
    <button
      data-filter-chip
      class="flex h-9 items-center gap-2 rounded-lg border border-[#747775] bg-white px-4 text-[14px] text-[#3c4043] hover:bg-[#f8fafd]"
      aria-haspopup="menu"
      aria-expanded={open}
      on:click|stopPropagation={toggle}
    >
      Modificado
      <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="#3c4043">
        <path d="M7 10l5 5 5-5z" />
      </svg>
    </button>
  {/if}

  {#if open}
    <div
      class="absolute left-0 top-11 z-50 overflow-visible rounded bg-white text-[14px] text-[#1f1f1f] shadow-[0_4px_14px_rgba(60,64,67,.2)] {customOpen
        ? 'w-[574px]'
        : 'w-[316px]'}"
      role="menu"
      tabindex="-1"
      on:click|stopPropagation
      on:keydown|stopPropagation
    >
      <div class="w-[316px] py-1">
        <button class="flex h-10 w-full items-center gap-4 px-7 text-left hover:bg-[#f8fafd]" on:click={() => choosePreset('today')}>
          <span class="h-5 w-5 shrink-0"></span>
          <span>Hoje</span>
        </button>
        <button class="flex h-10 w-full items-center gap-4 px-7 text-left hover:bg-[#f8fafd]" on:click={() => choosePreset('last7')}>
          <span class="h-5 w-5 shrink-0"></span>
          <span>Últimos sete dias</span>
        </button>
        <button class="flex h-10 w-full items-center gap-4 px-7 text-left hover:bg-[#f8fafd]" on:click={() => choosePreset('last30')}>
          <span class="h-5 w-5 shrink-0"></span>
          <span>Últimos 30 dias</span>
        </button>
        <button class="flex h-10 w-full items-center gap-4 px-7 text-left hover:bg-[#f8fafd]" on:click={() => choosePreset('thisYear')}>
          <span class="h-5 w-5 shrink-0"></span>
          <span>Este ano ({currentYear})</span>
        </button>
        <button class="flex h-10 w-full items-center gap-4 px-7 text-left hover:bg-[#f8fafd]" on:click={() => choosePreset('lastYear')}>
          <span class="h-5 w-5 shrink-0"></span>
          <span>Ano passado ({currentYear - 1})</span>
        </button>
        <button
          class="flex h-10 w-full items-center gap-4 px-7 text-left hover:bg-[#f8fafd] {customOpen
            ? 'bg-[#1a73e8] text-white hover:bg-[#1a73e8]'
            : ''}"
          on:click={openCustom}
        >
          <span class="flex h-5 w-5 items-center justify-center">
            {#if customOpen}
              <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
                <path d="M9 16.17 4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" />
              </svg>
            {/if}
          </span>
          <span>Período personalizado</span>
          <svg class="ml-auto" xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
            <path d="m10 6 6 6-6 6-1.41-1.41L13.17 12 8.59 7.41z" />
          </svg>
        </button>
      </div>

      {#if customOpen}
        <div
          class="absolute left-[316px] top-0 h-[244px] w-[258px] border-l border-[#747775] bg-white p-4 shadow-[0_4px_14px_rgba(60,64,67,.18)]"
          role="presentation"
          on:click={() => (activeInput = null)}
          on:keydown={() => undefined}
        >
          <button
            class="relative flex h-11 w-full items-center justify-between rounded border border-[#9aa0a6] px-3 text-left text-[16px] hover:bg-[#f8fafd] {activeInput ===
            'after'
              ? 'border-[#8ab4f8]'
              : ''}"
            on:click|stopPropagation={() => openCalendar('after')}
          >
            {#if draftAfter}
              <span class="absolute -top-2 left-3 bg-white px-1 text-[12px] leading-4 text-[#bdc1c6]">Depois de</span>
            {/if}
            <span>{fieldValue(draftAfter, 'Depois de')}</span>
            {#if draftAfter}
              <span
                class="flex h-8 w-8 items-center justify-center rounded-full hover:bg-[#f1f3f4]"
                role="button"
                tabindex="0"
                aria-label="Limpar data inicial"
                on:click|stopPropagation={() => clearDate('after')}
                on:keydown|stopPropagation={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') clearDate('after');
                }}
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="21" height="21" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M18.3 5.71 12 12l6.3 6.29-1.41 1.41L10.59 13.41 4.29 19.71 2.88 18.3 9.17 12 2.88 5.71 4.29 4.29l6.3 6.3 6.29-6.3z" />
                </svg>
              </span>
            {:else}
              <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
                <path d="M19 3h-1V1h-2v2H8V1H6v2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H5V8h14v11z" />
              </svg>
            {/if}
          </button>
          <button
            class="relative mt-4 flex h-11 w-full items-center justify-between rounded border border-[#9aa0a6] px-3 text-left text-[16px] hover:bg-[#f8fafd] {activeInput ===
            'before'
              ? 'border-[#8ab4f8]'
              : ''}"
            on:click|stopPropagation={() => openCalendar('before')}
          >
            {#if draftBefore}
              <span class="absolute -top-2 left-3 bg-white px-1 text-[12px] leading-4 text-[#bdc1c6]">Antes de</span>
            {/if}
            <span>{fieldValue(draftBefore, 'Antes de')}</span>
            {#if draftBefore}
              <span
                class="flex h-8 w-8 items-center justify-center rounded-full hover:bg-[#f1f3f4]"
                role="button"
                tabindex="0"
                aria-label="Limpar data final"
                on:click|stopPropagation={() => clearDate('before')}
                on:keydown|stopPropagation={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') clearDate('before');
                }}
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="21" height="21" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M18.3 5.71 12 12l6.3 6.29-1.41 1.41L10.59 13.41 4.29 19.71 2.88 18.3 9.17 12 2.88 5.71 4.29 4.29l6.3 6.3 6.29-6.3z" />
                </svg>
              </span>
            {:else}
              <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
                <path d="M19 3h-1V1h-2v2H8V1H6v2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H5V8h14v11z" />
              </svg>
            {/if}
          </button>

          {#if activeInput}
            <div
              class="absolute left-4 z-[80] w-[304px] rounded bg-white px-5 pb-5 pt-3 shadow-[0_4px_14px_rgba(60,64,67,.2)] {activeInput ===
              'after'
                ? 'top-[62px]'
                : 'top-[118px]'}"
              role="presentation"
              on:click|stopPropagation
              on:keydown|stopPropagation
            >
              <div class="mb-4 flex h-10 items-center justify-between">
                <button class="rounded px-2 py-1 text-[15px] hover:bg-[#f8fafd]" on:click={() => (yearPickerOpen = !yearPickerOpen)}>
                  {monthNames[calendarMonth.getMonth()]} de {calendarMonth.getFullYear()}
                </button>
                <div class="flex items-center gap-1">
                  <button class="flex h-9 w-9 items-center justify-center rounded-full hover:bg-[#f8fafd]" on:click={() => moveMonth(-1)} aria-label="Mês anterior">
                    <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><path d="M15.41 7.41 14 6l-6 6 6 6 1.41-1.41L10.83 12z" /></svg>
                  </button>
                  <button class="flex h-9 w-9 items-center justify-center rounded-full hover:bg-[#f8fafd]" on:click={() => moveMonth(1)} aria-label="Próximo mês">
                    <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><path d="m8.59 16.59 4.58-4.59-4.58-4.59L10 6l6 6-6 6z" /></svg>
                  </button>
                </div>
              </div>

              {#if yearPickerOpen}
                <div class="max-h-[260px] overflow-y-auto py-1">
                  {#each yearList as year}
                    <button
                      class="flex h-10 w-full items-center justify-center text-[20px] hover:bg-[#f8fafd] {year ===
                      calendarMonth.getFullYear()
                        ? 'border border-[#8ab4f8] text-[#8ab4f8]'
                        : ''}"
                      on:click={() => chooseYear(year)}
                    >
                      {year}
                    </button>
                  {/each}
                </div>
              {:else}
                <div class="grid grid-cols-7 text-center text-[12px] text-[#5f6368]">
                  {#each weekdays as day}
                    <span class="py-2">{day}</span>
                  {/each}
                </div>
                <div class="grid grid-cols-7 text-center text-[13px]">
                  {#each calendarDays as day}
                    {#if day}
                      {@const selected = sameDay(day, selectedDateFor(activeInput))}
                      {@const isToday = sameDay(day, today)}
                      <button
                        class="mx-auto my-1 flex h-9 w-9 items-center justify-center rounded-full hover:bg-[#f1f3f4] {selected
                          ? 'bg-[#8ab4f8] text-[#001d35]'
                          : isToday
                            ? 'bg-[#303134] text-[#e8eaed]'
                            : ''}"
                        on:click={() => selectDate(day)}
                      >
                        {day.getDate()}
                      </button>
                    {:else}
                      <span class="h-9"></span>
                    {/if}
                  {/each}
                </div>
              {/if}
            </div>
          {/if}
        </div>
      {/if}

      <div
        class="relative flex h-12 items-center justify-between border-t border-[#747775] bg-white px-5"
      >
        <button class="text-[#5f6368] disabled:opacity-50" disabled={!active} on:click={clear}>Remover tudo</button>
        <div class="flex items-center gap-7">
          <button class="font-medium text-[#8ab4f8]" on:click={cancel}>Cancelar</button>
          <button class="font-medium text-[#8ab4f8] disabled:text-[#5f6368]" disabled={!canApply} on:click={apply}>Aplicar</button>
        </div>
      </div>
    </div>
  {/if}
</div>
