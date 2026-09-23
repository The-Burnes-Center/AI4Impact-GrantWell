import * as cdk from "aws-cdk-lib";
import * as cf from "aws-cdk-lib/aws-cloudfront";
import * as origins from "aws-cdk-lib/aws-cloudfront-origins";
import * as acm from "aws-cdk-lib/aws-certificatemanager";
import * as s3 from "aws-cdk-lib/aws-s3";
import { Construct } from "constructs";
import { ChatBotApi } from "../chatbot-api";
import { NagSuppressions } from "cdk-nag";


export interface WebsiteProps {  
  readonly userPoolId: string;
  readonly userPoolClientId: string;
  readonly api: ChatBotApi;
  readonly websiteBucket: s3.Bucket;
  readonly customDomain?: string;
  readonly certificateArn?: string;
}

export class Website extends Construct {
    readonly distribution: cf.Distribution;
    readonly domainName: string;

  constructor(scope: Construct, id: string, props: WebsiteProps) {
    super(scope, id);

    /////////////////////////////////////
    ///// CLOUDFRONT IMPLEMENTATION /////
    /////////////////////////////////////

    const originAccessIdentity = new cf.OriginAccessIdentity(this, "S3OAI");
    props.websiteBucket.grantRead(originAccessIdentity);    


    const distributionLogsBucket = new s3.Bucket(
      this,
      "DistributionLogsBucket",
      {
        objectOwnership: s3.ObjectOwnership.OBJECT_WRITER,
        blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
        removalPolicy: cdk.RemovalPolicy.DESTROY,
        autoDeleteObjects: true,
        enforceSSL: true,
      }
    );

    // Configure custom domain if certificate ARN and domain are provided
    const certificate = props.certificateArn && props.customDomain
      ? acm.Certificate.fromCertificateArn(this, 'CloudfrontAcm', props.certificateArn)
      : undefined;

    const s3Origin = origins.S3BucketOrigin.withOriginAccessIdentity(
      props.websiteBucket,
      { originAccessIdentity }
    );

    const chatbotFilesCachePolicy = new cf.CachePolicy(
      this,
      "ChatbotFilesCachePolicy",
      {
        minTtl: cdk.Duration.seconds(0),
        defaultTtl: cdk.Duration.seconds(0),
        maxTtl: cdk.Duration.days(365),
        queryStringBehavior: cf.CacheQueryStringBehavior.all(),
        cookieBehavior: cf.CacheCookieBehavior.none(),
        headerBehavior: cf.CacheHeaderBehavior.allowList(
          "Referer",
          "Origin",
          "Authorization",
          "Content-Type",
          "x-forwarded-user",
          "Access-Control-Request-Headers",
          "Access-Control-Request-Method"
        ),
      }
    );

    const distribution = new cf.Distribution(this, "Distribution", {
      domainNames: certificate && props.customDomain ? [props.customDomain] : undefined,
      certificate,
      minimumProtocolVersion: cf.SecurityPolicyProtocol.TLS_V1_2_2021,
      defaultRootObject: "index.html",
      priceClass: cf.PriceClass.PRICE_CLASS_ALL,
      httpVersion: cf.HttpVersion.HTTP2_AND_3,
      enableLogging: true,
      logBucket: distributionLogsBucket,
      defaultBehavior: {
        origin: s3Origin,
        viewerProtocolPolicy: cf.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        cachePolicy: cf.CachePolicy.CACHING_OPTIMIZED,
      },
      additionalBehaviors: {
        "/chatbot/files/*": {
          origin: s3Origin,
          viewerProtocolPolicy: cf.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
          allowedMethods: cf.AllowedMethods.ALLOW_ALL,
          cachePolicy: chatbotFilesCachePolicy,
        },
      },
      errorResponses: [
        {
          httpStatus: 404,
          responseHttpStatus: 200,
          responsePagePath: "/index.html",
          ttl: cdk.Duration.seconds(0),
        },
      ],
    });

    (distribution.node.defaultChild as cf.CfnDistribution).overrideLogicalId(
      "UserInterfaceWebsiteDistributionCFDistributionBCE5BC0C"
    );

    this.distribution = distribution;
    
    // Use custom domain if configured, otherwise use CloudFront domain
    this.domainName = props.customDomain || distribution.distributionDomainName;

    // ###################################################
    // Outputs
    // ###################################################
    new cdk.CfnOutput(this, "UserInterfaceDomainName", {
      value: `https://${this.domainName}`,
    });
    
    if (props.customDomain) {
      new cdk.CfnOutput(this, "CustomDomainName", {
        value: props.customDomain,
        description: "Custom domain configured for CloudFront distribution",
      });
    }

    NagSuppressions.addResourceSuppressions(
      distributionLogsBucket,
      [
        {
          id: "AwsSolutions-S1",
          reason: "Bucket is the server access logs bucket for websiteBucket.",
        },
      ]
    );

    NagSuppressions.addResourceSuppressions(props.websiteBucket, [
      { id: "AwsSolutions-S5", reason: "OAI is configured for read." },
    ]);

    NagSuppressions.addResourceSuppressions(distribution, [
      { id: "AwsSolutions-CFR1", reason: "No geo restrictions" },
      {
        id: "AwsSolutions-CFR2",
        reason: "WAF not required due to configured Cognito auth.",
      },
      { id: "AwsSolutions-CFR4", reason: "TLS 1.2 is the default." },
    ]);
    }

  }
