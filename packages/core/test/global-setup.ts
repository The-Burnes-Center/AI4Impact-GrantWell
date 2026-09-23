import { synthAll } from "../scripts/synth-ci.mjs";

// CI synthesises in its own step first and sets REUSE_SYNTH. Locally, always re-synth so a stale
// cdk.out/ci-* can never hide a changed logical ID.
export default async function setup() {
  if (process.env.REUSE_SYNTH !== "1") {
    await synthAll();
  }
}
