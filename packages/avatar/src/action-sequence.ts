/**
 * ActionSequence — Declarative Animation System for Coordinated Mesh Transformations
 *
 * Translates known action sequences (wave, nod, bow, point, etc.) into coordinated
 * multi-parameter keyframe tracks with easing, blending, and chaining. Each action
 * is defined as a set of parameter curves that drive the Cubism model's mesh
 * transformations in a synchronized, time-based manner.
 *
 * Composition: rig-logic ⊗ unreal-blueprint ⊗ workflow-creator
 */

// ============================================================
// Types
// ============================================================

/** Easing function type */
export type EasingFn = (t: number) => number;

/** A single keyframe in a parameter track */
export interface Keyframe {
  /** Time in seconds from sequence start */
  time: number;
  /** Target parameter value */
  value: number;
  /** Easing function name for interpolation TO this keyframe */
  easing?: EasingName;
}

/** Named easing functions */
export type EasingName =
  | 'linear'
  | 'easeIn'
  | 'easeOut'
  | 'easeInOut'
  | 'easeInQuad'
  | 'easeOutQuad'
  | 'easeInOutQuad'
  | 'easeInCubic'
  | 'easeOutCubic'
  | 'easeInOutCubic'
  | 'easeInElastic'
  | 'easeOutElastic'
  | 'easeOutBounce'
  | 'step';

/** A parameter track: a sequence of keyframes for one parameter */
export interface ParameterTrack {
  /** Cubism parameter ID */
  paramId: string;
  /** Keyframes sorted by time */
  keyframes: Keyframe[];
  /** Whether this track is additive (adds to current value) or absolute */
  mode: 'absolute' | 'additive';
  /** Blend weight for this track [0,1] */
  weight?: number;
}

/** Definition of a named action sequence */
export interface ActionSequenceDef {
  /** Unique action name */
  name: string;
  /** Human-readable label */
  label: string;
  /** Total duration in seconds */
  duration: number;
  /** Whether the action loops */
  loop: boolean;
  /** Parameter tracks that compose this action */
  tracks: ParameterTrack[];
  /** Priority level (higher priority actions override lower ones) */
  priority: number;
  /** Blend-in time in seconds */
  blendIn: number;
  /** Blend-out time in seconds */
  blendOut: number;
  /** Tags for categorization */
  tags: string[];
}

/** State of a currently playing action */
export interface PlayingAction {
  /** The action definition */
  def: ActionSequenceDef;
  /** Current playback time in seconds */
  time: number;
  /** Current blend weight [0,1] */
  weight: number;
  /** Whether the action is in blend-in phase */
  blendingIn: boolean;
  /** Whether the action is in blend-out phase */
  blendingOut: boolean;
  /** Whether the action has finished */
  finished: boolean;
  /** Speed multiplier */
  speed: number;
  /** Callback when action completes */
  onComplete?: () => void;
}

/** Output: parameter values to apply to the model */
export interface ActionOutput {
  /** Parameter ID → value pairs */
  params: Map<string, number>;
  /** Active action names */
  activeActions: string[];
}

// ============================================================
// Easing Functions
// ============================================================

export const EASING_FUNCTIONS: Record<EasingName, EasingFn> = {
  linear: (t) => t,
  easeIn: (t) => t * t,
  easeOut: (t) => t * (2 - t),
  easeInOut: (t) => t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t,
  easeInQuad: (t) => t * t,
  easeOutQuad: (t) => 1 - (1 - t) * (1 - t),
  easeInOutQuad: (t) => t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2,
  easeInCubic: (t) => t * t * t,
  easeOutCubic: (t) => 1 - Math.pow(1 - t, 3),
  easeInOutCubic: (t) => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2,
  easeInElastic: (t) => {
    if (t === 0 || t === 1) return t;
    return -Math.pow(2, 10 * t - 10) * Math.sin((t * 10 - 10.75) * (2 * Math.PI / 3));
  },
  easeOutElastic: (t) => {
    if (t === 0 || t === 1) return t;
    return Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * (2 * Math.PI / 3)) + 1;
  },
  easeOutBounce: (t) => {
    const n1 = 7.5625, d1 = 2.75;
    if (t < 1 / d1) return n1 * t * t;
    if (t < 2 / d1) return n1 * (t -= 1.5 / d1) * t + 0.75;
    if (t < 2.5 / d1) return n1 * (t -= 2.25 / d1) * t + 0.9375;
    return n1 * (t -= 2.625 / d1) * t + 0.984375;
  },
  step: (t) => t < 1 ? 0 : 1,
};

