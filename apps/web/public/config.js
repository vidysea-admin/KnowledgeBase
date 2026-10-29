// Runtime config for the web app. The web container REPLACES this file at start from APP_BASE_PATH /
// APP_API_BASE (apps/web/docker/40-lkb-runtime-config.sh). This default is what `vite dev` serves:
// mounted at "/", no explicit API base (api/client.ts falls back to localhost:3300 in dev).
window.__LKB_CONFIG__ = { basePath: "", apiBase: "" };
