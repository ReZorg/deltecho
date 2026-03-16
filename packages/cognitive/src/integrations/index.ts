/**
 * Integration Adapters Exports
 */

export { PersonaAdapter, createPersonaAdapter } from "./persona-adapter";
export type { IPersonaCore, PersonaAdapterConfig } from "./persona-adapter";

export { MemoryAdapter, createMemoryAdapter } from "./memory-adapter";
export type {
  IMemory,
  IRAGMemoryStore,
  MemoryAdapterConfig,
} from "./memory-adapter";

export { LLMAdapter, createLLMAdapter } from "./llm-adapter";
export type {
  ILLMService,
  LLMAdapterConfig,
  LLMResponse,
  PromptContext,
} from "./llm-adapter";

export {
  DreamGenNarrativeAdapter,
  createDreamGenNarrativeAdapter,
  DEFAULT_DREAMGEN_CONFIG,
  type DTECognitiveSnapshot,
  type EndocrineSnapshot,
  type DreamGenNarrativeConfig,
  type NarrativeResult,
  type NarrativeEvent,
  type NarrativeEventListener,
} from "./dreamgen-narrative";
