/**
 * Character Instance for Deep Tree Echo Avatar
 *
 * A running instance of a character, composing:
 *   CharacterInstance = Live2DRenderer ⊗ EndocrineSystem ⊗ ExpressionBridge ⊗ CognitiveDriver
 *
 * This is the top-level object that the UI components interact with.
 * It owns the tick loop that drives the endocrine system, evaluates
 * expression rules, and applies Cubism parameters to the Live2D model.
 *
 * Usage:
 *   const instance = createCharacterInstance('dtecho');
 *   instance.start();
 *   instance.updateCognitive({ emotionalValence: 0.5, ... });
 *   // Later:
 *   instance.stop();
 *   instance.dispose();
 */

import { EndocrineSystem } from "./endocrine-system";
import {
  EndocrineExpressionBridge,
  type BridgeResult,
} from "./endocrine-expression-bridge";
import {
  DTECognitiveDriver,
  type DTECognitiveInput,
} from "./dte-cognitive-driver";
import {
  characterRegistry,
  type CharacterManifest,
} from "./character-registry";

/**
 * Callback for applying Cubism parameters to the Live2D model
 */
export type ParameterApplier = (params: Record<string, number>) => void;

/**
 * Character instance state (for UI display)
 */
export interface CharacterInstanceState {
  characterId: string;
  characterName: string;
  isRunning: boolean;
  cognitiveMode: string;
  activeExpressions: string[];
  hormoneSnapshot: Record<string, number>;
  tickCount: number;
}

/**
 * Character Instance: a running avatar with endocrine-driven expressions
 */
export class CharacterInstance {
  readonly manifest: CharacterManifest;
  readonly endocrine: EndocrineSystem;
  readonly bridge: EndocrineExpressionBridge;
  readonly driver: DTECognitiveDriver;

  private tickInterval: ReturnType<typeof setInterval> | null = null;
  private parameterApplier: ParameterApplier | null = null;
  private _isRunning = false;
  private _tickCount = 0;
  private _lastResult: BridgeResult | null = null;

  constructor(manifest: CharacterManifest) {
    this.manifest = manifest;

    // Create endocrine system with character-specific baselines and sensitivity
    this.endocrine = new EndocrineSystem({
      baselines: manifest.endocrine.baselines,
      sensitivity: manifest.endocrine.sensitivity,
    });

    // Create expression bridge with character-specific rules
    this.bridge = new EndocrineExpressionBridge(manifest, 0.3);

    // Create cognitive driver connected to the endocrine system
    this.driver = new DTECognitiveDriver(this.endocrine);
  }

  /**
   * Set the parameter applier callback
   * This is called every tick with the computed Cubism parameters
   */
  setParameterApplier(applier: ParameterApplier): void {
    this.parameterApplier = applier;
  }

  /**
   * Start the tick loop
   */
  start(): void {
    if (this._isRunning) return;
    this._isRunning = true;

    const tickMs = this.manifest.simulation.tickIntervalMs;
    const dtSeconds = tickMs / 1000;

    this.tickInterval = setInterval(() => {
      this.tick(dtSeconds);
    }, tickMs);
  }

  /**
   * Stop the tick loop
   */
  stop(): void {
    if (!this._isRunning) return;
    this._isRunning = false;

    if (this.tickInterval) {
      clearInterval(this.tickInterval);
      this.tickInterval = null;
    }
  }

  /**
   * Perform a single tick of the character simulation
   */
  tick(dt: number): void {
    // 1. Tick the endocrine system (hormone decay/accumulation)
    this.endocrine.tick(dt);

    // 2. Evaluate expression bridge (hormones → Cubism parameters)
    const result = this.bridge.evaluate(this.endocrine);
    this._lastResult = result;

    // 3. Apply parameters to Live2D model
    if (this.parameterApplier) {
      this.parameterApplier(result.parameters);
    }

    this._tickCount++;
  }

  /**
   * Update from cognitive state
   */
  updateCognitive(input: DTECognitiveInput): void {
    this.driver.update(input);
  }

  /**
   * Get the current state for UI display
   */
  getState(): CharacterInstanceState {
    return {
      characterId: this.manifest.id,
      characterName: this.manifest.displayName,
      isRunning: this._isRunning,
      cognitiveMode: this._lastResult?.mode ?? "RESTING",
      activeExpressions: this._lastResult?.activeRules ?? [],
      hormoneSnapshot: { ...this.endocrine.getState() },
      tickCount: this._tickCount,
    };
  }

  /**
   * Get the last bridge result
   */
  getLastResult(): BridgeResult | null {
    return this._lastResult;
  }

  /**
   * Check if running
   */
  get isRunning(): boolean {
    return this._isRunning;
  }

  /**
   * Dispose of all resources
   */
  dispose(): void {
    this.stop();
    this.endocrine.reset();
    this.bridge.reset();
    this.parameterApplier = null;
  }
}

/**
 * Create a character instance from a registered character ID
 */
export function createCharacterInstance(
  characterId: string = "dtecho",
): CharacterInstance {
  const manifest = characterRegistry.get(characterId);
  if (!manifest) {
    throw new Error(
      `Character "${characterId}" not found in registry. Available: ${characterRegistry.list().join(", ")}`,
    );
  }
  return new CharacterInstance(manifest);
}
