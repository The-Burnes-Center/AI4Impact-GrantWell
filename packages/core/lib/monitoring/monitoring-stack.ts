/**
 * Outage alerting, modelled on a-iep's MonitoringStack:
 *
 *   alarms -> <prefix>-alarms -> alert-formatter -> <prefix>-alerts -> AWS Chatbot -> Slack
 *
 * Chatbot is set up in the console and subscribes to the alerts topic, never the alarms topic
 * (that one produces the raw metric card the formatter exists to replace).
 *
 * The alarm description is the one line a person reads, so it states what users experience,
 * not the metric. Heartbeats use treatMissingData BREACHING: a stopped schedule emits nothing,
 * and the default would read that as healthy.
 *
 * Every name starts with the instance prefix because the AWS account may be shared.
 */
import * as path from "node:path";
import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import * as cloudwatch from "aws-cdk-lib/aws-cloudwatch";
import * as actions from "aws-cdk-lib/aws-cloudwatch-actions";
import * as sns from "aws-cdk-lib/aws-sns";
import * as subscriptions from "aws-cdk-lib/aws-sns-subscriptions";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as logs from "aws-cdk-lib/aws-logs";
import * as iam from "aws-cdk-lib/aws-iam";
import * as ssm from "aws-cdk-lib/aws-ssm";
import * as events from "aws-cdk-lib/aws-events";
import * as targets from "aws-cdk-lib/aws-events-targets";
import * as sfn from "aws-cdk-lib/aws-stepfunctions";
import * as sqs from "aws-cdk-lib/aws-sqs";
import * as apigwv2 from "aws-cdk-lib/aws-apigatewayv2";
import * as cf from "aws-cdk-lib/aws-cloudfront";
import * as cr from "aws-cdk-lib/custom-resources";
import { InstanceConfig, monitoringPrefix } from "../config/instance-config";

/**
 * - `critical`: users can't use GrantWell right now. Red (prod only).
 * - `medium`: something is degraded, or heading for critical. Yellow.
 * - `low`: worth knowing, nothing is broken. Blue.
 *
 * Reaches the formatter as a `[severity]` prefix on the description, which it strips.
 */
export type Severity = "critical" | "medium" | "low";

/** Log lines the handlers already emit. Rewording one disarms its alarm; 16a's unit tests pin them. */
export const LOG_MARKERS = {
  turnstileUnavailable: ["Turnstile siteverify returned a non-OK status", "Turnstile siteverify call failed"],
  turnstileNotConfigured: ["TURNSTILE_SECRET_KEY is not set"],
  accountSetupFailed: ["Failed to set custom:state at confirmation", "Failed to revoke sessions after password reset"],
  kbRetrieveFailed: ["could not retrieve Knowledge Base documents"],
  grantSearchFailed: ["Hybrid search error:"],
  createMetadataFailed: ["Error processing record:"],
  draftVersionWriteFailed: ["draft-version-writer failed on"],
  pipelineDispatchFailed: ["Error dispatching SQS record:"],
  scraperFatal: ["Fatal coordinator error:"],
  digestSendFailed: ["Digest send failed for", "Digest failed for user"],
} as const;

/** Cognito's fixed, non-adjustable budget for a synchronous trigger. */
const COGNITO_TRIGGER_BUDGET_MS = 5_000;

export interface MonitoringStackProps extends cdk.NestedStackProps {
  readonly config: InstanceConfig;
  readonly httpApi: apigwv2.IHttpApi;
  readonly distribution: cf.IDistribution;
  readonly chatFunction: lambda.IFunction;
  readonly websocketAuthorizerFunction: lambda.IFunction;
  readonly signupTriggerFunction: lambda.IFunction;
  readonly createMetadataFunction: lambda.IFunction;
  readonly syncKBFunction: lambda.IFunction;
  readonly draftVersionWriterFunction: lambda.IFunction;
  readonly draftVersionWriterFailures: sqs.IQueue;
  readonly aiGrantSearchFunction: lambda.IFunction;
  readonly applicationPdfGeneratorFunction: lambda.IFunction;
  readonly nofoPipeline: {
    readonly stateMachine: sfn.IStateMachine;
    readonly extractText: lambda.IFunction;
    readonly extractAndAnalyze: lambda.IFunction;
    readonly synthesize: lambda.IFunction;
    readonly contentCheck: lambda.IFunction;
    readonly dispatcher: lambda.IFunction;
    readonly dlqProcessor: lambda.IFunction;
  };
  readonly draftGeneration: {
    readonly stateMachine: sfn.IStateMachine;
    readonly generateSection: lambda.IFunction;
  };
  readonly scraperCoordinatorFunction: lambda.IFunction;
  readonly notificationDigestFunction: lambda.IFunction;
  readonly autoArchiveFunction: lambda.IFunction;
}

