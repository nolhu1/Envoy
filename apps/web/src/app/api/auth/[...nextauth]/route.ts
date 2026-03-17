import NextAuth from "next-auth";

import { getAuthOptions } from "@/lib/auth";

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
  const handler = NextAuth(getAuthOptions());
  return handler(request, context);
}
