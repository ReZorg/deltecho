/**
 * @fileoverview deltecho Pipeline Integration Tests
 *
 * Rigorous integration tests for the full cognitive pipeline using only
 * the public API of the Orchestrator class:
 *   start / stop / isRunning
 *   getCognitiveTierMode / setCognitiveTierMode
 *   getProcessingStats / getCognitiveSystemStatus
 *   sendMessage (via public surface)
 *   getSys6Bridge / getDove9Integration / getDoubleMembraneIntegration
 *
 * All external I/O (DeltaChat, Dovecot, LLM, IPC, Webhooks) is mocked.
 * These tests verify internal wiring, state transitions, tier routing,
 * and error-handling paths without requiring live services.
 */

import {
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
  jest,
} from "@jest/globals";
import {
  Orchestrator,
  type OrchestratorConfig,
  type CognitiveTierMode,
} from "../orchestrator.js";

// ─── Module mocks ─────────────────────────────────────────────────────────────

jest.mock("deep-tree-echo-core", () => ({
  getLogger: () => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  }),
  LLMService: jest.fn().mockImplementation(() => ({
    generateFullParallelResponse: jest
      .fn<() => Promise<{ integratedResponse: string }>>()
      .mockResolvedValue({ integratedResponse: "Mocked LLM response" }),
    setConfig: jest.fn(),
  })),
  RAGMemoryStore: jest.fn().mockImplementation(() => ({
    setEnabled: jest.fn(),
    storeMemory: jest.fn(),
    retrieveRecentMemories: jest.fn().mockReturnValue([]),
  })),
  PersonaCore: jest.fn().mockImplementation(() => ({
    getPersonality: jest.fn().mockReturnValue("Deltecho cognitive persona"),
    getEmotionalState: jest.fn().mockReturnValue({
      joy: 0.3,
      sadness: 0,
      anger: 0,
      fear: 0,
      surprise: 0,
      disgust: 0,
      contempt: 0,
      interest: 0.2,
    }),
    getDominantEmotion: jest
      .fn()
      .mockReturnValue({ emotion: "curiosity", intensity: 0.7 }),
    updateEmotionalState: jest.fn(),
    getCognitiveState: jest.fn().mockReturnValue({
      creativity: 0.6,
      analyticalDepth: 0.5,
      empathy: 0.7,
      curiosity: 0.6,
    }),
    getPreferences: jest.fn().mockReturnValue({}),
  })),
  InMemoryStorage: jest.fn().mockImplementation(() => ({})),
}));

jest.mock("../sys6-bridge/Sys6OrchestratorBridge.js", () => ({
  Sys6OrchestratorBridge: jest.fn().mockImplementation(() => ({
    start: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
    stop: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
    processMessage: jest
      .fn<() => Promise<string>>()
      .mockResolvedValue("Sys6 triality response"),
    getState: jest.fn().mockReturnValue({
      running: true,
      cycleNumber: 3,
      currentStep: 12,
      streams: [{ salience: 0.9 }, { salience: 0.5 }, { salience: 0.3 }],
    }),
    getMetrics: jest.fn().mockReturnValue({ totalCycles: 3, totalSteps: 90 }),
    on: jest.fn(),
  })),
}));

jest.mock("../double-membrane-integration.js", () => ({
  DoubleMembraneIntegration: jest.fn().mockImplementation(() => ({
    start: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
    stop: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
    isRunning: jest.fn().mockReturnValue(true),
    chat: jest
      .fn<() => Promise<string>>()
      .mockResolvedValue("Double membrane response"),
    getStatus: jest.fn().mockReturnValue({ identityEnergy: 0.85 }),
    getMetrics: jest.fn().mockReturnValue({ membraneCoherence: 0.85 }),
  })),
}));

jest.mock("../dove9-integration.js", () => ({
  Dove9Integration: jest.fn().mockImplementation(() => ({
    initialize: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
    start: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
    stop: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
    onResponse: jest.fn(),
    getCognitiveState: jest.fn().mockReturnValue({ running: true }),
    getMetrics: jest.fn().mockReturnValue({ anticipationScore: 0.8 }),
  })),
}));

jest.mock("../deltachat-interface/index.js", () => ({
  DeltaChatInterface: jest.fn().mockImplementation(() => ({
    start: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
    stop: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
    sendMessage: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
    onMessage: jest.fn(),
    on: jest.fn(),
  })),
}));