interface BriefComponent {
  readonly label: string;
  readonly fn: lambda.IFunction;
  /** Without it "0 runs" is unreadable: some components are meant to be idle. */
  readonly purpose: string;
}

export class MonitoringStack extends cdk.NestedStack {
  /** Alarms publish here; the formatter is the only subscriber. */
  public readonly alarmTopic: sns.Topic;
  /** Readable alerts. This is the topic AWS Chatbot subscribes to. */
  public readonly alertTopic: sns.Topic;
  public readonly alarms: cloudwatch.Alarm[] = [];

  private readonly prefix: string;
  private readonly stage: InstanceConfig["stage"];
  private readonly logGroupPolicy: cr.AwsCustomResourcePolicy;
  private readonly ensuredLogGroups = new Map<lambda.IFunction, { logGroup: logs.ILogGroup; ensure: Construct }>();

  constructor(scope: Construct, id: string, props: MonitoringStackProps) {
    super(scope, id, props);
    const { config } = props;
    this.prefix = monitoringPrefix(config);
    this.stage = config.stage;
    this.logGroupPolicy = cr.AwsCustomResourcePolicy.fromSdkCalls({
      resources: [
        this.formatArn({
          service: "logs",
          resource: "log-group",
          resourceName: "/aws/lambda/*",
          arnFormat: cdk.ArnFormat.COLON_RESOURCE_NAME,
        }),
      ],
    });

    this.alarmTopic = new sns.Topic(this, "AlarmTopic", {
      topicName: `${this.prefix}-alarms`,
      displayName: `GrantWell ${config.id} alarms (raw)`,
    });
    this.alertTopic = new sns.Topic(this, "AlertTopic", {
      topicName: `${this.prefix}-alerts`,
      displayName: `GrantWell ${config.id} alerts`,
    });

    this.addAlertFormatter();
    this.addSiteAndApiAlarms(props);
    this.addSignInAlarms(props);
    this.addEmailAlarms(config);
    this.addChatAndSearchAlarms(props);
    this.addDocumentAlarms(props);
    this.addNofoPipelineAlarms(props);
    this.addDraftAlarms(props);
    this.addScheduledJobAlarms(props, config);

    if (config.monitoring.dailyBrief) {
      this.addDailyBrief([
        { label: "chat", fn: props.chatFunction, purpose: "answers every chat message; idle means nobody chatted" },
        { label: "chat sign-in check", fn: props.websocketAuthorizerFunction, purpose: "runs when a chat connection opens" },
        { label: "sign-up / sign-in trigger", fn: props.signupTriggerFunction, purpose: "runs on every sign-up and sign-in; errors include bot rejections" },
        { label: "upload indexing", fn: props.createMetadataFunction, purpose: "runs when a user uploads a document" },
        { label: "knowledge base sync", fn: props.syncKBFunction, purpose: "starts indexing after uploads and NOFO changes" },
        { label: "draft history", fn: props.draftVersionWriterFunction, purpose: "saves a version each time a draft changes" },
        { label: "AI grant search", fn: props.aiGrantSearchFunction, purpose: "runs on every grant search" },
        { label: "PDF export", fn: props.applicationPdfGeneratorFunction, purpose: "runs when a user exports a PDF" },
        { label: "NOFO upload dispatch", fn: props.nofoPipeline.dispatcher, purpose: "starts processing for each uploaded NOFO" },
        { label: "NOFO text extraction", fn: props.nofoPipeline.extractText, purpose: "first step of NOFO processing" },
        { label: "NOFO analysis", fn: props.nofoPipeline.extractAndAnalyze, purpose: "reads a NOFO's sections with Bedrock" },
        { label: "NOFO synthesis", fn: props.nofoPipeline.synthesize, purpose: "writes deadlines and questions for a NOFO" },
        { label: "NOFO content check", fn: props.nofoPipeline.contentCheck, purpose: "decides publish or admin review" },
        { label: "failed-NOFO sweep", fn: props.nofoPipeline.dlqProcessor, purpose: "every 15 min, moves failed NOFOs into admin review" },
        { label: "draft section writer", fn: props.draftGeneration.generateSection, purpose: "writes each section of a generated draft" },
        { label: "grants.gov scrape", fn: props.scraperCoordinatorFunction, purpose: config.scraper.dailySchedule ? "runs daily at 09:00 UTC" : "runs only when started by hand" },
        { label: "notification digest", fn: props.notificationDigestFunction, purpose: "daily and weekly NOFO emails at 14:00 Eastern" },
        { label: "expired-NOFO archiving", fn: props.autoArchiveFunction, purpose: "runs daily at 02:00 UTC" },
      ]);
    }

    new cdk.CfnOutput(this, "AlertTopicArn", {
      value: this.alertTopic.topicArn,
      description: "Subscribe AWS Chatbot to this topic",
    });
  }

