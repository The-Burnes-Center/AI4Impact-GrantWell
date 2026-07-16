// TEMPLATE — paste into INSTANCE_INFRA in core/lib/shared/instance-infra.ts of the grantwell-ma
// deliverable, then deploy with GRANTWELL_INSTANCE=ma. Values carried from the MA prod branch (main).
//
// These names feed CDK logical IDs on the LIVE MA stack — do not change them, or a deploy will
// create-and-destroy stateful resources instead of updating in place.
export const MA_INFRA_ENTRY = {
  ma: {
    stackName: "gw-stack-prod",
    cognitoDomainName: "gw-auth-prod",
    knowledgeBaseIndexName: "knowledge-base-index-prod",
    deploymentUrl: "https://d1mu5xcqb0ac30.cloudfront.net/",
    aws: { account: "976046823671", region: "us-east-1" },
  },
};
