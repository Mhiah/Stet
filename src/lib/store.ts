import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { ResearchProject } from "./types";

/**
 * Saves runs as JSON files on the machine running the app, so they reopen at /research/:id.
 * Callers only depend on saveProject/loadProject.
 */

/**
 * Vercel's functions can't keep files between requests, so runs aren't saved there (unless
 * CRUX_DATA_DIR points somewhere writable); reports are kept by downloading the PDF.
 */
export const storageAvailable = !process.env.VERCEL || Boolean(process.env.CRUX_DATA_DIR);

const DATA_DIR = process.env.CRUX_DATA_DIR || path.join(process.cwd(), ".data", "projects");

const fileFor = (id: string) => {
  if (!/^[0-9a-f-]{36}$/.test(id)) throw new Error("Invalid project id.");
  return path.join(DATA_DIR, `${id}.json`);
};

export async function saveProject(project: ResearchProject): Promise<void> {
  await mkdir(DATA_DIR, { recursive: true });
  await writeFile(fileFor(project.id), JSON.stringify(project, null, 2));
}

export async function loadProject(id: string): Promise<ResearchProject | null> {
  try {
    return JSON.parse(await readFile(fileFor(id), "utf8")) as ResearchProject;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw err;
  }
}