  /**
   * If the formatter breaks, alarms still fire but nothing reaches Slack, which looks healthy.
   * So its own two alarms publish straight to the alerts topic: a broken formatter degrades to
   * Chatbot's raw card rather than to silence.
   */
  private addAlertFormatter(): void {
    const formatter = new lambda.Function(this, "AlertFormatterFunction", {
      runtime: lambda.Runtime.PYTHON_3_12,
      handler: "handler.lambda_handler",
      code: lambda.Code.fromAsset(path.join(__dirname, "functions/alert-formatter"), {
        exclude: ["__pycache__"],
      }),
      timeout: cdk.Duration.seconds(15),
      environment: {
        ALERT_TOPIC_ARN: this.alertTopic.topicArn,
        STAGE: this.stage,
        ALARM_PREFIX: `${this.prefix} `,
      },
      description: "Rewrites CloudWatch alarms as readable Slack alerts",
      logGroup: new logs.LogGroup(this, "AlertFormatterLogGroup", {
        retention: logs.RetentionDays.ONE_MONTH,
      }),
    });
    this.alertTopic.grantPublish(formatter);
    this.alarmTopic.addSubscription(new subscriptions.LambdaSubscription(formatter));

    this.alarm("AlertFormatterFailingAlarm", {
      severity: "critical",
      name: "alerting itself is broken",
      description:
        "Alarms are firing but their alerts are not reaching Slack, so the channel looks quiet " +
        "while something may be wrong. Check CloudWatch alarms directly until this is fixed.",
      metric: formatter.metricErrors({ period: cdk.Duration.minutes(5), statistic: "Sum" }),
      threshold: 1,
      topic: this.alertTopic,
    });

    // The alarm above can't see a formatter that is never called (subscription or permission gone).
    this.alarm("AlertDeliveryFailingAlarm", {
      severity: "critical",
      name: "alerts are not reaching the formatter",
      description:
        "Alarms fired but could not be delivered for formatting, so they never reached Slack. " +
        "Check CloudWatch alarms directly until this is fixed.",
      metric: new cloudwatch.Metric({
        namespace: "AWS/SNS",
        metricName: "NumberOfNotificationsFailed",
        dimensionsMap: { TopicName: this.alarmTopic.topicName },
        statistic: "Sum",
        period: cdk.Duration.minutes(5),
      }),
      threshold: 1,
      topic: this.alertTopic,
    });
  }

  private addSiteAndApiAlarms(props: MonitoringStackProps): void {
    // CloudFront publishes only in us-east-1; deployed elsewhere this alarm sees no data.
    this.alarm("SiteErrorsAlarm", {
      severity: "critical",
      name: "site returning errors",
      description: "The GrantWell site is failing to load for users (CloudFront is returning 5xx).",
      metric: new cloudwatch.Metric({
        namespace: "AWS/CloudFront",
        metricName: "5xxErrorRate",
        dimensionsMap: { DistributionId: props.distribution.distributionId, Region: "Global" },
        statistic: "Average",
        period: cdk.Duration.minutes(5),
      }),
      threshold: 10,
      evaluationPeriods: 3,
    });

    // Nearly every HTTP handler catches its errors and returns 500, so Lambda Errors stays flat; this sees them all.
    this.alarm("ApiServerErrorAlarm", {
      severity: "critical",
      name: "API returning 5xx",
      description: "Users can't load NOFOs, drafts, documents or their profile: the API is returning server errors.",
      metric: new cloudwatch.Metric({
        namespace: "AWS/ApiGateway",
        metricName: "5xx",
        dimensionsMap: { ApiId: props.httpApi.apiId },
        statistic: "Sum",
        period: cdk.Duration.minutes(5),
      }),
      threshold: 5,
    });

    // A Bedrock failure ends in Errors: the error send to a closed socket throws, or the loop runs to the timeout.
    this.alarm("ChatErrorsAlarm", {
      severity: "critical",
      name: "chat is failing",
      description: "The AI chat is erroring out or hanging for users. Usually Bedrock.",
      metric: props.chatFunction.metricErrors({ period: cdk.Duration.minutes(5), statistic: "Sum" }),
      threshold: 3,
    });

    this.alarm("ChatAuthorizerErrorsAlarm", {
      severity: "critical",
      name: "chat cannot connect",
      description: "Chat connections can't be opened, so users can't chat. Usually Cognito's signing keys are unreachable.",
      metric: props.websocketAuthorizerFunction.metricErrors({ period: cdk.Duration.minutes(5), statistic: "Sum" }),
      threshold: 3,
    });

    // Lambda concurrency is account-wide, and this account is shared with other projects.
    this.alarm("ChatThrottlesAlarm", {
      severity: "critical",
      name: "chat throttled",
      description: "Chat messages are being refused on capacity before any code runs. The account's Lambda concurrency is shared.",
      metric: props.chatFunction.metricThrottles({ period: cdk.Duration.minutes(5), statistic: "Sum" }),
      threshold: 1,
    });
  }

