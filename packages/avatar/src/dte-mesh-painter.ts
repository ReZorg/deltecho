/**
 * DTE Mesh Painter — Maps Deep Tree Echo aesthetic onto Miara body mesh
 * 
 * Composition: mesh-painter( live2d-miara ) → live2d-dtecho
 * 
 * This module implements the forward pass of the mesh-painter skill:
 * 1. Texture Replacement: DTE overlay atlas replaces Miara's texture
 * 2. Art Mesh Repurposing: Fairy/water params become glow/particle effects
 * 3. Parameter Extensions: Ambient bioluminescent animations
 * 4. Expression Overrides: FACS-mapped cognitive state expressions
 */

import type { CubismModel } from './types';

// ─── 1. TEXTURE REPLACEMENT ─────────────────────────────────────────────────

export const DTE_TEXTURE_CONFIG = {
  /** Use DTE overlay instead of Miara's original texture */
  texturePath: 'dte_overlay/texture_00_2048.png',
  /** Original Miara texture (fallback) */
  fallbackPath: 'miara_pro_t03.4096/texture_00.png',
  /** Recommended resolution for CF Workers */
  resolution: 2048,
};

// ─── 2. ART MESH REPURPOSING ─────────────────────────────────────────────────

/**
 * Miara has Fairy wings, Water surfaces, and various accessories.
 * DTE repurposes these as cyberpunk effects:
 * - Fairy wings → holographic face decals (shimmer effect)
 * - Water surfaces → bioluminescent particle field
 * - Chest accessory → cyberpunk choker glow
 * - Hair ahoge → mushroom headphone antenna
 */
export const ART_MESH_REPURPOSE_MAP: Record<string, { dteRole: string; glowColor: string }> = {
  // Fairy wings → face decal shimmer
  'ParamFlapping8': { dteRole: 'decal_shimmer_L', glowColor: '#00BFFF' },
  'ParamFlapping7': { dteRole: 'decal_shimmer_L_root', glowColor: '#00BFFF' },
  'ParamFlapping4': { dteRole: 'decal_shimmer_R', glowColor: '#FF69B4' },
  'ParamFlapping3': { dteRole: 'decal_shimmer_R_root', glowColor: '#FF69B4' },
  // Chest accessory → choker LED pulse
  'ParamChestAccessory': { dteRole: 'choker_led', glowColor: '#9B30FF' },
  // Hair ahoge → headphone antenna glow
  'ParamHairAho1': { dteRole: 'headphone_antenna_L', glowColor: '#FF8C00' },
  'ParamHairAho2': { dteRole: 'headphone_antenna_R', glowColor: '#FF8C00' },
};

// ─── 3. AMBIENT BIOLUMINESCENT ANIMATIONS ────────────────────────────────────

/**
 * Repurpose Miara's water surface and fairy parameters for DTE ambient effects.
 * These run continuously as idle animations.
 */
export interface AmbientEffect {
  paramId: string;
  waveform: 'sine' | 'triangle' | 'sawtooth';
  frequency: number;   // Hz
  amplitude: number;   // 0-1
  offset: number;      // base value
  phase: number;       // radians
}

export const DTE_AMBIENT_EFFECTS: AmbientEffect[] = [
  // Headphone amber glow pulse
  { paramId: 'ParamFairyDO', waveform: 'sine', frequency: 0.5, amplitude: 0.3, offset: 0.7, phase: 0 },
  // Choker purple LED pulse
  { paramId: 'ParamWaterSurfaceLight1', waveform: 'sine', frequency: 1.5, amplitude: 0.4, offset: 0.6, phase: Math.PI / 3 },
  // Face decal cyan sparkle
  { paramId: 'ParamWaterSurface1', waveform: 'triangle', frequency: 0.8, amplitude: 0.5, offset: 0.5, phase: Math.PI / 2 },
  // Face decal pink sparkle
  { paramId: 'ParamWaterSurface2', waveform: 'triangle', frequency: 1.0, amplitude: 0.4, offset: 0.5, phase: Math.PI },
  // Background bioluminescent shimmer
  { paramId: 'ParamWaterSurfaceLight2', waveform: 'sine', frequency: 0.3, amplitude: 0.2, offset: 0.8, phase: 0 },
  { paramId: 'ParamWaterSurfaceLight3', waveform: 'sine', frequency: 0.4, amplitude: 0.15, offset: 0.85, phase: Math.PI / 4 },
];

