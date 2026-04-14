import "server-only";

import {
  listStructuredMemoryFacts,
  upsertStructuredMemoryFacts,
  type StructuredMemoryFactKey,
  type UpsertStructuredMemoryFactInput,
} from "@envoy/db";

import { PERMISSIONS, requirePermission } from "@/lib/permissions";

export async function listWorkspaceStructuredMemoryFacts(input: {
  conversationId: string;
  keys?: StructuredMemoryFactKey[] | null;
}) {
  const authContext = await requirePermission(PERMISSIONS.ASSIGN_AGENTS);

  return listStructuredMemoryFacts({
    workspaceId: authContext.workspaceId,
    conversationId: input.conversationId,
    keys: input.keys ?? null,
  });
}

export async function upsertWorkspaceStructuredMemoryFacts(input: {
  conversationId: string;
  facts: UpsertStructuredMemoryFactInput[];
}) {
  const authContext = await requirePermission(PERMISSIONS.ASSIGN_AGENTS);

  return upsertStructuredMemoryFacts({
    workspaceId: authContext.workspaceId,
    conversationId: input.conversationId,
    facts: input.facts,
  });
}
