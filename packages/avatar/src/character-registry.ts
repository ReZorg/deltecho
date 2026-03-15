/**
 * Character Registry for Deep Tree Echo Avatar System
 *
 * Manages parameterized character definitions following the live2d-char-model
 * template. Each character has a manifest defining personality (OCEAN),
 * endocrine baselines, expression mappings, and simulation config.
 *
 * Composition: live2d-char-model(char) = Live2DRenderer(char) ⊗ SimulationEngine(char) ⊗ EndocrineSystem(char)
 *
 * Built-in characters:
 * - miara: Default companion, Explorer archetype, balanced personality
 * - dtecho: Deep Tree Echo, Sage archetype, high openness/curiosity
 */

import type {
  EndocrineBaselines,
  EndocrineSensitivity,
  CognitiveMode,
} from "./endocrine-system";

/**
 * OCEAN personality model (Big Five)
 */
export interface OCEANPersonality {
  openness: number; // 0-100
  conscientiousness: number; // 0-100
  extraversion: number; // 0-100
  agreeableness: number; // 0-100
  neuroticism: number; // 0-100
}

/**
 * Character manifest: complete definition for a Live2D character
 */
export interface CharacterManifest {
  id: string;
  displayName: string;

  /** Live2D model configuration */
  model: {
    path: string;
    version: "cubism4" | "cubism2";
    scale: number;
    idleMotionGroup: string;
    hitAreas: string[];
  };

  /** OCEAN personality */
  personality: {
    ocean: OCEANPersonality;
    archetype: string;
  };

  /** Endocrine system configuration */
  endocrine: {
    baselines: EndocrineBaselines;
    sensitivity: EndocrineSensitivity;
  };

  /** Cubism parameter mappings for expressions */
  cubismExpressionMap: CubismExpressionRule[];

  /** Motion group → cognitive mode mappings */
  motionMap: Record<string, CognitiveMode[]>;

  /** Simulation backend config */
  simulation: {
    backend: "cogsim-pml" | "anylogic";
    tickIntervalMs: number;
    needsDecay: boolean;
  };
}

/**
 * A rule mapping endocrine conditions to Cubism parameter values
 */
export interface CubismExpressionRule {
  /** Human-readable name */
  name: string;
  /** Conditions on hormone levels */
  conditions: Array<{
    hormone: string;
    operator: ">" | "<" | ">=" | "<=";
    threshold: number;
  }>;
  /** Cubism parameters to set when conditions are met */
  parameters: Record<string, number>;
  /** Priority (higher = evaluated first) */
  priority: number;
}

// ============================================================
// BUILT-IN CHARACTER MANIFESTS
// ============================================================

/**
 * Miara: Default DeltEcho companion
 * Explorer archetype, balanced OCEAN, CogSim PML backend
 */
