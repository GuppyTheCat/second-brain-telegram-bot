export type MediaKind = "photo" | "video" | "animation" | "document" | "audio" | "voice";

export interface MediaFile {
  fileId: string;
  kind: MediaKind;
  fileSize?: number;
}

export type MediaFetchResult =
  | { status: "ok"; bytes: Uint8Array; extension: string }
  | { status: "too_large" }
  | { status: "failed"; message: string };

export interface MediaFetcher {
  fetch(file: MediaFile): Promise<MediaFetchResult>;
}
