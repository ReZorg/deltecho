/**
 * Pixi.js Unsafe-Eval Shim
 *
 * This file MUST be loaded before any pixi.js code to patch the ShaderSystem.
 * PixiJS v7 uses `new Function()` for shader compilation, which is blocked by
 * Content Security Policy (CSP) when `script-src` does not include `'unsafe-eval'`.
 *
 * The `@pixi/unsafe-eval` package patches `ShaderSystem.prototype.syncUniforms`
 * and `ShaderSystem.prototype.systemCheck` to use pre-compiled shader functions
 * instead of dynamically generated ones.
 *
 * This shim is loaded via esbuild's `inject` option to guarantee it runs
 * before any other module in the bundle that might import pixi.js.
 *
 * @see https://pixijs.download/release/docs/PIXI.ShaderSystem.html
 * @see https://github.com/nicolo-ribaudo/pixi-unsafe-eval
 */
import "@pixi/unsafe-eval";