// ============================================================
// Built-in Action Library
// ============================================================

export const ACTION_LIBRARY: ActionSequenceDef[] = [
  // --- Facial Actions ---
  {
    name: 'blink',
    label: 'Blink',
    duration: 0.3,
    loop: false,
    priority: 5,
    blendIn: 0.02,
    blendOut: 0.02,
    tags: ['face', 'eyes', 'micro'],
    tracks: [
      {
        paramId: 'ParamEyeLOpen',
        mode: 'absolute',
        keyframes: [
          { time: 0, value: 1.0, easing: 'linear' },
          { time: 0.08, value: 0.0, easing: 'easeInQuad' },
          { time: 0.15, value: 0.0, easing: 'linear' },
          { time: 0.3, value: 1.0, easing: 'easeOutQuad' },
        ],
      },
      {
        paramId: 'ParamEyeROpen',
        mode: 'absolute',
        keyframes: [
          { time: 0, value: 1.0, easing: 'linear' },
          { time: 0.08, value: 0.0, easing: 'easeInQuad' },
          { time: 0.15, value: 0.0, easing: 'linear' },
          { time: 0.3, value: 1.0, easing: 'easeOutQuad' },
        ],
      },
    ],
  },
  {
    name: 'wink_left',
    label: 'Wink Left',
    duration: 0.4,
    loop: false,
    priority: 6,
    blendIn: 0.05,
    blendOut: 0.05,
    tags: ['face', 'eyes', 'expression'],
    tracks: [
      {
        paramId: 'ParamEyeLOpen',
        mode: 'absolute',
        keyframes: [
          { time: 0, value: 1.0 },
          { time: 0.1, value: 0.0, easing: 'easeInQuad' },
          { time: 0.25, value: 0.0 },
          { time: 0.4, value: 1.0, easing: 'easeOutCubic' },
        ],
      },
      {
        paramId: 'ParamMouthForm',
        mode: 'absolute',
        keyframes: [
          { time: 0, value: 0.0 },
          { time: 0.1, value: 0.6, easing: 'easeOut' },
          { time: 0.3, value: 0.6 },
          { time: 0.4, value: 0.0, easing: 'easeIn' },
        ],
      },
    ],
  },
  {
    name: 'smile',
    label: 'Smile',
    duration: 1.0,
    loop: false,
    priority: 4,
    blendIn: 0.2,
    blendOut: 0.3,
    tags: ['face', 'mouth', 'expression'],
    tracks: [
      {
        paramId: 'ParamMouthForm',
        mode: 'absolute',
        keyframes: [
          { time: 0, value: 0.0 },
          { time: 0.3, value: 0.8, easing: 'easeOutCubic' },
          { time: 0.7, value: 0.8 },
          { time: 1.0, value: 0.0, easing: 'easeInOut' },
        ],
      },
      {
        paramId: 'ParamEyeLOpen',
        mode: 'absolute',
        keyframes: [
          { time: 0, value: 0.8 },
          { time: 0.3, value: 0.6, easing: 'easeOut' },
          { time: 0.7, value: 0.6 },
          { time: 1.0, value: 0.8, easing: 'easeIn' },
        ],
      },
      {
        paramId: 'ParamEyeROpen',
        mode: 'absolute',
        keyframes: [
          { time: 0, value: 0.8 },
          { time: 0.3, value: 0.6, easing: 'easeOut' },
          { time: 0.7, value: 0.6 },
          { time: 1.0, value: 0.8, easing: 'easeIn' },
        ],
      },
    ],
  },
  {
    name: 'talk',
    label: 'Talking',
    duration: 0.6,
    loop: true,
    priority: 3,
    blendIn: 0.05,
    blendOut: 0.1,
    tags: ['face', 'mouth', 'lipsync'],
    tracks: [
      {
        paramId: 'ParamMouthOpenY',
        mode: 'absolute',
        keyframes: [
          { time: 0, value: 0.0 },
          { time: 0.1, value: 0.7, easing: 'easeOut' },
          { time: 0.2, value: 0.3, easing: 'easeInOut' },
          { time: 0.3, value: 0.8, easing: 'easeOut' },
          { time: 0.4, value: 0.2, easing: 'easeInOut' },
          { time: 0.5, value: 0.5, easing: 'easeOut' },
          { time: 0.6, value: 0.0, easing: 'easeIn' },
        ],
      },
      {
        paramId: 'ParamMouthForm',
        mode: 'additive',
        keyframes: [
          { time: 0, value: 0.0 },
          { time: 0.15, value: 0.2, easing: 'easeOut' },
          { time: 0.3, value: -0.1, easing: 'easeInOut' },
          { time: 0.45, value: 0.15, easing: 'easeOut' },
          { time: 0.6, value: 0.0, easing: 'easeIn' },
        ],
      },
    ],
  },

  // --- Head Actions ---
  {
    name: 'nod',
    label: 'Nod',
    duration: 0.8,
    loop: false,
    priority: 5,
    blendIn: 0.1,
    blendOut: 0.1,
    tags: ['head', 'gesture'],
    tracks: [
      {
        paramId: 'ParamAngleY',
        mode: 'additive',
        keyframes: [
          { time: 0, value: 0 },
          { time: 0.2, value: -8, easing: 'easeOut' },
          { time: 0.4, value: 3, easing: 'easeInOut' },
          { time: 0.6, value: -5, easing: 'easeInOut' },
          { time: 0.8, value: 0, easing: 'easeOut' },
        ],
      },
      {
        paramId: 'ParamBodyAngleX',
        mode: 'additive',
        keyframes: [
          { time: 0, value: 0 },
          { time: 0.25, value: -2, easing: 'easeOut' },
          { time: 0.5, value: 1, easing: 'easeInOut' },
          { time: 0.8, value: 0, easing: 'easeOut' },
        ],
      },
    ],
  },
  {
    name: 'head_shake',
    label: 'Head Shake',
    duration: 0.8,
    loop: false,
    priority: 5,
    blendIn: 0.1,
    blendOut: 0.1,
    tags: ['head', 'gesture'],
    tracks: [
      {
        paramId: 'ParamAngleX',
        mode: 'additive',
        keyframes: [
          { time: 0, value: 0 },
          { time: 0.1, value: 12, easing: 'easeOut' },
          { time: 0.3, value: -12, easing: 'easeInOut' },
          { time: 0.5, value: 8, easing: 'easeInOut' },
          { time: 0.65, value: -5, easing: 'easeInOut' },
          { time: 0.8, value: 0, easing: 'easeOut' },
        ],
      },
    ],
  },
  {
    name: 'head_tilt',
    label: 'Head Tilt (Curious)',
    duration: 1.2,
    loop: false,
    priority: 4,
    blendIn: 0.2,
    blendOut: 0.3,
    tags: ['head', 'expression'],
    tracks: [
      {
        paramId: 'ParamAngleZ',
        mode: 'additive',
        keyframes: [
          { time: 0, value: 0 },
          { time: 0.4, value: 8, easing: 'easeOutCubic' },
          { time: 0.8, value: 8 },
          { time: 1.2, value: 0, easing: 'easeInOut' },
        ],
      },
      {
        paramId: 'ParamBrowLY',
        mode: 'additive',
        keyframes: [
          { time: 0, value: 0 },
          { time: 0.3, value: 0.3, easing: 'easeOut' },
          { time: 0.9, value: 0.3 },
          { time: 1.2, value: 0, easing: 'easeIn' },
        ],
      },
      {
        paramId: 'ParamBrowRY',
        mode: 'additive',
        keyframes: [
          { time: 0, value: 0 },
          { time: 0.3, value: 0.2, easing: 'easeOut' },
          { time: 0.9, value: 0.2 },
          { time: 1.2, value: 0, easing: 'easeIn' },
        ],
      },
    ],
  },

  // --- Body Actions ---
  {
    name: 'bow',
    label: 'Bow',
    duration: 2.0,
    loop: false,
    priority: 7,
    blendIn: 0.2,
    blendOut: 0.3,
    tags: ['body', 'gesture', 'formal'],
    tracks: [
      {
        paramId: 'ParamAngleY',
        mode: 'additive',
        keyframes: [
          { time: 0, value: 0 },
          { time: 0.5, value: -15, easing: 'easeInOutCubic' },
          { time: 1.2, value: -15 },
          { time: 2.0, value: 0, easing: 'easeInOutCubic' },
        ],
      },
      {
        paramId: 'ParamBodyAngleX',
        mode: 'additive',
        keyframes: [
          { time: 0, value: 0 },
          { time: 0.5, value: -8, easing: 'easeInOutCubic' },
          { time: 1.2, value: -8 },
          { time: 2.0, value: 0, easing: 'easeInOutCubic' },
        ],
      },
      {
        paramId: 'ParamEyeLOpen',
        mode: 'absolute',
        keyframes: [
          { time: 0, value: 0.8 },
          { time: 0.4, value: 0.3, easing: 'easeIn' },
          { time: 1.3, value: 0.3 },
          { time: 1.8, value: 0.8, easing: 'easeOut' },
        ],
      },
      {
        paramId: 'ParamEyeROpen',
        mode: 'absolute',
        keyframes: [
          { time: 0, value: 0.8 },
          { time: 0.4, value: 0.3, easing: 'easeIn' },
          { time: 1.3, value: 0.3 },
          { time: 1.8, value: 0.8, easing: 'easeOut' },
        ],
      },
    ],
  },
  {
    name: 'wave',
    label: 'Wave',
    duration: 1.6,
    loop: false,
    priority: 6,
    blendIn: 0.15,
    blendOut: 0.2,
    tags: ['arm', 'gesture', 'greeting'],
    tracks: [
      {
        paramId: 'ParamArmR1',
        mode: 'absolute',
        keyframes: [
          { time: 0, value: 0 },
          { time: 0.3, value: 0.8, easing: 'easeOutCubic' },
          { time: 0.5, value: 0.6, easing: 'easeInOut' },
          { time: 0.7, value: 0.9, easing: 'easeInOut' },
          { time: 0.9, value: 0.5, easing: 'easeInOut' },
          { time: 1.1, value: 0.85, easing: 'easeInOut' },
          { time: 1.6, value: 0, easing: 'easeInCubic' },
        ],
      },
      {
        paramId: 'ParamArmR2',
        mode: 'absolute',
        keyframes: [
          { time: 0, value: 0 },
          { time: 0.3, value: 0.5, easing: 'easeOut' },
          { time: 1.3, value: 0.5 },
          { time: 1.6, value: 0, easing: 'easeIn' },
        ],
      },
      {
        paramId: 'ParamFingerR1',
        mode: 'absolute',
        keyframes: [
          { time: 0, value: 0 },
          { time: 0.3, value: 0.7, easing: 'easeOut' },
          { time: 1.3, value: 0.7 },
          { time: 1.6, value: 0, easing: 'easeIn' },
        ],
      },
      {
        paramId: 'ParamMouthForm',
        mode: 'absolute',
        keyframes: [
          { time: 0, value: 0 },
          { time: 0.3, value: 0.7, easing: 'easeOut' },
          { time: 1.2, value: 0.7 },
          { time: 1.6, value: 0, easing: 'easeIn' },
        ],
      },
      {
        paramId: 'ParamBodyAngleZ',
        mode: 'additive',
        keyframes: [
          { time: 0, value: 0 },
          { time: 0.3, value: -3, easing: 'easeOut' },
          { time: 1.3, value: -3 },
          { time: 1.6, value: 0, easing: 'easeIn' },
        ],
      },
    ],
  },
  {
    name: 'point',
    label: 'Point Forward',
    duration: 1.2,
    loop: false,
    priority: 5,
    blendIn: 0.15,
    blendOut: 0.2,
    tags: ['arm', 'gesture'],
    tracks: [
      {
        paramId: 'ParamArmR1',
        mode: 'absolute',
        keyframes: [
          { time: 0, value: 0 },
          { time: 0.3, value: 0.6, easing: 'easeOutCubic' },
          { time: 0.8, value: 0.6 },
          { time: 1.2, value: 0, easing: 'easeInCubic' },
        ],
      },
      {
        paramId: 'ParamFingerR2',
        mode: 'absolute',
        keyframes: [
          { time: 0, value: 0 },
          { time: 0.25, value: 1.0, easing: 'easeOut' },
          { time: 0.85, value: 1.0 },
          { time: 1.2, value: 0, easing: 'easeIn' },
        ],
      },
    ],
  },
  {
    name: 'shrug',
    label: 'Shrug',
    duration: 1.0,
    loop: false,
    priority: 5,
    blendIn: 0.1,
    blendOut: 0.15,
    tags: ['body', 'gesture', 'expression'],
    tracks: [
      {
        paramId: 'ParamBodyAngleX',
        mode: 'additive',
        keyframes: [
          { time: 0, value: 0 },
          { time: 0.2, value: 3, easing: 'easeOut' },
          { time: 0.7, value: 3 },
          { time: 1.0, value: 0, easing: 'easeInOut' },
        ],
      },
      {
        paramId: 'ParamAngleZ',
        mode: 'additive',
        keyframes: [
          { time: 0, value: 0 },
          { time: 0.2, value: -3, easing: 'easeOut' },
          { time: 0.7, value: -3 },
          { time: 1.0, value: 0, easing: 'easeIn' },
        ],
      },
      {
        paramId: 'ParamBrowLY',
        mode: 'additive',
        keyframes: [
          { time: 0, value: 0 },
          { time: 0.2, value: 0.4, easing: 'easeOut' },
          { time: 0.7, value: 0.4 },
          { time: 1.0, value: 0, easing: 'easeIn' },
        ],
      },
      {
        paramId: 'ParamBrowRY',
        mode: 'additive',
        keyframes: [
          { time: 0, value: 0 },
          { time: 0.2, value: 0.4, easing: 'easeOut' },
          { time: 0.7, value: 0.4 },
          { time: 1.0, value: 0, easing: 'easeIn' },
        ],
      },
      {
        paramId: 'ParamMouthForm',
        mode: 'additive',
        keyframes: [
          { time: 0, value: 0 },
          { time: 0.2, value: -0.3, easing: 'easeOut' },
          { time: 0.7, value: -0.3 },
          { time: 1.0, value: 0, easing: 'easeIn' },
        ],
      },
    ],
  },

  // --- Breathing / Idle ---
  {
    name: 'deep_breath',
    label: 'Deep Breath',
    duration: 3.0,
    loop: false,
    priority: 2,
    blendIn: 0.3,
    blendOut: 0.3,
    tags: ['body', 'breathing', 'calm'],
    tracks: [
      {
        paramId: 'ParamBreath',
        mode: 'absolute',
        keyframes: [
          { time: 0, value: 0.0 },
          { time: 1.0, value: 1.0, easing: 'easeInOutCubic' },
          { time: 1.5, value: 1.0 },
          { time: 3.0, value: 0.0, easing: 'easeInOutCubic' },
        ],
      },
      {
        paramId: 'ParamBodyAngleX',
        mode: 'additive',
        keyframes: [
          { time: 0, value: 0 },
          { time: 1.0, value: -2, easing: 'easeInOut' },
          { time: 3.0, value: 0, easing: 'easeInOut' },
        ],
      },
      {
        paramId: 'ParamEyeLOpen',
        mode: 'absolute',
        keyframes: [
          { time: 0, value: 0.8 },
          { time: 1.0, value: 0.4, easing: 'easeIn' },
          { time: 2.0, value: 0.4 },
          { time: 3.0, value: 0.8, easing: 'easeOut' },
        ],
      },
      {
        paramId: 'ParamEyeROpen',
        mode: 'absolute',
        keyframes: [
          { time: 0, value: 0.8 },
          { time: 1.0, value: 0.4, easing: 'easeIn' },
          { time: 2.0, value: 0.4 },
          { time: 3.0, value: 0.8, easing: 'easeOut' },
        ],
      },
    ],
  },

  // --- Surprise / Reaction ---
  {
    name: 'startle',
    label: 'Startle',
    duration: 0.6,
    loop: false,
    priority: 8,
    blendIn: 0.02,
    blendOut: 0.15,
    tags: ['body', 'face', 'reaction'],
    tracks: [
      {
        paramId: 'ParamEyeLOpen',
        mode: 'absolute',
        keyframes: [
          { time: 0, value: 0.8 },
          { time: 0.05, value: 1.0, easing: 'step' },
          { time: 0.4, value: 1.0 },
          { time: 0.6, value: 0.8, easing: 'easeOut' },
        ],
      },
      {
        paramId: 'ParamEyeROpen',
        mode: 'absolute',
        keyframes: [
          { time: 0, value: 0.8 },
          { time: 0.05, value: 1.0, easing: 'step' },
          { time: 0.4, value: 1.0 },
          { time: 0.6, value: 0.8, easing: 'easeOut' },
        ],
      },
      {
        paramId: 'ParamMouthOpenY',
        mode: 'absolute',
        keyframes: [
          { time: 0, value: 0 },
          { time: 0.05, value: 0.6, easing: 'step' },
          { time: 0.3, value: 0.6 },
          { time: 0.6, value: 0, easing: 'easeOut' },
        ],
      },
      {
        paramId: 'ParamBodyAngleX',
        mode: 'additive',
        keyframes: [
          { time: 0, value: 0 },
          { time: 0.05, value: 4, easing: 'step' },
          { time: 0.6, value: 0, easing: 'easeOutElastic' },
        ],
      },
      {
        paramId: 'ParamBrowLY',
        mode: 'additive',
        keyframes: [
          { time: 0, value: 0 },
          { time: 0.05, value: 0.5, easing: 'step' },
          { time: 0.6, value: 0, easing: 'easeOut' },
        ],
      },
      {
        paramId: 'ParamBrowRY',
        mode: 'additive',
        keyframes: [
          { time: 0, value: 0 },
          { time: 0.05, value: 0.5, easing: 'step' },
          { time: 0.6, value: 0, easing: 'easeOut' },
        ],
      },
    ],
  },

  // --- Look Around ---
  {
    name: 'look_left',
    label: 'Look Left',
    duration: 0.8,
    loop: false,
    priority: 3,
    blendIn: 0.15,
    blendOut: 0.2,
    tags: ['head', 'eyes', 'gaze'],
    tracks: [
      {
        paramId: 'ParamAngleX',
        mode: 'additive',
        keyframes: [
          { time: 0, value: 0 },
          { time: 0.3, value: -15, easing: 'easeOutCubic' },
          { time: 0.5, value: -15 },
          { time: 0.8, value: 0, easing: 'easeInOut' },
        ],
      },
      {
        paramId: 'ParamEyeBallX',
        mode: 'additive',
        keyframes: [
          { time: 0, value: 0 },
          { time: 0.2, value: -0.8, easing: 'easeOut' },
          { time: 0.55, value: -0.8 },
          { time: 0.8, value: 0, easing: 'easeIn' },
        ],
      },
    ],
  },
  {
    name: 'look_right',
    label: 'Look Right',
    duration: 0.8,
    loop: false,
    priority: 3,
    blendIn: 0.15,
    blendOut: 0.2,
    tags: ['head', 'eyes', 'gaze'],
    tracks: [
      {
        paramId: 'ParamAngleX',
        mode: 'additive',
        keyframes: [
          { time: 0, value: 0 },
          { time: 0.3, value: 15, easing: 'easeOutCubic' },
          { time: 0.5, value: 15 },
          { time: 0.8, value: 0, easing: 'easeInOut' },
        ],
      },
      {
        paramId: 'ParamEyeBallX',
        mode: 'additive',
        keyframes: [
          { time: 0, value: 0 },
          { time: 0.2, value: 0.8, easing: 'easeOut' },
          { time: 0.55, value: 0.8 },
          { time: 0.8, value: 0, easing: 'easeIn' },
        ],
      },
    ],
  },
];