  /**
   * The trigger throws on purpose to reject a sign-up or sign-in, so its Errors count includes
   * every bot and unsupported-state rejection. The Turnstile markers separate an outage from that.
   */
  private addSignInAlarms(props: MonitoringStackProps): void {
    const trigger = props.signupTriggerFunction;

    this.alarm("TurnstileUnavailableAlarm", {
      severity: "critical",
      name: "sign-up bot check unreachable",
      description: "Cloudflare Turnstile can't be reached or is failing, so every sign-up and sign-in is being rejected.",
      metric: this.markerMetric("TurnstileUnavailable", trigger, LOG_MARKERS.turnstileUnavailable, cdk.Duration.minutes(15)),
      threshold: 3,
    });

    this.alarm("TurnstileNotConfiguredAlarm", {
      severity: "critical",
      name: "sign-up bot check not configured",
      description: "The Turnstile secret is missing from the sign-in trigger, so every sign-up and sign-in is being rejected.",
      metric: this.markerMetric("TurnstileNotConfigured", trigger, LOG_MARKERS.turnstileNotConfigured, cdk.Duration.minutes(5)),
      threshold: 1,
    });

    // The trigger's Lambda timeout sits 1 s under Cognito's budget; this fires a second before that.
    this.alarm("SignInTriggerSlowAlarm", {
      severity: "critical",
      name: "sign-in slow: trigger nearing Cognito's 5-second limit",
      description: "The sign-up and sign-in trigger is running long enough that Cognito may be abandoning the call and failing the sign-in.",
      metric: trigger.metricDuration({ period: cdk.Duration.minutes(5), statistic: "Maximum" }),
      threshold: COGNITO_TRIGGER_BUDGET_MS - 2_000,
    });

    this.alarm("SignUpRejectionsAlarm", {
      severity: "medium",
      name: "sign-ups being rejected in bulk",
      description: "Many sign-ups or sign-ins are being rejected. Either a bot run is being stopped, or real users are being turned away.",
      metric: trigger.metricErrors({ period: cdk.Duration.minutes(15), statistic: "Sum" }),
      threshold: 10,
    });

    this.alarm("AccountSetupFailedAlarm", {
      severity: "medium",
      name: "account setup step failed",
      description: "A new user's state wasn't saved, or a password reset didn't sign out their other sessions.",
      metric: this.markerMetric("AccountSetupFailed", trigger, LOG_MARKERS.accountSetupFailed, cdk.Duration.minutes(15)),
      threshold: 1,
    });
  }

  private addEmailAlarms(config: InstanceConfig): void {
    const configurationSet = `${config.aws.environment}-auth`;
    const sesMetric = (metricName: string) =>
      new cloudwatch.Metric({
        namespace: "AWS/SES",
        metricName,
        dimensionsMap: { "ses:configuration-set": configurationSet },
        statistic: "Sum",
        period: cdk.Duration.hours(1),
      });

    this.alarm("AuthEmailNotDeliveredAlarm", {
      severity: "medium",
      name: "sign-in emails not delivered",
      description: "Verification and password-reset codes are bouncing or being rejected, so some users can't finish signing up or resetting.",
      metric: new cloudwatch.MathExpression({
        expression: "bounce + reject",
        usingMetrics: { bounce: sesMetric("Bounce"), reject: sesMetric("Reject") },
        label: "bounced or rejected",
        period: cdk.Duration.hours(1),
      }),
      threshold: 3,
    });

    // Account-wide, so only the deployment that owns the sender identity alarms on it.
    if (config.email.manageSenderIdentity) {
      this.alarm("SesBounceRateAlarm", {
        severity: "medium",
        name: "SES bounce rate heading for a sending pause",
        description: "The account's email bounce rate is climbing. At 10% SES pauses all sending, including sign-in codes.",
        metric: new cloudwatch.Metric({
          namespace: "AWS/SES",
          metricName: "Reputation.BounceRate",
          statistic: "Maximum",
          period: cdk.Duration.hours(1),
        }),
        threshold: 0.05,
      });
    }
  }

