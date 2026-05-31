import { NextResponse } from "next/server";
import { readdir, readFile } from "fs/promises";
import { join } from "path";
import { FRAGMENTS_ROOT } from "@/lib/fragmentRegistry";

const PRESETS_DIR = join(FRAGMENTS_ROOT, "presets");

export interface Preset {
  id: string;
  name: string;
  description: string;
  tiers: Array<{ id: string; label: string }>;
  fragments: string[];
}

/**
 * GET /api/presets
 * Returns list of available starter pack presets
 */
export async function GET() {
  try {
    const files = await readdir(PRESETS_DIR);
    const presetFiles = files.filter((f) => f.endsWith(".json"));
    
    const presets: Preset[] = [];
    for (const file of presetFiles) {
      try {
        const content = await readFile(join(PRESETS_DIR, file), "utf-8");
        const preset = JSON.parse(content) as Preset;
        presets.push(preset);
      } catch (err) {
        console.error(`Failed to load preset ${file}:`, err);
      }
    }
    
    // Sort by fragment count (least to most) for intuitive ordering
    presets.sort((a, b) => a.fragments.length - b.fragments.length);
    
    return NextResponse.json({ presets });
  } catch (err) {
    console.error("Failed to load presets:", err);
    return NextResponse.json(
      { error: "Failed to load presets", presets: [] },
      { status: 500 }
    );
  }
}
