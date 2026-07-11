import { NextRequest } from "next/server";
import { proxyMedusaRequest } from "@/lib/medusa-proxy";

export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ path: string[] }>;
};

async function handle(req: NextRequest, context: RouteContext) {
  const { path } = await context.params;
  return proxyMedusaRequest(req, path);
}

export async function GET(req: NextRequest, context: RouteContext) {
  return handle(req, context);
}

export async function POST(req: NextRequest, context: RouteContext) {
  return handle(req, context);
}

export async function PUT(req: NextRequest, context: RouteContext) {
  return handle(req, context);
}

export async function PATCH(req: NextRequest, context: RouteContext) {
  return handle(req, context);
}

export async function DELETE(req: NextRequest, context: RouteContext) {
  return handle(req, context);
}

export async function OPTIONS(req: NextRequest, context: RouteContext) {
  return handle(req, context);
}
