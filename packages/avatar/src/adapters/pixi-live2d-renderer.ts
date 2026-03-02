/* eslint-disable no-console */
/**
 * PixiJS Live2D Renderer
 *
 * Implements the ICubismRenderer interface using pixi-live2d-display.
 * This provides actual Live2D model rendering with full expression,
 * motion, and lip-sync support.
 *
 * FIXED: Resolved "Maximum call stack size exceeded" crash caused by
 * Cubism4 framework's startUpCubism4() passing console.log as logFunction,
 * which interacts badly with console.log interceptors (DeltaChat error
 * boundary, browser extensions, etc.). The fix uses fromSync() with
 * event-based loading and provides a safe noop logger to the framework.
 *
 * FIXED: Resolved "Current environment does not allow unsafe-eval" error
 * caused by PixiJS v7's ShaderSystem using new Function() for shader
 * compilation. The CSP policy blocks unsafe-eval, so we import
 * @pixi/unsafe-eval which patches PixiJS to use pre-compiled shaders.
 */

import type { Application, Container } from "pixi.js";
import type { Expression, AvatarMotion } from "../types";
import type {
  ICubismRenderer,
  CubismAdapterConfig,
  CubismModelInfo,
} from "./cubism-adapter";

/**
 * Live2D model reference type (from pixi-live2d-display)
 */
interface Live2DModel {
  x: number;
  y: number;
  scale: { x: number; y: number; set: (x: number, y?: number) => void };
  anchor: { x: number; y: number; set: (x: number, y?: number) => void };
  internalModel: {
    motionManager: {
      startMotion: (
        group: string,
        index: number,
        priority?: number,
      ) => Promise<boolean>;
      stopAllMotions: () => void;
    };
    coreModel: {
      setParameterValueById: (id: string, value: number) => void;
      getParameterValueById: (id: string) => number;
    };
  };
  expression: (name?: string) => void;
  motion: (
    group: string,
    index?: number,
    priority?: number,
  ) => Promise<boolean>;
  focus: (x: number, y: number) => void;
  speak: (
    audioUrl: string,
    options?: { volume?: number; crossOrigin?: string },
  ) => void;
  stopSpeaking: () => void;
  destroy: () => void;
  // Event emitter methods from pixi-live2d-display
  once: (event: string, fn: (...args: any[]) => void) => void;
  on: (event: string, fn: (...args: any[]) => void) => void;
  off: (event: string, fn: (...args: any[]) => void) => void;
}

/**
 * Expression to Live2D expression name mapping
 */
const DEFAULT_EXPRESSION_MAP: Record<Expression, string> = {
  neutral: "neutral",
  happy: "happy",
  thinking: "thinking",
  curious: "curious",
  surprised: "surprised",
  concerned: "sad",
  focused: "focused",
  playful: "happy",
  contemplative: "thinking",
  empathetic: "neutral",
};

/**
 * Motion to Live2D motion group mapping
 * Note: Motion groups vary between models. Common conventions:
 * - Standard models: "idle", "tap_body", "shake", "flick_head"
 * - Cubism Editor exports: "Idle", "Tap", "Flic" (capitalized, abbreviated)
 * We try multiple group names in order of preference.
 */
const DEFAULT_MOTION_MAP: Record<
  AvatarMotion,
  { groups: string[]; index: number }
> = {
  idle: { groups: ["Idle", "idle"], index: 0 },
  talking: { groups: ["Tap", "tap_body", "tap"], index: 0 },
  nodding: { groups: ["Tap", "tap_body", "tap"], index: 1 },
  shaking_head: { groups: ["Flic", "shake", "flick"], index: 0 },
  tilting_head: { groups: ["Flic", "flick_head", "flick"], index: 0 },
  breathing: { groups: ["Idle", "idle"], index: 0 },
  wave: { groups: ["Tap", "tap_body", "tap"], index: 2 },
  nod: { groups: ["Tap", "tap_body", "tap"], index: 1 },
  shake: { groups: ["Flic", "shake", "flick"], index: 0 },
  thinking: { groups: ["Idle", "idle"], index: 1 },
  tilt_head_left: { groups: ["Flic", "flick_head", "flick"], index: 1 },
  tilt_head_right: { groups: ["Flic", "flick_head", "flick"], index: 0 },
};

