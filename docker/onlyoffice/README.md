# Ride ONLYOFFICE Image

This directory builds the Ride-owned ONLYOFFICE image.

The runtime image is:

```txt
ride/onlyoffice-documentserver:local
```

It is built from a local base image:

```txt
ride/onlyoffice-documentserver-base:local
```

The base can be frozen into:

```txt
docker/onlyoffice/vendor/documentserver.tar
```

## First-Time Vendor Step

Run once while the upstream image is available:

```bash
npm run docker:vendor-office
```

That command pulls `ONLYOFFICE_UPSTREAM_IMAGE`, tags it as the local base image, and saves it into `docker/onlyoffice/vendor/documentserver.tar`.

After that, `npm run dev` rebuilds and starts the complete Ride stack from the local image without pulling `onlyoffice/documentserver`.

## What Is Baked Into The Image

- `ride-office-host.html`
- `patches/documenteditor/main/index.html`
- `patches/spreadsheeteditor/main/index.html`
- `patches/presentationeditor/main/index.html`

These files used to be mounted as development volumes. They are now copied into the local image at build time, so the Ride office integration is part of the image itself.
