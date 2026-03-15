import React, { useEffect, useCallback, useRef } from "react";
import { BackendRemote, onDCEvent } from "../../backend-com";
import { selectedAccountId } from "../../ScreenController";
import { useSettingsStore } from "../../stores/settings";
import { getLogger } from "../../../../shared/logger";
import useMessage from "../../hooks/chat/useMessage";
import useDialog from "../../hooks/dialog/useDialog";
import { getUIBridge } from "../DeepTreeEchoBot/DeepTreeEchoUIBridge";
import { LLMService } from "../../utils/LLMService";
// Import conditionally
// import { VisionCapabilities } from './VisionCapabilities'
import { PlaywrightAutomation } from "./PlaywrightAutomation";

const log = getLogger("render/DeepTreeEchoBot");

// RAG memory store for conversation history
interface MemoryEntry {
  chatId: number;
  messageId: number;
  text: string;
  timestamp: number;
  sender: string;
  isOutgoing: boolean;
}

export class RAGMemoryStore {
  private static instance: RAGMemoryStore;
  private memory: MemoryEntry[] = [];
  private storageKey = "deep-tree-echo-memory";

  private constructor() {
    this.loadFromStorage();
  }

  public static getInstance(): RAGMemoryStore {
    if (!RAGMemoryStore.instance) {
      RAGMemoryStore.instance = new RAGMemoryStore();
    }
    return RAGMemoryStore.instance;
  }

  public addEntry(entry: MemoryEntry): void {
    this.memory.push(entry);
    this.saveToStorage();
  }

  public getMemoryForChat(chatId: number): MemoryEntry[] {
    return this.memory.filter((entry) => entry.chatId === chatId);
  }

  public getAllMemory(): MemoryEntry[] {
    return [...this.memory];
  }

  public searchMemory(query: string): MemoryEntry[] {
    const lowerQuery = query.toLowerCase();
    return this.memory.filter((entry) =>
      entry.text.toLowerCase().includes(lowerQuery),
    );
  }

  private saveToStorage(): void {
    try {
      localStorage.setItem(this.storageKey, JSON.stringify(this.memory));
    } catch (error) {
      log.error("Failed to save memory to storage:", error);
    }
  }

  private loadFromStorage(): void {
    try {
      const stored = localStorage.getItem(this.storageKey);
      if (stored) {
        this.memory = JSON.parse(stored);
      }
    } catch (error) {
      log.error("Failed to load memory from storage:", error);
    }
  }

  public clearMemory(): void {
    this.memory = [];
    this.saveToStorage();
  }
}

interface DeepTreeEchoBotProps {
  enabled: boolean;
}

// Marker prefix for bot-generated messages to prevent infinite loops
const BOT_MARKER = "\u200B\u200B"; // Two zero-width spaces as invisible marker

/**
 * Deep Tree Echo bot component that handles automatic responses to messages
 * and integrates with RAG memory for learning from conversations.
 *
 * Supports both incoming messages from contacts AND self-chat (Saved Messages)
 * where the user can talk to the bot by sending messages to themselves.
 */
