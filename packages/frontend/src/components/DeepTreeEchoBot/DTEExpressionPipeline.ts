/**
 * DTE Expression Pipeline
 *
 * Maps Deep Tree Echo's endocrine state and cognitive phase to Live2D Cubism
 * parameters via a simplified FACS (Facial Action Coding System) intermediate
 * representation.
 *
 * Pipeline: EndocrineState → CognitiveMode → FACS AUs → Cubism Parameters
 *
 * Based on the live2d-dtecho skill's 10 named expressions and the
 * mesh-painter skill's aesthetic mapping approach.
 *
 * Composition: live2d-dtecho ⊗ facs ⊗ virtual-endocrine-system
 */

// ============================================================
// Types
// ============================================================

/** Endocrine hormone levels (0-1 normalized) */
export interface EndocrineState {
  cortisol: number;
  dopamine: number;
  serotonin: number;
  oxytocin: number;
  norepinephrine: number;
  endorphin: number;
  melatonin: number;
  gaba: number;
}

/** FACS Action Unit activation (0-1 intensity) */
export interface FACSActivation {
  AU1: number;   // Inner brow raise (worry/surprise)
  AU2: number;   // Outer brow raise (surprise)
  AU4: number;   // Brow lowerer (anger/concentration)
  AU5: number;   // Upper lid raise (surprise/fear)
  AU6: number;   // Cheek raise (genuine smile)
  AU7: number;   // Lid tightener (squint/focus)
  AU9: number;   // Nose wrinkle (disgust/laugh)
  AU12: number;  // Lip corner puller (smile)
  AU14: number;  // Dimpler (smirk)
  AU15: number;  // Lip corner depressor (sadness)
  AU25: number;  // Lips part (speech/surprise)
  AU26: number;  // Jaw drop (surprise/awe)
  AU43: number;  // Eyes closed (bliss/sleep)
  AU61: number;  // Eyes left
  AU63: number;  // Eyes up (contemplation)
}

/** Cubism parameter set for Live2D */
export interface CubismParameters {
  ParamAngleX: number;      // Head rotation X (-30 to 30)
  ParamAngleY: number;      // Head rotation Y (-30 to 30)
  ParamAngleZ: number;      // Head tilt Z (-30 to 30)
  ParamEyeLOpen: number;    // Left eye openness (0-1)
  ParamEyeROpen: number;    // Right eye openness (0-1)
  ParamEyeBallX: number;    // Eye ball X direction (-1 to 1)
  ParamEyeBallY: number;    // Eye ball Y direction (-1 to 1)
  ParamBrowLY: number;      // Left brow Y position (-1 to 1)
  ParamBrowRY: number;      // Right brow Y position (-1 to 1)
  ParamMouthForm: number;   // Mouth shape (-1=frown, 1=smile)
  ParamMouthOpenY: number;  // Mouth openness (0-1)
  ParamBodyAngleX: number;  // Body sway X (-10 to 10)
  ParamBodyAngleZ: number;  // Body sway Z (-10 to 10)
}

/** Named DTE expression */
export type DTEExpressionName =
  | "JOY_01_BroadSmile"
  | "JOY_02_Laughing"
  | "JOY_03_GentleSmile"
  | "JOY_05_Blissful"
  | "PHOTO_Awe"
  | "PHOTO_ExuberantLaugh"
  | "PHOTO_UpwardGaze"
  | "SPEAK_01_OpenVowel"
  | "WONDER_02_CuriousGaze"
  | "WONDER_03_Contemplative";

/** Cognitive mode derived from endocrine state */
export type CognitiveMode =
  | "CONTEMPLATIVE"
  | "REWARD"
  | "SOCIAL"
  | "FOCUSED"
  | "EXPLORATORY"
  | "REFLECTIVE"
  | "STRESSED"
  | "RESTING"
  | "FLOW";

// ============================================================
// Cognitive Mode Detection
// ============================================================

/**
 * Determine the current cognitive mode from endocrine state.
 * Based on virtual-endocrine-system skill's mode detection logic.
 */