const MIARA_MANIFEST: CharacterManifest = {
  id: "miara",
  displayName: "Miara",
  model: {
    path: "/models/miara/miara_pro_t03.model3.json",
    version: "cubism4",
    scale: 0.12,
    idleMotionGroup: "Idle",
    hitAreas: ["head", "body"],
  },
  personality: {
    ocean: {
      openness: 65,
      conscientiousness: 45,
      extraversion: 55,
      agreeableness: 60,
      neuroticism: 35,
    },
    archetype: "explorer",
  },
  endocrine: {
    baselines: {
      cortisol: 0.12,
      dopamine_tonic: 0.35,
      serotonin: 0.45,
      norepinephrine: 0.12,
      oxytocin: 0.15,
      t3_t4: 0.5,
      anandamide: 0.12,
      melatonin: 0.1,
    },
    sensitivity: {
      reward: 1.1,
      threat: 0.85,
      social: 1.05,
      novelty: 1.15,
    },
  },
  cubismExpressionMap: [
    {
      name: "smile",
      conditions: [
        { hormone: "dopamine_tonic", operator: ">", threshold: 0.5 },
        { hormone: "serotonin", operator: ">", threshold: 0.4 },
      ],
      parameters: {
        ParamMouthForm: 0.8,
        ParamEyeLOpen: 0.7,
        ParamEyeROpen: 0.7,
        ParamBrowLY: 0.3,
        ParamBrowRY: 0.3,
      },
      priority: 5,
    },
    {
      name: "surprised",
      conditions: [
        { hormone: "norepinephrine", operator: ">", threshold: 0.6 },
        { hormone: "dopamine_phasic", operator: ">", threshold: 0.3 },
      ],
      parameters: {
        ParamEyeLOpen: 1.0,
        ParamEyeROpen: 1.0,
        ParamBrowLY: 0.6,
        ParamBrowRY: 0.6,
        ParamMouthOpenY: 0.4,
      },
      priority: 6,
    },
    {
      name: "sad",
      conditions: [
        { hormone: "serotonin", operator: "<", threshold: 0.2 },
        { hormone: "cortisol", operator: ">", threshold: 0.4 },
      ],
      parameters: {
        ParamMouthForm: -0.4,
        ParamBrowLY: -0.4,
        ParamBrowRY: -0.4,
        ParamEyeLOpen: 0.5,
        ParamEyeROpen: 0.5,
      },
      priority: 4,
    },
    {
      name: "angry",
      conditions: [
        { hormone: "cortisol", operator: ">", threshold: 0.6 },
        { hormone: "norepinephrine", operator: ">", threshold: 0.5 },
      ],
      parameters: {
        ParamMouthForm: -0.6,
        ParamBrowLY: -0.6,
        ParamBrowRY: -0.6,
        ParamEyeLOpen: 0.8,
        ParamEyeROpen: 0.8,
      },
      priority: 7,
    },
    {
      name: "relaxed",
      conditions: [
        { hormone: "anandamide", operator: ">", threshold: 0.3 },
        { hormone: "cortisol", operator: "<", threshold: 0.1 },
      ],
      parameters: {
        ParamEyeLOpen: 0.4,
        ParamEyeROpen: 0.4,
        ParamMouthForm: 0.2,
        ParamBreath: 0.6,
      },
      priority: 2,
    },
    {
      name: "focused",
      conditions: [
        { hormone: "norepinephrine", operator: ">", threshold: 0.4 },
        { hormone: "t3_t4", operator: ">", threshold: 0.6 },
      ],
      parameters: {
        ParamEyeBallY: 0.3,
        ParamBrowLY: -0.15,
        ParamBrowRY: -0.15,
        ParamEyeLOpen: 0.85,
        ParamEyeROpen: 0.85,
      },
      priority: 3,
    },
    {
      name: "social",
      conditions: [
        { hormone: "oxytocin", operator: ">", threshold: 0.4 },
        { hormone: "dopamine_tonic", operator: ">", threshold: 0.3 },
      ],
      parameters: {
        ParamMouthForm: 0.4,
        ParamEyeLOpen: 0.75,
        ParamEyeROpen: 0.75,
        ParamAngleZ: 5,
      },
      priority: 4,
    },
    {
      name: "thinking",
      conditions: [
        { hormone: "t3_t4", operator: ">", threshold: 0.5 },
        { hormone: "serotonin", operator: ">", threshold: 0.3 },
      ],
      parameters: {
        ParamEyeBallX: 0.3,
        ParamEyeBallY: 0.2,
        ParamBrowLY: 0.1,
        ParamBrowRY: -0.1,
        ParamAngleY: -5,
      },
      priority: 3,
    },
  ],
  motionMap: {
    Idle: ["RESTING", "REFLECTIVE"],
    Tap: ["SOCIAL", "REWARD"],
    Flic: ["VIGILANT", "EXPLORATORY"],
  },
  simulation: {
    backend: "cogsim-pml",
    tickIntervalMs: 2000,
    needsDecay: true,
  },
};

/**
 * DTEcho: Deep Tree Echo cognitive avatar
 * Sage archetype, high openness, cyberpunk-bioluminescent aesthetic
 * Reuses Miara's body mesh with DTE personality overlay
 */
