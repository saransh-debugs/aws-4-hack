/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_DATA_MODE?: string;
  readonly VITE_LOCATION_API_KEY?: string;
  readonly VITE_LOCATION_MAP_NAME?: string;
  readonly VITE_AWS_REGION?: string;
  readonly VITE_API_URL?: string;
  readonly VITE_COGNITO_USER_POOL_ID?: string;
  readonly VITE_COGNITO_CLIENT_ID?: string;
  /** "msw" serves the API from a browser service worker (dev only). */
  readonly VITE_API_MOCKING?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
