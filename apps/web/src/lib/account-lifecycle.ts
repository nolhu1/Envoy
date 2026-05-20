import "server-only";

import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

import { getPrisma } from "@envoy/db";
import { hash } from "bcryptjs";

const PASSWORD_RESET_TTL_MINUTES = 30;
const EMAIL_VERIFICATION_TTL_HOURS = 24;

function hashToken(token: string) {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

function createRawToken() {
  return randomBytes(32).toString("base64url");
}

function expiryFromNow(ms: number) {
  return new Date(Date.now() + ms);
}

function safeTokenEquals(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);

  return (
    leftBuffer.length === rightBuffer.length &&
    timingSafeEqual(leftBuffer, rightBuffer)
  );
}

function passwordResetIdentifier(email: string) {
  return `password-reset:${email.trim().toLowerCase()}`;
}

function emailVerificationIdentifier(email: string) {
  return `email-verify:${email.trim().toLowerCase()}`;
}

async function createOneTimeToken(input: {
  identifier: string;
  expires: Date;
}) {
  const prisma = getPrisma();
  const rawToken = createRawToken();
  const token = hashToken(rawToken);

  await prisma.verificationToken.deleteMany({
    where: {
      identifier: input.identifier,
    },
  });
  await prisma.verificationToken.create({
    data: {
      identifier: input.identifier,
      token,
      expires: input.expires,
    },
  });

  return rawToken;
}

async function consumeOneTimeToken(input: {
  identifier: string;
  rawToken: string;
}) {
  const prisma = getPrisma();
  const hashedToken = hashToken(input.rawToken);
  const records = await prisma.verificationToken.findMany({
    where: {
      identifier: input.identifier,
      expires: {
        gt: new Date(),
      },
    },
    select: {
      token: true,
    },
  });
  const matched = records.find((record) =>
    safeTokenEquals(record.token, hashedToken),
  );

  if (!matched) {
    return false;
  }

  await prisma.verificationToken.delete({
    where: {
      token: matched.token,
    },
  });

  return true;
}

export async function createPasswordResetToken(email: string) {
  return createOneTimeToken({
    identifier: passwordResetIdentifier(email),
    expires: expiryFromNow(PASSWORD_RESET_TTL_MINUTES * 60_000),
  });
}

export async function resetPasswordWithToken(input: {
  email: string;
  token: string;
  password: string;
}) {
  const email = input.email.trim().toLowerCase();

  if (!email || input.password.length < 8) {
    throw new Error("Password reset request is invalid.");
  }

  const consumed = await consumeOneTimeToken({
    identifier: passwordResetIdentifier(email),
    rawToken: input.token,
  });

  if (!consumed) {
    throw new Error("Password reset link is invalid or expired.");
  }

  const prisma = getPrisma();
  const passwordHash = await hash(input.password, 12);

  await prisma.user.update({
    where: { email },
    data: {
      passwordHash,
      passwordChangedAt: new Date(),
    },
  });

  await prisma.session.deleteMany({
    where: {
      user: {
        email,
      },
    },
  });
}

export async function createEmailVerificationToken(email: string) {
  return createOneTimeToken({
    identifier: emailVerificationIdentifier(email),
    expires: expiryFromNow(EMAIL_VERIFICATION_TTL_HOURS * 60 * 60_000),
  });
}

export async function verifyEmailWithToken(input: {
  email: string;
  token: string;
}) {
  const email = input.email.trim().toLowerCase();
  const consumed = await consumeOneTimeToken({
    identifier: emailVerificationIdentifier(email),
    rawToken: input.token,
  });

  if (!consumed) {
    throw new Error("Verification link is invalid or expired.");
  }

  await getPrisma().user.update({
    where: { email },
    data: {
      emailVerified: new Date(),
    },
  });
}
