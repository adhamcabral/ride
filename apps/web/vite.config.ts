import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

const onlyOfficeTarget =
  process.env.VITE_ONLYOFFICE_PROXY_TARGET ?? process.env.ONLYOFFICE_DOCUMENT_SERVER_URL ?? 'http://127.0.0.1:8082';

const onlyOfficeProxy = {
  target: onlyOfficeTarget,
  changeOrigin: true,
  ws: true
};

export default defineConfig({
  plugins: [sveltekit()],
  server: {
    port: 5173,
    proxy: {
      '/onlyoffice': {
        ...onlyOfficeProxy,
        rewrite: (path) => path.replace(/^\/onlyoffice/, '') || '/'
      },
      '/web-apps': onlyOfficeProxy,
      '/sdkjs': onlyOfficeProxy,
      '/doc': onlyOfficeProxy,
      '/cache': onlyOfficeProxy,
      '/spellchecker': onlyOfficeProxy,
      '/downloadas': onlyOfficeProxy,
      '/coauthoring': onlyOfficeProxy,
      '/ConvertService.ashx': onlyOfficeProxy,
      '/healthcheck': onlyOfficeProxy,
      '^/[0-9]+\\.[0-9]+\\.[0-9]+-[^/]+': onlyOfficeProxy
    }
  }
});
