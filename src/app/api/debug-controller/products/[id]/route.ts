import { NextRequest, NextResponse } from "next/server";
import {
  extractDebugAuthToken,
  verifyDebugControllerToken,
} from "@/lib/debug-controller/auth";
import { deleteAdminProduct } from "@/lib/debug-controller/products";

export const dynamic = "force-dynamic";

export async function DELETE(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const token = extractDebugAuthToken(req);
  if (!verifyDebugControllerToken(token)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;
  if (!id) {
    return NextResponse.json({ error: "Product id required" }, { status: 400 });
  }

  try {
    await deleteAdminProduct(id);
    return NextResponse.json({ success: true, deletedId: id });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
