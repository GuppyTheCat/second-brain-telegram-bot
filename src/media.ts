import https from "node:https";
import type { Agent } from "node:http";

const DOWNLOAD_LIMIT_BYTES = 20 * 1024 * 1024;
const DOWNLOAD_TIMEOUT_MS = 60_000;

export interface MediaFileRef {
  fileId: string;
  fileUniqueId: string;
  fileSize?: number;
  fileName?: string;
  mimeType?: string;
}

export type MediaFetchResult =
  | { ok: true; bytes: Uint8Array; extension?: string }
  | { ok: false; reason: "too_large" | "failed" };

export interface MediaFetcher {
  fetch(file: MediaFileRef): Promise<MediaFetchResult>;
}

export interface TelegramFileSource {
  getFile(fileId: string): Promise<{ file_path?: string; file_size?: number }>;
}

export function createTelegramMediaFetcher(options: {
  token: string;
  getFile: TelegramFileSource["getFile"];
  agent?: Agent;
}): MediaFetcher {
  return {
    async fetch(file) {
      try {
        if (file.fileSize !== undefined && file.fileSize > DOWNLOAD_LIMIT_BYTES) {
          return { ok: false, reason: "too_large" };
        }
        const remote = await options.getFile(file.fileId);
        if (remote.file_size !== undefined && remote.file_size > DOWNLOAD_LIMIT_BYTES) {
          return { ok: false, reason: "too_large" };
        }
        if (!remote.file_path) {
          console.error("media download failed: missing file path");
          return { ok: false, reason: "failed" };
        }
        const extension = extensionFromFilePath(remote.file_path);
        const url = fileUrl(options.token, remote.file_path);
        const bytes = await downloadFile(url, options.agent);
        return { ok: true, bytes, extension };
      } catch (error) {
        if (isFileTooBig(error)) return { ok: false, reason: "too_large" };
        console.error(`media download failed: ${sanitizeError(error, options.token)}`);
        return { ok: false, reason: "failed" };
      }
    },
  };
}

function fileUrl(token: string, filePath: string): string {
  const encoded = filePath.split("/").map((segment) => encodeURIComponent(segment)).join("/");
  return `https://api.telegram.org/file/bot${token}/${encoded}`;
}

function extensionFromFilePath(filePath: string): string | undefined {
  const base = filePath.split("/").pop() ?? "";
  const dot = base.lastIndexOf(".");
  if (dot <= 0 || dot === base.length - 1) return undefined;
  const extension = base.slice(dot + 1).toLowerCase();
  return /^[a-z0-9]+$/.test(extension) ? extension : undefined;
}

function downloadFile(url: string, agent: Agent | undefined): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    const request = https.get(url, { agent, timeout: DOWNLOAD_TIMEOUT_MS }, (response) => {
      const status = response.statusCode ?? 0;
      if (status !== 200) {
        response.resume();
        reject(new Error(`download failed: HTTP ${status}`));
        return;
      }
      const chunks: Buffer[] = [];
      response.on("data", (chunk: Buffer | string) => {
        chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
      });
      response.on("end", () => {
        resolve(Buffer.concat(chunks));
      });
      response.on("error", (error) => {
        reject(error instanceof Error ? error : new Error("download failed"));
      });
    });
    request.on("timeout", () => {
      request.destroy(new Error("download timed out"));
    });
    request.on("error", (error) => {
      reject(error instanceof Error ? error : new Error("download failed"));
    });
  });
}

function isFileTooBig(error: unknown): boolean {
  return errorText(error).toLowerCase().includes("file is too big");
}

function sanitizeError(error: unknown, token: string): string {
  const text = errorText(error);
  return token.length > 0 ? text.split(token).join("[redacted]") : text;
}

function errorText(error: unknown): string {
  const message = error instanceof Error ? error.message : "unknown error";
  if (typeof error === "object" && error !== null && "description" in error) {
    const description = error.description;
    if (typeof description === "string" && description.length > 0) return `${message}: ${description}`;
  }
  return message;
}