// ============================================================
// ActionSequencePlayer Class
// ============================================================

/**
 * Plays and blends multiple action sequences simultaneously,
 * resolving parameter conflicts by priority and blend weight.
 */
export class ActionSequencePlayer {
  private library: Map<string, ActionSequenceDef> = new Map();
  private playing: PlayingAction[] = [];
  private baseValues: Map<string, number> = new Map();

  constructor() {
    // Register built-in actions
    for (const action of ACTION_LIBRARY) {
      this.library.set(action.name, action);
    }
  }

  /**
   * Register a custom action sequence definition.
   */
  registerAction(def: ActionSequenceDef): void {
    this.library.set(def.name, def);
  }

  /**
   * Get all registered action names.
   */
  getActionNames(): string[] {
    return Array.from(this.library.keys());
  }

  /**
   * Get an action definition by name.
   */
  getAction(name: string): ActionSequenceDef | undefined {
    return this.library.get(name);
  }

  /**
   * Get actions filtered by tag.
   */
  getActionsByTag(tag: string): ActionSequenceDef[] {
    return Array.from(this.library.values()).filter(a => a.tags.includes(tag));
  }

  /**
   * Play an action by name.
   * @param name - Action name
   * @param speed - Playback speed multiplier (default 1.0)
   * @param onComplete - Callback when action finishes
   */
  play(name: string, speed: number = 1.0, onComplete?: () => void): boolean {
    const def = this.library.get(name);
    if (!def) return false;

    // Remove any existing instance of this action
    this.playing = this.playing.filter(p => p.def.name !== name);

    this.playing.push({
      def,
      time: 0,
      weight: 0,
      blendingIn: true,
      blendingOut: false,
      finished: false,
      speed,
      onComplete,
    });

    // Sort by priority (higher priority = later in array = applied last)
    this.playing.sort((a, b) => a.def.priority - b.def.priority);

    return true;
  }

