/** Signs the test user out everywhere (so tokens caught in a trace are dead) and deletes the saved session. */
import * as fs from "node:fs";
import { AUTH_FILE, removeAuthDir } from "./helpers/config";
import { globalSignOut } from "./helpers/session";

export default async function globalTeardown(): Promise<void> {
  try {
    if (fs.existsSync(AUTH_FILE)) {
      await globalSignOut();
      console.log("[e2e teardown] test user signed out everywhere");
    }
  } finally {
    removeAuthDir();
  }
}
