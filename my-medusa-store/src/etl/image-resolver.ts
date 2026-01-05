import axios from "axios";

import { config } from "./config";
import { logger } from "./logger";

const normalize = (value: string | undefined | null): string | undefined => {
  if (!value) {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
};

const baseFromEnv =
  normalize(process.env.OC_BASE_URL) ??
  normalize(process.env.OC_IMAGE_BASE_URL) ??
  normalize(config.mysql.imageBaseUrl);

const BASE_ROOT = baseFromEnv ? baseFromEnv.replace(/\/+$/, "") : undefined;

const PLACEHOLDER_URL =
  normalize(process.env.PLACEHOLDER_URL) ??
  "https://via.placeholder.com/800x800.png?text=Image+missing";

const HTTP_REFERER = normalize(process.env.HTTP_REFERER) ?? BASE_ROOT;

const http = axios.create({
  timeout: 20000,
  headers: {
    "User-Agent": "Mozilla/5.0 (compatible; ow-eg-etl/1.0)",
    Referer: HTTP_REFERER,
    Accept: "image/*",
  },
  maxRedirects: 5,
  validateStatus: (status) => status >= 200 && status < 400,
});

export const ALLOWED_EXT = new Set(["jpg", "jpeg", "png", "webp", "gif", "bmp"]);
export const SIZES = ["1000x1000", "800x800", "600x600", "500x500", "300x300"];

const ensureAbsolute = (raw: string): string => {
  const trimmed = raw.trim();
  if (!trimmed) {
    return "";
  }
  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed;
  }
  if (trimmed.startsWith("//")) {
    return `https:${trimmed}`;
  }
  if (!BASE_ROOT) {
    return "";
  }
  if (trimmed.startsWith("/")) {
    return `${BASE_ROOT}${trimmed}`;
  }
  if (trimmed.startsWith("image/")) {
    return `${BASE_ROOT}/${trimmed}`;
  }
  return `${BASE_ROOT}/image/${trimmed.replace(/^\/+/, "")}`;
};

const safeDecode = (segment: string): string => {
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
};

const encodePathPreservingSlashes = (raw: string): string => {
  try {
    const absolute = ensureAbsolute(raw.replace(/#/g, "%23"));
    if (!absolute) {
      return absolute;
    }
    const url = new URL(absolute);
    url.pathname = url.pathname
      .split("/")
      .map((segment) => encodeURIComponent(safeDecode(segment)))
      .join("/");
    return url.toString();
  } catch (error) {
    void logger.debug({
      step: "image",
      message: "Failed to encode URL",
      raw,
      error: error instanceof Error ? error.message : String(error),
    });
    return "";
  }
};

const getExt = (url: string): string => {
  const match = url.toLowerCase().match(/\.([a-z0-9]+)(?:\?|$)/);
  return match ? match[1] : "";
};

const headOk = async (url: string): Promise<boolean> => {
  try {
    const response = await http.head(url);
    if (!/^image\//i.test(response.headers["content-type"] ?? "")) {
      return false;
    }
    return true;
  } catch (error) {
    try {
      const response = await http.get(url, { headers: { Range: "bytes=0-0" } });
      return /^image\//i.test(response.headers["content-type"] ?? "");
    } catch (innerError) {
      void logger.debug({
        step: "image",
        message: "Image request failed",
        url,
        error:
          innerError instanceof Error ? innerError.message : String(innerError),
      });
      return false;
    }
  }
};

const cacheCandidates = (original: string): string[] => {
  try {
    const absolute = new URL(original);
    const marker = "/image/catalog/";
    const idx = absolute.pathname.toLowerCase().indexOf(marker);
    if (idx === -1) {
      return [];
    }
    const relative = absolute.pathname.slice(idx + marker.length);
    const lastSlash = relative.lastIndexOf("/");
    const dir = lastSlash === -1 ? "" : relative.slice(0, lastSlash + 1);
    const file = lastSlash === -1 ? relative : relative.slice(lastSlash + 1);
    const name = file.replace(/\.[^.]+$/, "");
    const ext0 = getExt(file);
    const exts = Array.from(new Set([ext0, ...ALLOWED_EXT])).filter(Boolean) as string[];
    const root = BASE_ROOT ?? `${absolute.protocol}//${absolute.host}`;
    const candidates: string[] = [];
    for (const size of SIZES) {
      for (const ext of exts) {
        const candidate = `${root}/image/cache/catalog/${dir}${name}-${size}.${ext}`;
        candidates.push(candidate);
      }
    }
    return candidates.map((candidate) => encodePathPreservingSlashes(candidate));
  } catch (error) {
    void logger.debug({
      step: "image",
      message: "Failed to build cache fallback",
      original,
      error: error instanceof Error ? error.message : String(error),
    });
    return [];
  }
};

export interface ResolveResult {
  url: string;
  reason: "original" | "cache" | "placeholder";
  attempts: string[];
}

const placeholderResult = (attempts: string[], raw: string): ResolveResult => {
  void logger.warn({
    step: "image",
    message: "Using placeholder image",
    raw,
    attempts,
  });
  return {
    url: PLACEHOLDER_URL,
    reason: "placeholder",
    attempts,
  };
};

export async function resolveImageUrl(raw: string): Promise<ResolveResult> {
  if (!raw) {
    return placeholderResult([], raw);
  }

  const attempts: string[] = [];
  const encoded = encodePathPreservingSlashes(raw);
  if (encoded) {
    attempts.push(encoded);
    const ext = getExt(encoded);
    if (!ext || ALLOWED_EXT.has(ext)) {
      if (await headOk(encoded)) {
        return { url: encoded, reason: "original", attempts };
      }
    }
  }

  const fallbacks = cacheCandidates(encoded || ensureAbsolute(raw));
  for (const candidate of fallbacks) {
    attempts.push(candidate);
    if (await headOk(candidate)) {
      void logger.info({
        step: "image",
        message: "Using cached OpenCart thumbnail fallback",
        raw,
        candidate,
      });
      return { url: candidate, reason: "cache", attempts };
    }
  }

  return placeholderResult(attempts, raw);
}

export const placeholderUrl = (): string => PLACEHOLDER_URL;