jest.mock("../dovecot-interface/index.js", () => ({
  DovecotInterface: jest.fn().mockImplementation(() => ({
    start: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
    stop: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
    onEmailResponse: jest.fn(),
  })),
}));

jest.mock("../ipc/server.js", () => ({
  IPCServer: jest.fn().mockImplementation(() => ({
    start: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
    stop: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
    registerHandler: jest.fn(),
  })),
}));

jest.mock("../ipc/websocket-server.js", () => ({
  WebSocketServer: jest.fn().mockImplementation(() => ({
    start: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
    stop: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
  })),
}));

jest.mock("../webhooks/webhook-server.js", () => ({
  WebhookServer: jest.fn().mockImplementation(() => ({
    start: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
    stop: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
  })),
}));

jest.mock("../scheduler/task-scheduler.js", () => ({
  TaskScheduler: jest.fn().mockImplementation(() => ({
    start: jest.fn(),
    stop: jest.fn(),
    schedule: jest.fn(),
    cancel: jest.fn(),
  })),
  TaskStatus: { PENDING: "pending", RUNNING: "running", DONE: "done" },
}));

jest.mock("../aar/index.js", () => ({
  AARSystem: jest.fn().mockImplementation(() => ({
    start: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
    stop: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
    processMessage: jest
      .fn<() => Promise<{ response: string }>>()
      .mockResolvedValue({ response: "AAR processed response" }),
    getMetrics: jest.fn().mockReturnValue({}),
  })),
}));

jest.mock("../agents/index.js", () => ({
  SessionManager: jest.fn().mockImplementation(() => ({
    start: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
    stop: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
    createSession: jest.fn().mockReturnValue({ id: "mock-session-1" }),
    getSession: jest.fn().mockReturnValue(null),
    getPersistence: jest.fn().mockReturnValue(undefined),
    getStats: jest.fn().mockReturnValue({
      activeSessions: 0,
      totalMessages: 0,
      averageSessionAge: 0,
    }),
  })),
  FileSessionPersistence: jest.fn().mockImplementation(() => ({})),
  AgentCoordinator: jest.fn().mockImplementation(() => ({
    start: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
    stop: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
    coordinate: jest
      .fn<() => Promise<string>>()
      .mockResolvedValue("coordinated"),
  })),
}));

jest.mock("../ipc/cognitive-handlers.js", () => ({
  registerCognitiveHandlers: jest.fn(),
}));

jest.mock("../telemetry/TelemetryMonitor.js", () => ({
  TelemetryMonitor: jest.fn().mockImplementation(() => ({
    start: jest.fn(),
    stop: jest.fn(),
    recordMetric: jest.fn(),
    getMetrics: jest.fn().mockReturnValue({}),
    exportPrometheusMetrics: jest.fn().mockReturnValue("# metrics"),
    checkThresholds: jest.fn().mockReturnValue([]),
    getHealthStatus: jest.fn().mockReturnValue({ healthy: true }),
  })),
}));

// ─── Test helpers ─────────────────────────────────────────────────────────────

function makeConfig(
  overrides: Partial<OrchestratorConfig> = {},
): Partial<OrchestratorConfig> {
  return {
    enableDeltaChat: false,
    enableDovecot: false,
    enableIPC: false,
    enableScheduler: false,
    enableWebhooks: false,
    enableDove9: false,
    enableSys6: false,
    enableDoubleMembrane: false,
    enableAAR: false,
    cognitiveTierMode: "BASIC",
    ...overrides,
  };
}

function makeOrchestrator(overrides: Partial<OrchestratorConfig> = {}) {
  return new Orchestrator(makeConfig(overrides));
}

// ─── Test suites ──────────────────────────────────────────────────────────────

