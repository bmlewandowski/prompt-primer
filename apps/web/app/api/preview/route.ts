import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { runCompile } from "@/lib/runCompile";

const RequestBodySchema = z.object({
  fragmentPaths: z.array(z.string()),
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

  // If no fragments selected, return empty shell
  if (parsed.data.fragmentPaths.length === 0) {
    return NextResponse.json({
      markdown: "",
      openAIMessage: { role: "system", content: "" },
      manifest: {
        compiledAt: new Date().toISOString(),
        selectedFragments: [],
        tokenCount: 0,
        tokenBudget: parsed.data.tokenBudget,
        exceedsBudget: false,
        conflictResolutions: [],
        missingDependencies: [],
        circularDependencies: [],
        outputFormat: parsed.data.outputFormat,
      },
    });
  }

  return runCompile(parsed.data);
}
