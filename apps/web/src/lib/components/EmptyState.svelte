<script lang="ts">
  export let title = 'Nenhum arquivo aqui';
  export let description = 'Use o botão "Novo" ou arraste arquivos para começar.';
</script>

<div class="flex min-h-[400px] flex-col items-center justify-center px-8 py-16 text-center">
  <svg xmlns="http://www.w3.org/2000/svg" width="96" height="96" viewBox="0 0 24 24" fill="#dadce0">
    <path
      d="M20 6h-8l-2-2H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2zm0 12H4V8h16v10z"
    />
  </svg>
  <h3 class="mt-4 text-[16px] font-normal text-[#202124]">{title}</h3>
  <p class="mt-2 max-w-sm text-[14px] text-[#5f6368]">{description}</p>
</div>