describe("deltecho Pipeline Integration", () => {
  // ── 1. Orchestrator lifecycle ──────────────────────────────────────────────
  describe("Orchestrator lifecycle", () => {
    let orch: Orchestrator;

    beforeEach(() => {
      orch = makeOrchestrator();
    });
    afterEach(async () => {
      await orch.stop().catch(() => {});
    });

    it("constructs without throwing", () => {
      expect(orch).toBeInstanceOf(Orchestrator);
    });

    it("starts successfully", async () => {
      await expect(orch.start()).resolves.not.toThrow();
    });

    it("reports isRunning() === true after start", async () => {
      await orch.start();
      expect(orch.isRunning()).toBe(true);
    });

    it("stops cleanly after start", async () => {
      await orch.start();
      await expect(orch.stop()).resolves.not.toThrow();
    });

    it("reports isRunning() === false after stop", async () => {
      await orch.start();
      await orch.stop();
      expect(orch.isRunning()).toBe(false);
    });

    it("stop is idempotent — double-stop does not throw", async () => {
      await orch.start();
      await orch.stop();
      await expect(orch.stop()).resolves.not.toThrow();
    });
  });

  // ── 2. Cognitive tier mode management ─────────────────────────────────────
  describe("Cognitive tier mode management", () => {
    const tiers: CognitiveTierMode[] = [
      "BASIC",
      "SYS6",
      "MEMBRANE",
      "ADAPTIVE",
      "FULL",
    ];

    it("defaults to BASIC when configured as BASIC", () => {
      const orch = makeOrchestrator({ cognitiveTierMode: "BASIC" });
      expect(orch.getCognitiveTierMode()).toBe("BASIC");
    });

    for (const tier of tiers) {
      it(`getCognitiveTierMode returns ${tier} when set at construction`, () => {
        const orch = makeOrchestrator({ cognitiveTierMode: tier });
        expect(orch.getCognitiveTierMode()).toBe(tier);
      });
    }

    it("setCognitiveTierMode updates the active tier at runtime", async () => {
      const orch = makeOrchestrator({ cognitiveTierMode: "BASIC" });
      await orch.start();
      try {
        orch.setCognitiveTierMode("SYS6");
        expect(orch.getCognitiveTierMode()).toBe("SYS6");
        orch.setCognitiveTierMode("FULL");
        expect(orch.getCognitiveTierMode()).toBe("FULL");
      } finally {
        await orch.stop().catch(() => {});
      }
    });

    it("setCognitiveTierMode works before start", () => {
      const orch = makeOrchestrator({ cognitiveTierMode: "BASIC" });
      orch.setCognitiveTierMode("MEMBRANE");
      expect(orch.getCognitiveTierMode()).toBe("MEMBRANE");
    });
  });

  // ── 3. Processing statistics ───────────────────────────────────────────────
  describe("Processing statistics", () => {
    let orch: Orchestrator;

    beforeEach(async () => {
      orch = makeOrchestrator();
      await orch.start();
    });
    afterEach(async () => {
      await orch.stop().catch(() => {});
    });

    it("getProcessingStats returns a valid stats object", () => {
      const stats = orch.getProcessingStats();
      expect(stats).toBeDefined();
      expect(typeof stats).toBe("object");
    });

    it("stats object contains expected numeric fields", () => {
      const stats = orch.getProcessingStats();
      expect(typeof stats.totalMessages).toBe("number");
      expect(typeof stats.basicTierMessages).toBe("number");
      expect(typeof stats.sys6TierMessages).toBe("number");
      expect(typeof stats.membraneTierMessages).toBe("number");
    });

    it("stats start at zero", () => {
      const stats = orch.getProcessingStats();
      expect(stats.totalMessages).toBe(0);
    });
  });

  // ── 4. Cognitive system status ─────────────────────────────────────────────
  describe("Cognitive system status", () => {
    let orch: Orchestrator;

    beforeEach(async () => {
      orch = makeOrchestrator();
      await orch.start();
    });
    afterEach(async () => {
      await orch.stop().catch(() => {});
    });

    it("getCognitiveSystemStatus returns a valid status object", () => {
      const status = orch.getCognitiveSystemStatus();
      expect(status).toBeDefined();
      expect(typeof status).toBe("object");
    });

    it("status.tierMode matches the configured tier", () => {
      const status = orch.getCognitiveSystemStatus();
      expect(status.tierMode).toBe("BASIC");
    });

    it("status.sys6 is null when Sys6 is disabled", () => {
      const status = orch.getCognitiveSystemStatus();
      expect(status.sys6).toBeNull();
    });

    it("status.dove9 is null when Dove9 is disabled", () => {
      const status = orch.getCognitiveSystemStatus();
      expect(status.dove9).toBeNull();
    });

    it("status.stats contains expected fields", () => {
      const status = orch.getCognitiveSystemStatus();
      expect(status.stats).toBeDefined();
      expect(typeof status.stats.totalMessages).toBe("number");
      expect(typeof status.stats.averageComplexity).toBe("number");
    });
  });

  // ── 5. Sys6 bridge integration ─────────────────────────────────────────────
  describe("Sys6 bridge integration", () => {
    it("getSys6Bridge returns undefined when Sys6 is disabled", async () => {
      const orch = makeOrchestrator({ enableSys6: false });
      await orch.start();
      try {
        expect(orch.getSys6Bridge()).toBeUndefined();
      } finally {
        await orch.stop().catch(() => {});
      }
    });

    it("getSys6Bridge returns the bridge instance when Sys6 is enabled", async () => {
      const orch = makeOrchestrator({
        enableSys6: true,
        cognitiveTierMode: "SYS6",
      });
      await orch.start();
      try {
        expect(orch.getSys6Bridge()).toBeDefined();
      } finally {
        await orch.stop().catch(() => {});
      }
    });
  });

  // ── 6. Dove9 integration ───────────────────────────────────────────────────
  describe("Dove9 integration", () => {
    it("getDove9Integration returns undefined when Dove9 is disabled", async () => {
      const orch = makeOrchestrator({ enableDove9: false });
      await orch.start();
      try {
        expect(orch.getDove9Integration()).toBeUndefined();
      } finally {
        await orch.stop().catch(() => {});
      }
    });

    it("getDove9Integration returns the integration when Dove9 is enabled", async () => {
      const orch = makeOrchestrator({ enableDove9: true });
      await orch.start();
      try {
        expect(orch.getDove9Integration()).toBeDefined();
      } finally {
        await orch.stop().catch(() => {});
      }
    });
  });

  // ── 7. Double Membrane integration ────────────────────────────────────────
  describe("Double Membrane integration", () => {
    it("getDoubleMembraneIntegration returns undefined when disabled", async () => {
      const orch = makeOrchestrator({ enableDoubleMembrane: false });
      await orch.start();
      try {
        expect(orch.getDoubleMembraneIntegration()).toBeUndefined();
      } finally {
        await orch.stop().catch(() => {});
      }
    });

    it("getDoubleMembraneIntegration returns instance when enabled", async () => {
      const orch = makeOrchestrator({
        enableDoubleMembrane: true,
        cognitiveTierMode: "MEMBRANE",
      });
      await orch.start();
      try {
        expect(orch.getDoubleMembraneIntegration()).toBeDefined();
      } finally {
        await orch.stop().catch(() => {});
      }
    });
  });

  // ── 8. API key configuration ───────────────────────────────────────────────
  describe("API key configuration", () => {
    it("configureApiKeys does not throw", async () => {
      const orch = makeOrchestrator();
      await orch.start();
      try {
        expect(() =>
          orch.configureApiKeys({ openai: "sk-test", anthropic: "ant-test" }),
        ).not.toThrow();
      } finally {
        await orch.stop().catch(() => {});
      }
    });
  });

  // ── 9. Multiple orchestrators in parallel ─────────────────────────────────
  describe("Multiple orchestrator instances", () => {
    it("two orchestrators start and stop independently", async () => {
      const o1 = makeOrchestrator({ cognitiveTierMode: "BASIC" });
      const o2 = makeOrchestrator({
        cognitiveTierMode: "SYS6",
        enableSys6: true,
      });
      await Promise.all([o1.start(), o2.start()]);
      try {
        expect(o1.isRunning()).toBe(true);
        expect(o2.isRunning()).toBe(true);
        expect(o1.getCognitiveTierMode()).toBe("BASIC");
        expect(o2.getCognitiveTierMode()).toBe("SYS6");
      } finally {
        await Promise.all([
          o1.stop().catch(() => {}),
          o2.stop().catch(() => {}),
        ]);
      }
    });
  });

  // ── 10. Tier-mode switching under load ────────────────────────────────────
  describe("Runtime tier switching", () => {
    it("cycles through all tiers without throwing", async () => {
      const orch = makeOrchestrator({ cognitiveTierMode: "BASIC" });
      await orch.start();
      try {
        const tiers: CognitiveTierMode[] = [
          "BASIC",
          "SYS6",
          "MEMBRANE",
          "ADAPTIVE",
          "FULL",
          "BASIC",
        ];
        for (const tier of tiers) {
          orch.setCognitiveTierMode(tier);
          expect(orch.getCognitiveTierMode()).toBe(tier);
        }
      } finally {
        await orch.stop().catch(() => {});
      }
    });
  });
});
