import { NextResponse } from "next/server";
import { readFile, writeFile, mkdir } from "fs/promises";
import { join, dirname } from "path";
import { parse } from "yaml";
import { FragmentSchema } from "@prompt-primer/compiler";
import type { Fragment } from "@prompt-primer/compiler";
import { FRAGMENTS_ROOT, regenerateRegistry, withWriteLock, invalidateRegistryCache } from "@/lib/fragmentRegistry";
import type { Preset } from "@/app/api/presets/route";

const PRESETS_DIR = join(FRAGMENTS_ROOT, "presets");
const DEFAULTS_PATH = join(FRAGMENTS_ROOT, "defaults.json");

interface DefaultsSnapshot {
  version: string;
  tiers: Array<{ id: string; label: string }>;
  fragmentCount: number;
  fragments: Array<{ path: string; content: string }>;
}

export interface ApplyPresetRequest {
  presetId: string;
}

/**
 * POST /api/presets/apply
 * Loads fragments from defaults.json and writes them to disk based on preset selection
 */
export async function POST(request: Request) {
  try {
    const body = (await request.json()) as ApplyPresetRequest;
    const { presetId } = body;

    if (!presetId) {
      return NextResponse.json(
        { error: "presetId is required" },
        { status: 400 }
      );
    }

    // Load the preset file
    const presetPath = join(PRESETS_DIR, `${presetId}.json`);
    
    let preset: Preset;
    try {
      const content = await readFile(presetPath, "utf-8");
      preset = JSON.parse(content) as Preset;
    } catch (err) {
      console.error(`Preset ${presetId} not found:`, err);
      return NextResponse.json(
        { error: `Preset ${presetId} not found` },
        { status: 404 }
      );
    }

    // Load defaults.json which contains all fragment content
    let defaults: DefaultsSnapshot;
    try {
      const defaultsContent = await readFile(DEFAULTS_PATH, "utf-8");
      defaults = JSON.parse(defaultsContent) as DefaultsSnapshot;
    } catch (err) {
      return NextResponse.json(
        { error: "Failed to load fragment templates from defaults.json" },
        { status: 500 }
      );
    }

    // Create a map of fragment path -> content from defaults
    const fragmentMap = new Map<string, string>();
    for (const frag of defaults.fragments) {
      fragmentMap.set(frag.path, frag.content);
    }

    // Write YAML files for the preset fragments
    const written: string[] = [];
    const errors: string[] = [];

    await withWriteLock(async () => {
      invalidateRegistryCache();

      for (const fragPath of preset.fragments) {
        const content = fragmentMap.get(fragPath);
        if (!content) {
          errors.push(`${fragPath}: Not found in defaults.json`);
          continue;
        }

        try {
          // Validate the YAML content
          const parsed = parse(content);
          const result = FragmentSchema.safeParse(parsed);
          if (!result.success) {
            errors.push(`${fragPath}: Invalid fragment schema`);
            continue;
          }

          // Write the YAML file
          const fullPath = join(FRAGMENTS_ROOT, fragPath);
          await mkdir(dirname(fullPath), { recursive: true });
          await writeFile(fullPath, content, "utf-8");
          written.push(fragPath);
        } catch (err) {
          errors.push(`${fragPath}: ${err instanceof Error ? err.message : "Write failed"}`);
        }
      }

      // Regenerate the registry
      await regenerateRegistry();
    });

    return NextResponse.json({
      preset: {
        id: preset.id,
        name: preset.name,
        description: preset.description,
        fragmentPaths: preset.fragments,
        tiers: preset.tiers,
      },
      imported: written.length,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (err) {
    console.error("Failed to apply preset:", err);
    return NextResponse.json(
      { error: "Failed to apply preset" },
      { status: 500 }
    );
  }
}
