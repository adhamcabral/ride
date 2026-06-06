<script lang="ts">
  import { onMount } from 'svelte';
  import { initTheme } from '$lib/theme';
  import '../app.css';

  onMount(() => initTheme());
</script>

<slot />
