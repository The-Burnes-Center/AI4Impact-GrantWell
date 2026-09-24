export interface Link {
  label: string;
  href: string;
}

export interface LogoLink extends Link {
  logo?: string;
  className?: string;
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
  footer: {
    /** Also the digest email header image; falls back to `logo`. */
    wordmark?: string;
    madeBy?: LogoLink;
    partners: LogoLink[];
  };
  omniPartners: Link[];
  analyticsId?: string;
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
  customDomain?: { domainName: string; certificateArn: string };
  auth: { mfaRequired: boolean; oidcProviderName?: string };
  email: {
    /** Its domain is the SES identity auth and digest mail send from. */
    sender: string;
    /** False when another deployment in the same account and region already owns the identity. */
    manageSenderIdentity: boolean;
  };
  scraper: { dailySchedule: boolean };
  /** Alarms always ship; this adds the once-a-day health brief to the alerts topic. */
  monitoring: { dailyBrief: boolean };
  /** https URL the in-app feedback form is forwarded to; unset, feedback is only logged. */
  feedbackFormUrl?: string;
  /** Dev only. These accounts may sign in past Turnstile with the token in SSM at `e2eBypassParameter(config)`. */
  e2e?: { testEmails: string[] };
  /** Extra tags for every resource except the vector collection. Project, Instance and Stage come from core. */
  tags: Record<string, string>;
  branding: Branding;
}

export type InstanceConfig = InstanceConfigBase &
  ({ tenancy: "single"; states: [UsState] } | { tenancy: "multi"; states: UsState[] });

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
  if (!config.email.sender.includes("@")) problems.push("email.sender is not an address");
  if (config.feedbackFormUrl !== undefined && !config.feedbackFormUrl.startsWith("https://")) {
    problems.push("feedbackFormUrl must start with https://");
  }
  if (config.e2e) {
    if (config.stage === "prod") problems.push("e2e must not be set on a prod deployment");
    if (config.e2e.testEmails.length === 0) problems.push("e2e.testEmails is empty");
    const outside = config.e2e.testEmails.filter((e) => !e.endsWith(E2E_TEST_EMAIL_DOMAIN));
    if (outside.length) problems.push(`e2e.testEmails must end in ${E2E_TEST_EMAIL_DOMAIN}: ${outside.join(", ")}`);
  }
  if (problems.length) {
    throw new Error(`Invalid instance config "${config.id}": ${problems.join("; ")}`);
  }
}

/** Reserved (RFC 2606), so no real person can hold an e2e account. The trigger Lambda re-checks it. */
export const E2E_TEST_EMAIL_DOMAIN = "@grantwell.invalid";

/** SecureString created out of band; only deployments with `e2e` can read it. */
export function e2eBypassParameter(config: InstanceConfig): string {
  return `/${monitoringPrefix(config)}/e2e/turnstile-bypass`;
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
export function supportedStatesEnv(config: InstanceConfig): string {
  return JSON.stringify(config.states.map((s) => ({ code: s.code, name: s.name })));
}
