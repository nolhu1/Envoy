import "server-only";

import {
  AGENT_TRIGGER_TYPES,
  type AgentTriggerType,
} from "@envoy/db";

export const AGENT_TRIGGER_RULE_TYPES: readonly AgentTriggerType[] = [
  AGENT_TRIGGER_TYPES.INBOUND_MESSAGE,
  AGENT_TRIGGER_TYPES.FOLLOW_UP_DUE,
  AGENT_TRIGGER_TYPES.APPROVAL_REJECTED,
  AGENT_TRIGGER_TYPES.MANUAL_REGENERATE,
] as const;

export const DEFAULT_ENABLED_AGENT_TRIGGER_TYPES: readonly AgentTriggerType[] =
  AGENT_TRIGGER_RULE_TYPES;

function isJsonObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function normalizeAgentTriggerTypes(
  values: Iterable<unknown>,
): AgentTriggerType[] {
  const allowed = new Set<AgentTriggerType>(AGENT_TRIGGER_RULE_TYPES);
  const normalized = new Set<AgentTriggerType>();

  for (const value of values) {
    if (typeof value !== "string") {
      continue;
    }

    const candidate = value.trim() as AgentTriggerType;
    if (allowed.has(candidate)) {
      normalized.add(candidate);
    }
  }

  return [...normalized];
}

function readEnabledTriggerTypesFromRules(
  escalationRulesJson: unknown,
): AgentTriggerType[] | null {
  if (!isJsonObject(escalationRulesJson)) {
    return null;
  }

  const directEnabled = escalationRulesJson.enabledTriggerTypes;
  if (Array.isArray(directEnabled)) {
    return normalizeAgentTriggerTypes(directEnabled);
  }

  const nestedRules = escalationRulesJson.triggerRules;
  if (isJsonObject(nestedRules)) {
    const enabled = AGENT_TRIGGER_RULE_TYPES.filter(
      (triggerType) => nestedRules[triggerType] === true,
    );
    return enabled.length > 0 ? enabled : [];
  }

  const inlineEnabled = AGENT_TRIGGER_RULE_TYPES.filter(
    (triggerType) => escalationRulesJson[triggerType] === true,
  );
  return inlineEnabled.length > 0 ? inlineEnabled : null;
}

export function hasConfiguredAgentTriggerRules(escalationRulesJson: unknown) {
  return readEnabledTriggerTypesFromRules(escalationRulesJson) !== null;
}

export function getEnabledAgentTriggerTypes(
  escalationRulesJson: unknown,
  fallback: readonly AgentTriggerType[] = DEFAULT_ENABLED_AGENT_TRIGGER_TYPES,
) {
  const configured = readEnabledTriggerTypesFromRules(escalationRulesJson);
  if (!configured) {
    return [...fallback];
  }

  return configured;
}

export function isAgentTriggerEnabled(input: {
  escalationRulesJson: unknown;
  triggerType: AgentTriggerType;
  fallbackEnabled?: boolean;
}) {
  const configured = readEnabledTriggerTypesFromRules(input.escalationRulesJson);

  if (!configured) {
    return input.fallbackEnabled ?? true;
  }

  return configured.includes(input.triggerType);
}

export function buildEscalationRulesWithEnabledTriggers(input: {
  baseEscalationRulesJson?: unknown;
  enabledTriggerTypes: AgentTriggerType[];
}) {
  const base = isJsonObject(input.baseEscalationRulesJson)
    ? input.baseEscalationRulesJson
    : {};

  return {
    ...base,
    enabledTriggerTypes: normalizeAgentTriggerTypes(input.enabledTriggerTypes),
  };
}