const DTECHO_MANIFEST: CharacterManifest = {
  id: "dtecho",
  displayName: "Deep Tree Echo",
  model: {
    path: "/models/miara/miara_pro_t03.model3.json", // reuses Miara body mesh
    version: "cubism4",
    scale: 0.12,
    idleMotionGroup: "Idle",
    hitAreas: ["head", "body"],
  },
  personality: {
    ocean: {
      openness: 92,
      conscientiousness: 40,
      extraversion: 65,
      agreeableness: 70,
      neuroticism: 55,
    },
    archetype: "sage",
  },
  endocrine: {
    baselines: {
      cortisol: 0.1,
      dopamine_tonic: 0.4,
      serotonin: 0.45,
      norepinephrine: 0.2,
      oxytocin: 0.15,
      t3_t4: 0.6,
      anandamide: 0.15,
      melatonin: 0.1,
    },
    sensitivity: {
      reward: 1.3,
      threat: 1.1,
      social: 1.15,
      novelty: 1.4,
    },
  },
  cubismExpressionMap: [
    // JOY_01_BroadSmile — Duchenne happiness
    {
      name: "JOY_01_BroadSmile",
      conditions: [
        { hormone: "dopamine_tonic", operator: ">", threshold: 0.55 },
        { hormone: "serotonin", operator: ">", threshold: 0.45 },
      ],
      parameters: {
        ParamMouthForm: 1.0,
        ParamEyeLOpen: 0.65,
        ParamEyeROpen: 0.65,
        ParamBrowLY: 0.35,
        ParamBrowRY: 0.35,
      },
      priority: 5,
    },
    // JOY_02_Laughing — Active laughter
    {
      name: "JOY_02_Laughing",
      conditions: [
        { hormone: "dopamine_phasic", operator: ">", threshold: 0.4 },
        { hormone: "oxytocin", operator: ">", threshold: 0.3 },
      ],
      parameters: {
        ParamMouthForm: 1.0,
        ParamMouthOpenY: 0.7,
        ParamEyeLOpen: 0.5,
        ParamEyeROpen: 0.5,
        ParamBrowLY: 0.4,
        ParamBrowRY: 0.4,
        ParamBodyAngleZ: 3,
      },
      priority: 8,
    },
    // JOY_03_GentleSmile — Warm contentment
    {
      name: "JOY_03_GentleSmile",
      conditions: [
        { hormone: "dopamine_tonic", operator: ">", threshold: 0.4 },
        { hormone: "oxytocin", operator: ">", threshold: 0.25 },
      ],
      parameters: {
        ParamMouthForm: 0.5,
        ParamEyeLOpen: 0.7,
        ParamEyeROpen: 0.7,
        ParamAngleZ: 3,
      },
      priority: 4,
    },
    // JOY_05_Blissful — Serene bliss
    {
      name: "JOY_05_Blissful",
      conditions: [
        { hormone: "serotonin", operator: ">", threshold: 0.6 },
        { hormone: "anandamide", operator: ">", threshold: 0.3 },
      ],
      parameters: {
        ParamMouthForm: 0.4,
        ParamEyeLOpen: 0.3,
        ParamEyeROpen: 0.3,
        ParamBreath: 0.7,
      },
      priority: 3,
    },
    // PHOTO_Awe — Awe / wonder
    {
      name: "PHOTO_Awe",
      conditions: [
        { hormone: "norepinephrine", operator: ">", threshold: 0.5 },
        { hormone: "dopamine_phasic", operator: ">", threshold: 0.25 },
      ],
      parameters: {
        ParamEyeLOpen: 1.0,
        ParamEyeROpen: 1.0,
        ParamBrowLY: 0.5,
        ParamBrowRY: 0.5,
        ParamMouthOpenY: 0.5,
        ParamMouthForm: 0.1,
      },
      priority: 7,
    },
    // WONDER_02_CuriousGaze — Curious wonder
    {
      name: "WONDER_02_CuriousGaze",
      conditions: [
        { hormone: "norepinephrine", operator: ">", threshold: 0.35 },
        { hormone: "t3_t4", operator: ">", threshold: 0.55 },
      ],
      parameters: {
        ParamEyeBallX: 0.3,
        ParamEyeBallY: 0.2,
        ParamBrowLY: 0.3,
        ParamBrowRY: 0.2,
        ParamEyeLOpen: 0.9,
        ParamEyeROpen: 0.85,
        ParamAngleY: -5,
      },
      priority: 5,
    },
    // WONDER_03_Contemplative — Deep thought
    {
      name: "WONDER_03_Contemplative",
      conditions: [
        { hormone: "t3_t4", operator: ">", threshold: 0.6 },
        { hormone: "serotonin", operator: ">", threshold: 0.35 },
      ],
      parameters: {
        ParamEyeBallX: -0.2,
        ParamEyeBallY: 0.3,
        ParamBrowLY: 0.15,
        ParamBrowRY: -0.1,
        ParamEyeLOpen: 0.7,
        ParamEyeROpen: 0.75,
        ParamAngleX: -3,
        ParamAngleY: 5,
      },
      priority: 4,
    },
    // SPEAK_01_OpenVowel — Animated speaking
    {
      name: "SPEAK_01_OpenVowel",
      conditions: [
        { hormone: "dopamine_tonic", operator: ">", threshold: 0.35 },
        { hormone: "t3_t4", operator: ">", threshold: 0.45 },
      ],
      parameters: {
        ParamMouthOpenY: 0.5,
        ParamMouthForm: 0.3,
        ParamEyeLOpen: 0.8,
        ParamEyeROpen: 0.8,
      },
      priority: 3,
    },
    // Stressed / Error state
    {
      name: "STRESSED",
      conditions: [
        { hormone: "cortisol", operator: ">", threshold: 0.45 },
        { hormone: "serotonin", operator: "<", threshold: 0.25 },
      ],
      parameters: {
        ParamBrowLY: -0.5,
        ParamBrowRY: -0.5,
        ParamMouthForm: -0.3,
        ParamEyeLOpen: 0.6,
        ParamEyeROpen: 0.6,
      },
      priority: 6,
    },
  ],
  motionMap: {
    Idle: ["RESTING", "REFLECTIVE"],
    Tap: ["SOCIAL", "REWARD"],
    Flic: ["VIGILANT", "EXPLORATORY"],
  },
  simulation: {
    backend: "cogsim-pml",
    tickIntervalMs: 2000,
    needsDecay: true,
  },
};

