export interface Link {
  label: string;
  href: string;
}

export interface LogoLink extends Link {
  logo?: string;
  className?: string;
}

/** A line of text with optional links, e.g. ["Developed by ", { label: "AI for Impact", href }, "."]. */
export type RichLine = (string | Link)[];

/** The public home page. Every field is optional; core supplies neutral defaults. */
export interface HomeCopy {
  /** "state" for tenancy "single", otherwise "marketing". A chrome PublicHome replaces both. */
  layout?: "state" | "marketing";
  /** One line under the app name; also the marketing page's hero line. */
  tagline?: string;
  description?: string;
  /** Exactly three cards, in the order of their icons: discover, understand, draft. */
  features?: { title: string; text: string }[];
  trust?: { title: string; text: string };
  /** Replaces the default credit and support-email lines. */
  attribution?: RichLine[];
}

/** One per instance, shared by its deployments. Plain JSON: core reads it at synth for emails. */
export interface Branding {
  appName: string;
  orgName: string;
  postalAddress: string;
  /** Shown in the UI, and the Reply-To on auth mail. */
  supportEmail: string;
  colors: {
    primary: string;
    primaryHover?: string;
    primaryActive?: string;
    primaryLight?: string;
    accent?: string;
    accentHover?: string;
  };
  /** Image paths are site-root URLs, e.g. "/images/marketing/logo.svg". */
  logo: string;
  favicon: string;
  /** Home-screen and web-manifest name; defaults to appName. */
  shortName?: string;
  home?: HomeCopy;
  footer: {
    /** Also the digest email header image; falls back to `logo`. */
    wordmark?: string;
    madeBy?: LogoLink;
    partners: LogoLink[];
    links?: Link[];
    /** Holder in the "© <year> <holder>" line. */
    copyright?: string;
    disclaimer?: string;
  };
  omniPartners: Link[];
  /**
   * A government deployment's identity: a strip above every page (logo + label, linking to href) and
   * the logo beside the app logo, unless sealBesideLogo is false.
   */
  govHeader?: { logo: string; label: string; href: string; sealBesideLogo?: boolean };
  analyticsId?: string;
  seo?: {
    /** Home page <title>, at most 60 characters. Defaults to appName. */
    title?: string;
    /** Meta description, about 150 characters. */
    description?: string;
    /** 1200×630 share image, a site-root path like logo. No og:image when unset. */
    ogImage?: { path: string; alt: string };
  };
}

export interface UsState {
  code: string;
  name: string;
}

interface InstanceConfigBase {
  /** Readable ID, e.g. "generic-prod", lowercase-kebab. Frozen AWS names never use it; monitoring names do (`grantwell-<id>`). */
  id: string;
  /** The instance this deployment belongs to, lowercase-kebab, e.g. "generic". Tagged as Instance. */
  instance: string;
  stage: "prod" | "dev";
  /** Frozen once deployed. Core derives every other physical name from these. */
  aws: {
    stackName: string;
    /** Prefix of the SES configuration sets; also baked into the UI build. */
    environment: string;
    cognitoDomainPrefix: string;
    knowledgeBaseIndexName: string;
    /** The vector collection's tags can't change after creation; set this to what a deployed one carries. Defaults to coreTags. */
    collectionTags?: Record<string, string>;
  };
  /** Public site URL, no trailing slash. */
  siteUrl: string;
  customDomain?: {
    domainName: string;
    certificateArn: string;
    /** Extra hostnames (e.g. www) that 301 to domainName. The certificate must cover them too. */
    redirectDomains?: string[];
  };
  auth: {
    mfaRequired: boolean;
    /** "off" turns MFA off entirely (no authenticator setup); otherwise mfaRequired picks required or optional. */
    mfa?: "off";
    oidcProviderName?: string;
    /** ISO timestamp with offset. Until then the UI urges MFA at each sign-in; from then it blocks the app until the user enrolls. */
    mfaDeadline?: string;
    /** Cloudflare Turnstile on sign-up and sign-in; on unless false. Off needs no TURNSTILE_* keys. */
    turnstile?: boolean;
  };
  /** SES, or Cognito's own sender for an account without SES; the digest needs SES and is off without it. */
  email: SesEmail | { cognitoDefault: true };
  scraper: { dailySchedule: boolean };
  /** Admin emails, off unless set. They need an SES sender. */
  notifications?: {
    /**
     * Weekdays at 09:00 Eastern, when grants are waiting in the processing queue, one email to the
     * comma-separated addresses in the SSM String parameter `queueEmailRecipientsParameter(config)`.
     */
    processingQueueEmail?: boolean;
  };
  /** Alarms always ship; this adds the once-a-day health brief to the alerts topic. */
  monitoring: { dailyBrief: boolean };
  /** Search engines may index the home page. Off unless set; never on a dev stage. */
  seo?: { indexable: boolean };
  /** https URL the in-app feedback form is forwarded to; unset, feedback is only logged. */
  feedbackFormUrl?: string;
  /** Choices for a required Region question on the user's profile, stored on the profile row. Unset or empty, no question. */
  regions?: string[];
  /** Abuse and cost limits; every key is optional, `limits(config)` fills in the defaults. */
  limits?: Partial<Limits>;
  /** Dev only. These accounts may sign in past Turnstile with the token in SSM at `e2eBypassParameter(config)`. */
  e2e?: { testEmails: string[] };
  /** Extra tags for every resource except the vector collection. Project, Instance and Stage come from core. */
  tags: Record<string, string>;
  branding: Branding;
}

