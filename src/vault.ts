import { rename, writeFile } from "node:fs/promises";
import path from "node:path";

export interface VaultStore {
  createNote(filename: string, content: string): Promise<void>;
}

export function createVaultStore(root: string): VaultStore {
  return {
    async createNote(filename, content) {
      await atomicWrite(root, filename, content);
    },
  };
}

async function atomicWrite(directory: string, filename: string, data: string | Uint8Array): Promise<void> {
  const target = resolveInside(directory, filename);
  const temporary = path.join(directory, `.syncthing.${path.basename(filename)}.tmp`);
  await writeFile(temporary, data);
  await rename(temporary, target);
}

function resolveInside(directory: string, filename: string): string {
  if (filename !== path.basename(filename)) {
    throw new Error(`filename must be a single path segment: ${filename}`);
  }
  const root = path.resolve(directory);
  const target = path.resolve(root, filename);
  if (!target.startsWith(`${root}${path.sep}`)) {
    throw new Error(`refusing to write outside the vault: ${filename}`);
  }
  return target;
}
