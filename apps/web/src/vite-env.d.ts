/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL?: string;
  readonly VITE_SESSIONS_FILTERS?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
