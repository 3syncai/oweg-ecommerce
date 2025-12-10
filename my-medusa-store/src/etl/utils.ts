import crypto from "crypto";
import fs from "fs";
import { mkdir, readFile, writeFile } from "fs/promises";
import path from "path";

export async function ensureDir(dirPath: string): Promise<void> {
  await mkdir(dirPath, { recursive: true });
}

export function nowIso(): string {
  return new Date().toISOString();
}

export async function writeJson(
  filePath: string,
  data: unknown,
  pretty = true
): Promise<void> {
  await ensureDir(path.dirname(filePath));
  await writeFile(
    filePath,
    JSON.stringify(data, null, pretty ? 2 : undefined),
    "utf8"
  );
}

export async function readJson<T>(filePath: string): Promise<T | null> {
  try {
    const raw = await readFile(filePath, "utf8");
    return JSON.parse(raw) as T;
  } catch (error: any) {
    if (error?.code === "ENOENT") {
      return null;
    }
    throw error;
  }
}

export async function sha256File(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash("sha256");
    const stream = fs.createReadStream(filePath);
    stream.on("error", (error) => reject(error));
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("end", () => resolve(hash.digest("hex")));
  });
}

export function safeFilename(input: string): string {
  return input.replace(/[^a-z0-9._-]+/gi, "_");
}

export async function appendLog(
  filePath: string,
  logEntry: Record<string, unknown>
): Promise<void> {
  await ensureDir(path.dirname(filePath));
  await fs.promises.appendFile(
    filePath,
    `${JSON.stringify({ timestamp: nowIso(), ...logEntry })}\n`,
    "utf8"
  );
}


