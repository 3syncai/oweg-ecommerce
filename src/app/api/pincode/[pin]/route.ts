import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

type PostalRow = {
  Status?: string;
  Message?: string;
  PostOffice?: Array<{
    Name?: string;
    District?: string;
    State?: string;
  } | null> | null;
};

function placeFromPostal(data: unknown): string | null {
  const row = Array.isArray(data) ? (data[0] as PostalRow | undefined) : null;
  const office = row?.PostOffice?.[0];
  if (!office) return null;
  const place = [office.Name, office.District, office.State]
    .filter(Boolean)
    .join(", ");
  return place || null;
}

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ pin: string }> }
) {
  const { pin: raw } = await ctx.params;
  const pin = String(raw || "").replace(/\D/g, "").slice(0, 6);

  if (pin.length < 4) {
    return NextResponse.json(
      { place: null, error: "invalid_pincode" },
      { status: 400 }
    );
  }

  const url = `https://api.postalpincode.in/pincode/${encodeURIComponent(pin)}`;

  try {
    const res = await fetch(url, {
      headers: { Accept: "application/json" },
      cache: "no-store",
    });
    if (!res.ok) {
      return NextResponse.json(
        { place: null, error: "upstream_failed" },
        { status: 502 }
      );
    }

    const data = (await res.json()) as unknown;
    const place = placeFromPostal(data);

    if (!place) {
      return NextResponse.json(
        { place: null, error: "not_found" },
        { status: 404 }
      );
    }

    return NextResponse.json({ place });
  } catch {
    return NextResponse.json(
      { place: null, error: "lookup_failed" },
      { status: 502 }
    );
  }
}
