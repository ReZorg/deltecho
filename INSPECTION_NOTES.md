# DeltEcho Inspection Notes

## Production Deployment
- URL: https://deltecho-chat-preview.dan-cdc.workers.dev
- Auth: WEB_PASSWORD secret set in Cloudflare
- Container: v7 image, shared container mode
- Login page shows correctly - password-protected

## Key Files for Live2D Avatar
1. `packages/frontend/src/components/AICompanionHub/Live2DAvatar.tsx` - React component
2. `packages/avatar/src/adapters/pixi-live2d-renderer.ts` - Core renderer (770 lines)
3. `packages/avatar/src/adapters/live2d-avatar.ts` - Manager class
4. `packages/avatar/src/adapters/cubism-adapter.ts` - Cubism adapter interface
5. `packages/frontend/src/components/screens/DeepTreeEchoHub/DeepTreeEchoHub.tsx` - Main hub (1149 lines)

## Three-Layer Fix Status (from skill doc)
- Layer 1 (Stack overflow): Fixed via fromSync() + safe noop logger
- Layer 2 (CSP blocks shaders): Fixed via @pixi/unsafe-eval import
- Layer 3 (Cubism 2 assertion): Fixed via cubism4 sub-export

## Model Configuration
- Default model: miara at `/models/miara/miara_pro_t03.model3.json`
- CDN models: shizuku (Cubism 2), haru (Cubism 4)
- Known issue: 4096px texture (13MB) causes slow loads

## Skill Specifications vs Implementation Gaps
- live2d-char-model: Defines parameterized character model template with endocrine system
- live2d-dtecho: DTE character definition with 10 FACS expressions, endocrine drivers
- live2d-miara: Miara character with OCEAN personality, endocrine baselines
- MISSING: No endocrine system implementation in the actual codebase
- MISSING: No FACS expression mapping in the actual codebase
- MISSING: No character manifest/registry system
- MISSING: No DTE cognitive state → expression pipeline
- MISSING: No simulation tick loop connecting DTE states to avatar expressions
