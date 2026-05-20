import NextAuth from "next-auth";

import { getAuthOptions } from "@/lib/auth";
import {
  checkRateLimit,
  createRateLimitResponse,
  getClientIpFromHeaders,
} from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  context: { params: Promise<{ nextauth: string[] }> },
) {
  const handler = NextAuth(getAuthOptions());
  return handler(request, context);
}

export async function POST(
  request: Request,
  context: { params: Promise<{ nextauth: string[] }> },
) {
  const params = await context.params;

  if (params.nextauth.includes("callback")) {
    const result = checkRateLimit({
      key: `nextauth:${getClientIpFromHeaders(request.headers)}`,
      limit: 20,
      windowMs: 15 * 60_000,
    });

    if (!result.allowed) {
      return createRateLimitResponse(result);
    }
  }

  const handler = NextAuth(getAuthOptions());
  return handler(request, { params: Promise.resolve(params) });
}
