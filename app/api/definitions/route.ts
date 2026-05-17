import { readFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";

function parseDefinitions(source: string) {
  const definitions: Record<string, string> = {};

  for (const line of source.split(/\r?\n/)) {
    const match = line.match(/^([a-z]+)\s*=\s*(.+)$/);

    if (!match) {
      continue;
    }

    const [, word, rawValue] = match;
    const value = rawValue.trim();

    if (value.startsWith('"') && value.endsWith('"')) {
      definitions[word] = JSON.parse(value) as string;
      continue;
    }

    if (value.startsWith("'") && value.endsWith("'")) {
      definitions[word] = value.slice(1, -1);
    }
  }

  return definitions;
}

export async function GET() {
  const filePath = path.join(
    process.cwd(),
    "app",
    "data",
    "definition.toml",
  );
  const source = await readFile(filePath, "utf8");

  return NextResponse.json(parseDefinitions(source));
}