  private addChatAndSearchAlarms(props: MonitoringStackProps): void {
    // Retrieval failures become a "search tool failed" tool result, so chat carries on and Errors stays flat.
    this.alarm("ChatRetrievalFailingAlarm", {
      severity: "medium",
      name: "chat cannot search NOFOs",
      description: "Chat can't read the knowledge base, so it answers users without the NOFO text.",
      metric: this.markerMetric("KbRetrieveFailed", props.chatFunction, LOG_MARKERS.kbRetrieveFailed, cdk.Duration.minutes(15)),
      threshold: 3,
    });

    // A failed hybrid search returns an empty 200.
    this.alarm("GrantSearchFailingAlarm", {
      severity: "medium",
      name: "grant search returning nothing",
      description: "AI grant search is showing users empty results because OpenSearch queries are failing.",
      metric: this.markerMetric("GrantSearchFailed", props.aiGrantSearchFunction, LOG_MARKERS.grantSearchFailed, cdk.Duration.minutes(15)),
      threshold: 3,
    });
  }

  private addDocumentAlarms(props: MonitoringStackProps): void {
    // Always returns 200, whatever happened to the record.
    this.alarm("UploadIndexingFailingAlarm", {
      severity: "medium",
      name: "uploaded documents not indexed",
      description: "A user's uploaded document wasn't prepared for indexing, so chat won't be able to use it.",
      metric: this.markerMetric("CreateMetadataFailed", props.createMetadataFunction, LOG_MARKERS.createMetadataFailed, cdk.Duration.minutes(15)),
      threshold: 1,
    });

    // Async invokes retry twice, so one failed sync is three Errors.
    this.alarm("KbSyncFailingAlarm", {
      severity: "medium",
      name: "document index sync failing",
      description: "New uploads and NOFO changes aren't reaching the knowledge base, so chat and drafts work from stale content.",
      metric: props.syncKBFunction.metricErrors({ period: cdk.Duration.minutes(15), statistic: "Sum" }),
      threshold: 3,
    });

    // Failures are reported per record, so Errors stays flat; after 3 retries the batch goes to the failure queue.
    this.alarm("DraftHistoryFailingAlarm", {
      severity: "medium",
      name: "draft history not being saved",
      description: "Draft versions aren't being recorded, so users lose the history they would restore from.",
      metric: this.markerMetric("DraftVersionWriteFailed", props.draftVersionWriterFunction, LOG_MARKERS.draftVersionWriteFailed, cdk.Duration.minutes(15)),
      threshold: 1,
    });

    // Stays in alarm until someone drains the queue.
    this.alarm("DraftHistoryLostAlarm", {
      severity: "medium",
      name: "draft history records lost",
      description: "Draft changes failed every retry and were skipped, so those versions are missing. The failure queue says which; the stream keeps them for 24 h.",
      metric: props.draftVersionWriterFailures.metricApproximateNumberOfMessagesVisible({ period: cdk.Duration.minutes(5), statistic: "Maximum" }),
      threshold: 1,
    });
  }