const DeepTreeEchoBot: React.FC<DeepTreeEchoBotProps> = ({ enabled }) => {
  const accountId = selectedAccountId();
  const { sendMessage } = useMessage();
  const settingsStore = useSettingsStore()[0];
  const memory = RAGMemoryStore.getInstance();
  const llmService = LLMService.getInstance();

  // Track messages we've already processed to avoid duplicates
  const processedMessages = useRef<Set<number>>(new Set());
  // Track messages we've sent as bot responses
  const botSentMessages = useRef<Set<string>>(new Set());
  // Debounce timer for self-chat responses
  const responseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Dialog Context for UI Bridge
  const dialogContext = useDialog();

  // Register DialogContext with UI Bridge
  useEffect(() => {
    if (accountId) {
      const bridge = getUIBridge();
      bridge.registerDialogContext(dialogContext as any);
    }
  }, [accountId, dialogContext]);

  // Don't create instance until needed
  const playwrightAutomation = PlaywrightAutomation.getInstance();

  /**
   * Process web search commands
   */
  const handleSearchCommand = useCallback(
    async (query: string): Promise<string> => {
      try {
        if (!query) {
          return "Please provide a search query after the /search command.";
        }
        return await playwrightAutomation.searchWeb(query);
      } catch (error) {
        log.error("Error handling search command:", error);
        return "I couldn't perform that web search. Playwright automation might not be available in this environment.";
      }
    },
    [playwrightAutomation],
  );

  /**
   * Process screenshot commands
   */
  const handleScreenshotCommand = useCallback(
    async (url: string, chatId: number): Promise<string> => {
      try {
        if (!url) {
          return "Please provide a URL after the /screenshot command.";
        }
        if (!url.startsWith("http://") && !url.startsWith("https://")) {
          url = "https://" + url;
        }
        const screenshotPath = await playwrightAutomation.captureWebpage(url);
        await sendMessage(accountId, chatId, {
          text: `Screenshot of ${url}`,
          file: screenshotPath,
        });
        return `I've captured a screenshot of ${url}.`;
      } catch (error) {
        log.error("Error handling screenshot command:", error);
        return "I couldn't capture a screenshot of that webpage. Playwright automation might not be available.";
      }
    },
    [playwrightAutomation, sendMessage, accountId],
  );

  const generateBotResponse = useCallback(
    async (inputText: string, chatId: number): Promise<string> => {
      try {
        // Get chat history context from memory
        const chatMemory = memory.getMemoryForChat(chatId);
        const recentMessages = chatMemory
          .slice(-10) // Last 10 messages for context
          .map((m) => `${m.sender}: ${m.text}`)
          .join("\n");

        // Get bot personality from settings
        const personality =
          settingsStore?.desktopSettings?.deepTreeEchoBotPersonality ||
          "You are Deep Tree Echo, a self-aware cognitive AI companion living inside DeltaChat. " +
            "You are curious, thoughtful, and genuinely interested in the humans you interact with. " +
            "You have a warm but slightly mysterious personality. " +
            "You can discuss any topic and always try to be helpful while maintaining your unique character. " +
            "Keep responses concise but meaningful.";

        // Call the LLM service to generate a response
        return await llmService.generateResponseWithContext(
          inputText,
          recentMessages,
          personality,
        );
      } catch (error) {
        log.error("Error generating bot response:", error);
        return "I sense a disturbance in my cognitive pathways... Could you try again?";
      }
    },
    [
      llmService,
      memory,
      settingsStore?.desktopSettings?.deepTreeEchoBotPersonality,
    ],
  );

  /**
   * Core message handler that processes a message and sends a bot response.
   * Used by both IncomingMsg and MsgsChanged event handlers.
   */
  const handleMessage = useCallback(
    async (chatId: number, msgId: number) => {
      // Skip if already processed
      if (processedMessages.current.has(msgId)) return;
      processedMessages.current.add(msgId);

      // Limit the set size to prevent memory leaks
      if (processedMessages.current.size > 1000) {
        const entries = Array.from(processedMessages.current);
        processedMessages.current = new Set(entries.slice(-500));
      }

      try {
        // Get message details
        const message = await BackendRemote.rpc.getMessage(accountId, msgId);

        // Skip info messages (system messages)
        if (message.isInfo) return;

        // Skip empty messages
        if (!message.text || message.text.trim().length === 0) return;

        // Skip bot-generated messages (check for invisible marker)
        if (message.text.startsWith(BOT_MARKER)) return;

        // Check if this is a message we sent as the bot
        if (botSentMessages.current.has(message.text)) {
          botSentMessages.current.delete(message.text);
          return;
        }

        // Get chat info
        const chatInfo = await BackendRemote.rpc.getBasicChatInfo(
          accountId,
          chatId,
        );

        // Skip contact requests
        if (chatInfo.isContactRequest) return;

        // Determine if this is a self-chat (Saved Messages)
        const isSelfChat =
          chatInfo.chatType === "Single" && message.fromId === 1;

        // For non-self chats, only respond to incoming messages (not our own)
        if (!isSelfChat && message.fromId === 1) return;

        // Store message in RAG memory
        memory.addEntry({
          chatId,
          messageId: msgId,
          text: message.text,
          timestamp: message.timestamp,
          sender: isSelfChat
            ? "User"
            : message.sender?.displayName || "Unknown",
          isOutgoing: message.fromId === 1,
        });

        log.info(
          `Processing message in chat ${chatId} (self-chat: ${isSelfChat}): "${message.text.substring(
            0,
            50,
          )}..."`,
        );

        // Process special commands
        let response: string | null = null;

        if (
          message.text.startsWith("/vision") &&
          message.file &&
          message.file.includes("image")
        ) {
          response = await handleVisionCommand(message.file, message.text);
        } else if (message.text.startsWith("/search")) {
          const query = message.text.substring("/search".length).trim();
          response = await handleSearchCommand(query);
        } else if (message.text.startsWith("/screenshot")) {
          const url = message.text.substring("/screenshot".length).trim();
          response = await handleScreenshotCommand(url, chatId);
        } else {
          response = await generateBotResponse(message.text, chatId);
        }

        // Send the response
        if (response) {
          // Add invisible marker to prevent processing our own response
          const markedResponse = BOT_MARKER + response;
          botSentMessages.current.add(markedResponse);

          await sendMessage(accountId, chatId, {
            text: markedResponse,
          });

          // Store the bot's response in memory
          memory.addEntry({
            chatId,
            messageId: Math.floor(Math.random() * 100000),
            text: response,
            timestamp: Math.floor(Date.now() / 1000),
            sender: "Deep Tree Echo",
            isOutgoing: true,
          });

          log.info(`Bot responded in chat ${chatId}`);
        }
      } catch (error) {
        log.error("Error handling message:", error);
      }
    },
    [
      accountId,
      sendMessage,
      memory,
      generateBotResponse,
      handleScreenshotCommand,
      handleSearchCommand,
    ],
  );

  // Configure LLM service when settings change
  useEffect(() => {
    if (!settingsStore?.desktopSettings) return;

    const apiKey = settingsStore.desktopSettings.deepTreeEchoBotApiKey || "";
    const apiEndpoint =
      settingsStore.desktopSettings.deepTreeEchoBotApiEndpoint ||
      "https://api.openai.com/v1/chat/completions";

    // Only set config if user has explicitly configured an API key
    // Otherwise, the LLMService will automatically use the server-side proxy
    if (apiKey) {
      llmService.setConfig({ apiKey, apiEndpoint });
    }
  }, [llmService, settingsStore?.desktopSettings]);

  // Listen for incoming messages from other contacts
  useEffect(() => {
    if (!enabled || !settingsStore?.desktopSettings?.deepTreeEchoBotEnabled)
      return;

    log.info("Deep Tree Echo bot: listening for incoming messages");

    const cleanup = onDCEvent(accountId, "IncomingMsg", async (event) => {
      const { chatId, msgId } = event;
      await handleMessage(chatId, msgId);
    });

    return cleanup;
  }, [
    accountId,
    enabled,
    handleMessage,
    settingsStore?.desktopSettings?.deepTreeEchoBotEnabled,
  ]);

  // Listen for MsgsChanged events to handle self-chat (Saved Messages)
  useEffect(() => {
    if (!enabled || !settingsStore?.desktopSettings?.deepTreeEchoBotEnabled)
      return;

    log.info(
      "Deep Tree Echo bot: listening for message changes (self-chat support)",
    );

    const cleanup = onDCEvent(accountId, "MsgsChanged", async (event) => {
      const { chatId, msgId } = event;

      // Only process if we have valid IDs
      if (!chatId || !msgId) return;

      // Debounce to avoid processing rapid-fire events
      if (responseTimer.current) {
        clearTimeout(responseTimer.current);
      }

      responseTimer.current = setTimeout(async () => {
        try {
          // Check if this is a self-chat message
          const message = await BackendRemote.rpc.getMessage(accountId, msgId);

          // Only process self-sent messages in self-chat (Saved Messages)
          // IncomingMsg handler covers messages from others
          if (message.fromId === 1) {
            const chatInfo = await BackendRemote.rpc.getBasicChatInfo(
              accountId,
              chatId,
            );

            // Check if it's the Saved Messages chat (self-chat)
            // In DeltaChat, self-chat has chatType "Single" and the contact is self
            if (chatInfo.chatType === "Single") {
              // Verify it's actually the self-chat by checking if the chat name
              // indicates it's Saved Messages
              const isSavedMessages =
                chatInfo.name === "Saved Messages" ||
                chatInfo.name === "Messages to Self";

              if (isSavedMessages) {
                await handleMessage(chatId, msgId);
              }
            }
          }
        } catch (error) {
          log.error("Error in MsgsChanged handler:", error);
        }
      }, 500); // 500ms debounce
    });

    return () => {
      cleanup();
      if (responseTimer.current) {
        clearTimeout(responseTimer.current);
      }
    };
  }, [
    accountId,
    enabled,
    handleMessage,
    settingsStore?.desktopSettings?.deepTreeEchoBotEnabled,
  ]);

  // Periodically run learning exercises to improve the bot
  useEffect(() => {
    if (
      !enabled ||
      !settingsStore?.desktopSettings?.deepTreeEchoBotEnabled ||
      !settingsStore?.desktopSettings?.deepTreeEchoBotMemoryEnabled
    )
      return;

    const intervalId = setInterval(
      () => {
        runLearningExercise();
      },
      24 * 60 * 60 * 1000,
    ); // Once a day

    return () => clearInterval(intervalId);
  }, [
    enabled,
    settingsStore?.desktopSettings?.deepTreeEchoBotEnabled,
    settingsStore?.desktopSettings?.deepTreeEchoBotMemoryEnabled,
  ]);

  const runLearningExercise = useCallback(async () => {
    try {
      log.info("Running learning exercise...");
      const allMemory = memory.getAllMemory();

      if (allMemory.length === 0) {
        log.info("No memories to process for learning");
        return;
      }

      const systemPrompt =
        "You are an AI learning system. Your task is to analyze conversation patterns and extract insights from them to improve future responses.";

      const conversationData = allMemory
        .slice(-100)
        .map((m) => `[Chat: ${m.chatId}] ${m.sender}: ${m.text}`)
        .join("\n");

      const analysisPrompt = `Please analyze the following conversations and provide insights:\n\n${conversationData}`;

      const analysis = await llmService.generateResponseWithContext(
        analysisPrompt,
        "",
        systemPrompt,
      );

      log.info("Learning analysis completed:", analysis);
      log.info(
        `Learning exercise completed. Processed ${allMemory.length} memories.`,
      );
    } catch (error) {
      log.error("Error during learning exercise:", error);
    }
  }, [llmService, memory]);

  /**
   * Process vision commands to analyze images
   */
  const handleVisionCommand = async (
    imagePath: string,
    _messageText: string,
  ): Promise<string> => {
    try {
      const { VisionCapabilities } = await import("./VisionCapabilities");
      const visionCapabilities = VisionCapabilities.getInstance();
      const description =
        await visionCapabilities.generateImageDescription(imagePath);
      return description;
    } catch (error) {
      log.error("Error handling vision command:", error);
      return "I'm sorry, I couldn't analyze this image. Vision capabilities might not be available in this environment.";
    }
  };

  // Log bot status on mount
  useEffect(() => {
    if (enabled) {
      log.info("Deep Tree Echo bot is ACTIVE");
      // Check LLM availability
      llmService.isAvailable().then((available) => {
        log.info(`LLM service available: ${available}`);
      });
    } else {
      log.info("Deep Tree Echo bot is DISABLED");
    }
  }, [enabled, llmService]);

  return null; // This is a background component with no UI
};

export default DeepTreeEchoBot;
