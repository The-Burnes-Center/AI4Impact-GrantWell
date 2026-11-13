import { createHash } from "node:crypto";
import { encodeIndex, quantize } from "../../lib/chatbot-api/functions/landing-page/ai-grant-search/search-core.mjs";

export const DIMS = 1024;

/** A unit vector pointing mostly along `axis`, so tests can say which grants a query is "about". */
export function topicVector(axis: number, spread = 0.15, seed = axis): number[] {
  const v = new Array(DIMS).fill(0);
  let x = seed * 9301 + 49297;
  for (let i = 0; i < DIMS; i++) {
    x = (x * 233280 + 1) % 2147483647;
    v[i] = ((x / 2147483647) - 0.5) * spread / Math.sqrt(DIMS);
  }
  v[axis] += 1;
  const norm = Math.sqrt(v.reduce((s, a) => s + a * a, 0));
  return v.map((a) => a / norm);
}

/** Deterministic Titan stand-in: the text's hash picks the vector. */
export function textVector(text: string): number[] {
  const h = createHash("sha256").update(text).digest();
  return topicVector(h.readUInt16LE(0) % DIMS, 0.5, h.readUInt32LE(2));
}

export type FixtureDoc = {
  name: string;
  topic: number;
  body?: string;
  agency?: string;
  category?: string;
  scope?: string;
  state?: string;
  status?: string;
};

export function fixtureIndex(docs: FixtureDoc[], buildId = "build-1") {
  return encodeIndex({
    buildId,
    builtAt: "2026-11-04T00:00:00.000Z",
    dims: DIMS,
    views: ["card"],
    docs: docs.map((d) => ({
      name: d.name,
      agency: d.agency ?? null,
      category: d.category ?? null,
      scope: d.scope ?? "federal",
      state: d.state ?? null,
      status: d.status ?? "active",
      fields: { name: d.name, agency: d.agency ?? "", category: d.category ?? "", body: d.body ?? "" },
      vectors: [quantize(topicVector(d.topic))],
    })),
  });
}

export const s3Body = (bytes: Uint8Array | string) => {
  const buf = typeof bytes === "string" ? Buffer.from(bytes) : Buffer.from(bytes);
  return {
    transformToByteArray: async () => new Uint8Array(buf),
    transformToString: async () => buf.toString("utf8"),
  } as any;
};

export const s3Error = (name: string, status: number) => Object.assign(new Error(name), { name, $metadata: { httpStatusCode: status } });

/** An in-memory bucket for S3Client mocks: Get (with IfNoneMatch/IfMatch), Put, List, DeleteObjects. */
export class FakeBucket {
  objects = new Map<string, { body: Buffer; etag: string }>();
  private n = 0;

  put(key: string, body: string | Uint8Array) {
    const buf = Buffer.from(body as any);
    const etag = `"${createHash("md5").update(buf).digest("hex")}-${++this.n}"`;
    this.objects.set(key, { body: buf, etag });
    return etag;
  }

  get(input: any) {
    const o = this.objects.get(input.Key);
    if (!o) throw s3Error("NoSuchKey", 404);
    if (input.IfNoneMatch && input.IfNoneMatch === o.etag) throw s3Error("NotModified", 304);
    let body = o.body;
    const range = /^bytes=(\d+)-(\d+)$/.exec(input.Range ?? "");
    if (range) body = body.subarray(Number(range[1]), Number(range[2]) + 1);
    return { Body: s3Body(body), ETag: o.etag };
  }

  putObject(input: any) {
    const existing = this.objects.get(input.Key);
    if (input.IfNoneMatch === "*" && existing) throw s3Error("PreconditionFailed", 412);
    if (input.IfMatch && existing?.etag !== input.IfMatch) throw s3Error("PreconditionFailed", 412);
    return { ETag: this.put(input.Key, input.Body) };
  }

  list(input: any) {
    const prefix = input.Prefix ?? "";
    const keys = [...this.objects.keys()].filter((k) => k.startsWith(prefix)).sort();
    if (input.Delimiter) {
      const prefixes = new Set<string>();
      for (const k of keys) {
        const rest = k.slice(prefix.length);
        const i = rest.indexOf(input.Delimiter);
        if (i >= 0) prefixes.add(prefix + rest.slice(0, i + 1));
      }
      return { CommonPrefixes: [...prefixes].map((Prefix) => ({ Prefix })), IsTruncated: false };
    }
    return { Contents: keys.map((Key) => ({ Key, ETag: this.objects.get(Key)!.etag })), IsTruncated: false };
  }

  deleteObjects(input: any) {
    for (const { Key } of input.Delete.Objects) this.objects.delete(Key);
    return {};
  }
}

/** Grants shaped like real ones for size and timing: ~900 body words, two vectors, a tenth state-scoped (MA). */
export function syntheticDocs(n: number) {
  const vocab = Array.from({ length: 6000 }, (_, i) => `term${i.toString(36)}`);
  let x = 7;
  const rand = () => ((x = (x * 48271) % 2147483647) / 2147483647);
  return Array.from({ length: n }, (_, i) => ({
    name: `Grant ${i} ${vocab[i % vocab.length]} program`,
    agency: `Agency ${i % 40}`,
    category: `Category ${i % 25}`,
    scope: i % 10 === 0 ? "state" : "federal",
    state: i % 10 === 0 ? "MA" : null,
    fields: {
      name: `Grant ${i} ${vocab[i % vocab.length]} program`,
      agency: `Agency ${i % 40}`,
      category: `Category ${i % 25}`,
      body: Array.from({ length: 900 }, () => vocab[Math.floor(rand() ** 2 * vocab.length)]).join(" "),
    },
    vectors: [quantize(topicVector(i % DIMS, 1, i)), quantize(topicVector((i * 7) % DIMS, 1, i + 1))],
  }));
}
