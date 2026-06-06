# Ride API

API NestJS para contas, cotas, metadados, upload, download, favoritos, spam, lixeira, movimentação de pastas e compartilhamento público.

## Endpoints principais

- `GET /api/library` lista arquivos e pastas
- `GET /api/accounts` lista contas
- `POST /api/accounts` cria conta admin/usuário com cota em GB
- `PATCH /api/accounts/:id` edita conta e cota
- `GET /api/folders` lista pastas disponíveis para mover itens
- `POST /api/folders` cria pasta
- `POST /api/files/upload` faz upload multipart no campo `file`
- `PATCH /api/files/:id` renomeia, move, favorita, restaura ou envia para lixeira
- `DELETE /api/files/:id` move para lixeira
- `DELETE /api/files/:id?hard=true` exclui permanentemente
- `POST /api/files/:id/share` cria link público
- `GET /api/files/:id/download` baixa arquivo

## Storage

Por padrão, os arquivos ficam em `apps/api/data/objects` e os metadados em `apps/api/data/ride.sqlite`.

Se existir um `apps/api/data/metadata.json` legado, a API importa esses dados para SQLite automaticamente na primeira inicialização. Uploads multipart são recebidos em `apps/api/data/tmp` e movidos para `objects`, evitando carregar arquivos grandes inteiros na memória do processo.

Preview de PDF usa os binários `pdfinfo` e `pdftocairo` do pacote `poppler-utils`.

## Manutenção

Endpoints admin:

- `POST /api/admin/maintenance/audit` audita objetos, checksums e órfãos
- `POST /api/admin/maintenance/audit` com `{ "repair": true, "removeOrphans": true }` preenche checksums/tamanhos ausentes e remove objetos órfãos
- `GET /api/admin/maintenance` lista backups e snapshots recentes
- `POST /api/admin/maintenance/backup` cria backup consistente do SQLite
- `POST /api/admin/maintenance/snapshot` cria snapshot local por hard links

A reserva mínima de disco livre antes de upload usa `RIDE_MIN_FREE_BYTES` e o padrão é `512 MB`.