  /**
   * Failures in the first four steps are caught into Quarantine (admin review) and the execution
   * SUCCEEDS; only Publish and Quarantine can fail it. So ExecutionsFailed means a NOFO that is
   * neither published nor waiting for review, and per-step Errors say which stage is breaking.
   */
  private addNofoPipelineAlarms(props: MonitoringStackProps): void {
    const pipeline = props.nofoPipeline;

    this.alarm("NofoProcessingFailedAlarm", {
      severity: "medium",
      name: "NOFO processing failed outright",
      description: "A NOFO is stuck: it was neither published nor put in the admin review queue.",
      metric: pipeline.stateMachine.metricFailed({ period: cdk.Duration.minutes(15), statistic: "Sum" }),
      threshold: 1,
    });

    this.alarm("NofoProcessingTimedOutAlarm", {
      severity: "medium",
      name: "NOFO processing timed out",
      description: "A NOFO ran past the 30-minute limit and is stuck: not published and not in the admin review queue.",
      metric: pipeline.stateMachine.metricTimedOut({ period: cdk.Duration.minutes(15), statistic: "Sum" }),
      threshold: 1,
    });

    // One failing NOFO is 1 + retries Errors; the threshold is one above that, so it means more than one NOFO.
    const steps: [string, string, lambda.IFunction, number][] = [
      ["ExtractText", "text extraction", pipeline.extractText, 4],
      ["ExtractAndAnalyze", "analysis", pipeline.extractAndAnalyze, 2],
      ["Synthesize", "synthesis", pipeline.synthesize, 2],
      ["ContentCheck", "content check", pipeline.contentCheck, 2],
    ];
    for (const [id, label, fn, threshold] of steps) {
      this.alarm(`NofoStep${id}FailingAlarm`, {
        severity: "medium",
        name: `NOFO step failing: ${label}`,
        description: `More than one NOFO is failing at the ${label} step. Each goes to admin review, but new NOFOs aren't being published.`,
        metric: fn.metricErrors({ period: cdk.Duration.minutes(15), statistic: "Sum" }),
        threshold,
      });
    }

    // 5 = one record retried to the queue's receive limit.
    this.alarm("NofoDispatchFailingAlarm", {
      severity: "medium",
      name: "NOFO uploads not starting",
      description: "Uploaded NOFOs aren't entering the processing pipeline.",
      metric: this.markerMetric("PipelineDispatchFailed", pipeline.dispatcher, LOG_MARKERS.pipelineDispatchFailed, cdk.Duration.minutes(15)),
      threshold: 5,
    });
  }

  private addDraftAlarms(props: MonitoringStackProps): void {
    const draft = props.draftGeneration;
    this.alarm("DraftGenerationFailingAlarm", {
      severity: "medium",
      name: "draft generation failing",
      description: "A user asked for a generated draft and got an error.",
      metric: new cloudwatch.MathExpression({
        expression: "failed + timedOut",
        usingMetrics: {
          failed: draft.stateMachine.metricFailed({ statistic: "Sum" }),
          timedOut: draft.stateMachine.metricTimedOut({ statistic: "Sum" }),
        },
        label: "executions failed or timed out",
        period: cdk.Duration.minutes(15),
      }),
      threshold: 1,
    });

    // A section retries twice before its fallback, so one failed section is three Errors.
    this.alarm("DraftSectionsFailingAlarm", {
      severity: "medium",
      name: "draft sections failing",
      description: "Generated drafts are coming back with empty sections. Usually Bedrock.",
      metric: draft.generateSection.metricErrors({ period: cdk.Duration.minutes(15), statistic: "Sum" }),
      threshold: 4,
    });

    // The async export worker raises; the synchronous DOCX path returns 500, which the API alarm sees.
    this.alarm("PdfExportFailingAlarm", {
      severity: "medium",
      name: "PDF exports failing",
      description: "Users' PDF exports are failing.",
      metric: props.applicationPdfGeneratorFunction.metricErrors({ period: cdk.Duration.minutes(15), statistic: "Sum" }),
      threshold: 2,
    });
  }

