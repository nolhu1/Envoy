# Envoy Draft Generator v1

## Purpose

This document defines the first draft generator contract for the Envoy MVP.

The draft generator is the first LLM-backed step that turns agent context and planning output into a proposed reply draft.

It does not send messages.
It only produces a structured proposed draft result that can later:
- create a canonical draft message
- create an approval request
- update structured memory
- suggest workflow state changes

---

## MVP Provider Choice

### Selected LLM provider
- OpenAI

### Reason
OpenAI is the first selected provider for MVP because:
- the roadmap already recommends OpenAI first
- the MVP should optimize for speed and clean architecture
- a single-provider path keeps the first draft generator narrow

### Deferred
- Anthropic fallback
- multi-provider routing
- model arbitration
- per-workspace model selection
- provider failover logic

---

## Core Rules

1. The draft generator runs only after the planner chooses `draft_reply`.
2. The draft generator may produce draft content, not autonomous sends.
3. Output must be canonical-first and workspace-scoped.
4. Provider-specific behavior must remain behind a small generator/provider abstraction.
5. The generator must not pull raw provider APIs directly.

---

## Generator Inputs

The generator should accept:

- canonical agent conversation context
- planner output
- trigger context
- optional generation config

### Required context inputs
- workspaceId
- conversationId
- platform
- conversationState
- active agent assignment config
- recent message window
- participant summary
- structured memory facts
- recent approval outcome summary if available

### Planner inputs
- actionType = `draft_reply`
- rationaleSummary
- confidence
- optional suggested workflow state change

### Trigger context
- trigger type
- trigger reason
- safe trigger metadata

---

## Generator Output Contract

The draft generator should return a structured result with at minimum:

- `proposedMessageText`
- `rationaleSummary`
- `extractedStructuredData`
- `confidenceScore`
- `suggestedWorkflowStateChange`

### proposedMessageText
The proposed outbound message text for review.

### rationaleSummary
A concise explanation of why this draft is being suggested.

### extractedStructuredData
Structured updates or extracted facts inferred during generation.

Examples:
- contact_name
- company
- role
- need
- timeline
- budget
- availability
- meeting_intent
- unanswered_question
- next_suggested_move

### confidenceScore
A normalized confidence signal for the draft generation result.

### suggestedWorkflowStateChange
Optional workflow suggestion such as:
- remain ACTIVE
- move to WAITING
- move to FOLLOW_UP_DUE
- move to ESCALATED

This is a suggestion only.
The workflow engine or approval flow remains authoritative.

---

## Additional Recommended Output Fields

The first implementation may also include:

- `subjectSuggestion` nullable
- `missingInformationQuestions` nullable
- `safetyFlags`
- `escalationHint`
- `generationDiagnostics`
- `modelMetadata` safe summary only

These are optional for MVP as long as they remain non-secret and canonical-first.

---

## Relationship to Approval

A generated draft should later feed:

1. canonical outbound draft message creation
2. approval request creation
3. approval queue display

The draft generator itself must not:
- create a provider send
- bypass approval
- mark a message as sent

Approval remains required for AI outbound drafts.

---

## Relationship to Structured Memory

The generator may suggest structured data updates, but those updates should remain separate from the final memory write decision.

That means:
- extractedStructuredData is an output
- memory persistence happens later through a controlled boundary

Do not let generation directly mutate memory without an explicit write step.

---

## Relationship to Workflow

The generator may suggest a workflow state change, but it does not own the state machine.

That means:
- `suggestedWorkflowStateChange` is advisory
- the shared workflow engine remains authoritative

---

## Initial Prompting Rules

The first draft generator should be instructed to:
- stay concise
- respect tone constraints
- respect allowed actions
- avoid unsupported promises
- avoid hallucinating facts not present in context
- prefer asking for missing information when context is insufficient
- surface escalation need when policy/risk requires it

---

## Safety Rules

The draft generator must not:
- send a message directly
- bypass approval
- include secrets or token material in prompts or outputs
- assume provider-specific features beyond canonical context
- fabricate structured facts as certain when they are weakly supported

If confidence is low or policy constraints are unclear, the planner should have chosen `ask_for_missing_information`, `wait`, or `escalate` instead.

---

## Non-Goals

This version does not define:
- multi-provider routing
- autonomous sending
- final approval creation implementation
- retry strategy for model calls
- advanced prompt versioning system
- few-shot library management

Those come later.

---

## Acceptance Test

The draft generator contract is correct only if all of the following are true:

1. OpenAI is the single selected LLM provider for MVP.
2. The generator only runs for `draft_reply` planner outputs.
3. The generator returns:
   - proposed message text
   - rationale summary
   - extracted structured data
   - confidence score
   - suggested workflow state change
4. The generator does not send messages or bypass approval.
5. The contract remains provider-agnostic enough to add other providers later.