export interface SesEmail {
  /** Auth and digest mail send from this address. */
  sender: string;
  /**
   * The SES identity behind `sender`: its domain (the default) or the address itself, for a sender
   * whose domain's DNS the deployment can't change. An address identity is verified by hand.
   */
  identity?: "domain" | "address";
  /** False when another deployment in the same account and region already owns the identity. */
  manageSenderIdentity: boolean;
}

/** Stage-wide API Gateway throttling: shared by every caller, not per user. */
export interface Throttle {
  /** Steady requests per second. */
  rateLimit: number;
  /** Requests allowed in a burst above the steady rate. */
  burstLimit: number;
}

export interface Limits {
  /** Chat messages per user per UTC day. Admins are exempt. */
  chatMessagesPerDay: number;
  /** Generated applications per user per UTC day. Admins are exempt. */
  applicationsPerDay: number;
  /** Reserved concurrency of the chat Lambda: its ceiling, and taken from the account's shared pool. */
  chatConcurrency: number;
  httpApiThrottle: Throttle;
  websocketThrottle: Throttle;
}

export const DEFAULT_LIMITS: Limits = {
  chatMessagesPerDay: 100,
  applicationsPerDay: 10,
  chatConcurrency: 25,
  httpApiThrottle: { rateLimit: 200, burstLimit: 400 },
  websocketThrottle: { rateLimit: 50, burstLimit: 100 },
};

export function limits(config: InstanceConfig): Limits {
  return { ...DEFAULT_LIMITS, ...config.limits };
}

export function turnstileEnabled(config: InstanceConfig): boolean {
  return config.auth.turnstile !== false;
}

/** The deployment's only state when tenancy is single: every user belongs to it. */
export function singleState(config: InstanceConfig): UsState | undefined {
  return config.tenancy === "single" ? config.states[0] : undefined;
}

/** Undefined when the deployment sends with Cognito's default sender. */
export function sesEmail(config: InstanceConfig): SesEmail | undefined {
  return "sender" in config.email ? config.email : undefined;
}

export type InstanceConfig = InstanceConfigBase &
  ({ tenancy: "single"; states: [UsState] } | { tenancy: "multi"; states: UsState[] });

const isLinkHref = (href: unknown) => typeof href === "string" && /^(https:\/\/|mailto:|\/)/.test(href);
const isText = (value: unknown) => typeof value === "string" && value.trim() !== "";

