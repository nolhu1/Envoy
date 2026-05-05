import {
  DRAFT_GENERATION_PROVIDERS,
  STRUCTURED_MEMORY_FACT_KEYS,
  assertDraftGenerationAllowed,
  clampDraftConfidenceScore,
  sanitizeSuggestedWorkflowStateChange,
  type DraftGenerationProvider,
  type DraftGenerationResult,
  type DraftGenerationStructuredDatum,
  type DraftGeneratorInput,
} from "../../../../packages/db/src/index";

type ResolvedDraftGenerationConfig = {
  provider: DraftGenerationProvider;
  model: string;
  temperature: number;
  maxOutputTokens: number;
};

type DraftGeneratorProviderAdapter = {
  provider: DraftGenerationProvider;
  generate(
    input: DraftGeneratorInput,
    config: ResolvedDraftGenerationConfig,
  ): Promise<DraftGenerationResult>;
};

type OpenAIDraftRawOutput = {
  proposedMessageText?: string;
  rationaleSummary?: string;
  extractedStructuredData?: Array<{
    key?: string;
    valueText?: string;
    confidence?: number | null;
  }>;
  confidenceScore?: number;
  suggestedWorkflowStateChange?: {
    to?: string;
    reason?: string;
  } | null;
};

const OPENAI_DRAFT_PROVIDER: DraftGeneratorProviderAdapter = {
  provider: DRAFT_GENERATION_PROVIDERS.OPENAI,
  async generate(input, config) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error("OPENAI_API_KEY is required for draft generation.");
    }

    const endpointBase = (
      process.env.OPENAI_BASE_URL?.trim() || "https://api.openai.com/v1"
    ).replace(/\/+$/, "");
    const endpoint = `${endpointBase}/responses`;

    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: config.model,
        temperature: config.temperature,
        max_output_tokens: config.maxOutputTokens,
        input: [
          {
            role: "system",
            content: [
              {
                type: "input_text",
                text:
                  "You are Envoy's draft generator. Return strict JSON only. " +
                  "Generate a concise draft reply grounded in provided canonical context. " +
                  "Do not claim uncertain facts. Do not mention internal systems. " +
                  "Do not include secrets.",
              },
            ],
          },
          {
            role: "user",
            content: [
              {
                type: "input_text",
                text: JSON.stringify(buildPromptPayload(input)),
              },
            ],
          },
        ],
        text: {
          format: {
            type: "json_schema",
            name: "envoy_draft_generation_result",
            strict: true,
            schema: {
              type: "object",
              additionalProperties: false,
              properties: {
                proposedMessageText: {
                  type: "string",
                },
                rationaleSummary: {
                  type: "string",
                },
                extractedStructuredData: {
                  type: "array",
                  items: {
                    type: "object",
                    additionalProperties: false,
                    properties: {
                      key: { type: "string" },
                      valueText: { type: "string" },
                      confidence: { type: ["number", "null"] },
                    },
                    required: ["key", "valueText", "confidence"],
                  },
                },
                confidenceScore: {
                  type: "number",
                },
                suggestedWorkflowStateChange: {
                  type: ["object", "null"],
                  additionalProperties: false,
                  properties: {
                    to: { type: "string" },
                    reason: { type: "string" },
                  },
                  required: ["to", "reason"],
                },
              },
              required: [
                "proposedMessageText",
                "rationaleSummary",
                "extractedStructuredData",
                "confidenceScore",
                "suggestedWorkflowStateChange",
              ],
            },
          },
        },
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `OpenAI draft generation failed with status ${response.status}. ${errorText.slice(0, 240)}`,
      );
    }

    const payload = (await response.json()) as {
      output_text?: string;
      output?: Array<{
        content?: Array<{
          type?: string;
          text?: string;
        }>;
      }>;
      model?: string;
    };

    const outputText = extractOpenAIOutputText(payload);
    if (!outputText) {
      throw new Error("OpenAI draft generation returned no structured output.");
    }

    let parsed: OpenAIDraftRawOutput;
    try {
      parsed = JSON.parse(outputText) as OpenAIDraftRawOutput;
    } catch {
      throw new Error("OpenAI draft generation returned invalid JSON.");
    }

    return normalizeGenerationResult({
      input,
      config,
      providerModel: payload.model || config.model,
      raw: parsed,
    });
  },
};

const DRAFT_GENERATOR_PROVIDERS_REGISTRY: Record<
  DraftGenerationProvider,
  DraftGeneratorProviderAdapter
> = {
  [DRAFT_GENERATION_PROVIDERS.OPENAI]: OPENAI_DRAFT_PROVIDER,
};

export async function generateDraftFromPlanner(
  input: DraftGeneratorInput,
): Promise<DraftGenerationResult> {
  assertDraftGenerationAllowed({
    planner: input.planner,
  });

  const config = resolveDraftGenerationConfig(input);
  const provider = DRAFT_GENERATOR_PROVIDERS_REGISTRY[config.provider];

  return provider.generate(input, config);
}

function resolveDraftGenerationConfig(
  input: DraftGeneratorInput,
): ResolvedDraftGenerationConfig {
  const provider =
    input.config?.provider || DRAFT_GENERATION_PROVIDERS.OPENAI;
  const model =
    input.config?.model?.trim() ||
    process.env.OPENAI_DRAFT_MODEL?.trim() ||
    "gpt-4.1-mini";

  return {
    provider,
    model,
    temperature:
      typeof input.config?.temperature === "number"
        ? input.config.temperature
        : 0.3,
    maxOutputTokens:
      typeof input.config?.maxOutputTokens === "number"
        ? input.config.maxOutputTokens
        : 500,
  };
}

