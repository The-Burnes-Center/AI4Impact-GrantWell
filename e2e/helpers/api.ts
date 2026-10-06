/**
 * The app's own HTTP API, called as the test user. The handlers take the user from the JWT's
 * `sub`, not from the body, so nothing here can reach another user's rows.
 */
import { appConfig } from "./config";
import { tokens } from "./session";

export interface Nofo {
  name: string;
  status: string;
  processing_status: string | null;
  expiration_date: string | null;
  scope: string | null;
}

export interface NofoSummary {
  EligibilityCriteria?: { item: string; description: string }[];
  RequiredDocuments?: { item: string; description: string }[];
  ProjectNarrativeSections?: { item: string; description: string }[];
  KeyDeadlines?: { item: string; description: string }[];
}

export interface DraftJob {
  status: string;
  sectionNames?: string[];
  failedSections?: string[];
}

export const JOB_DONE = ["completed", "partial", "error"];

async function call<T>(method: string, path: string, body?: object): Promise<T> {
  const { idToken } = await tokens();
  const response = await fetch(`${appConfig().httpEndpoint.replace(/\/$/, "")}${path}`, {
    method,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${idToken}` },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`${method} ${path} → ${response.status}: ${text.slice(0, 300)}`);
  return (text ? JSON.parse(text) : undefined) as T;
}

export async function listNofos(): Promise<Nofo[]> {
  return (await call<{ nofoData: Nofo[] }>("GET", "/s3-nofo-bucket-data")).nofoData;
}

export async function nofoSummary(nofoName: string): Promise<NofoSummary> {
  const key = encodeURIComponent(`${nofoName}/`);
  return (await call<{ data: NofoSummary }>("GET", `/s3-nofo-summary?documentKey=${key}`)).data;
}

export async function draftJob(jobId: string): Promise<DraftJob> {
  return call<DraftJob>("GET", `/draft-generation-jobs/${encodeURIComponent(jobId)}`);
}

export async function listSessionIds(): Promise<string[]> {
  const { sub } = await tokens();
  const items = await call<{ session_id: string }[]>("POST", "/user-session", {
    operation: "list_all_sessions_by_user_id",
    user_id: sub,
  });
  return items.map((i) => i.session_id);
}

export async function deleteSession(sessionId: string): Promise<void> {
  const { sub } = await tokens();
  await call("POST", "/user-session", { operation: "delete_session", session_id: sessionId, user_id: sub });
}

export async function listDraftIds(): Promise<string[]> {
  const { sub } = await tokens();
  const items = await call<{ sessionId: string }[]>("POST", "/user-draft", {
    operation: "list_all_drafts_by_user_id",
    user_id: sub,
  });
  return items.map((i) => i.sessionId);
}

export async function deleteDraft(sessionId: string): Promise<void> {
  const { sub } = await tokens();
  await call("POST", "/user-draft", { operation: "delete_draft", session_id: sessionId, user_id: sub });
}

export async function clearRecentlyViewed(): Promise<void> {
  await call("PUT", "/user-profile/recently-viewed", { items: [], mode: "replace" });
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Polls a draft-generation job until it has finished, or until `timeoutMs`. */
export async function waitForJob(jobId: string, timeoutMs: number): Promise<DraftJob> {
  const deadline = Date.now() + timeoutMs;
  let job = await draftJob(jobId);
  while (!JOB_DONE.includes(job.status) && Date.now() < deadline) {
    await sleep(5_000);
    job = await draftJob(jobId);
  }
  return job;
}

/**
 * Deletes a draft once nothing can re-create it: the pipeline's Assemble step upserts the draft
 * when the job ends, and the version writer can add a row after the first purge, so it waits for
 * the job and deletes twice.
 */
export async function deleteDraftSafely(sessionId: string, jobId?: string): Promise<void> {
  if (jobId) await waitForJob(jobId, 15 * 60_000);
  await deleteDraft(sessionId);
  await sleep(10_000);
  await deleteDraft(sessionId);
}