function brandingProblems(branding: Branding): string[] {
  const problems: string[] = [];
  const badLinks = (links: unknown[] | undefined) =>
    (links ?? []).some((l) => !l || typeof l !== "object" || !isText((l as Link).label) || !isLinkHref((l as Link).href));
  const home = branding.home;
  if (home?.layout !== undefined && home.layout !== "state" && home.layout !== "marketing") {
    problems.push('branding.home.layout must be "state" or "marketing"');
  }
  for (const field of ["tagline", "description"] as const) {
    if (home?.[field] !== undefined && !isText(home[field])) problems.push(`branding.home.${field} must be non-empty text`);
  }
  if (home?.features !== undefined && (home.features.length !== 3 || home.features.some((f) => !isText(f?.title) || !isText(f?.text)))) {
    problems.push("branding.home.features must be exactly three { title, text } cards");
  }
  if (home?.trust !== undefined && (!isText(home.trust.title) || !isText(home.trust.text))) {
    problems.push("branding.home.trust needs a title and text");
  }
  if (home?.attribution?.some((line) => !Array.isArray(line) || badLinks(line.filter((part) => typeof part !== "string")))) {
    problems.push("branding.home.attribution lines must be lists of text and { label, href } links (https://, mailto: or /)");
  }
  if (badLinks(branding.footer.links)) problems.push("branding.footer.links need a label and an https://, mailto: or / href");
  for (const field of ["copyright", "disclaimer"] as const) {
    if (branding.footer[field] !== undefined && !isText(branding.footer[field])) {
      problems.push(`branding.footer.${field} must be non-empty text`);
    }
  }
  if (branding.shortName !== undefined && (!isText(branding.shortName) || branding.shortName.length > 12)) {
    problems.push("branding.shortName must be 1-12 characters");
  }
  return problems;
}

export function validateInstanceConfig(config: InstanceConfig): void {
  const problems: string[] = [];
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(config.id)) problems.push("id must be lowercase-kebab");
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(config.instance)) problems.push("instance must be lowercase-kebab");
  const reserved = Object.keys(config.tags).filter((k) => k in coreTags(config));
  if (reserved.length) problems.push(`tags must not set ${reserved.join(", ")} (core sets them)`);
  if (config.states.length === 0) problems.push("states is empty");
  if (config.tenancy === "single" && config.states.length !== 1) {
    problems.push(`tenancy "single" needs exactly one state, got ${config.states.length}`);
  }
  if (config.siteUrl.endsWith("/")) problems.push("siteUrl has a trailing slash");
  if (config.customDomain && config.siteUrl !== `https://${config.customDomain.domainName}`) {
    problems.push(`siteUrl must be https://${config.customDomain.domainName} when customDomain is set`);
  }
  const redirectDomains = config.customDomain?.redirectDomains ?? [];
  if (redirectDomains.some((d) => d !== d.toLowerCase() || d === config.customDomain?.domainName || d.includes("/"))) {
    problems.push("customDomain.redirectDomains must be lowercase hostnames other than domainName");
  }
  const ses = sesEmail(config);
  if (ses ? "cognitoDefault" in config.email : (config.email as { cognitoDefault?: unknown }).cognitoDefault !== true) {
    problems.push("email must be either { sender, manageSenderIdentity } or { cognitoDefault: true }");
  } else if (ses && !ses.sender.includes("@")) problems.push("email.sender is not an address");
  if (ses?.identity !== undefined && ses.identity !== "domain" && ses.identity !== "address") {
    problems.push('email.identity must be "domain" or "address"');
  } else if (ses?.identity === "address" && ses.manageSenderIdentity) {
    problems.push('email.identity "address" needs manageSenderIdentity: false (verify the address in SES by hand)');
  }
  const queueEmail = config.notifications?.processingQueueEmail;
  if (queueEmail !== undefined && typeof queueEmail !== "boolean") {
    problems.push("notifications.processingQueueEmail must be true or false");
  } else if (queueEmail && !ses) {
    problems.push(
      "notifications.processingQueueEmail needs SES, but email is { cognitoDefault: true }: set email: { sender, manageSenderIdentity } or remove the option"
    );
  }
  if (config.feedbackFormUrl !== undefined && !config.feedbackFormUrl.startsWith("https://")) {
    problems.push("feedbackFormUrl must start with https://");
  }
  if (config.regions !== undefined) {
    const names = Array.isArray(config.regions) ? config.regions : [];
    if (!Array.isArray(config.regions) || names.some((r) => typeof r !== "string" || !r.trim() || r !== r.trim() || r.length > 200)) {
      problems.push("regions must be a list of trimmed, non-empty names of at most 200 characters");
    } else if (new Set(names.map((r) => r.toLowerCase())).size !== names.length) {
      problems.push("regions has duplicates");
    }
  }
  problems.push(...brandingProblems(config.branding));
  const deadline = config.auth.mfaDeadline;
  if (deadline !== undefined && !(/(Z|[+-]\d{2}:\d{2})$/.test(deadline) && Number.isFinite(Date.parse(deadline)))) {
    problems.push("auth.mfaDeadline must be an ISO timestamp with an offset, e.g. 2026-11-02T00:00:00-05:00");
  }
  if (config.seo?.indexable && config.stage === "dev") problems.push("seo.indexable must not be set on a dev deployment");
  if (config.auth.mfa !== undefined && config.auth.mfa !== "off") problems.push('auth.mfa can only be "off"');
  if (config.auth.mfa === "off" && (config.auth.mfaRequired || config.auth.mfaDeadline)) {
    problems.push('auth.mfa "off" can\'t be combined with mfaRequired or mfaDeadline');
  }
  if (config.auth.turnstile !== undefined && typeof config.auth.turnstile !== "boolean") {
    problems.push("auth.turnstile must be true or false");
  }
  problems.push(...limitProblems(config.limits));
  if (config.e2e) {
    if (!turnstileEnabled(config)) problems.push("e2e only bypasses Turnstile; remove it when auth.turnstile is false");
    if (config.stage === "prod") problems.push("e2e must not be set on a prod deployment");
    if (config.e2e.testEmails.length === 0) problems.push("e2e.testEmails is empty");
    const outside = config.e2e.testEmails.filter((e) => !e.endsWith(E2E_TEST_EMAIL_DOMAIN));
    if (outside.length) problems.push(`e2e.testEmails must end in ${E2E_TEST_EMAIL_DOMAIN}: ${outside.join(", ")}`);
  }
  if (problems.length) {
    throw new Error(`Invalid instance config "${config.id}": ${problems.join("; ")}`);
  }
}

