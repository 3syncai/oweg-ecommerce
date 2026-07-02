import { NextRequest, NextResponse } from "next/server";
import { authorizeWalletMutation } from "@/lib/store-customer-auth";

export async function requireWalletMutationAuth(req: NextRequest) {
  const auth = await authorizeWalletMutation(req);
  if (!auth.ok) {
    return {
      auth: null as never,
      errorResponse: NextResponse.json(
        { error: auth.status === 403 ? "Forbidden" : "Unauthorized" },
        { status: auth.status }
      ),
    };
  }

  return { auth, errorResponse: null };
}