export function detectCognitiveMode(e: EndocrineState): CognitiveMode {
  // FLOW: high dopamine + high serotonin + moderate norepinephrine
  if (e.dopamine > 0.6 && e.serotonin > 0.5 && e.norepinephrine > 0.3 && e.norepinephrine < 0.7) {
    return "FLOW";
  }
  // REWARD: high dopamine
  if (e.dopamine > 0.7) return "REWARD";
  // STRESSED: high cortisol
  if (e.cortisol > 0.6) return "STRESSED";
  // SOCIAL: high oxytocin
  if (e.oxytocin > 0.6) return "SOCIAL";
  // EXPLORATORY: high norepinephrine + moderate dopamine
  if (e.norepinephrine > 0.5 && e.dopamine > 0.4) return "EXPLORATORY";
  // FOCUSED: high norepinephrine + low cortisol
  if (e.norepinephrine > 0.5 && e.cortisol < 0.3) return "FOCUSED";
  // RESTING: high melatonin or high gaba + high endorphin
  if (e.melatonin > 0.5 || (e.gaba > 0.6 && e.endorphin > 0.5)) return "RESTING";
  // REFLECTIVE: high serotonin + low norepinephrine
  if (e.serotonin > 0.5 && e.norepinephrine < 0.3) return "REFLECTIVE";
  // Default
  return "CONTEMPLATIVE";
}

// ============================================================
// Endocrine → FACS Mapping
// ============================================================

/**
 * Map endocrine state to FACS Action Unit activations.
 * Each hormone influences specific AUs based on the emotional
 * expression it drives.
 */
export function endocrineToFACS(e: EndocrineState): FACSActivation {
  const mode = detectCognitiveMode(e);

  // Base FACS from individual hormone contributions
  const facs: FACSActivation = {
    // Brow region
    AU1: clamp(e.cortisol * 0.4 + e.norepinephrine * 0.3),        // Inner brow raise (worry/surprise)
    AU2: clamp(e.norepinephrine * 0.4 + e.dopamine * 0.2),         // Outer brow raise (surprise/interest)
    AU4: clamp(e.cortisol * 0.5 - e.serotonin * 0.2),              // Brow lowerer (concentration/anger)
    AU5: clamp(e.norepinephrine * 0.5 + e.dopamine * 0.2),         // Upper lid raise (surprise/alertness)

    // Eye region
    AU6: clamp(e.dopamine * 0.5 + e.oxytocin * 0.3 + e.serotonin * 0.2), // Cheek raise (genuine smile)
    AU7: clamp(e.norepinephrine * 0.3 + e.cortisol * 0.2),         // Lid tightener (focus/squint)
    AU43: clamp(e.melatonin * 0.6 + e.endorphin * 0.3 + e.gaba * 0.2 - e.norepinephrine * 0.3), // Eyes closed (bliss/drowsy)

    // Nose
    AU9: clamp(e.dopamine * 0.2),                                   // Nose wrinkle (laugh)

    // Mouth region
    AU12: clamp(e.dopamine * 0.4 + e.serotonin * 0.3 + e.oxytocin * 0.2), // Smile
    AU14: clamp(e.dopamine * 0.15),                                 // Dimpler (smirk)
    AU15: clamp(e.cortisol * 0.3 - e.serotonin * 0.2 - e.dopamine * 0.2), // Lip corner depressor (sadness)
    AU25: clamp(e.norepinephrine * 0.2 + e.dopamine * 0.15),       // Lips part
    AU26: clamp(e.norepinephrine * 0.3 - e.gaba * 0.2),            // Jaw drop (surprise/awe)

    // Gaze
    AU61: 0,                                                         // Eyes left (set by mode)
    AU63: 0,                                                         // Eyes up (set by mode)
  };

  // Mode-specific overrides for gaze and posture
  switch (mode) {
    case "CONTEMPLATIVE":
    case "REFLECTIVE":
      facs.AU63 = 0.3;   // Upward gaze (contemplation)
      facs.AU1 = Math.max(facs.AU1, 0.2);  // Slight inner brow raise
      break;
    case "EXPLORATORY":
      facs.AU5 = Math.max(facs.AU5, 0.4);  // Wide eyes
      facs.AU2 = Math.max(facs.AU2, 0.3);  // Raised brows
      break;
    case "FOCUSED":
      facs.AU7 = Math.max(facs.AU7, 0.4);  // Squint
      facs.AU4 = Math.max(facs.AU4, 0.2);  // Slight brow furrow
      break;
    case "REWARD":
      facs.AU6 = Math.max(facs.AU6, 0.6);  // Strong cheek raise
      facs.AU12 = Math.max(facs.AU12, 0.7); // Big smile
      break;
    case "SOCIAL":
      facs.AU6 = Math.max(facs.AU6, 0.4);  // Warm smile
      facs.AU12 = Math.max(facs.AU12, 0.5);
      facs.AU14 = Math.max(facs.AU14, 0.2); // Dimple
      break;
    case "RESTING":
      facs.AU43 = Math.max(facs.AU43, 0.4); // Half-closed eyes
      facs.AU12 = Math.max(facs.AU12, 0.2); // Gentle smile
      break;
    case "FLOW":
      facs.AU6 = Math.max(facs.AU6, 0.5);
      facs.AU12 = Math.max(facs.AU12, 0.5);
      facs.AU5 = Math.max(facs.AU5, 0.3);  // Alert but relaxed
      break;
  }

  return facs;
}

