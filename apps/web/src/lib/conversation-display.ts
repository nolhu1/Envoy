export type ConversationDisplayPlatform = "EMAIL" | "SLACK";

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

export function isSlackSystemParticipant(
  participant: ConversationDisplayParticipant,
) {
  const displayName = participant.displayName?.trim().toLowerCase() ?? null;
  const handle = participant.handle?.trim().toLowerCase() ?? null;
  const externalParticipantId =
    participant.externalParticipantId?.trim().toLowerCase() ?? null;

  return (
    participant.isInternal ||
    displayName === "slackbot" ||
    handle === "@slackbot" ||
    externalParticipantId === "uslackbot" ||
    externalParticipantId?.startsWith("bot:") === true
  );
}

export function formatParticipantSummary(
  platform: ConversationDisplayPlatform,
  participants: ConversationDisplayParticipant[],
) {
  const preferredParticipants = participants.filter((participant) =>
    platform === "SLACK"
      ? !isSlackSystemParticipant(participant)
      : !participant.isInternal,
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

export function buildSlackTitle(record: ConversationDisplayRecord) {
  const preferredParticipants = record.participants.filter(
    (participant) => !isSlackSystemParticipant(participant),
  );
  const labels = Array.from(
    new Set(
      (preferredParticipants.length > 0 ? preferredParticipants : record.participants).map(
        (participant) => getParticipantDisplayName(participant),
      ),
    ),
  ).filter(Boolean);

  if (labels.length === 0) {
    return "Slack DM";
  }

  return labels.length === 1 ? labels[0] : `Slack DM: ${labels.join(", ")}`;
}

export function buildConversationTitle(record: ConversationDisplayRecord) {
  if (record.platform === "EMAIL") {
    return (
      record.subject?.trim() ||
      formatParticipantSummary(record.platform, record.participants) ||
      "Email thread"
    );
  }

  return buildSlackTitle(record);
}
