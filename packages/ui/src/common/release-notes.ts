import notes from "../../RELEASE_NOTES.md?raw";
import { LEGACY_RELEASE_NOTES } from "./instance";
import { parseReleaseNotes, shownReleases, type ReleaseEntry } from "./release-notes-parse";

export const RELEASES: ReleaseEntry[] = shownReleases(parseReleaseNotes(notes), LEGACY_RELEASE_NOTES);
export const LATEST_RELEASE: ReleaseEntry | null = RELEASES[0] ?? null;