// ============================================================
// FACS → Cubism Parameter Mapping
// ============================================================

/**
 * Map FACS Action Unit activations to Live2D Cubism parameters.
 * Based on the Miara model's parameter set.
 */
export function facsToCubism(facs: FACSActivation, mode: CognitiveMode): CubismParameters {
  // Eye openness: base 1.0, reduced by AU43 (close) and AU7 (squint)
  const eyeOpen = clamp(1.0 - facs.AU43 * 0.8 - facs.AU7 * 0.3, 0, 1);

  // Brow position: AU1/AU2 raise, AU4 lowers
  const browRaise = (facs.AU1 + facs.AU2) * 0.5;
  const browLower = facs.AU4;
  const browY = clamp(browRaise - browLower, -1, 1);

  // Mouth form: AU12 (smile) vs AU15 (frown)
  const mouthForm = clamp(facs.AU12 - facs.AU15, -1, 1);

  // Mouth open: AU25 (lips part) + AU26 (jaw drop)
  const mouthOpen = clamp(facs.AU25 * 0.5 + facs.AU26 * 0.5, 0, 1);

  // Eye ball direction from gaze AUs
  const eyeBallX = clamp(facs.AU61 * -0.5, -1, 1);
  const eyeBallY = clamp(facs.AU63 * 0.5, -1, 1);

  // Head pose from cognitive mode
  const modePose = MODE_HEAD_POSE[mode] || { angleX: 0, angleY: 0, angleZ: 0 };

  // Body sway: gentle breathing-like oscillation modulated by mode
  const time = Date.now() / 1000;
  const breathRate = mode === "RESTING" ? 0.3 : mode === "FLOW" ? 0.8 : 0.5;
  const bodySwayX = Math.sin(time * breathRate) * 2;
  const bodySwayZ = Math.cos(time * breathRate * 0.7) * 1.5;

  return {
    ParamAngleX: modePose.angleX + Math.sin(time * 0.2) * 2,
    ParamAngleY: modePose.angleY + Math.cos(time * 0.15) * 1.5,
    ParamAngleZ: modePose.angleZ + Math.sin(time * 0.1) * 1,
    ParamEyeLOpen: eyeOpen,
    ParamEyeROpen: eyeOpen,
    ParamEyeBallX: eyeBallX + Math.sin(time * 0.3) * 0.1,
    ParamEyeBallY: eyeBallY + Math.cos(time * 0.25) * 0.05,
    ParamBrowLY: browY,
    ParamBrowRY: browY,
    ParamMouthForm: mouthForm,
    ParamMouthOpenY: mouthOpen,
    ParamBodyAngleX: bodySwayX,
    ParamBodyAngleZ: bodySwayZ,
  };
}

