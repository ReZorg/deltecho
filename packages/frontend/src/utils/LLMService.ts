import { getLogger } from "../../../shared/logger";

const log = getLogger("renderer/LLMService");

export interface ContentPart {
  type: "text" | "image_url";
  text?: string;
  image_url?: {
    url: string;
    detail?: "auto" | "low" | "high";
  };
}

export type MessageContent = string | ContentPart[];

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: MessageContent;
}

export interface OpenAIRequestParams {
  model: string;
  messages: ChatMessage[];
  temperature?: number;
  max_tokens?: number;
  top_p?: number;
  frequency_penalty?: number;
  presence_penalty?: number;
  stream?: boolean;
}

export interface LLMConfig {
  apiKey: string;
  apiEndpoint: string;
  model?: string;
  temperature?: number;
  maxTokens?: number;
}

interface LLMProxyStatus {
  available: boolean;
  endpoint: string;
  model: string;
}

export class LLMService {
  private static instance: LLMService;
  private config: LLMConfig = {
    apiKey: "",
    apiEndpoint: "https://api.openai.com/v1/chat/completions",
    model: "gpt-4.1-mini",
    temperature: 0.7,
    maxTokens: 1000,
  };
  private proxyStatus: LLMProxyStatus | null = null;
  private proxyChecked = false;

  private constructor() {}

  public static getInstance(): LLMService {
    if (!LLMService.instance) {
      LLMService.instance = new LLMService();
    }
    return LLMService.instance;
  }

  public setConfig(config: Partial<LLMConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Check if the server-side LLM proxy is available.
   * This allows the bot to work without users configuring API keys.
   */
  private async checkProxyStatus(): Promise<LLMProxyStatus | null> {
    if (this.proxyChecked) {
      return this.proxyStatus;
    }
    try {
      const response = await fetch("/backend-api/llm/status");
      if (response.ok) {
        this.proxyStatus = await response.json();
        log.info("LLM proxy status:", this.proxyStatus);
      }
    } catch (error) {
      log.debug("LLM proxy not available:", error);
      this.proxyStatus = null;
    }
    this.proxyChecked = true;
    return this.proxyStatus;
  }

  /**
   * Check if the LLM service is available (either via proxy or direct API key)
   */
  public async isAvailable(): Promise<boolean> {
    if (this.config.apiKey) {
      return true;
    }
    const proxy = await this.checkProxyStatus();
    return proxy?.available ?? false;
  }

  public async generateResponse(
    messages: ChatMessage[],
    overrideConfig?: Partial<LLMConfig>,
  ): Promise<string> {
    const config = { ...this.config, ...overrideConfig };

    // If no direct API key is configured, try the server-side proxy
    if (!config.apiKey) {
      return this.generateResponseViaProxy(messages, config);
    }

    // Direct API call with user-provided API key
    return this.generateResponseDirect(messages, config);
  }

  /**
   * Generate response via the server-side LLM proxy endpoint.
   * This uses the OPENAI_API_KEY configured on the server.
   */
  private async generateResponseViaProxy(
    messages: ChatMessage[],
    config: LLMConfig,
  ): Promise<string> {
    try {
      const proxy = await this.checkProxyStatus();
      if (!proxy?.available) {
        throw new Error(
          "LLM service not available. Configure OPENAI_API_KEY on the server or set an API key in settings.",
        );
      }

      const response = await fetch(proxy.endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messages,
          model: config.model || proxy.model,
          temperature: config.temperature,
          max_tokens: config.maxTokens,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(
          `LLM Proxy Error: ${response.status} - ${JSON.stringify(errorData)}`,
        );
      }

      const data = await response.json();
      return data.choices[0].message.content;
    } catch (error) {
      log.error("Error generating response via proxy:", error);
      throw error;
    }
  }

  /**
   * Generate response via direct API call with user-provided API key.
   */
  private async generateResponseDirect(
    messages: ChatMessage[],
    config: LLMConfig,
  ): Promise<string> {
    try {
      const requestPayload: OpenAIRequestParams = {
        model: config.model || "gpt-4.1-mini",
        messages,
        temperature: config.temperature,
        max_tokens: config.maxTokens,
      };

      const response = await fetch(config.apiEndpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${config.apiKey}`,
        },
        body: JSON.stringify(requestPayload),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(
          `API Error: ${response.status} - ${JSON.stringify(errorData)}`,
        );
      }

      const data = await response.json();
      return data.choices[0].message.content;
    } catch (error) {
      log.error("Error generating response from LLM:", error);
      throw error;
    }
  }

  public async generateResponseWithContext(
    userInput: string,
    conversationHistory: string,
    systemPrompt: string,
  ): Promise<string> {
    const messages: ChatMessage[] = [
      {
        role: "system",
        content: systemPrompt,
      },
    ];

    // Add conversation history as context if available
    if (conversationHistory && conversationHistory.trim().length > 0) {
      messages.push({
        role: "user",
        content: `Here is the recent conversation history for context:\n${conversationHistory}\n\nPlease keep this in mind when responding to my next message.`,
      });

      messages.push({
        role: "assistant",
        content:
          "I'll keep this conversation context in mind when responding to your next message.",
      });
    }

    // Add the current user message
    messages.push({
      role: "user",
      content: userInput,
    });

    return this.generateResponse(messages);
  }
}
