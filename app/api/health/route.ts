import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return NextResponse.json({ ok: true, database: "ready" });
  } catch (error) {
    return NextResponse.json(
      { ok: false, database: "unavailable", error: error instanceof Error ? error.message : "Unknown error" },
      { status: 503 }
    );
  }
}