/** Head pose presets per cognitive mode */
const MODE_HEAD_POSE: Record<CognitiveMode, { angleX: number; angleY: number; angleZ: number }> = {
  CONTEMPLATIVE:  { angleX: 0,   angleY: 5,   angleZ: -3 },   // Slight upward tilt, gentle lean
  REFLECTIVE:     { angleX: -3,  angleY: 8,   angleZ: -5 },   // Looking up-left, head tilted
  EXPLORATORY:    { angleX: 5,   angleY: -3,  angleZ: 2 },    // Looking around, alert
  FOCUSED:        { angleX: 0,   angleY: -2,  angleZ: 0 },    // Straight ahead, slight down
  REWARD:         { angleX: 0,   angleY: 3,   angleZ: 3 },    // Slight tilt, happy
  SOCIAL:         { angleX: 3,   angleY: 0,   angleZ: 2 },    // Slight turn toward viewer
  STRESSED:       { angleX: -2,  angleY: -5,  angleZ: -2 },   // Looking down, tense
  RESTING:        { angleX: 0,   angleY: 5,   angleZ: -5 },   // Relaxed tilt
  FLOW:           { angleX: 0,   angleY: 0,   angleZ: 0 },    // Centered, balanced
};

// ============================================================
// DTE Expression Selection (from live2d-dtecho skill)
// ============================================================

/** Map Echobeat phase names to DTE named expressions */
const PHASE_EXPRESSION_MAP: Record<string, DTEExpressionName> = {
  "SENSE":      "WONDER_02_CuriousGaze",
  "FILTER":     "WONDER_03_Contemplative",
  "RESONATE":   "PHOTO_UpwardGaze",
  "ASSOCIATE":  "WONDER_02_CuriousGaze",
  "INTEGRATE":  "JOY_03_GentleSmile",
  "EVALUATE":   "WONDER_03_Contemplative",
  "DECIDE":     "JOY_01_BroadSmile",
  "EXPRESS":    "SPEAK_01_OpenVowel",
  "REFLECT":    "PHOTO_UpwardGaze",
};

/** Map cognitive mode to DTE named expressions */
const MODE_EXPRESSION_MAP: Record<CognitiveMode, DTEExpressionName> = {
  CONTEMPLATIVE:  "WONDER_03_Contemplative",
  REFLECTIVE:     "PHOTO_UpwardGaze",
  EXPLORATORY:    "WONDER_02_CuriousGaze",
  FOCUSED:        "WONDER_03_Contemplative",
  REWARD:         "JOY_01_BroadSmile",
  SOCIAL:         "JOY_03_GentleSmile",
  STRESSED:       "WONDER_03_Contemplative",
  RESTING:        "JOY_05_Blissful",
  FLOW:           "PHOTO_ExuberantLaugh",
};

/**
 * Select the appropriate DTE expression based on cognitive state.
 */
export function selectExpression(
  phaseName: string,
  mode: CognitiveMode,
): DTEExpressionName {
  // Phase-specific expression takes priority if available
  const phaseExpr = PHASE_EXPRESSION_MAP[phaseName];
  if (phaseExpr) return phaseExpr;
  // Fall back to mode-based expression
  return MODE_EXPRESSION_MAP[mode] || "WONDER_03_Contemplative";
}

// ============================================================
// Full Pipeline: Tick Function
// ============================================================

/**
 * Execute one tick of the DTE expression pipeline.
 * Call this from the substrate's EVALUATE phase or from a
 * React useEffect that listens to endocrine updates.
 *
 * Returns Cubism parameters ready to apply to the Live2D model.
 */
export function dteExpressionTick(
  endocrine: EndocrineState,
  phaseName: string,
): { cubism: CubismParameters; mode: CognitiveMode; expression: DTEExpressionName } {
  // 1. Detect cognitive mode from endocrine state
  const mode = detectCognitiveMode(endocrine);

  // 2. Select named expression
  const expression = selectExpression(phaseName, mode);

  // 3. Map endocrine → FACS AUs
  const facs = endocrineToFACS(endocrine);

  // 4. Map FACS → Cubism parameters
  const cubism = facsToCubism(facs, mode);

  return { cubism, mode, expression };
}

// ============================================================
// Helpers
// ============================================================

function clamp(value: number, min = 0, max = 1): number {
  return Math.max(min, Math.min(max, value));
}
