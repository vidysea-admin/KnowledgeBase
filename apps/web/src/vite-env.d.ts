/// <reference types="vite/client" />

interface Window {
  /** Set by config.js, generated at container start from APP_BASE_PATH / APP_API_BASE. */
  __LKB_CONFIG__?: { basePath?: string; apiBase?: string; userAccounts?: boolean };
}

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL?: string;
  readonly VITE_SESSIONS_FILTERS?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
