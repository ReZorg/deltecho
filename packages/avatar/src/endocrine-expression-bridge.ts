/**
 * Endocrine-Expression Bridge for Deep Tree Echo Avatar
 *
 * Maps the 16-channel hormone state from the EndocrineSystem to Live2D
 * Cubism parameters, creating biologically-inspired facial expressions.
 *
 * Composition: live2d-char-model ⊗ virtual-endocrine-system ⊗ live2d-avatar
 *
 * The bridge evaluates character-specific expression rules against the
 * current hormone state, blends matching rules by priority, and applies
 * the resulting Cubism parameters to the Live2D model.
 *
 * Also maps cognitive modes to motion groups for body animation.
 */

import type {
  EndocrineSystem,
  HormoneState,
  CognitiveMode,
} from "./endocrine-system";
import type {
  CharacterManifest,
  CubismExpressionRule,
} from "./character-registry";

/**
 * Cubism parameter values computed by the bridge
 */
export type CubismParameterMap = Record<string, number>;

/**
 * Result of bridge evaluation
 */
export interface BridgeResult {
  /** Computed Cubism parameter values */
  parameters: CubismParameterMap;
  /** Active expression rules (matched conditions) */
  activeRules: string[];
  /** Current cognitive mode */
  mode: CognitiveMode;
  /** Suggested motion group for the current mode */
  suggestedMotionGroup: string | null;
}

/**
 * Cognitive mode → head/gaze pose overlays
 * These subtle poses are added on top of expression parameters
 */
const MODE_POSE: Record<CognitiveMode, CubismParameterMap> = {
  RESTING: { ParamAngleX: 0, ParamAngleY: 3, ParamAngleZ: 2 },
  FOCUSED: { ParamAngleX: 0, ParamAngleY: -3, ParamAngleZ: 0 },
  REWARD: { ParamAngleX: 0, ParamAngleY: 0, ParamAngleZ: 3 },
  SOCIAL: { ParamAngleX: 5, ParamAngleY: 0, ParamAngleZ: 5 },
  VIGILANT: { ParamAngleX: 0, ParamAngleY: -5, ParamAngleZ: 0 },
  STRESSED: { ParamAngleX: -3, ParamAngleY: -2, ParamAngleZ: -3 },
  THREAT: { ParamAngleX: 0, ParamAngleY: -8, ParamAngleZ: 0 },
  REFLECTIVE: { ParamAngleX: -5, ParamAngleY: 5, ParamAngleZ: 3 },
  EXPLORATORY: { ParamAngleX: 8, ParamAngleY: -3, ParamAngleZ: 0 },
};

/**
 * Evaluate a single condition against the hormone state
 */
function evaluateCondition(
  hormoneState: Readonly<HormoneState>,
  condition: CubismExpressionRule["conditions"][0],
): boolean {
  const level = (hormoneState as Record<string, number>)[condition.hormone] ?? 0;
  switch (condition.operator) {
    case ">":
      return level > condition.threshold;
    case "<":
      return level < condition.threshold;
    case ">=":
      return level >= condition.threshold;
    case "<=":
      return level <= condition.threshold;
    default:
      return false;
  }
}

/**
 * Evaluate all conditions of a rule (AND logic)
 */
function evaluateRule(
  hormoneState: Readonly<HormoneState>,
  rule: CubismExpressionRule,
): boolean {
  return rule.conditions.every((c) => evaluateCondition(hormoneState, c));
}

/**
 * Endocrine-Expression Bridge
 *
 * Evaluates character expression rules against hormone state and produces
 * Cubism parameter values for the Live2D model.
 */
export class EndocrineExpressionBridge {
  private manifest: CharacterManifest;
  private previousParameters: CubismParameterMap = {};
  private smoothingFactor: number;

