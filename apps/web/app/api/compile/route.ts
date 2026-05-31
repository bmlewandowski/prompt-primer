import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { runCompile } from "@/lib/runCompile";

const RequestBodySchema = z.object({
  fragmentPaths: z.array(z.string()).min(1),
  tokenBudget: z.number().positive().optional().default(8192),
  encoding: z.enum(["cl100k_base", "o200k_base"]).optional().default("cl100k_base"),
  outputFormat: z.enum(["fabric", "xml", "prose", "json", "chatml"]).optional().default("fabric"),
});

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = RequestBodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  return runCompile(parsed.data);
}
