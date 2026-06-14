

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

The first start tries to generate a local HTTPS certificate, downloads the local ONLYOFFICE Docs Docker image if it is not already available, and starts the Docker stack. Ride keeps ONLYOFFICE running locally in Docker; the large image archive is not committed to Git.
On a clean Docker install, the stack also prepares Docker volumes for `node_modules` before starting the Web and API containers.

Open:

```txt
https://127.0.0.1:3443
```

The default certificate is signed by Ride's local CA, so browsers will show a trust warning until you trust or replace the certificate.
If certificate generation fails, `npm run dev` continues in HTTP fallback mode at `http://127.0.0.1:5173`.

For LAN or domain access, edit `.env` before starting and include every hostname/IP that browsers will use:

```env
RIDE_HTTPS_HOSTS=your-domain-or-ip,localhost,127.0.0.1
PUBLIC_APP_URL=https://your-domain-or-ip:3443
PUBLIC_API_URL=https://your-domain-or-ip:3443/api
VITE_API_URL=/api
CORS_ORIGINS=https://your-domain-or-ip:3443,https://127.0.0.1:3443,https://localhost:3443
ONLYOFFICE_DOCUMENT_SERVER_URL=https://your-domain-or-ip:8443
RIDE_ACCESS_TICKET_SECRET=change-this
ONLYOFFICE_JWT_SECRET=change-this-too
```

Then regenerate the certificate:

```bash
FORCE_RENEW=1 npm run https:certs
npm run dev
```

For Android, the app uses the API and ONLYOFFICE directly over HTTP to avoid local certificate setup. Set `API_BIND_ADDRESS=0.0.0.0` and `ONLYOFFICE_BIND_ADDRESS=0.0.0.0`, keep `API_HOST_PORT=3333` and `ONLYOFFICE_PORT=8082`, restart Ride, then enter the PC LAN address in the app:

```txt
192.168.1.199
```

The app completes the API as `http://192.168.1.199:3333/api` and opens ONLYOFFICE inside the app through `http://192.168.1.199:8082`. Do not use `127.0.0.1` on the phone because it points to the phone itself.

For ONLYOFFICE editing from PC and Android at the same time, make the API URL sent to ONLYOFFICE reachable from both the browser and the Document Server container:

```env
DOCKER_PUBLIC_API_URL=http://192.168.1.199:3333/api
ONLYOFFICE_DOCUMENT_SERVER_URL=http://192.168.1.199:8082
CORS_ORIGINS=https://192.168.1.199:3443,http://192.168.1.199:8082,https://192.168.1.199:8443,http://192.168.1.199:3333
```

Stop:

```bash
npm run docker:down
```

## Production Mode

For normal use, prefer production mode after the first configuration is working:

```bash
npm run prod
```

Production mode keeps the same local data folder and the same public HTTPS ports, but runs:

```txt
API  compiled NestJS app
Web  static Svelte build served by Nginx
```

That avoids the Vite development server and API watch mode, so CPU and memory usage are lower and static assets are cached/compressed. Open:

```txt
https://127.0.0.1:3443
```

Useful commands:

```bash
npm run prod:ps
npm run prod:logs
npm run prod:down
```

Use `npm run dev` when editing code and `npm run prod` when you want the faster local server. Both modes use `apps/api/data`; switching modes does not reset accounts or files.

## PDF Performance

The in-app PDF reader renders pages on demand. Large PDFs, manga, and scanned books open the first page first, then load nearby pages while you scroll. Rendered pages are cached locally in:

```txt
apps/api/data/pdf-cache
```

Tune quality versus speed in `.env`:

```env
PDF_RENDER_DPI=120
PDF_RENDER_MAX_BUFFER_MB=64
```

Higher DPI makes pages sharper but increases CPU, RAM, and load time. `120` is the default for faster large-file previews.

## HTTPS and Certificates

Ride exposes only two public HTTPS ports by default:

```txt
3443  Ride Web + API
8443  ONLYOFFICE Docs
```

For Android on the same LAN, expose the API HTTP port:

```txt
3333  API for Android app
8082  ONLYOFFICE for Android app
```

The Docker-only development ports can stay bound to localhost when Android access is not needed:

```txt
5173  Web dev server
8082  ONLYOFFICE HTTP
```

If the HTTPS certificate cannot be generated or validated, Ride skips the HTTPS proxy and starts only the fallback ports above. Fix OpenSSL/certificate configuration and run `npm run dev` again to return to HTTPS mode.

For router or firewall access, forward only:

```txt
3443/tcp
8443/tcp
```

The generated certificate files live in:

```txt
docker/proxy/certs/ride-local.crt
docker/proxy/certs/ride-local.key
```

They are ignored by Git. To renew the local certificate manually:

```bash
FORCE_RENEW=1 npm run https:certs
docker compose restart proxy
```

If you change domains, LAN IPs, or HTTPS ports, update `.env`, regenerate the certificate, and restart the stack:

```bash
FORCE_RENEW=1 npm run https:certs
npm run docker:down
npm run dev
```

For a publicly trusted certificate, place your certificate and private key in `docker/proxy/certs`, point `RIDE_TLS_CERT_FILE` and `RIDE_TLS_KEY_FILE` to those filenames, and set:

```env
RIDE_SKIP_CERT_GENERATION=true
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
3443  HTTPS Web + API
8443  HTTPS ONLYOFFICE
3333  HTTP API for Android LAN access
8082  HTTP ONLYOFFICE for Android LAN access
5173  Web localhost fallback
```

UFW:

```bash
sudo ufw allow 3443/tcp
sudo ufw allow 8443/tcp
sudo ufw allow from 192.168.1.0/24 to any port 3333 proto tcp
sudo ufw allow from 192.168.1.0/24 to any port 8082 proto tcp
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

Start Ride, then go to `Settings > Backups` and set the default backup location to other disk:

```txt
/backups
```

## Author

Created and maintained by Adham Cabral.
