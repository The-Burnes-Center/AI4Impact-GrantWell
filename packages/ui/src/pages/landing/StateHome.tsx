import "../../styles/state-home.css";
import type { PublicHomeProps } from "../../common/chrome-api";
import { useBranding } from "../../common/branding";
import { HOME } from "../../common/instance";
import { StateHomeView } from "./StateHomeView";

/** The single-state public home: identity and sign-in, three feature cards, a trust panel and attribution. */
export default function StateHome({ signIn }: PublicHomeProps) {
  return <StateHomeView branding={useBranding()} home={HOME} signIn={signIn} />;
}
