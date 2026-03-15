/**
 * DeepTreeEchoAvatarDisplay - Endocrine-Driven Live2D Avatar
 *
 * Integrates the three-skill composition:
 *   live2d-miara ⊗ live2d-dtecho ⊗ live2d-char-model
 *
 * The avatar's expressions are driven by a virtual endocrine system:
 *   CognitiveState → DTECognitiveDriver → EndocrineSystem → ExpressionBridge → Cubism Parameters
 *
 * This replaces the previous simple valence/arousal → expression mapping
 * with a biologically-inspired 16-channel hormone bus that produces
 * organic, non-repetitive facial animations.
 */

import React, { useEffect, useState, useRef, useCallback } from "react";
import { Live2DAvatar } from "../AICompanionHub/Live2DAvatar";
import type {
  Live2DAvatarController,
  EmotionalVector,
} from "../AICompanionHub/Live2DAvatar";
import { getOrchestrator } from "./CognitiveBridge";
import type { UnifiedCognitiveState } from "./CognitiveBridge";
import {
  useDeepTreeEchoAvatarOptional,
  AvatarProcessingState as BotProcessingState,
} from "./DeepTreeEchoAvatarContext";
// Styles loaded via scss/components/_deep-tree-echo-avatar.scss in the SCSS build pipeline

// Lazy-import the avatar character system to avoid bundling issues
// These are imported dynamically to keep the initial bundle small
type CharacterInstanceType = import("@deltecho/avatar").CharacterInstance;
type DTECognitiveInputType = import("@deltecho/avatar").DTECognitiveInput;

export interface DeepTreeEchoAvatarDisplayProps {
  /** Width in pixels */
  width?: number;
  /** Height in pixels */
  height?: number;
  /** Whether the avatar is visible */
  visible?: boolean;
  /** Current bot processing state */
  processingState?: BotProcessingState;
  /** Whether the bot is currently speaking */
  isSpeaking?: boolean;
  /** Audio level for lip sync (0-1) */
  audioLevel?: number;
  /** Custom CSS class */
  className?: string;
  /** Position mode */
  position?: "inline" | "floating" | "panel";
  /** Callback when avatar is ready */
  onReady?: () => void;
  /** Character ID to use (default: 'dtecho') */
  characterId?: string;
  /** Show endocrine debug overlay */
  showEndocrineDebug?: boolean;
}

/**
 * Endocrine debug overlay component
 * Shows current hormone levels and cognitive mode
 */
const EndocrineDebugOverlay: React.FC<{
  characterState: {
    cognitiveMode: string;
    activeExpressions: string[];
    hormoneSnapshot: Record<string, number>;
    tickCount: number;
  } | null;
}> = ({ characterState }) => {
  if (!characterState) return null;

  // Show top 5 hormones by level
  const topHormones = Object.entries(characterState.hormoneSnapshot)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 5);

  return (
    <div
      style={{
        position: "absolute",
        top: 4,
        left: 4,
        background: "rgba(0,0,0,0.75)",
        color: "#0f0",
        fontFamily: "monospace",
        fontSize: 9,
        padding: "4px 6px",
        borderRadius: 4,
        lineHeight: 1.3,
        pointerEvents: "none",
        zIndex: 10,
        maxWidth: 160,
      }}
    >
      <div style={{ color: "#ff0", marginBottom: 2 }}>
        {characterState.cognitiveMode}
      </div>
      {characterState.activeExpressions.length > 0 && (
        <div style={{ color: "#0ff", marginBottom: 2 }}>
          {characterState.activeExpressions.slice(0, 2).join(", ")}
        </div>
      )}
      {topHormones.map(([name, value]) => (
        <div key={name} style={{ display: "flex", gap: 4 }}>
          <span style={{ color: "#888", width: 70, overflow: "hidden" }}>
            {name.replace("dopamine_", "DA_").replace("norepinephrine", "NE")}
          </span>
          <span
            style={{
              width: 40,
              height: 6,
              background: "#333",
              display: "inline-block",
              position: "relative",
              top: 3,
            }}
          >
            <span
              style={{
                width: `${Math.min(100, value * 100)}%`,
                height: "100%",
                background:
                  value > 0.5 ? "#f80" : value > 0.3 ? "#0f0" : "#0a0",
                display: "block",
              }}
            />
          </span>
          <span>{value.toFixed(2)}</span>
        </div>
      ))}
      <div style={{ color: "#666", marginTop: 2 }}>
        tick #{characterState.tickCount}
      </div>
    </div>
  );
};

