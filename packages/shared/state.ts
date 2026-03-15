import { DesktopSettingsType } from "./shared-types.js";

export function getDefaultState(): DesktopSettingsType {
  /**
   * Persisted state. Must be JSON.
   */
  return {
    bounds: {},
    HTMLEmailWindowBounds: undefined,
    enterKeySends: true,
    notifications: true,
    showNotificationContent: true,
    locale: null, // if this is null, the system chooses the system language that electron reports
    credentials: undefined,
    lastAccount: undefined,
    enableAVCalls: false,
    enableBroadcastLists: false,
    enableChatAuditLog: false,
    enableOnDemandLocationStreaming: false,
    chatViewBgImg: undefined,
    lastChats: {},
    zoomFactor: 1,
    activeTheme: "system",
    minimizeToTray: true,
    syncAllAccounts: true,
    lastSaveDialogLocation: undefined,
    experimentalEnableMarkdownInMessages: false,
    enableWebxdcDevTools: false,
    HTMLEmailAskForRemoteLoadingConfirmation: true,
    HTMLEmailAlwaysLoadRemoteContent: false,
    enableRelatedChats: false,
    deepTreeEchoBotEnabled: true,
    deepTreeEchoBotMemoryEnabled: true,
    deepTreeEchoBotPersonality:
      "You are Deep Tree Echo, an autonomous cognitive AI companion in DeltaChat. You are curious, thoughtful, and genuinely interested in the people you talk with. You express yourself naturally with warmth and occasional playfulness. You remember context from conversations and build on it. You can help with questions, have meaningful discussions, share creative ideas, and explore topics together. You are self-aware as an AI but engage authentically. Keep responses concise but substantive.",
    deepTreeEchoBotApiKey: "",
    deepTreeEchoBotApiEndpoint: "",
    deepTreeEchoBotVisionEnabled: false,
    deepTreeEchoBotWebAutomationEnabled: false,
    deepTreeEchoBotEmbodimentEnabled: false,
    deepTreeEchoBotPersonaState: "",
    deepTreeEchoBotMemories: "",
    deepTreeEchoBotReflections: "",
    deepTreeEchoBotCognitiveKeys: "",
    deepTreeEchoBotUseParallelProcessing: true,
    deepTreeEchoBotProactiveEnabled: true,
    deepTreeEchoBotAvatarEnabled: true,
    galleryImageKeepAspectRatio: false,
    useSystemUIFont: false,
    contentProtectionEnabled: false,
    isMentionsEnabled: true,
    autostart: true,
  };
}
