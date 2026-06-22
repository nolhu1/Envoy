export type ConversationDisplayPlatform = "EMAIL";

export type ConversationDisplayParticipant = {
  externalParticipantId: string | null;
  displayName: string | null;
  email: string | null;
  handle: string | null;
  isInternal: boolean;
};

export type ConversationDisplayRecord = {
  platform: ConversationDisplayPlatform;
  subject: string | null;
  participants: ConversationDisplayParticipant[];
};

export function getParticipantDisplayName(
  participant: ConversationDisplayParticipant,
) {
  return (
    participant.displayName ||
    participant.email ||
    participant.handle ||
    (participant.isInternal ? "Internal participant" : "External participant")
  );
}

export function formatParticipantSummary(
  _platform: ConversationDisplayPlatform,
  participants: ConversationDisplayParticipant[],
) {
  const preferredParticipants = participants.filter(
    (participant) => !participant.isInternal,
  );
  const source = preferredParticipants.length > 0 ? preferredParticipants : participants;
  const labels = Array.from(
    new Set(source.map((participant) => getParticipantDisplayName(participant)).filter(Boolean)),
  );

  if (labels.length === 0) {
    return "No participants";
  }

  if (labels.length === 1) {
    return labels[0];
  }

  if (labels.length === 2) {
    return `${labels[0]} and ${labels[1]}`;
  }

  return `${labels[0]}, ${labels[1]}, +${labels.length - 2} more`;
}

export function buildConversationTitle(record: ConversationDisplayRecord) {
  return (
    record.subject?.trim() ||
    formatParticipantSummary(record.platform, record.participants) ||
    "Email thread"
  );
}
