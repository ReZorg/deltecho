import React, { useEffect, useCallback, useRef, useState } from "react";
import { BackendRemote, onDCEvent } from "../../backend-com";
import { selectedAccountId } from "../../ScreenController";
import { useSettingsStore } from "../../stores/settings";
import { getLogger } from "../../../../shared/logger";
import { LLMService } from "../../utils/LLMService";

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

// Default message data template for sendMsg
const MESSAGE_DEFAULT = {
  file: null,
  filename: null,
  viewtype: null,
  html: null,
  location: null,
  overrideSenderName: null,
  quotedMessageId: null,
  quotedText: null,
  text: null,
};

/**
 * Deep Tree Echo bot component that handles automatic responses to messages.
 * Uses BackendRemote.rpc.sendMsg directly to avoid UI context dependencies.
 *
 * Supports both incoming messages from contacts AND self-chat (Saved Messages)
 * where the user can talk to the bot by sending messages to themselves.
 */
const DeepTreeEchoBot: React.FC<DeepTreeEchoBotProps> = ({ enabled }) => {
  const accountId = selectedAccountId();
  const settingsStore = useSettingsStore()[0];
  const memory = RAGMemoryStore.getInstance();
  const llmService = LLMService.getInstance();

  // Debug status for visible indicator
  const [debugStatus, setDebugStatus] = useState<string>("Initializing...");
  const [lastEvent, setLastEvent] = useState<string>("");
  const [messageCount, setMessageCount] = useState(0);

  // Track messages we've already processed to avoid duplicates
  const processedMessages = useRef<Set<number>>(new Set());
  // Track messages we've sent as bot responses
  const botSentMessages = useRef<Set<string>>(new Set());
  // Debounce timer for self-chat responses
  const responseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Processing lock to prevent concurrent responses
  const isProcessing = useRef(false);

  /**
   * Send a message directly via RPC, bypassing useMessage hook
   * This avoids dependency on ChatContext and works from any UI state
   */
  const sendBotMessage = useCallback(
    async (chatId: number, text: string) => {
      try {
        await BackendRemote.rpc.sendMsg(accountId, chatId, {
          ...MESSAGE_DEFAULT,
          text,
        });
        log.info(`Bot sent message to chat ${chatId}`);
      } catch (error) {
        log.error(`Failed to send bot message to chat ${chatId}:`, error);
        throw error;
      }
    },
    [accountId],
  );

  const generateBotResponse = useCallback(
    async (inputText: string, chatId: number): Promise<string> => {
      try {
        // Get chat history context from memory
        const chatMemory = memory.getMemoryForChat(chatId);
        const recentMessages = chatMemory
          .slice(-10)
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

      // Prevent concurrent processing
      if (isProcessing.current) {
        log.info("Already processing a message, skipping");
        return;
      }
      isProcessing.current = true;

      try {
        // Get message details
        const message = await BackendRemote.rpc.getMessage(accountId, msgId);

        setLastEvent(
          `Msg ${msgId}: "${(message.text || "").substring(0, 30)}..."`,
        );

        // Skip info messages (system messages)
        if (message.isInfo) {
          log.info(`Skipping info message ${msgId}`);
          return;
        }

        // Skip empty messages
        if (!message.text || message.text.trim().length === 0) {
          log.info(`Skipping empty message ${msgId}`);
          return;
        }

        // Skip bot-generated messages (check for invisible marker)
        if (message.text.startsWith(BOT_MARKER)) {
          log.info(`Skipping bot-marked message ${msgId}`);
          return;
        }

        // Check if this is a message we sent as the bot
        if (botSentMessages.current.has(message.text)) {
          botSentMessages.current.delete(message.text);
          log.info(`Skipping own bot message ${msgId}`);
          return;
        }

        // Get chat info
        const chatInfo = await BackendRemote.rpc.getBasicChatInfo(
          accountId,
          chatId,
        );

        // Skip contact requests
        if (chatInfo.isContactRequest) {
          log.info(`Skipping contact request message ${msgId}`);
          return;
        }

        // Determine if this is a self-chat (Saved Messages)
        const isSelfChat = chatInfo.isSelfTalk === true;

        // For non-self chats, only respond to incoming messages (not our own)
        if (!isSelfChat && message.fromId === 1) {
          log.info(`Skipping own outgoing message ${msgId} in non-self chat`);
          return;
        }

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
        setDebugStatus(`Processing: "${message.text.substring(0, 30)}..."`);

        // Generate response
        const response = await generateBotResponse(message.text, chatId);

        // Send the response
        if (response) {
          // Add invisible marker to prevent processing our own response
          const markedResponse = BOT_MARKER + response;
          botSentMessages.current.add(markedResponse);

          await sendBotMessage(chatId, markedResponse);

          // Store the bot's response in memory
          memory.addEntry({
            chatId,
            messageId: Math.floor(Math.random() * 100000),
            text: response,
            timestamp: Math.floor(Date.now() / 1000),
            sender: "Deep Tree Echo",
            isOutgoing: true,
          });

          setMessageCount((c) => c + 1);
          setDebugStatus(`Responded (${messageCount + 1} total)`);
          log.info(`Bot responded in chat ${chatId}`);
        }
      } catch (error) {
        log.error("Error handling message:", error);
        setDebugStatus(
          `Error: ${error instanceof Error ? error.message : String(error)}`,
        );
      } finally {
        isProcessing.current = false;
      }
    },
    [accountId, sendBotMessage, memory, generateBotResponse, messageCount],
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
    if (!enabled || !settingsStore?.desktopSettings?.deepTreeEchoBotEnabled) {
      setDebugStatus("Disabled (waiting for settings)");
      return;
    }

    log.info("Deep Tree Echo bot: listening for incoming messages");
    setDebugStatus("Listening for messages...");

    const cleanup = onDCEvent(accountId, "IncomingMsg", async (event) => {
      const { chatId, msgId } = event;
      log.info(`IncomingMsg event: chat=${chatId}, msg=${msgId}`);
      setLastEvent(`IncomingMsg: chat=${chatId}, msg=${msgId}`);
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
    if (!enabled || !settingsStore?.desktopSettings?.deepTreeEchoBotEnabled) {
      return;
    }

    log.info(
      "Deep Tree Echo bot: listening for message changes (self-chat support)",
    );

    const cleanup = onDCEvent(accountId, "MsgsChanged", async (event) => {
      const { chatId, msgId } = event;

      // Only process if we have valid IDs
      if (!chatId || !msgId) return;

      log.info(`MsgsChanged event: chat=${chatId}, msg=${msgId}`);
      setLastEvent(`MsgsChanged: chat=${chatId}, msg=${msgId}`);

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

            // Use isSelfTalk to reliably detect Saved Messages chat
            if (chatInfo.isSelfTalk) {
              log.info(
                `Self-chat message detected: chat=${chatId}, msg=${msgId}`,
              );
              await handleMessage(chatId, msgId);
            }
          }
        } catch (error) {
          log.error("Error in MsgsChanged handler:", error);
          setDebugStatus(
            `MsgsChanged error: ${
              error instanceof Error ? error.message : String(error)
            }`,
          );
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

  // Log bot status on mount and check LLM availability
  useEffect(() => {
    if (enabled) {
      log.info("Deep Tree Echo bot is ACTIVE");
      setDebugStatus("Active - checking LLM...");
      llmService
        .isAvailable()
        .then((available) => {
          log.info(`LLM service available: ${available}`);
          setDebugStatus(
            available
              ? "Active - LLM ready"
              : "Active - LLM unavailable (will use fallback)",
          );
        })
        .catch((err) => {
          log.error("LLM availability check failed:", err);
          setDebugStatus("Active - LLM check failed");
        });
    } else {
      log.info("Deep Tree Echo bot is DISABLED (enabled prop is false)");
      setDebugStatus("Disabled (enabled=false)");
    }
  }, [enabled, llmService]);

  // Render a small debug indicator in the corner
  return (
    <div
      style={{
        position: "fixed",
        bottom: "4px",
        left: "4px",
        zIndex: 9999,
        background: "rgba(0,0,0,0.7)",
        color: enabled ? "#0f0" : "#f00",
        padding: "2px 6px",
        borderRadius: "4px",
        fontSize: "10px",
        fontFamily: "monospace",
        maxWidth: "300px",
        pointerEvents: "none",
      }}
    >
      DTE: {debugStatus}
      {lastEvent && (
        <span style={{ color: "#888", display: "block" }}>{lastEvent}</span>
      )}
    </div>
  );
};

export default DeepTreeEchoBot;