function buildPromptPayload(input: DraftGeneratorInput) {
  return {
    workspaceId: input.context.workspaceId,
    conversationId: input.context.conversationId,
    platform: input.context.platform,
    conversationState: input.context.state,
    subject: input.context.subject,
    trigger: {
      triggerType: input.trigger.triggerType,
      triggerReason: input.trigger.triggerReason ?? null,
      sourceMessageId: input.trigger.sourceMessageId ?? null,
      sourceApprovalRequestId: input.trigger.sourceApprovalRequestId ?? null,
      metadata: input.trigger.metadata ?? null,
    },
    planner: {
      actionType: input.planner.actionType,
      rationaleSummary: input.planner.rationaleSummary,
      confidence: input.planner.confidence,
      suggestedWorkflowStateChange:
        input.planner.suggestedWorkflowStateChange ?? null,
      missingInformationQuestions:
        input.planner.missingInformationQuestions ?? null,
      escalationReason: input.planner.escalationReason ?? null,
    },
    assignment: input.context.assignment
      ? {
          goal: input.context.assignment.goal,
          instructions: input.context.assignment.instructions,
          tone: input.context.assignment.tone,
          allowedActionsJson: input.context.assignment.allowedActionsJson,
          escalationRulesJson: input.context.assignment.escalationRulesJson,
        }
      : null,
    participants: input.context.participants.map((participant) => ({
      displayName: participant.displayName,
      email: participant.email,
      handle: participant.handle,
      isInternal: participant.isInternal,
    })),
    recentMessages: input.context.recentMessages.map((message) => ({
      direction: message.direction,
      senderType: message.senderType,
      senderLabel:
        message.senderParticipant?.displayName ||
        message.senderParticipant?.email ||
        message.senderParticipant?.handle ||
        message.senderType,
      bodyText: truncateText(message.bodyText, 1200),
      createdAt: message.createdAt.toISOString(),
      providerRef: {
        externalMessageId: message.externalMessageId,
      },
    })),
    structuredMemory: input.context.facts.map((fact) => ({
      key: fact.key,
      valueText: fact.valueText,
      confidence: fact.confidence,
    })),
    recentApprovalOutcome: input.context.recentApprovalOutcome
      ? {
          status: input.context.recentApprovalOutcome.status,
          rejectionReason: input.context.recentApprovalOutcome.rejectionReason,
          editedContent: input.context.recentApprovalOutcome.editedContent,
        }
      : null,
    requirements: {
      outputMustBeDraftOnly: true,
      noSending: true,
      noApprovalCreation: true,
      noSecrets: true,
    },
  };
}

function normalizeGenerationResult(input: {
  input: DraftGeneratorInput;
  config: ResolvedDraftGenerationConfig;
  providerModel: string;
  raw: OpenAIDraftRawOutput;
}): DraftGenerationResult {
  const proposedMessageText = (input.raw.proposedMessageText || "").trim();
  if (!proposedMessageText) {
    throw new Error("Generated draft text is empty.");
  }

  const rationaleSummary =
    (input.raw.rationaleSummary || "").trim() ||
    input.input.planner.rationaleSummary;

  const extractedStructuredData = normalizeStructuredData(
    input.raw.extractedStructuredData,
  );

  const suggestedWorkflowStateChange = sanitizeSuggestedWorkflowStateChange({
    fromState: input.input.context.state,
    suggested: input.raw.suggestedWorkflowStateChange
      ? {
          to: input.raw.suggestedWorkflowStateChange.to as never,
          reason: input.raw.suggestedWorkflowStateChange.reason || "Suggested by draft generator.",
        }
      : input.input.planner.suggestedWorkflowStateChange,
  });

  return {
    proposedMessageText,
    rationaleSummary,
    extractedStructuredData,
    confidenceScore: clampDraftConfidenceScore(
      input.raw.confidenceScore ?? input.input.planner.confidence,
    ),
    suggestedWorkflowStateChange,
    provider: input.config.provider,
    model: input.providerModel,
  };
}

function normalizeStructuredData(
  items: OpenAIDraftRawOutput["extractedStructuredData"],
): DraftGenerationStructuredDatum[] {
  if (!Array.isArray(items)) {
    return [];
  }

  const allowedKeys = new Set(Object.values(STRUCTURED_MEMORY_FACT_KEYS));
  const normalized: DraftGenerationStructuredDatum[] = [];

  for (const item of items) {
    const key = (item?.key || "").trim();
    const valueText = (item?.valueText || "").trim();
    if (!key || !valueText || !allowedKeys.has(key as never)) {
      continue;
    }

    normalized.push({
      key: key as DraftGenerationStructuredDatum["key"],
      valueText,
      confidence: clampDraftConfidenceScore(item.confidence ?? null),
    });
  }

  return normalized;
}

function extractOpenAIOutputText(payload: {
  output_text?: string;
  output?: Array<{
    content?: Array<{
      type?: string;
      text?: string;
    }>;
  }>;
}) {
  if (typeof payload.output_text === "string" && payload.output_text.trim()) {
    return payload.output_text;
  }

  const output = payload.output || [];
  for (const item of output) {
    const content = item.content || [];
    for (const entry of content) {
      if (entry.type === "output_text" && typeof entry.text === "string") {
        return entry.text;
      }
    }
  }

  return null;
}

function truncateText(value: string | null, maxChars: number) {
  if (!value) {
    return null;
  }

  if (value.length <= maxChars) {
    return value;
  }

  return `${value.slice(0, maxChars)}...`;
}
