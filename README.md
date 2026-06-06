

<p align="center">
<img src="design/logotipo.png" width="300">
</p>
<h3 align="center">High performance self-hosted file management solution</h3>

<p align="center" >
Ride is a self-hosted file manager with users, sharing, search, previews, backups, and ONLYOFFICE editing.
It runs as a local Docker stack with Web, API, SQLite storage, and ONLYOFFICE Docs.
Use it as a private Drive-style workspace for files, folders, and office documents.
</p>
<hr>


## Requirements

- Linux server or desktop
- Docker and Docker Compose
- Node.js 24+
- npm 10+
- Internet access on first start to pull Docker images
- Optional: UFW for firewall rules

## Fast Start

```bash
cp .env.example .env
npm run dev
```

The first start downloads the local ONLYOFFICE Docs Docker image if it is not already available. Ride keeps ONLYOFFICE running locally in Docker; the large image archive is not committed to Git.
On a clean Docker install, the stack also prepares Docker volumes for `node_modules` before starting the Web and API containers.

Open:

```txt
http://127.0.0.1:5173
```

For LAN or domain access, edit `.env` before starting:

```env
PUBLIC_APP_URL=http://your-domain-or-ip:5173
PUBLIC_API_URL=http://your-domain-or-ip:3333/api
VITE_API_URL=http://your-domain-or-ip:3333/api
CORS_ORIGINS=http://your-domain-or-ip:5173
ONLYOFFICE_DOCUMENT_SERVER_URL=http://your-domain-or-ip:8082
RIDE_ACCESS_TICKET_SECRET=change-this
ONLYOFFICE_JWT_SECRET=change-this-too
```

Stop:

```bash
npm run docker:down
```

## First Account and Local Data

On the first start, Ride opens the account creation screen. The API stores local SQLite data and uploaded objects in:

```txt
apps/api/data
```

That folder is ignored by Git. To reset Ride back to first-account setup, stop the stack and remove that local data folder. Docker dependency volumes can be recreated safely; they do not contain Ride accounts or files.

To pre-cache the ONLYOFFICE base image for later local reuse:

```bash
npm run docker:vendor-office
```

## Ports

```txt
5173  Web
3333  API
8082  ONLYOFFICE
```

UFW:

```bash
sudo ufw allow 5173/tcp
sudo ufw allow 3333/tcp
sudo ufw allow 8082/tcp
```

## Backup Volume

Create a host folder:

```bash
sudo mkdir -p /srv/ride-backups
sudo chown -R "$USER:$USER" /srv/ride-backups
```

Set it in `.env`:

```env
RIDE_BACKUP_DIR=/srv/ride-backups
```

Start Ride, then go to `Settings > Backups` and set the default backup location to:

```txt
/backups
```

## Author

Created and maintained by Adham Cabral.