function limitProblems(given: Partial<Limits> | undefined): string[] {
  if (given === undefined) return [];
  if (typeof given !== "object" || given === null) return ["limits must be an object"];
  const problems: string[] = [];
  const isPositiveInt = (v: unknown) => Number.isInteger(v) && (v as number) > 0;
  const known = Object.keys(DEFAULT_LIMITS);
  const unknown = Object.keys(given).filter((k) => !known.includes(k));
  if (unknown.length) problems.push(`limits has unknown keys: ${unknown.join(", ")}`);
  for (const key of ["chatMessagesPerDay", "applicationsPerDay", "chatConcurrency"] as const) {
    if (given[key] !== undefined && !isPositiveInt(given[key])) problems.push(`limits.${key} must be a positive whole number`);
  }
  for (const key of ["httpApiThrottle", "websocketThrottle"] as const) {
    const t = given[key];
    if (t === undefined) continue;
    if (typeof t !== "object" || t === null || !(typeof t.rateLimit === "number" && t.rateLimit > 0) || !isPositiveInt(t.burstLimit)) {
      problems.push(`limits.${key} must be { rateLimit: a number above 0, burstLimit: a positive whole number }`);
    }
  }
  return problems;
}

/** Reserved (RFC 2606), so no real person can hold an e2e account. The trigger Lambda re-checks it. */
export const E2E_TEST_EMAIL_DOMAIN = "@grantwell.invalid";

/** SecureString created out of band; only deployments with `e2e` can read it. */
export function e2eBypassParameter(config: InstanceConfig): string {
  return `/${monitoringPrefix(config)}/e2e/turnstile-bypass`;
}

/** String parameter created out of band so the addresses stay out of the repo. */
export function queueEmailRecipientsParameter(config: InstanceConfig): string {
  return `/${monitoringPrefix(config)}/queue-email/recipients`;
}

export function processingQueueEmailEnabled(config: InstanceConfig): boolean {
  return config.notifications?.processingQueueEmail === true && sesEmail(config) !== undefined;
}

/** Tags core puts on every stack and resource. None of them may change for a deployed stack; see collectionTags. */
export function coreTags(config: InstanceConfig): Record<string, string> {
  return { Project: "GrantWell", Instance: config.instance, Stage: config.stage };
}

/** Prefix for monitoring names. The AWS account may be shared, so every one starts with "grantwell-". */
export function monitoringPrefix(config: InstanceConfig): string {
  return `grantwell-${config.id}`;
}

/** [{code,name}] so handlers get both membership checks and display names from one env var. */
/** The Region question's choices; empty when the deployment asks none. */
export function regions(config: InstanceConfig): string[] {
  return config.regions ?? [];
}

export function supportedStatesEnv(config: InstanceConfig): string {
  return JSON.stringify(config.states.map((s) => ({ code: s.code, name: s.name })));
}
