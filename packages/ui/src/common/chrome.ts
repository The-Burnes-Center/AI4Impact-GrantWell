import { CHROME_API_VERSION, type Chrome } from "./chrome-api";

// Absent unless the deployment ships chrome/; theme.css loads for its side effects.
import.meta.glob("../instance-chrome/theme.css", { eager: true });
const module = Object.values(
  import.meta.glob<Chrome>("../instance-chrome/index.tsx", { eager: true, import: "chrome" })
)[0];

function load(): Partial<Chrome> {
  if (!module) return {};
  if (module.apiVersion !== CHROME_API_VERSION) {
    console.error(
      `[chrome] This deployment's chrome targets version ${module.apiVersion}; GrantWell supports ${CHROME_API_VERSION}. Using GrantWell's own.`
    );
    return {};
  }
  return module;
}

export const CHROME: Partial<Chrome> = load();
export const HAS_CHROME_HEADER = Boolean(CHROME.Header);