  /**
   * @param manifest - Character manifest with expression rules
   * @param smoothingFactor - 0-1, higher = smoother transitions (0.3 recommended)
   */
  constructor(manifest: CharacterManifest, smoothingFactor: number = 0.3) {
    this.manifest = manifest;
    this.smoothingFactor = smoothingFactor;
  }

  /**
   * Evaluate the bridge: compute Cubism parameters from endocrine state
   */
  evaluate(endocrine: EndocrineSystem): BridgeResult {
    const hormoneState = endocrine.getState();
    const mode = endocrine.currentMode();

    // Evaluate all expression rules
    const matchedRules = this.manifest.cubismExpressionMap
      .filter((rule) => evaluateRule(hormoneState, rule))
      .sort((a, b) => b.priority - a.priority);

    // Blend matched rules: higher priority rules dominate
    const blended = this.blendRules(matchedRules);

    // Add cognitive mode pose overlay
    const modePose = MODE_POSE[mode] ?? {};
    const combined = { ...blended };
    for (const [param, value] of Object.entries(modePose)) {
      combined[param] = (combined[param] ?? 0) + value * 0.3; // Mode pose is subtle
    }

    // Apply smoothing for natural transitions
    const smoothed = this.smooth(combined);

    // Determine suggested motion group
    const suggestedMotionGroup = this.findMotionGroup(mode);

    return {
      parameters: smoothed,
      activeRules: matchedRules.map((r) => r.name),
      mode,
      suggestedMotionGroup,
    };
  }

  /**
   * Blend multiple matched expression rules
   * Higher priority rules contribute more; lower priority rules fill gaps
   */
  private blendRules(rules: CubismExpressionRule[]): CubismParameterMap {
    if (rules.length === 0) {
      // No rules matched: return neutral defaults
      return {
        ParamMouthForm: 0,
        ParamMouthOpenY: 0,
        ParamEyeLOpen: 0.8,
        ParamEyeROpen: 0.8,
        ParamBrowLY: 0,
        ParamBrowRY: 0,
      };
    }

    const result: CubismParameterMap = {};
    const paramWeights: Record<string, number> = {};

    // Total priority for normalization
    const totalPriority = rules.reduce((sum, r) => sum + r.priority, 0);

    for (const rule of rules) {
      const weight = rule.priority / totalPriority;

      for (const [param, value] of Object.entries(rule.parameters)) {
        if (!(param in result)) {
          result[param] = 0;
          paramWeights[param] = 0;
        }
        result[param] += value * weight;
        paramWeights[param] += weight;
      }
    }

    // Normalize by accumulated weight per parameter
    for (const param of Object.keys(result)) {
      if (paramWeights[param] > 0) {
        result[param] /= paramWeights[param];
      }
    }

    return result;
  }

  /**
   * Apply exponential smoothing for natural transitions
   */
  private smooth(target: CubismParameterMap): CubismParameterMap {
    const result: CubismParameterMap = {};
    const factor = this.smoothingFactor;

    // Get all parameter keys from both previous and target
    const allKeys = new Set([
      ...Object.keys(this.previousParameters),
      ...Object.keys(target),
    ]);

    for (const key of allKeys) {
      const prev = this.previousParameters[key] ?? 0;
      const tgt = target[key] ?? 0;
      result[key] = prev * factor + tgt * (1 - factor);
    }

    this.previousParameters = result;
    return result;
  }

  /**
   * Find the best motion group for the current cognitive mode
   */
  private findMotionGroup(mode: CognitiveMode): string | null {
    for (const [group, modes] of Object.entries(this.manifest.motionMap)) {
      if (modes.includes(mode)) {
        return group;
      }
    }
    return null;
  }

  /**
   * Update the character manifest (e.g., when switching characters)
   */
  setManifest(manifest: CharacterManifest): void {
    this.manifest = manifest;
    this.previousParameters = {};
  }

  /**
   * Reset smoothing state
   */
  reset(): void {
    this.previousParameters = {};
  }
}