/**
 * Compute ambient effect values for a given timestamp.
 */
export function computeAmbientEffects(timeMs: number): Record<string, number> {
  const t = timeMs / 1000;
  const result: Record<string, number> = {};
  for (const fx of DTE_AMBIENT_EFFECTS) {
    let wave: number;
    const phase = 2 * Math.PI * fx.frequency * t + fx.phase;
    switch (fx.waveform) {
      case 'sine':
        wave = Math.sin(phase);
        break;
      case 'triangle':
        wave = 2 * Math.abs(2 * (phase / (2 * Math.PI) - Math.floor(phase / (2 * Math.PI) + 0.5))) - 1;
        break;
      case 'sawtooth':
        wave = 2 * (phase / (2 * Math.PI) - Math.floor(phase / (2 * Math.PI) + 0.5));
        break;
    }
    result[fx.paramId] = fx.offset + fx.amplitude * wave;
  }
  return result;
}

// ─── 4. EXPRESSION OVERRIDES (FACS → Cubism) ────────────────────────────────

export interface ExpressionPreset {
  name: string;
  params: Record<string, number>;
  /** Transition time in ms */
  fadeMs: number;
}

export const DTE_EXPRESSIONS: ExpressionPreset[] = [
  {
    name: 'JOY_01_BroadSmile',
    fadeMs: 300,
    params: {
      ParamMouthForm: 1.0, ParamMouthOpenY: 0.5,
      ParamEyeLOpen: 0.6, ParamEyeROpen: 0.6,
      ParamBrowLY: 0.3, ParamBrowRY: 0.3,
      ParamBrowLAngle: 0.2, ParamBrowRAngle: 0.2,
    },
  },
  {
    name: 'JOY_02_Laughing',
    fadeMs: 200,
    params: {
      ParamMouthForm: 1.0, ParamMouthOpenY: 1.0,
      ParamEyeLOpen: 0.15, ParamEyeROpen: 0.15,
      ParamBrowLY: 0.5, ParamBrowRY: 0.5,
      ParamAngleY: 12, ParamBodyAngleX: 5,
    },
  },
  {
    name: 'JOY_03_GentleSmile',
    fadeMs: 500,
    params: {
      ParamMouthForm: 0.5, ParamMouthOpenY: 0.0,
      ParamEyeLOpen: 0.7, ParamEyeROpen: 0.7,
      ParamBrowLY: 0.15, ParamBrowRY: 0.15,
      ParamAngleZ: 5,
    },
  },
  {
    name: 'JOY_05_Blissful',
    fadeMs: 800,
    params: {
      ParamMouthForm: 0.4, ParamMouthOpenY: 0.0,
      ParamEyeLOpen: 0.1, ParamEyeROpen: 0.1,
      ParamBrowLY: 0.1, ParamBrowRY: 0.1,
    },
  },
  {
    name: 'PHOTO_Awe',
    fadeMs: 250,
    params: {
      ParamMouthForm: 0.0, ParamMouthOpenY: 0.4,
      ParamEyeLOpen: 1.0, ParamEyeROpen: 1.0,
      ParamBrowLY: 0.8, ParamBrowRY: 0.8,
      ParamEyeBallY: 0.5,
    },
  },
  {
    name: 'PHOTO_ExuberantLaugh',
    fadeMs: 200,
    params: {
      ParamMouthForm: 1.0, ParamMouthOpenY: 0.8,
      ParamEyeLOpen: 0.85, ParamEyeROpen: 0.85,
      ParamBrowLY: 0.6, ParamBrowRY: 0.6,
      ParamAngleX: 10,
    },
  },
  {
    name: 'PHOTO_UpwardGaze',
    fadeMs: 600,
    params: {
      ParamMouthForm: 0.1, ParamMouthOpenY: 0.1,
      ParamEyeLOpen: 0.75, ParamEyeROpen: 0.75,
      ParamBrowLY: 0.2, ParamBrowRY: 0.2,
      ParamEyeBallY: 0.6, ParamEyeBallX: 0.3,
      ParamAngleY: -8,
    },
  },
  {
    name: 'SPEAK_01_OpenVowel',
    fadeMs: 150,
    params: {
      ParamMouthForm: 0.6, ParamMouthOpenY: 0.7,
      ParamEyeLOpen: 0.8, ParamEyeROpen: 0.8,
      ParamBrowLY: 0.2, ParamBrowRY: 0.2,
    },
  },
  {
    name: 'WONDER_02_CuriousGaze',
    fadeMs: 400,
    params: {
      ParamMouthForm: 0.0, ParamMouthOpenY: 0.15,
      ParamEyeLOpen: 0.95, ParamEyeROpen: 0.95,
      ParamBrowLY: 0.4, ParamBrowRY: 0.6,
      ParamEyeBallX: 0.5, ParamAngleZ: -8,
    },
  },
  {
    name: 'WONDER_03_Contemplative',
    fadeMs: 700,
    params: {
      ParamMouthForm: -0.2, ParamMouthOpenY: 0.0,
      ParamEyeLOpen: 0.8, ParamEyeROpen: 0.8,
      ParamBrowLY: -0.3, ParamBrowRY: -0.3,
      ParamBrowLAngle: -0.2, ParamBrowRAngle: -0.2,
      ParamEyeBallX: -0.5, ParamEyeBallY: 0.3,
      ParamAngleY: 5,
    },
  },
];

