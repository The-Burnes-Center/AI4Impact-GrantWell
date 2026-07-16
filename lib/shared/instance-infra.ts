/**
 * Per-instance infra identity — the backend/infra half of the core↔config seam (the frontend half
 * is config/instances/<id>.ts). Selected by GRANTWELL_INSTANCE, mirroring the frontend selector.
 *
 * This is OPT-IN and additive: when GRANTWELL_INSTANCE is unset, constants.ts keeps its existing
 * ENVIRONMENT string-switch verbatim, so the two live deployments (MA prod, generic staging) are
 * byte-for-byte unchanged. A frozen state deliverable sets GRANTWELL_INSTANCE and provides its own
 * entry here, bypassing the switch. Values feed CDK logical IDs — never rename an existing
 * instance's values or the swap onto its live stack stops being safe.
 */

export interface InstanceInfra {
  /** CloudFormation stack name — the root of most logical resource IDs. */
  stackName: string;
  /** Cognito hosted-UI domain prefix (globally unique). */
  cognitoDomainName: string;
  /** OpenSearch KB vector index name. */
  knowledgeBaseIndexName: string;
  /** Public URL used in invitation emails; omit to derive from CloudFront at deploy. */
  deploymentUrl?: string;
  /** AWS account/region to bind the stack to; omit for an environment-agnostic synth. */
  aws?: { account?: string; region?: string };
}

/**
 * Registry of instances that opt into config-driven infra. Empty until a state is onboarded this
 * way; MA/generic still run through the ENVIRONMENT switch in constants.ts until B2 migrates them.
 */
export const INSTANCE_INFRA: Record<string, InstanceInfra> = {};

/** Returns the infra config for GRANTWELL_INSTANCE, or null when unset / not registered. */
export function resolveInstanceInfra(): InstanceInfra | null {
  const instance = process.env.GRANTWELL_INSTANCE;
  if (!instance) return null;
  return INSTANCE_INFRA[instance] ?? null;
}
