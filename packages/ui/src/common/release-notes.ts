import notes from "../../RELEASE_NOTES.md?raw";
import { parseReleaseNotes, type ReleaseEntry } from "./release-notes-parse";

export const RELEASES: ReleaseEntry[] = parseReleaseNotes(notes);
export const LATEST_RELEASE: ReleaseEntry | null = RELEASES[0] ?? null;
