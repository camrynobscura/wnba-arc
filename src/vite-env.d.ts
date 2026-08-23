/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Base URL of the wnba-data read API, e.g. https://your-api.example.com */
  readonly VITE_API_BASE?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
