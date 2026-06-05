import { InstanceConfig } from "./instance-config";
import { maConfig } from "./instances/ma";
import { genericConfig } from "./instances/generic";

const REGISTRY: Record<string, InstanceConfig> = {
  ma: maConfig,
  generic: genericConfig,
};

export function loadInstanceConfig(instanceId: string | undefined): InstanceConfig {
  const known = Object.keys(REGISTRY).join(", ");
  if (!instanceId) {
    throw new Error(`Missing context 'instance'. Use: cdk deploy -c instance=<id>. Known: ${known}`);
  }
  const config = REGISTRY[instanceId];
  if (!config) {
    throw new Error(`Unknown instance '${instanceId}'. Known: ${known}`);
  }
  if (config.instanceId !== instanceId) {
    throw new Error(`config/instances/${instanceId}.ts has instanceId='${config.instanceId}'`);
  }
  const grantsGovApiKey = process.env.GRANTS_GOV_API_KEY;
  if (!grantsGovApiKey) {
    throw new Error("GRANTS_GOV_API_KEY environment variable is required");
  }
  return { ...config, grantsGovApiKey };
}
