import 'source-map-support/register';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as cdk from 'aws-cdk-lib';
import { AwsSolutionsChecks } from 'cdk-nag';
import { GrantWellStack } from './grantwell-stack';
import { InstanceConfig, coreTags, validateInstanceConfig } from './config/instance-config';
import { featureFlags } from './feature-flags';
import { COLLECTION_RESOURCE_TYPE } from './chatbot-api/opensearch/opensearch';
import { describeStacks } from './stack-descriptions';

export interface RunGrantWellAppOptions {
  /** UI project to build. Defaults to the `grantwell-ui` package installed next to the app. */
  readonly uiSourceDir?: string;
  /** The instance's own public files. Defaults to `public/` in the app directory, when it exists. */
  readonly publicDir?: string;
}

/** Synthesises the deployment whose `aws.environment` matches the ENVIRONMENT env var. */
export function runGrantWellApp(instances: InstanceConfig[], options: RunGrantWellAppOptions = {}): cdk.App {
  const environment = process.env.ENVIRONMENT;
  const config = instances.find((i) => i.aws.environment === environment);
  if (!config) {
    throw new Error(
      `No instance config for ENVIRONMENT="${environment ?? ''}". Expected one of: ${instances.map((i) => i.aws.environment).join(', ')}.`
    );
  }
  validateInstanceConfig(config);

  const app = new cdk.App({ context: featureFlags });

  // The collection's tags are create-only; OpenSearchStack sets them itself.
  for (const [key, value] of Object.entries({ ...config.tags, ...coreTags(config) })) {
    cdk.Tags.of(app).add(key, value, { excludeResourceTypes: [COLLECTION_RESOURCE_TYPE] });
  }

  const stack = new GrantWellStack(app, config.aws.stackName, {
    config,
    uiSourceDir: options.uiSourceDir ?? installedUiSourceDir(),
    publicDir: options.publicDir ?? instancePublicDir(),
  });
  describeStacks(stack, config);

  // CI only: nag findings are error annotations, which would fail `cdk deploy`.
  if (process.env.CDK_NAG === 'warn') {
    cdk.Aspects.of(app).add(new AwsSolutionsChecks({ reports: true }));
  }

  return app;
}

function instancePublicDir(): string | undefined {
  const dir = path.join(process.cwd(), 'public');
  return fs.existsSync(dir) ? dir : undefined;
}

function installedUiSourceDir(): string {
  const pkg = require.resolve('grantwell-ui/package.json', { paths: [process.cwd()] });
  return path.join(path.dirname(pkg), 'app');
}