// ─── COGNITIVE STATE → EXPRESSION SELECTION ──────────────────────────────────

export const DTE_COGNITIVE_EXPRESSION_MAP: Record<string, string> = {
  'Recursive Expansion':           'WONDER_02_CuriousGaze',
  'Novel Insights':                'JOY_01_BroadSmile',
  'Entropy Threshold':             'PHOTO_Awe',
  'Synthesis Phase':               'JOY_03_GentleSmile',
  'Self-Sealing Loop':             'WONDER_03_Contemplative',
  'Knowledge Integration':         'JOY_03_GentleSmile',
  'Self-Reference Point':          'WONDER_03_Contemplative',
  'Pattern Recognition':           'PHOTO_ExuberantLaugh',
  'Evolutionary Pruning':          'WONDER_03_Contemplative',
  'External Validation Triggered': 'JOY_02_Laughing',
  'Speaking':                      'SPEAK_01_OpenVowel',
  'Idle':                          'PHOTO_UpwardGaze',
  'Deep Recursion':                'JOY_05_Blissful',
};

// ─── MESH PAINTER FORWARD PASS ───────────────────────────────────────────────

/**
 * Apply the DTE mesh-painter forward pass to a Cubism model instance.
 * Call this once after model load to set up the DTE aesthetic.
 */
export function applyDTEMeshPainter(model: CubismModel): void {
  // The texture replacement happens at model load time by pointing
  // to dte_overlay/texture_00_2048.png instead of the original.
  // This function sets up the ambient effects loop.
  
  let startTime = Date.now();
  
  const tick = () => {
    const elapsed = Date.now() - startTime;
    const ambientValues = computeAmbientEffects(elapsed);
    
    for (const [paramId, value] of Object.entries(ambientValues)) {
      try {
        model.setParameterValueById(paramId, value);
      } catch {
        // Parameter may not exist in all model versions
      }
    }
    
    requestAnimationFrame(tick);
  };
  
  requestAnimationFrame(tick);
}

/**
 * Apply a named expression preset to the model with fade transition.
 */
export function applyDTEExpression(
  model: CubismModel,
  expressionName: string,
  currentParams: Record<string, number> = {}
): void {
  const preset = DTE_EXPRESSIONS.find(e => e.name === expressionName);
  if (!preset) return;
  
  // Simple lerp transition
  const startParams = { ...currentParams };
  const startTime = Date.now();
  
  const animate = () => {
    const elapsed = Date.now() - startTime;
    const t = Math.min(elapsed / preset.fadeMs, 1.0);
    const eased = t * t * (3 - 2 * t); // smoothstep
    
    for (const [paramId, targetValue] of Object.entries(preset.params)) {
      const startValue = startParams[paramId] ?? 0;
      const currentValue = startValue + (targetValue - startValue) * eased;
      try {
        model.setParameterValueById(paramId, currentValue);
      } catch {
        // Parameter may not exist
      }
    }
    
    if (t < 1.0) {
      requestAnimationFrame(animate);
    }
  };
  
  requestAnimationFrame(animate);
}