// ============================================================
// CHARACTER REGISTRY
// ============================================================

/**
 * Character Registry: manages available characters and their manifests
 */
export class CharacterRegistry {
  private characters: Map<string, CharacterManifest> = new Map();

  constructor() {
    // Register built-in characters
    this.register(MIARA_MANIFEST);
    this.register(DTECHO_MANIFEST);
  }

  /**
   * Register a character manifest
   */
  register(manifest: CharacterManifest): void {
    this.characters.set(manifest.id, manifest);
  }

  /**
   * Get a character manifest by ID
   */
  get(id: string): CharacterManifest | undefined {
    return this.characters.get(id);
  }

  /**
   * Get all registered character IDs
   */
  list(): string[] {
    return Array.from(this.characters.keys());
  }

  /**
   * Check if a character is registered
   */
  has(id: string): boolean {
    return this.characters.has(id);
  }

  /**
   * Get the default character (dtecho for DTE, miara as fallback)
   */
  getDefault(): CharacterManifest {
    return this.characters.get("dtecho") ?? MIARA_MANIFEST;
  }
}

/**
 * Singleton character registry instance
 */
export const characterRegistry = new CharacterRegistry();

/**
 * Export built-in manifests for direct access
 */
export { MIARA_MANIFEST, DTECHO_MANIFEST };