/**
 * Live2D model parameter IDs for common controls
 */
const PARAM_IDS = {
  // Mouth parameters
  PARAM_MOUTH_OPEN_Y: "ParamMouthOpenY",
  PARAM_MOUTH_FORM: "ParamMouthForm",
  // Eye parameters
  PARAM_EYE_L_OPEN: "ParamEyeLOpen",
  PARAM_EYE_R_OPEN: "ParamEyeROpen",
  // Brow parameters
  PARAM_BROW_L_Y: "ParamBrowLY",
  PARAM_BROW_R_Y: "ParamBrowRY",
  // Body parameters
  PARAM_BODY_ANGLE_X: "ParamBodyAngleX",
  PARAM_BODY_ANGLE_Y: "ParamBodyAngleY",
  PARAM_BODY_ANGLE_Z: "ParamBodyAngleZ",
  // Head parameters
  PARAM_ANGLE_X: "ParamAngleX",
  PARAM_ANGLE_Y: "ParamAngleY",
  PARAM_ANGLE_Z: "ParamAngleZ",
};

/**
 * Configuration for the PixiJS Live2D renderer
 */
export interface PixiLive2DConfig extends Omit<CubismAdapterConfig, "canvas"> {
  /** Canvas element or ID */
  canvas: string | HTMLCanvasElement;
  /** Pixel ratio for high-DPI displays */
  pixelRatio?: number;
  /** Background color (transparent by default) */
  backgroundColor?: number;
  /** Enable debug mode */
  debug?: boolean;
}

/**
 * Safe logger that avoids recursion when console.log is intercepted.
 * The Cubism4 framework passes console.log as its logFunction, which
 * can cause infinite recursion if console.log has been wrapped by
 * error boundaries, browser extensions, or debugging tools.
 */
const _nativeLog = console.log.bind(console);
const _nativeWarn = console.warn.bind(console);
const _nativeError = console.error.bind(console);

function safeLog(...args: any[]): void {
  try {
    _nativeLog(...args);
  } catch {
    // Silently swallow if even native log fails
  }
}

/**
 * PixiJS-based Live2D model renderer
 *
 * This class provides real Live2D model rendering using the
 * pixi-live2d-display library. It supports:
 * - Expression changes
 * - Motion playback
 * - Real-time lip sync from audio levels
 * - Eye blinking
 */
export class PixiLive2DRenderer implements ICubismRenderer {
  private app: Application | null = null;
  private model: Live2DModel | null = null;
  private config: PixiLive2DConfig | null = null;
  private initialized = false;
  private currentExpression: Expression = "neutral";
  private lipSyncValue = 0;
  private isBlinking = false;
  private blinkTimer: ReturnType<typeof setInterval> | null = null;
  private expressionMap: Record<Expression, string> = DEFAULT_EXPRESSION_MAP;
  private motionMap: Record<AvatarMotion, { groups: string[]; index: number }> =
    DEFAULT_MOTION_MAP;

