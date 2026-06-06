# Ride Web

Frontend SvelteKit + TailwindCSS com layout responsivo de gerenciador de arquivos em nuvem.

O painel administrativo usa padrões inspirados no Immich: shell com navegação lateral, cards de métricas, tabela de usuários, medidores de armazenamento e fila de jobs.

## Telas

- `src/routes/+page.svelte`: tela principal do Ride
- `src/routes/share/[token]/+page.svelte`: download público por link

## Configuração

Defina `VITE_API_URL` se a API não estiver em `http://localhost:3333/api`.