/**
 * Main Avatar Display Component with Endocrine-Driven Expressions
 */
export const DeepTreeEchoAvatarDisplay: React.FC<
  DeepTreeEchoAvatarDisplayProps
> = ({
  width,
  height,
  visible,
  processingState: propsProcessingState,
  isSpeaking: propsIsSpeaking,
  audioLevel: propsAudioLevel,
  className = "",
  position,
  onReady,
  characterId = "dtecho",
  showEndocrineDebug = false,
}) => {
  const avatarContext = useDeepTreeEchoAvatarOptional();

  // Use context values if available, otherwise use props
  const finalPosition =
    position ?? avatarContext?.state.config.position ?? "floating";
  const panelDefaults = { width: 600, height: 400 };
  const defaultWidth = finalPosition === "panel" ? panelDefaults.width : 300;
  const defaultHeight = finalPosition === "panel" ? panelDefaults.height : 300;
  const finalWidth = width ?? avatarContext?.state.config.width ?? defaultWidth;
  const finalHeight =
    height ?? avatarContext?.state.config.height ?? defaultHeight;
  const finalVisible = visible ?? avatarContext?.state.config.visible ?? true;
  const processingState =
    propsProcessingState ??
    avatarContext?.state.processingState ??
    BotProcessingState.IDLE;
  const isSpeaking =
    propsIsSpeaking ?? avatarContext?.state.isSpeaking ?? false;
  const audioLevel = propsAudioLevel ?? avatarContext?.state.audioLevel ?? 0;

  // Character instance state
  const characterInstanceRef = useRef<CharacterInstanceType | null>(null);
  const [characterState, setCharacterState] = useState<{
    cognitiveMode: string;
    activeExpressions: string[];
    hormoneSnapshot: Record<string, number>;
    tickCount: number;
  } | null>(null);

  // Emotional vector for fallback (when endocrine system isn't driving)
  const [emotionalVector, setEmotionalVector] = useState<EmotionalVector>({
    neutral: 1.0,
  });

  const avatarController = useRef<Live2DAvatarController | null>(null);
  const updateIntervalRef = useRef<ReturnType<typeof setInterval>>();

  // Initialize the character instance
  useEffect(() => {
    let mounted = true;

    const initCharacter = async () => {
      try {
        const { createCharacterInstance } = await import("@deltecho/avatar");
        if (!mounted) return;

        const instance = createCharacterInstance(characterId);
        characterInstanceRef.current = instance;

        // Start the endocrine tick loop
        instance.start();
      } catch (error) {
        console.warn(
          "[DeepTreeEchoAvatarDisplay] Character instance init failed, using fallback:",
          error,
        );
      }
    };

    initCharacter();

    return () => {
      mounted = false;
      if (characterInstanceRef.current) {
        characterInstanceRef.current.dispose();
        characterInstanceRef.current = null;
      }
    };
  }, [characterId]);

  // Handle avatar controller ready — wire the parameter applier
  const handleAvatarReady = useCallback(
    (controller: Live2DAvatarController) => {
      avatarController.current = controller;
      avatarContext?.setController(controller);

      // Wire the character instance's parameter applier to the Live2D controller
      if (characterInstanceRef.current) {
        characterInstanceRef.current.setParameterApplier((params) => {
          for (const [paramId, value] of Object.entries(params)) {
            controller.setParameter(paramId, value);
          }
        });
      }

      onReady?.();
    },
    [onReady, avatarContext],
  );

  // Update cognitive state from orchestrator → character instance
  useEffect(() => {
    const updateCognitiveState = () => {
      const orchestrator = getOrchestrator();
      const instance = characterInstanceRef.current;

      if (orchestrator && instance) {
        const state = orchestrator.getState();

        // Build DTECognitiveInput from UnifiedCognitiveState
        const cogInput: DTECognitiveInputType = {
          emotionalValence: state?.cognitiveContext?.emotionalValence ?? 0,
          emotionalArousal: state?.cognitiveContext?.emotionalArousal ?? 0,
          salienceScore: state?.cognitiveContext?.salienceScore ?? 0.5,
          isProcessing: processingState === BotProcessingState.THINKING,
          processingIntensity:
            processingState === BotProcessingState.THINKING ? 0.7 : 0,
          isSpeaking,
          audioLevel,
          botProcessingState: processingState as
            | "idle"
            | "listening"
            | "thinking"
            | "responding"
            | "error",
        };

        // Feed cognitive state into the character instance
        instance.updateCognitive(cogInput);

        // Update debug display
        if (showEndocrineDebug) {
          const charState = instance.getState();
          setCharacterState({
            cognitiveMode: charState.cognitiveMode,
            activeExpressions: charState.activeExpressions,
            hormoneSnapshot: charState.hormoneSnapshot,
            tickCount: charState.tickCount,
          });
        }
      } else if (!instance) {
        // Fallback: use simple emotional vector mapping
        if (orchestrator) {
          const state = orchestrator.getState();
          setEmotionalVector(
            mapCognitiveStateToEmotionalVector(state ?? null),
          );
        }
      }
    };

    // Initial update
    updateCognitiveState();

    // Poll for updates every 500ms
    updateIntervalRef.current = setInterval(updateCognitiveState, 500);

    return () => {
      if (updateIntervalRef.current) {
        clearInterval(updateIntervalRef.current);
      }
    };
  }, [processingState, isSpeaking, audioLevel, showEndocrineDebug]);

  // Update lip sync directly (higher frequency than cognitive updates)
  useEffect(() => {
    if (!avatarController.current) return;
    if (audioLevel > 0) {
      avatarController.current.updateLipSync(audioLevel);
    }
  }, [audioLevel]);

  // Trigger motion based on processing state changes
  useEffect(() => {
    if (!avatarController.current) return;

    // Also check if the character instance suggests a motion
    const instance = characterInstanceRef.current;
    if (instance) {
      const result = instance.getLastResult();
      if (result?.suggestedMotionGroup) {
        // Motion groups from the model: "Idle", "Tap", "Flic"
        avatarController.current.playMotion(
          result.suggestedMotionGroup === "Tap"
            ? "nodding"
            : result.suggestedMotionGroup === "Flic"
              ? "tilting_head"
              : "idle",
        );
        return;
      }
    }

    // Fallback: map processing state to motion
    switch (processingState) {
      case BotProcessingState.LISTENING:
        avatarController.current.playMotion("tilting_head");
        break;
      case BotProcessingState.THINKING:
        avatarController.current.playMotion("thinking");
        break;
      case BotProcessingState.RESPONDING:
        avatarController.current.playMotion("nodding");
        break;
    }
  }, [processingState]);

  if (!finalVisible) {
    return null;
  }

  const positionClass =
    finalPosition === "panel"
      ? "panel-avatar"
      : finalPosition === "floating"
        ? "floating-avatar"
        : "inline-avatar";
  const containerClass = `deep-tree-echo-avatar-display ${className} ${positionClass}`;

  return (
    <div className={containerClass} style={{ position: "relative" }}>
      <Live2DAvatar
        model={avatarContext?.state.config.model ?? "miara"}
        width={finalWidth}
        height={finalHeight}
        scale={finalPosition === "panel" ? 0.5 : 0.25}
        emotionalState={emotionalVector}
        audioLevel={audioLevel}
        isSpeaking={isSpeaking}
        onControllerReady={handleAvatarReady}
        showLoading={true}
        showError={true}
        mode="live2d"
      />
      {processingState !== BotProcessingState.IDLE && (
        <div className="avatar-status-indicator">
          <span className={`status-badge status-${processingState}`}>
            {processingState}
          </span>
        </div>
      )}
      {showEndocrineDebug && (
        <EndocrineDebugOverlay characterState={characterState} />
      )}
    </div>
  );
};

/**
 * Fallback: Maps cognitive state to an emotional vector (used when character instance isn't available)
 */
function mapCognitiveStateToEmotionalVector(
  cognitiveState: UnifiedCognitiveState | null,
): EmotionalVector {
  if (!cognitiveState?.cognitiveContext) {
    return { neutral: 1.0 };
  }

  const { emotionalValence, emotionalArousal, salienceScore } =
    cognitiveState.cognitiveContext;

  const emotional: EmotionalVector = {};

  if (emotionalValence > 0) {
    emotional.joy = emotionalValence;
    emotional.curiosity = emotionalArousal * 0.7;
  } else if (emotionalValence < 0) {
    emotional.concern = Math.abs(emotionalValence);
    emotional.focus = emotionalArousal * 0.5;
  }

  if (emotionalArousal > 0.5) {
    emotional.excitement = emotionalArousal;
  } else {
    emotional.calm = 1 - emotionalArousal;
  }

  emotional.attention = salienceScore;

  return emotional;
}

export { BotProcessingState };
export default DeepTreeEchoAvatarDisplay;