  private addScheduledJobAlarms(props: MonitoringStackProps, config: InstanceConfig): void {
    if (config.scraper.dailySchedule) {
      this.alarm("ScraperStoppedAlarm", {
        severity: "medium",
        name: "daily grants.gov scrape has stopped",
        description: "The daily scrape hasn't run for 24 hours, so new federal NOFOs stop appearing.",
        metric: props.scraperCoordinatorFunction.metricInvocations({ period: cdk.Duration.hours(1), statistic: "Sum" }),
        ...this.dailyHeartbeat(),
      });
    }

    // The coordinator returns 200 with a skipped-page count; a grants.gov outage runs it to its timeout.
    this.alarm("ScraperFailedAlarm", {
      severity: "medium",
      name: "grants.gov scrape failed",
      description: "The grants.gov scrape failed, so today's new NOFOs are missing.",
      metric: new cloudwatch.MathExpression({
        expression: "errors + fatal",
        usingMetrics: {
          errors: props.scraperCoordinatorFunction.metricErrors({ statistic: "Sum" }),
          fatal: this.markerMetric("ScraperFatal", props.scraperCoordinatorFunction, LOG_MARKERS.scraperFatal, cdk.Duration.hours(1)),
        },
        label: "failed runs",
        period: cdk.Duration.hours(1),
      }),
      threshold: 1,
    });

    this.alarm("FailedNofoSweepStoppedAlarm", {
      severity: "medium",
      name: "failed-NOFO sweep has stopped",
      description: "The 15-minute sweep has stopped, so failed NOFOs no longer reach the admin review queue.",
      metric: props.nofoPipeline.dlqProcessor.metricInvocations({ period: cdk.Duration.minutes(30), statistic: "Sum" }),
      threshold: 1,
      comparisonOperator: cloudwatch.ComparisonOperator.LESS_THAN_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.BREACHING,
    });

    this.alarm("FailedNofoSweepFailingAlarm", {
      severity: "medium",
      name: "failed-NOFO sweep failing",
      description: "The sweep that moves failed NOFOs into admin review is erroring, so they aren't reaching the queue.",
      metric: props.nofoPipeline.dlqProcessor.metricErrors({ period: cdk.Duration.minutes(30), statistic: "Sum" }),
      threshold: 2,
    });

    // Scheduled at 14:00 America/New_York, so the November clock change leaves one 25-hour gap.
    this.alarm("DigestStoppedAlarm", {
      severity: "medium",
      name: "notification digest has stopped",
      description: "The NOFO digest hasn't run for 24 hours, so users stop getting their daily and weekly emails.",
      metric: props.notificationDigestFunction.metricInvocations({ period: cdk.Duration.hours(1), statistic: "Sum" }),
      ...this.dailyHeartbeat(),
    });

    // A crash before the user loop raises; per-user send failures are logged and the run carries on.
    this.alarm("DigestFailingAlarm", {
      severity: "medium",
      name: "notification digest failing",
      description: "Some or all users didn't get their NOFO digest email.",
      metric: new cloudwatch.MathExpression({
        expression: "IF(errors >= 1 OR sends >= 3, 1, 0)",
        usingMetrics: {
          errors: props.notificationDigestFunction.metricErrors({ statistic: "Sum" }),
          sends: this.markerMetric("DigestSendFailed", props.notificationDigestFunction, LOG_MARKERS.digestSendFailed, cdk.Duration.hours(1)),
        },
        label: "digest run failed or 3+ sends failed",
        period: cdk.Duration.hours(1),
      }),
      threshold: 1,
    });

    this.alarm("AutoArchiveFailingAlarm", {
      severity: "low",
      name: "expired-NOFO archiving failing",
      description: "Expired NOFOs aren't being archived, so they stay listed as open.",
      metric: props.autoArchiveFunction.metricErrors({ period: cdk.Duration.hours(1), statistic: "Sum" }),
      threshold: 1,
    });
  }

  /** Every empty hour breaches, so this fires 24 hours after the last run rather than at a fixed day boundary. */
  private dailyHeartbeat() {
    return {
      threshold: 1,
      comparisonOperator: cloudwatch.ComparisonOperator.LESS_THAN_THRESHOLD,
      evaluationPeriods: 24,
      datapointsToAlarm: 24,
      treatMissingData: cloudwatch.TreatMissingData.BREACHING,
    };
  }

  private addDailyBrief(components: BriefComponent[]): void {
    // SSM, not an env var: Lambda caps all environment variables at 4 KB combined.
    const manifest = new ssm.StringParameter(this, "DailyBriefComponents", {
      parameterName: `/${this.prefix}/daily-brief/components`,
      stringValue: cdk.Stack.of(this).toJsonString(
        components.map(({ label, fn, purpose }) => ({ label, functionName: fn.functionName, purpose })),
      ),
      tier: ssm.ParameterTier.ADVANCED,
      description: "What the daily brief reports on, and what each component is for",
    });

    const brief = new lambda.Function(this, "DailyBriefFunction", {
      runtime: lambda.Runtime.PYTHON_3_12,
      handler: "handler.lambda_handler",
      code: lambda.Code.fromAsset(path.join(__dirname, "functions/daily-brief"), {
        exclude: ["__pycache__"],
      }),
      timeout: cdk.Duration.minutes(2),
      environment: {
        ALERT_TOPIC_ARN: this.alertTopic.topicArn,
        STAGE: this.stage,
        BRIEF_COMPONENTS_PARAM: manifest.parameterName,
        ALARM_PREFIX: `${this.prefix} `,
      },
      description: "Publishes the daily GrantWell health brief to Slack",
      logGroup: new logs.LogGroup(this, "DailyBriefLogGroup", {
        retention: logs.RetentionDays.ONE_MONTH,
      }),
    });
    // Read-only on metrics and alarm state: it must never change what it reports on.
    brief.addToRolePolicy(new iam.PolicyStatement({
      actions: ["cloudwatch:GetMetricData", "cloudwatch:DescribeAlarms"],
      resources: ["*"],
    }));
    this.alertTopic.grantPublish(brief);
    manifest.grantRead(brief);

    new events.Rule(this, "DailyBriefSchedule", {
      schedule: events.Schedule.cron({ minute: "0", hour: "13" }),
      description: "Triggers the daily GrantWell health brief",
      targets: [new targets.LambdaFunction(brief)],
    });

    this.alarm("DailyBriefMissingAlarm", {
      severity: "low",
      name: "the daily health brief has stopped running",
      description: 'The once-a-day summary didn\'t go out, so "no news" no longer means anything. Nothing is broken for users.',
      metric: brief.metricInvocations({ period: cdk.Duration.hours(1), statistic: "Sum" }),
      ...this.dailyHeartbeat(),
    });

    // A failing run still counts as an invocation, so the heartbeat above can't see this.
    this.alarm("DailyBriefFailingAlarm", {
      severity: "medium",
      name: "the daily health brief is failing",
      description: 'The once-a-day summary ran but couldn\'t be sent, so "no news" no longer means anything. Nothing is broken for users.',
      metric: brief.metricErrors({ period: cdk.Duration.hours(1), statistic: "Sum" }),
      threshold: 1,
    });
  }

