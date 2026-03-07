# DeltEcho Production Diagnosis

## Issue 1: Live2D Avatar Not Displaying in Main Chat Window

The avatar is stuck in "Loading..." state. The architecture:

1. `Live2DAvatar.tsx` (React component) dynamically imports `@deltecho/avatar`
2. `Live2DAvatarManager` creates a canvas, imports `PixiLive2DRenderer`
3. `PixiLive2DRenderer` waits for `window.Live2DCubismCore` (WASM), then imports pixi.js and pixi-live2d-display
4. Model files ARE accessible on the server (confirmed via curl: model3.json, moc3, texture all return 200)
5. `live2dcubismcore.min.js` IS loaded in main.html before bundle.js

The esbuild config has `cubismPatchPlugin` that replaces the fatal throw with a warning.
The esbuild config marks `*.jpg`, `*.png`, `*.webp`, `*.svg` as external.

**Possible failure points:**
- The avatar package dist/ directory doesn't exist locally (needs `tsc` build first)
- But in production, the Dockerfile runs `pnpm --filter=@deltecho/avatar build` before `pnpm build:browser`
- The dynamic import chain: `Live2DAvatar.tsx` -> `@deltecho/avatar` -> `pixi-live2d-renderer.ts` -> `pixi.js` + `pixi-live2d-display-lipsyncpatch/cubism4`
- Since esbuild bundles everything, the dynamic import of `@deltecho/avatar` becomes a code-split chunk
- The 30-second timeout in Live2DAvatar.tsx would eventually show an error, but user reports it stays loading

**Key insight:** The avatar is shown on the Dashboard tab as a sprite image (the cyberpunk girl), but the Live2D Avatar tab shows "Loading..." indefinitely. The Dashboard tab shows "Live2D Active" green indicator, which means `avatarLoaded` is true. But on fresh page load, it showed "Loading..." first.

**Most likely cause:** The `fromSync()` call in pixi-live2d-renderer.ts may be silently failing without triggering onLoad or onError callbacks, leaving the component in a permanent loading state.

## Issue 2: Settings Dialog Not Loading

The Settings dialog shows "Loading..." indefinitely. The flow:
1. Settings.tsx checks `settingsStore` - if null, shows loading
2. `SettingsStoreInstance.effect.load()` is called from ScreenController.tsx with retry logic
3. `effect.load()` calls `BackendRemote.rpc.batchGetConfig()` and `runtime.getDesktopSettings()`
4. `getDesktopSettings()` calls `fetch("/backend-api/config")` which requires auth

**Possible cause:** The settings store load might be failing silently after all 5 retries, or the batchGetConfig RPC call might be failing with deprecated/unknown keys.
