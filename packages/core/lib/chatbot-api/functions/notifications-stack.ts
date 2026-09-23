/**
 * Nested stack holding the NOFO notification digest Lambda functions and the EventBridge
 * Scheduler entries that drive them. Split out of the main app stack to stay under the
 * 500-resource CloudFormation limit.
 *
 * The SES identity/configuration set, the bounce/complaint SNS topic and the unsubscribe
 * HMAC secret stay in the parent: they are account-scoped or shared state whose physical
 * identity must survive this refactor.
 */

import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import * as path from "path";

import * as lambda from "aws-cdk-lib/aws-lambda";
import * as iam from "aws-cdk-lib/aws-iam";
import * as ses from "aws-cdk-lib/aws-ses";
import * as sns from "aws-cdk-lib/aws-sns";
import * as scheduler from "aws-cdk-lib/aws-scheduler";
import * as schedulerTargets from "aws-cdk-lib/aws-scheduler-targets";
import * as secretsmanager from "aws-cdk-lib/aws-secretsmanager";
import { SnsEventSource } from "aws-cdk-lib/aws-lambda-event-sources";
import { Table } from "aws-cdk-lib/aws-dynamodb";

import { emailConfig } from "../../constants";
import { genericBrandingData } from "../../shared/generic-branding";
import { sesSendEmailPolicy } from "./shared-policies";

export interface NotificationsStackProps extends cdk.NestedStackProps {
  readonly userNotificationPrefsTable: Table;
  readonly nofoMetadataTable: Table;
  readonly digestSendLogTable: Table;
  readonly digestSuppressionTable: Table;
  readonly userPool: cdk.aws_cognito.UserPool;
  /** Shared with functions outside this stack, so it stays in the parent. */
  readonly jsSharedLayer: lambda.ILayerVersion;
  /** Account+region scoped, and its event destination is wired in the parent. */
  readonly sesConfigurationSet: ses.IConfigurationSet;
  /**
   * ARN of the bounce/complaint topic, which stays in the parent. Imported rather than passed
   * as the Topic object: LambdaSubscription.bind() adds a stack dependency for a concrete
   * sns.Topic in another stack, and a nested stack may not depend on its parent.
   */
  readonly sesFeedbackTopicArn: string;
  /** Recreating it would invalidate every unsubscribe link already mailed out. */
  readonly unsubscribeSecret: secretsmanager.ISecret;
  readonly notificationSender: string;
  readonly supportedStatesEnv: string;
}

export class NotificationsStack extends cdk.NestedStack {
  public readonly notificationDigestFunction: lambda.Function;
  public readonly notificationDigestPreviewFunction: lambda.Function;
  public readonly notificationDigestBroadcastFunction: lambda.Function;
  public readonly notificationUnsubscribeFunction: lambda.Function;
  public readonly notificationSesFeedbackFunction: lambda.Function;