  /**
   * Stop a playing action by name.
   */
  stop(name: string): void {
    const action = this.playing.find(p => p.def.name === name);
    if (action) {
      action.blendingOut = true;
      action.blendingIn = false;
    }
  }

  /**
   * Stop all playing actions.
   */
  stopAll(): void {
    for (const action of this.playing) {
      action.blendingOut = true;
      action.blendingIn = false;
    }
  }

  /**
   * Check if an action is currently playing.
   */
  isPlaying(name: string): boolean {
    return this.playing.some(p => p.def.name === name && !p.finished);
  }

  /**
   * Set base parameter values (from endocrine system or other sources).
   * These are used as the starting point for additive tracks.
   */
  setBaseValues(values: Map<string, number>): void {
    this.baseValues = values;
  }

  /**
   * Tick the player forward by dt seconds and compute output parameter values.
   */
  tick(dt: number): ActionOutput {
    const output: Map<string, number> = new Map();
    const activeActions: string[] = [];

    // Copy base values as starting point
    for (const [k, v] of this.baseValues) {
      output.set(k, v);
    }

    // Update and evaluate each playing action
    for (const action of this.playing) {
      if (action.finished) continue;

      // Advance time
      action.time += dt * action.speed;

      // Handle looping
      if (action.def.loop && action.time >= action.def.duration) {
        action.time = action.time % action.def.duration;
      }

      // Handle blend-in
      if (action.blendingIn) {
        if (action.def.blendIn > 0) {
          action.weight = Math.min(1, action.time / action.def.blendIn);
        } else {
          action.weight = 1;
        }
        if (action.weight >= 1) {
          action.blendingIn = false;
          action.weight = 1;
        }
      }

      // Handle blend-out (starts when action nears end or manually stopped)
      const timeToEnd = action.def.duration - action.time;
      if (!action.def.loop && timeToEnd <= action.def.blendOut) {
        action.blendingOut = true;
      }
      if (action.blendingOut) {
        if (action.def.blendOut > 0) {
          action.weight = Math.max(0, timeToEnd / action.def.blendOut);
        } else {
          action.weight = 0;
        }
      }

      // Check if finished
      if (!action.def.loop && action.time >= action.def.duration) {
        action.finished = true;
        action.weight = 0;
        if (action.onComplete) action.onComplete();
        continue;
      }

      if (action.weight <= 0) {
        action.finished = true;
        if (action.onComplete) action.onComplete();
        continue;
      }

      activeActions.push(action.def.name);

      // Evaluate each track
      for (const track of action.def.tracks) {
        const value = evaluateTrack(track, action.time);
        if (value === null) continue;

        const trackWeight = action.weight * (track.weight ?? 1);
        const current = output.get(track.paramId) ?? 0;

        if (track.mode === 'additive') {
          output.set(track.paramId, current + value * trackWeight);
        } else {
          // Absolute: blend between current and target
          output.set(track.paramId, current * (1 - trackWeight) + value * trackWeight);
        }
      }
    }

    // Clean up finished actions
    this.playing = this.playing.filter(p => !p.finished);

    return { params: output, activeActions };
  }

