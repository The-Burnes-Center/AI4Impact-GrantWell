import * as cdk from "aws-cdk-lib";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as s3deploy from "aws-cdk-lib/aws-s3-deployment";
import * as cf from "aws-cdk-lib/aws-cloudfront";
import { Construct } from "constructs";
import {
  ExecSyncOptionsWithBufferEncoding,
  execSync,
} from "node:child_process";
import * as path from "node:path";
import * as fs from "node:fs";
import { ChatBotApi } from "../chatbot-api";
import { Website } from "./generate-app"
import { NagSuppressions } from "cdk-nag";
import { Utils } from "../shared/utils"
import { InstanceConfig } from "../config/instance-config";

// .gitignore because npm pack drops it: a source build and a packaged build must hash the same.
const UI_COPY_EXCLUDES = new Set(["node_modules", "dist", ".gitignore", path.join("src", "common", "generated")]);

export interface UserInterfaceProps {
  readonly config: InstanceConfig;
  readonly uiSourceDir: string;
  readonly userPoolId: string;
  readonly userPoolClientId: string;
  readonly api: ChatBotApi;
  readonly cognitoDomain : string;
}

export class UserInterface extends Construct {
  public readonly distribution: cf.Distribution;

  constructor(scope: Construct, id: string, props: UserInterfaceProps) {
    super(scope, id);

    // A fresh copy per synth, so the asset hash sees only the package's files and parallel synths never share a dir.
    const appPath = path.join(cdk.Stage.of(this)!.outdir, "ui-build");
    fs.rmSync(appPath, { recursive: true, force: true });
    fs.cpSync(props.uiSourceDir, appPath, {
      recursive: true,
      filter: (src) => !UI_COPY_EXCLUDES.has(path.relative(props.uiSourceDir, src)),
    });
    const buildPath = path.join(appPath, "dist");

    const uploadLogsBucket = new s3.Bucket(this, "WebsiteLogsBucket", {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
      enforceSSL: true,
    });

    const websiteBucket = new s3.Bucket(this, "WebsiteBucket", {
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      autoDeleteObjects: true,
      // bucketName: props.config.privateWebsite ? props.config.domain : undefined,
      websiteIndexDocument: "index.html",
      websiteErrorDocument: "index.html",
      enforceSSL: true,
      serverAccessLogsBucket: uploadLogsBucket,
    });

    // Deploy either Private (only accessible within VPC) or Public facing website
    let distribution;

    const publicWebsite = new Website(this, "Website", { 
      ...props, 
      websiteBucket: websiteBucket,
      customDomain: props.config.customDomain?.domainName,
      certificateArn: props.config.customDomain?.certificateArn
    });
    distribution = publicWebsite.distribution
    this.distribution = publicWebsite.distribution;
    
    // Use custom domain if configured, otherwise use CloudFront domain
    const frontendDomain = publicWebsite.domainName;

    const exportsAsset = s3deploy.Source.jsonData("aws-exports.json", {
      Auth: {
        region: cdk.Aws.REGION,
        userPoolId: props.userPoolId,
        userPoolWebClientId: props.userPoolClientId,
        oauth: {
          domain: props.cognitoDomain.concat(".auth.us-east-1.amazoncognito.com"),
          scope: ["aws.cognito.signin.user.admin","email", "openid", "profile"],
          redirectSignIn: "https://" + frontendDomain,
          redirectSignOut: "https://" + frontendDomain,
          responseType: "code"
        }
      },
      httpEndpoint : props.api.httpAPI.restAPI.url,
      wsEndpoint : props.api.wsAPI.wsAPIStage.url,
      federatedSignInProvider : props.config.auth.oidcProviderName ?? ""
    });

    // Staged inside appPath so it is part of the asset hash and visible to the Docker fallback.
    const generatedDir = path.join(appPath, "src", "common", "generated");
    fs.mkdirSync(generatedDir, { recursive: true });
    fs.writeFileSync(
      path.join(generatedDir, "instance.json"),
      JSON.stringify({ branding: props.config.branding, states: props.config.states }, null, 2) + "\n"
    );

    const asset = s3deploy.Source.asset(appPath, {
      bundling: {
        image: cdk.DockerImage.fromRegistry(
          "public.ecr.aws/sam/build-nodejs24.x:latest"
        ),
        command: [
          "sh",
          "-c",
          [
            "npm --cache /tmp/.npm install",
            `ENVIRONMENT="${props.config.aws.environment}" TURNSTILE_SITE_KEY="${process.env.TURNSTILE_SITE_KEY ?? ""}" npm --cache /tmp/.npm run build`,
            "cp -aur /asset-input/dist/* /asset-output/",
          ].join(" && "),
        ],
        local: {
          tryBundle(outputDir: string) {
            try {
              const options: ExecSyncOptionsWithBufferEncoding = {
                stdio: "inherit",
                cwd: appPath,
                env: {
                  ...process.env,
                  ENVIRONMENT: props.config.aws.environment,
                },
              };

              execSync(`npm --silent --prefix "${appPath}" install`, options);
              execSync(`npm --silent --prefix "${appPath}" run build`, options);
              Utils.copyDirRecursive(buildPath, outputDir);
            } catch (e) {
              console.error(e);
              return false;
            }

            return true;
          },
        },
      },
    });

    new s3deploy.BucketDeployment(this, "UserInterfaceDeployment", {
      prune: false,
      sources: [asset, exportsAsset],
      destinationBucket: websiteBucket,
      distribution: distribution,
      memoryLimit: 2048,
      retainOnDelete: false
    });


    /**
     * CDK NAG suppression
     */
    NagSuppressions.addResourceSuppressions(
      uploadLogsBucket,
      [
        {
          id: "AwsSolutions-S1",
          reason: "Bucket is the server access logs bucket for websiteBucket.",
        },
      ]
    );
  }
}
