import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { SdkBackend, type ArkivBackend } from "./arkiv/backend";
import { loadRun, saveRun } from "./arkiv/runs";
import type { ResearchProject } from "./types";

/**
 * Where runs live. Arkiv is the store: every finished run is written to Tiramisu as a read-only
 * entity and reopened from there at /research/:id, on any deployment, by anyone.
 *
 * Reading needs no key. Writing needs ARKIV_PRIVATE_KEY (a funded Tiramisu wallet). Without one,
 * a local JSON folder is used only when STET_LOCAL_STORE=1, for offline development.
 */

let backend: ArkivBackend | null = null;
export function arkiv(): ArkivBackend {
  backend ??= new SdkBackend(process.env.ARKIV_PRIVATE_KEY);
  return backend;
}
/** Swaps the backend (tests). */
export function setArkivBackend(b: ArkivBackend | null) {
  backend = b;
}

const localStore = process.env.STET_LOCAL_STORE === "1";
export const arkivWritable = () => Boolean(arkiv().writer);
export const storageAvailable = () => arkivWritable() || localStore;

const DATA_DIR = process.env.STET_DATA_DIR || path.join(process.cwd(), ".data", "projects");
const fileFor = (id: string) => {
  if (!/^[0-9a-f-]{36}$/.test(id)) throw new Error("Invalid project id.");
  return path.join(DATA_DIR, `${id}.json`);
};

export async function saveProject(project: ResearchProject, opts: { supersedes?: string | null } = {}): Promise<void> {
  if (arkivWritable()) {
    project.arkiv = await saveRun(arkiv(), project, opts);
    return;
  }
  if (!localStore) throw new Error("No ARKIV_PRIVATE_KEY set, so runs can't be saved.");
  await mkdir(DATA_DIR, { recursive: true });
  await writeFile(fileFor(project.id), JSON.stringify(project, null, 2));
}

export async function loadProject(id: string): Promise<ResearchProject | null> {
  if (!/^[0-9a-f-]{36}$/.test(id)) return null;
  const onChain = await loadRun(arkiv(), id);
  if (onChain || !localStore) return onChain;
  try {
    return JSON.parse(await readFile(fileFor(id), "utf8")) as ResearchProject;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw err;
  }
}
