/**
 * maplibre-gl 6 finds its worker with `new URL('./maplibre-gl-worker.mjs', import.meta.url)`.
 * Vite pre-bundles maplibre-gl into node_modules/.vite/deps, where that file doesn't exist, so
 * the map fails with "worker url failed to load". Giving maplibre a Vite-built worker URL fixes
 * dev and production builds. Import this before creating a Map.
 */
import { setWorkerUrl } from 'maplibre-gl';
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';

setWorkerUrl(workerUrl);