  /**
   * Wait for the Live2D Cubism Core WASM to be fully initialized.
   * The Cubism Core SDK loads asynchronously via WebAssembly.instantiateStreaming.
   * pixi-live2d-display checks window.Live2DCubismCore at import time.
   */
  private async waitForCubismCore(timeoutMs = 10000): Promise<void> {
    const start = Date.now();
    while (!((window as any).Live2DCubismCore)) {
      if (Date.now() - start > timeoutMs) {
        throw new Error(
          "Live2D Cubism Core SDK not loaded. Ensure live2dcubismcore.min.js is included before the bundle."
        );
      }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    // Also wait for WASM runtime initialization if .then() is available
    const core = (window as any).Live2DCubismCore;
    if (core && typeof core.then === "function") {
      await new Promise<void>((resolve) => {
        core.then(() => resolve());
      });
    }
    safeLog("[PixiLive2DRenderer] Cubism Core WASM ready");
  }

  /**
   * Patch the Cubism4 framework startup to use a safe logger.
   * This prevents the "Maximum call stack size exceeded" crash caused by
   * console.log recursion when the framework's logFunction is called
   * through intercepted console methods.
   */
  private patchCubismStartup(): void {
    try {
      // The Cubism4 framework's startUpCubism4() uses:
      //   { logFunction: console.log, loggingLevel: LogLevel_Verbose }
      // If console.log has been wrapped (by error boundaries, extensions, etc.),
      // this creates infinite recursion. We patch by ensuring the global
      // Live2DCubismCore.Logging uses our safe logger.
      const cubismCore = (window as any).Live2DCubismCore;
      if (cubismCore?.Logging) {
        const origSetLogFunction = cubismCore.Logging.csmSetLogFunction;
        if (origSetLogFunction) {
          cubismCore.Logging.csmSetLogFunction = function(fn: any) {
            // Replace any console.log reference with our safe version
            origSetLogFunction.call(this, safeLog);
          };
        }
      }
    } catch {
      // Non-critical: if patching fails, we'll handle errors downstream
    }
  }

  /**
   * Initialize the renderer with configuration
   */
  async initialize(config: CubismAdapterConfig): Promise<void> {
    this.config = config as PixiLive2DConfig;

    // Wait for Cubism Core WASM to be fully initialized before importing
    // pixi-live2d-display, which checks window.Live2DCubismCore at module level
    await this.waitForCubismCore();

    // Patch Cubism startup to prevent console.log recursion crash
    this.patchCubismStartup();

    // Import @pixi/unsafe-eval BEFORE pixi.js to patch the ShaderSystem.
    // Without this, PixiJS v7 uses new Function() for shader compilation,
    // which is blocked by the CSP policy (script-src 'self' 'wasm-unsafe-eval').
    // @pixi/unsafe-eval replaces this with pre-compiled shader functions.
    await import("@pixi/unsafe-eval");

    // Dynamically import PixiJS and pixi-live2d-display-lipsyncpatch/cubism4.
    // IMPORTANT: We import the /cubism4 sub-export instead of the main entry
    // because the main entry includes Cubism 2 support which throws:
    //   "Could not find Cubism 2 runtime. This plugin requires live2d.min.js"
    // at module level if window.Live2D is not defined. Since we only use
    // Cubism 4 models (.model3.json), the cubism4-only build is sufficient.
    const [{ Application }, { Live2DModel: Live2DModelClass }] =
      await Promise.all([
        import("pixi.js"),
        import("pixi-live2d-display-lipsyncpatch/cubism4"),
      ]);

    // Get or create canvas element
    let canvas: HTMLCanvasElement;
    if (typeof config.canvas === "string") {
      const element = document.getElementById(config.canvas);
      if (!element || !(element instanceof HTMLCanvasElement)) {
        throw new Error(`Canvas element not found: ${config.canvas}`);
      }
      canvas = element;
    } else {
      canvas = config.canvas;
    }

    // Create PixiJS application
    this.app = new Application({
      view: canvas,
      backgroundAlpha: 0,
      antialias: true,
      resolution:
        (config as PixiLive2DConfig).pixelRatio ?? window.devicePixelRatio ?? 1,
      autoDensity: true,
      resizeTo: canvas.parentElement ?? undefined,
    });

    // Register the Live2D ticker for animation updates
    // Note: Type cast needed due to pixi-live2d-display type definitions
    Live2DModelClass.registerTicker(
      this.app.ticker as unknown as typeof import("pixi.js").Ticker,
    );

    // Apply custom expression/motion mappings
    if (config.expressions) {
      this.expressionMap = {
        ...DEFAULT_EXPRESSION_MAP,
        ...(config.expressions as Record<Expression, string>),
      };
    }
    if (config.motions) {
      // Convert config motion map (single group) to internal format (array of groups)
      const convertedMotions: Partial<
        Record<AvatarMotion, { groups: string[]; index: number }>
      > = {};
      for (const [motion, def] of Object.entries(config.motions)) {
        convertedMotions[motion as AvatarMotion] = {
          groups: [def.group], // Wrap single group in array
          index: def.index,
        };
      }
      this.motionMap = {
        ...DEFAULT_MOTION_MAP,
        ...convertedMotions,
      };
    }

    this.initialized = true;
    safeLog("[PixiLive2DRenderer] Initialized successfully");
  }

  /**
   * Load and display a Live2D model
   *
   * Uses fromSync() with event-based loading instead of from() to avoid
   * the "Maximum call stack size exceeded" error. The from() method wraps
   * the entire loading pipeline in a single Promise chain, and if any
   * step triggers console.log recursion, the stack overflow crashes the
   * entire app. With fromSync(), we get the model instance immediately
   * and listen for load/error events separately.
   */
  async loadModel(modelInfo: CubismModelInfo): Promise<void> {
    if (!this.app || !this.initialized) {
      throw new Error("Renderer not initialized");
    }

    // Dynamically import Live2DModel (cubism4-only build)
    const { Live2DModel: Live2DModelClass } = await import(
      "pixi-live2d-display-lipsyncpatch/cubism4"
    );

    // Dispose existing model
    if (this.model) {
      this.model.destroy();
      this.model = null;
    }

    // Use fromSync + event listeners instead of from() to avoid stack overflow.
    // The from() method creates a Promise that resolves after the entire
    // loading pipeline completes, but if Cubism4's startup logging triggers
    // console.log recursion, the stack overflow happens inside the Promise
    // chain and crashes the entire app. fromSync() returns immediately and
    // we handle load/error via events.
    return new Promise<void>((resolve, reject) => {
      const LOAD_TIMEOUT = 45000; // 45s for 13MB texture
      let settled = false;

      const timeoutId = setTimeout(() => {
        if (!settled) {
          settled = true;
          reject(new Error(`Model loading timed out after ${LOAD_TIMEOUT}ms`));
        }
      }, LOAD_TIMEOUT);

      try {
        const model = Live2DModelClass.fromSync(modelInfo.modelPath, {
          autoInteract: true,
          autoUpdate: true,
          ticker: this.app!.ticker,
          onLoad: () => {
            if (settled) return;
            settled = true;
            clearTimeout(timeoutId);

            try {
              this.model = model as unknown as Live2DModel;

              // Position and scale the model
              const scale = modelInfo.scale ?? 0.25;
              model.scale.set(scale, scale);
              model.anchor.set(0.5, 0.5);

              // Center in canvas
              if (this.app?.view) {
                const canvas = this.app.view as HTMLCanvasElement;
                model.x = canvas.width / 2 + (modelInfo.offset?.x ?? 0);
                model.y = canvas.height / 2 + (modelInfo.offset?.y ?? 0);
              }

              // Add to stage
              this.app!.stage.addChild(model as unknown as Container);

              // Start auto-blink
              this.startAutoBlinkLoop();

              safeLog(`[PixiLive2DRenderer] Model loaded: ${modelInfo.name}`);
              resolve();
            } catch (err) {
              const error = err instanceof Error ? err : new Error(String(err));
              _nativeError("[PixiLive2DRenderer] Post-load setup error:", error);
              reject(error);
            }
          },
          onError: (err: any) => {
            if (settled) return;
            settled = true;
            clearTimeout(timeoutId);

            const error = err instanceof Error ? err : new Error(String(err));
            _nativeError("[PixiLive2DRenderer] Model load error:", error);
            reject(error);
          },
        }) as unknown as Live2DModel;

      } catch (err) {
        if (!settled) {
          settled = true;
          clearTimeout(timeoutId);
          const error = err instanceof Error ? err : new Error(String(err));
          _nativeError("[PixiLive2DRenderer] fromSync error:", error);
          reject(error);
        }
      }
    });
  }

  /**
   * Set expression on the model
   */
  setExpression(expression: Expression, intensity: number): void {
    if (!this.model || !this.initialized) return;

    this.currentExpression = expression;
    const expressionName = this.expressionMap[expression] ?? "neutral";

    try {
      // Try to set expression using the expression() method
      this.model.expression(expressionName);

      // Also adjust facial parameters based on intensity
      this.adjustFacialParameters(expression, intensity);

      safeLog(
        `[PixiLive2DRenderer] Expression set: ${expression} (${expressionName}) at ${(
          intensity * 100
        ).toFixed(0)}%`,
      );
    } catch (_error) {
      _nativeWarn(
        "[PixiLive2DRenderer] Expression not available:",
        expressionName,
      );
    }
  }

  /**
   * Adjust facial parameters based on expression and intensity
   */
  private adjustFacialParameters(
    expression: Expression,
    intensity: number,
  ): void {
    if (!this.model?.internalModel?.coreModel) return;

    const core = this.model.internalModel.coreModel;

    // Adjust brows based on expression
    switch (expression) {
      case "happy":
      case "playful":
        this.setParameterSafe(core, PARAM_IDS.PARAM_BROW_L_Y, intensity * 0.5);
        this.setParameterSafe(core, PARAM_IDS.PARAM_BROW_R_Y, intensity * 0.5);
        break;
      case "surprised":
        this.setParameterSafe(core, PARAM_IDS.PARAM_BROW_L_Y, intensity);
        this.setParameterSafe(core, PARAM_IDS.PARAM_BROW_R_Y, intensity);
        break;
      case "concerned":
        this.setParameterSafe(
          core,
          PARAM_IDS.PARAM_BROW_L_Y,
          -intensity * 0.3,
        );
        this.setParameterSafe(
          core,
          PARAM_IDS.PARAM_BROW_R_Y,
          -intensity * 0.3,
        );
        break;
      case "focused":
      case "thinking":
        this.setParameterSafe(
          core,
          PARAM_IDS.PARAM_BROW_L_Y,
          -intensity * 0.2,
        );
        this.setParameterSafe(
          core,
          PARAM_IDS.PARAM_BROW_R_Y,
          -intensity * 0.2,
        );
        break;
      default:
        // Reset to neutral
        this.setParameterSafe(core, PARAM_IDS.PARAM_BROW_L_Y, 0);
        this.setParameterSafe(core, PARAM_IDS.PARAM_BROW_R_Y, 0);
    }
  }

  /**
   * Safely set a parameter value, catching any errors
   */
  private setParameterSafe(
    core: Live2DModel["internalModel"]["coreModel"],
    paramId: string,
    value: number,
  ): void {
    try {
      core.setParameterValueById(paramId, value);
    } catch {
      // Parameter might not exist in this model
    }
  }

  /**
   * Play a motion on the model
   */
  async playMotion(motion: AvatarMotion): Promise<boolean> {
    if (!this.model || !this.initialized) return false;

    const motionDef = this.motionMap[motion];
    if (!motionDef) return false;

    // Try each group name in order
    for (const group of motionDef.groups) {
      try {
        const success = await this.model.motion(
          group,
          motionDef.index,
          2, // priority
        );
        if (success) {
          safeLog(
            `[PixiLive2DRenderer] Motion played: ${motion} (${group}[${motionDef.index}])`,
          );
          return true;
        }
      } catch {
        // This group doesn't exist, try next
        continue;
      }
    }

    return false;
  }

  /**
   * Update lip sync value
   */
  updateLipSync(audioLevel: number): void {
    if (!this.model?.internalModel?.coreModel) return;

    this.lipSyncValue = Math.max(0, Math.min(1, audioLevel));

    try {
      this.model.internalModel.coreModel.setParameterValueById(
        PARAM_IDS.PARAM_MOUTH_OPEN_Y,
        this.lipSyncValue,
      );
    } catch {
      // Lip sync parameter might not be available
    }
  }

  /**
   * Set blinking state
   */
  setBlinking(isBlinking: boolean): void {
    if (!this.model?.internalModel?.coreModel) return;

    this.isBlinking = isBlinking;
    const eyeOpenValue = isBlinking ? 0 : 1;

    try {
      this.model.internalModel.coreModel.setParameterValueById(
        PARAM_IDS.PARAM_EYE_L_OPEN,
        eyeOpenValue,
      );
      this.model.internalModel.coreModel.setParameterValueById(
        PARAM_IDS.PARAM_EYE_R_OPEN,
        eyeOpenValue,
      );
    } catch {
      // Parameters might not be available
    }
  }

  /**
   * Start automatic blink loop
   */
  private startAutoBlinkLoop(): void {
    // Stop existing timer
    if (this.blinkTimer) {
      clearTimeout(this.blinkTimer);
    }

    // Random blink every 2-6 seconds
    const scheduleBlink = () => {
      const delay = 2000 + Math.random() * 4000;
      this.blinkTimer = setTimeout(() => {
        this.performBlink();
        scheduleBlink();
      }, delay);
    };

    scheduleBlink();
  }

  /**
   * Perform a single blink animation
   */
  private performBlink(): void {
    if (!this.model?.internalModel?.coreModel) return;

    const core = this.model.internalModel.coreModel;

    // Close eyes
    this.setParameterSafe(core, PARAM_IDS.PARAM_EYE_L_OPEN, 0);
    this.setParameterSafe(core, PARAM_IDS.PARAM_EYE_R_OPEN, 0);

    // Re-open after 100-150ms
    setTimeout(
      () => {
        this.setParameterSafe(core, PARAM_IDS.PARAM_EYE_L_OPEN, 1);
        this.setParameterSafe(core, PARAM_IDS.PARAM_EYE_R_OPEN, 1);
      },
      100 + Math.random() * 50,
    );
  }

  /**
   * Update model (called in render loop)
   */
  update(_deltaTime: number): void {
    // PixiJS handles updates via the ticker
    // This method is here for interface compatibility
  }

  /**
   * Render the model to canvas
   */
  render(): void {
    // PixiJS handles rendering automatically
    // This method is here for interface compatibility
  }

  /**
   * Clean up resources
   */
  dispose(): void {
    if (this.blinkTimer) {
      clearTimeout(this.blinkTimer);
      this.blinkTimer = null;
    }

    if (this.model) {
      this.model.destroy();
      this.model = null;
    }

    if (this.app) {
      this.app.destroy(true);
      this.app = null;
    }

    this.initialized = false;
    safeLog("[PixiLive2DRenderer] Disposed");
  }

  // === Utility methods ===

  /**
   * Get the current expression
   */
  getExpression(): Expression {
    return this.currentExpression;
  }

  /**
   * Check if renderer is initialized
   */
  isInitialized(): boolean {
    return this.initialized;
  }

  /**
   * Get the loaded model (for advanced usage)
   */
  getModel(): Live2DModel | null {
    return this.model;
  }

  /**
   * Get the PixiJS application (for advanced usage)
   */
  getApplication(): Application | null {
    return this.app;
  }

  /**
   * Set a custom parameter value directly
   */
  setParameter(paramId: string, value: number): void {
    if (!this.model?.internalModel?.coreModel) return;

    try {
      this.model.internalModel.coreModel.setParameterValueById(paramId, value);
    } catch {
      _nativeWarn("[PixiLive2DRenderer] Parameter not found:", paramId);
    }
  }

  /**
   * Get a parameter value
   */
  getParameter(paramId: string): number | undefined {
    if (!this.model?.internalModel?.coreModel) return undefined;
    try {
      return this.model.internalModel.coreModel.getParameterValueById(paramId);
    } catch {
      return undefined;
    }
  }

  /**
   * Manually focus the model's eyes at screen coordinates.
   * Useful for programmatic gaze direction when autoInteract is off.
   * @param x - Screen X coordinate (pixels)
   * @param y - Screen Y coordinate (pixels)
   */
  focusEyes(x: number, y: number): void {
    if (!this.model || !this.initialized) return;
    try {
      this.model.focus(x, y);
    } catch {
      // focus() may not be available on all model versions
    }
  }
}

/**
 * Create a PixiJS Live2D renderer instance
 */
export function createPixiLive2DRenderer(): PixiLive2DRenderer {
  return new PixiLive2DRenderer();
}

/**
 * Export parameter IDs for external use
 */
export { PARAM_IDS };