  /**
   * Get the list of currently playing action names.
   */
  getPlayingActions(): string[] {
    return this.playing.filter(p => !p.finished).map(p => p.def.name);
  }

  /**
   * Get the number of registered actions.
   */
  get actionCount(): number {
    return this.library.size;
  }
}

// ============================================================
// Track Evaluation
// ============================================================

/**
 * Evaluate a parameter track at a given time, interpolating between keyframes.
 */
function evaluateTrack(track: ParameterTrack, time: number): number | null {
  const kfs = track.keyframes;
  if (kfs.length === 0) return null;
  if (kfs.length === 1) return kfs[0].value;

  // Before first keyframe
  if (time <= kfs[0].time) return kfs[0].value;

  // After last keyframe
  if (time >= kfs[kfs.length - 1].time) return kfs[kfs.length - 1].value;

  // Find the two surrounding keyframes
  for (let i = 0; i < kfs.length - 1; i++) {
    if (time >= kfs[i].time && time < kfs[i + 1].time) {
      const k0 = kfs[i];
      const k1 = kfs[i + 1];
      const segmentDuration = k1.time - k0.time;
      if (segmentDuration <= 0) return k0.value;

      const localT = (time - k0.time) / segmentDuration;
      const easingName = k1.easing || 'linear';
      const easingFn = EASING_FUNCTIONS[easingName] || EASING_FUNCTIONS.linear;
      const easedT = easingFn(localT);

      return k0.value + (k1.value - k0.value) * easedT;
    }
  }

  return kfs[kfs.length - 1].value;
}