  constructor(scope: Construct, id: string, props: NotificationsStackProps) {
    super(scope, id, props);

    const notificationSender = props.notificationSender;

    const digestBrandEnv = {
      DIGEST_BRAND_COLOR: genericBrandingData.colors.primary,
      DIGEST_LOGO_URL: `${emailConfig.deploymentUrl}${genericBrandingData.footerLogo}`,
      DIGEST_APP_NAME: genericBrandingData.appName,
      DIGEST_ORG_NAME: genericBrandingData.orgName,
      DIGEST_POSTAL_ADDRESS: genericBrandingData.postalAddress,
      DIGEST_SUPPORT_EMAIL: genericBrandingData.supportEmail,
    };

    const notificationDigestFunction = new lambda.Function(
      this,
      "NotificationDigestFunction",
      {
        runtime: lambda.Runtime.NODEJS_24_X,
        code: lambda.Code.fromAsset(path.join(__dirname, "notifications/digest")),
        handler: "index.handler",
        layers: [props.jsSharedLayer],
        environment: {
          USER_NOTIFICATION_PREFS_TABLE_NAME:
            props.userNotificationPrefsTable.tableName,
          NOFO_METADATA_TABLE_NAME: props.nofoMetadataTable.tableName,
          USER_POOL_ID: props.userPool.userPoolId,
          NOTIFICATION_SENDER: notificationSender,
          DEPLOYMENT_URL: emailConfig.deploymentUrl,
          UNSUBSCRIBE_SECRET_ARN: props.unsubscribeSecret.secretArn,
          DIGEST_SEND_LOG_TABLE_NAME: props.digestSendLogTable.tableName,
          DIGEST_SUPPRESSION_TABLE_NAME: props.digestSuppressionTable.tableName,
          SES_CONFIGURATION_SET: props.sesConfigurationSet.configurationSetName,
          SUPPORTED_STATES: props.supportedStatesEnv,
          ...digestBrandEnv,
        },
        timeout: cdk.Duration.minutes(15),
      }
    );

    props.userNotificationPrefsTable.grantReadWriteData(notificationDigestFunction);
    props.nofoMetadataTable.grantReadData(notificationDigestFunction);
    props.digestSendLogTable.grantReadWriteData(notificationDigestFunction);
    props.digestSuppressionTable.grantReadData(notificationDigestFunction);
    props.userPool.grant(notificationDigestFunction, "cognito-idp:AdminGetUser");
    props.unsubscribeSecret.grantRead(notificationDigestFunction);
    notificationDigestFunction.addToRolePolicy(
      sesSendEmailPolicy(notificationSender)
    );

    this.notificationDigestFunction = notificationDigestFunction;

    // Developer-only digest preview: renders the real template (shared layer) against real data —
    // the caller's own prefs and the live active NOFO pool — and can also send a test message to the
    // caller.
    const notificationDigestPreviewFunction = new lambda.Function(
      this,
      "NotificationDigestPreviewFunction",
      {
        runtime: lambda.Runtime.NODEJS_24_X,
        code: lambda.Code.fromAsset(
          path.join(__dirname, "notifications/digest-preview")
        ),
        handler: "index.handler",
        layers: [props.jsSharedLayer],
        environment: {
          USER_NOTIFICATION_PREFS_TABLE_NAME:
            props.userNotificationPrefsTable.tableName,
          NOFO_METADATA_TABLE_NAME: props.nofoMetadataTable.tableName,
          DEPLOYMENT_URL: emailConfig.deploymentUrl,
          NOTIFICATION_SENDER: notificationSender,
          SES_CONFIGURATION_SET: props.sesConfigurationSet.configurationSetName,
          SUPPORTED_STATES: props.supportedStatesEnv,
          ...digestBrandEnv,
        },
        timeout: cdk.Duration.seconds(15),
      }
    );
    // Preview runs the real selection: read the caller's prefs and the active NOFO pool.
    props.userNotificationPrefsTable.grantReadData(
      notificationDigestPreviewFunction
    );
    props.nofoMetadataTable.grantReadData(notificationDigestPreviewFunction);
    // Test-send uses the same verified sender as the digest.
    notificationDigestPreviewFunction.addToRolePolicy(
      sesSendEmailPolicy(notificationSender)
    );
    this.notificationDigestPreviewFunction = notificationDigestPreviewFunction;

    // Developer-only trigger that fires the real digest on demand (async-invokes the digest Lambda),
    // for a single user or everyone. Route is wired in chatbot-api/index.ts.
    const notificationDigestBroadcastFunction = new lambda.Function(
      this,
      "NotificationDigestBroadcastFunction",
      {
        runtime: lambda.Runtime.NODEJS_24_X,
        code: lambda.Code.fromAsset(
          path.join(__dirname, "notifications/digest-broadcast")
        ),
        handler: "index.handler",
        environment: {
          DIGEST_FUNCTION_NAME: notificationDigestFunction.functionName,
        },
        timeout: cdk.Duration.seconds(15),
      }
    );
    notificationDigestFunction.grantInvoke(notificationDigestBroadcastFunction);
    this.notificationDigestBroadcastFunction = notificationDigestBroadcastFunction;

    // Public one-click unsubscribe endpoint (no JWT — the signed token is the authorization). Sets
    // the caller's frequency to "off". Route is wired in chatbot-api/index.ts without an authorizer.
    const notificationUnsubscribeFunction = new lambda.Function(
      this,
      "NotificationUnsubscribeFunction",
      {
        runtime: lambda.Runtime.NODEJS_24_X,
        code: lambda.Code.fromAsset(
          path.join(__dirname, "notifications/unsubscribe")
        ),
        handler: "index.handler",
        layers: [props.jsSharedLayer],
        environment: {
          USER_NOTIFICATION_PREFS_TABLE_NAME:
            props.userNotificationPrefsTable.tableName,
          UNSUBSCRIBE_SECRET_ARN: props.unsubscribeSecret.secretArn,
          DIGEST_APP_NAME: genericBrandingData.appName,
          DIGEST_BRAND_COLOR: genericBrandingData.colors.primary,
        },
        timeout: cdk.Duration.seconds(15),
      }
    );
    props.userNotificationPrefsTable.grantWriteData(notificationUnsubscribeFunction);
    props.unsubscribeSecret.grantRead(notificationUnsubscribeFunction);
    this.notificationUnsubscribeFunction = notificationUnsubscribeFunction;

    // Hard bounces and complaints land in the suppression table, the digest's send gate.
    const notificationSesFeedbackFunction = new lambda.Function(
      this,
      "NotificationSesFeedbackFunction",
      {
        runtime: lambda.Runtime.NODEJS_24_X,
        code: lambda.Code.fromAsset(
          path.join(__dirname, "notifications/ses-feedback")
        ),
        handler: "index.handler",
        environment: {
          DIGEST_SUPPRESSION_TABLE_NAME: props.digestSuppressionTable.tableName,
          USER_NOTIFICATION_PREFS_TABLE_NAME:
            props.userNotificationPrefsTable.tableName,
          USER_POOL_ID: props.userPool.userPoolId,
        },
        timeout: cdk.Duration.seconds(30),
      }
    );
    notificationSesFeedbackFunction.addEventSource(
      new SnsEventSource(
        sns.Topic.fromTopicArn(
          this,
          "NotificationDigestFeedbackTopic",
          props.sesFeedbackTopicArn
        )
      )
    );
    props.digestSuppressionTable.grantWriteData(notificationSesFeedbackFunction);
    props.userNotificationPrefsTable.grantReadWriteData(notificationSesFeedbackFunction);
    props.userPool.grant(notificationSesFeedbackFunction, "cognito-idp:ListUsers");
    this.notificationSesFeedbackFunction = notificationSesFeedbackFunction;

    // 2:00 PM America/New_York year-round. Scheduler, not events.Rule, because a Rule cron is UTC
    // only and would drift an hour across DST. Both cadences fire together on Mondays; a user is
    // only ever on one of them, so the overlap costs a concurrent table read, not a double-send.
    const digestSchedulerRole = new iam.Role(this, "NotificationDigestSchedulerRole", {
      assumedBy: new iam.ServicePrincipal("scheduler.amazonaws.com"),
    });
    notificationDigestFunction.grantInvoke(digestSchedulerRole);

    new scheduler.Schedule(this, "NotificationDigestDailySchedule", {
      schedule: scheduler.ScheduleExpression.expression(
        "cron(0 14 * * ? *)",
        cdk.TimeZone.AMERICA_NEW_YORK
      ),
      description: "Send daily NOFO notification digests",
      target: new schedulerTargets.LambdaInvoke(notificationDigestFunction, {
        role: digestSchedulerRole,
        input: scheduler.ScheduleTargetInput.fromObject({ frequency: "daily" }),
      }),
    });

    new scheduler.Schedule(this, "NotificationDigestWeeklySchedule", {
      schedule: scheduler.ScheduleExpression.expression(
        "cron(0 14 ? * MON *)",
        cdk.TimeZone.AMERICA_NEW_YORK
      ),
      description: "Send weekly NOFO notification digests",
      target: new schedulerTargets.LambdaInvoke(notificationDigestFunction, {
        role: digestSchedulerRole,
        input: scheduler.ScheduleTargetInput.fromObject({ frequency: "weekly" }),
      }),
    });
  }
}