  /**
   * Counts log lines matching any of `phrases` in `fn`'s default log group.
   *
   * That group only exists once the function has run, and a metric filter on a missing group fails
   * the deploy, so a custom resource creates it first (ignoring "already exists").
   */
  private markerMetric(
    metricName: string,
    fn: lambda.IFunction,
    phrases: readonly string[],
    period: cdk.Duration,
  ): cloudwatch.Metric {
    const { logGroup, ensure } = this.ensureLogGroup(metricName, fn);
    const filter = new logs.MetricFilter(this, `${metricName}Filter`, {
      logGroup,
      filterPattern: logs.FilterPattern.anyTerm(...phrases),
      metricNamespace: this.prefix,
      metricName,
      metricValue: "1",
      defaultValue: 0,
    });
    filter.node.addDependency(ensure);

    return new cloudwatch.Metric({
      namespace: this.prefix,
      metricName,
      statistic: "Sum",
      period,
    });
  }

  private ensureLogGroup(id: string, fn: lambda.IFunction) {
    const existing = this.ensuredLogGroups.get(fn);
    if (existing) return existing;
    const logGroupName = `/aws/lambda/${fn.functionName}`;
    const createLogGroup: cr.AwsSdkCall = {
      service: "CloudWatchLogs",
      action: "createLogGroup",
      parameters: { logGroupName },
      physicalResourceId: cr.PhysicalResourceId.of(logGroupName),
      ignoreErrorCodesMatching: "ResourceAlreadyExistsException",
    };
    const ensure = new cr.AwsCustomResource(this, `${id}LogGroupExists`, {
      onCreate: createLogGroup,
      onUpdate: createLogGroup,
      policy: this.logGroupPolicy,
      installLatestAwsSdk: false,
    });
    const entry = { logGroup: logs.LogGroup.fromLogGroupName(this, `${id}LogGroup`, logGroupName), ensure };
    this.ensuredLogGroups.set(fn, entry);
    return entry;
  }

  /** One alarm, named for a human reading Slack, with ALARM and OK wired to the topics. */
  private alarm(
    id: string,
    opts: {
      name: string;
      description: string;
      severity: Severity;
      metric: cloudwatch.IMetric;
      threshold: number;
      evaluationPeriods?: number;
      datapointsToAlarm?: number;
      comparisonOperator?: cloudwatch.ComparisonOperator;
      /** NOT_BREACHING by default: no data from an error count means no errors. Heartbeats pass BREACHING. */
      treatMissingData?: cloudwatch.TreatMissingData;
      /** Only the formatter's own alarms override this, to bypass the thing they report on. */
      topic?: sns.ITopic;
    },
  ): cloudwatch.Alarm {
    const alarm = new cloudwatch.Alarm(this, id, {
      alarmName: `${this.prefix} ${opts.name}`,
      alarmDescription: `[${opts.severity}] ${opts.description}`,
      metric: opts.metric,
      threshold: opts.threshold,
      evaluationPeriods: opts.evaluationPeriods ?? 1,
      datapointsToAlarm: opts.datapointsToAlarm,
      comparisonOperator: opts.comparisonOperator ?? cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
      treatMissingData: opts.treatMissingData ?? cloudwatch.TreatMissingData.NOT_BREACHING,
    });
    alarm.addAlarmAction(new actions.SnsAction(opts.topic ?? this.alarmTopic));
    // Recovery always goes through the formatter: when it clears, the formatter works, and it drops
    // the first INSUFFICIENT_DATA -> OK of a new alarm instead of posting a meaningless green card.
    alarm.addOkAction(new actions.SnsAction(this.alarmTopic));
    this.alarms.push(alarm);
    return alarm;
  }
}