// ============================================================
// Action Sequence Chainer
// ============================================================

/**
 * Chains multiple actions into a sequence with optional delays.
 */
export class ActionChain {
  private steps: { action: string; delay: number; speed: number }[] = [];
  private player: ActionSequencePlayer;
  private currentStep = -1;
  private waitTime = 0;
  private running = false;
  private onComplete?: () => void;

  constructor(player: ActionSequencePlayer) {
    this.player = player;
  }

  /**
   * Add an action to the chain.
   * @param action - Action name
   * @param delay - Delay before this action starts (seconds)
   * @param speed - Playback speed multiplier
   */
  then(action: string, delay: number = 0, speed: number = 1.0): ActionChain {
    this.steps.push({ action, delay, speed });
    return this;
  }

  /**
   * Start the chain.
   */
  start(onComplete?: () => void): void {
    this.onComplete = onComplete;
    this.currentStep = -1;
    this.waitTime = 0;
    this.running = true;
    this.advance();
  }

  /**
   * Tick the chain forward.
   */
  tick(dt: number): void {
    if (!this.running) return;

    if (this.waitTime > 0) {
      this.waitTime -= dt;
      if (this.waitTime <= 0) {
        this.advance();
      }
    }
  }

  private advance(): void {
    this.currentStep++;
    if (this.currentStep >= this.steps.length) {
      this.running = false;
      if (this.onComplete) this.onComplete();
      return;
    }

    const step = this.steps[this.currentStep];
    if (step.delay > 0) {
      this.waitTime = step.delay;
    } else {
      this.player.play(step.action, step.speed, () => {
        this.advance();
      });
    }
  }

  /**
   * Stop the chain.
   */
  stop(): void {
    this.running = false;
    this.player.stopAll();
  }
}
