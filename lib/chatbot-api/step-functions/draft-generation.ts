import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import * as sfn from "aws-cdk-lib/aws-stepfunctions";
import * as tasks from "aws-cdk-lib/aws-stepfunctions-tasks";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as logs from "aws-cdk-lib/aws-logs";

export interface DraftGenerationStateMachineProps {
  prepareFunction: lambda.Function;
  generateSectionFunction: lambda.Function;
  assembleFunction: lambda.Function;
}

export class DraftGenerationStateMachine extends Construct {
  public readonly stateMachine: sfn.StateMachine;

  constructor(
    scope: Construct,
    id: string,
    props: DraftGenerationStateMachineProps
  ) {
    super(scope, id);

    // ── Step 1: Prepare ─────────────────────────────────────────────
    // Fetches NOFO summary + KB docs, splits into N section items
    const prepareSections = new tasks.LambdaInvoke(this, "PrepareSections", {
      lambdaFunction: props.prepareFunction,
      outputPath: "$.Payload",
      retryOnServiceExceptions: true,
    });
    prepareSections.addRetry({
      errors: ["States.TaskFailed"],
      interval: cdk.Duration.seconds(10),
      maxAttempts: 2,
      backoffRate: 2,
    });

    // ── Step 2: Map — fan out N parallel section generators ─────────
    // Per-section error handler: catch failures gracefully so the Map
    // never aborts — failed sections return a stub with status "error"
    const sectionErrorFallback = new sfn.Pass(this, "SectionErrorFallback", {
      parameters: {
        "sectionName.$": "$.sectionItem.item",
        "content": "",
        "status": "error",
      },
    });

    const generateSection = new tasks.LambdaInvoke(
      this,
      "GenerateSection",
      {
        lambdaFunction: props.generateSectionFunction,
        outputPath: "$.Payload",
        retryOnServiceExceptions: true,
      }
    );

    // Retry on Bedrock throttling
    generateSection.addRetry({
      errors: [
        "ThrottlingException",
        "TooManyRequestsException",
        "ServiceUnavailableException",
        "ModelTimeoutException",
      ],
      interval: cdk.Duration.seconds(15),
      maxAttempts: 2,
      backoffRate: 2,
      jitterStrategy: sfn.JitterType.FULL,
    });

    // Retry on general task failures
    generateSection.addRetry({
      errors: ["States.TaskFailed"],
      interval: cdk.Duration.seconds(10),
      maxAttempts: 2,
      backoffRate: 2,
    });

    // Catch all unhandled errors — route to fallback stub
    generateSection.addCatch(sectionErrorFallback, {
      resultPath: "$",
    });

    const generateAllSections = new sfn.Map(this, "GenerateAllSections", {
      maxConcurrency: 5,
      itemsPath: "$.sections",
      resultPath: "$.sectionResults",
      parameters: {
        "sectionItem.$": "$$.Map.Item.Value",
        "jobId.$": "$.jobId",
        "query.$": "$.query",
        "documentIdentifier.$": "$.documentIdentifier",
        "projectBasics.$": "$.projectBasics",
        "questionnaire.$": "$.questionnaire",
        "sessionId.$": "$.sessionId",
        "userId.$": "$.userId",
        "grantInfos.$": "$.grantInfos",
        "totalSections.$": "$.totalSections",
      },
    });
    generateAllSections.itemProcessor(generateSection);

    // ── Step 3: Assemble ────────────────────────────────────────────
    const assembleDraft = new tasks.LambdaInvoke(this, "AssembleDraft", {
      lambdaFunction: props.assembleFunction,
      outputPath: "$.Payload",
      retryOnServiceExceptions: true,
    });
    assembleDraft.addRetry({
      errors: ["States.TaskFailed"],
      interval: cdk.Duration.seconds(10),
      maxAttempts: 2,
      backoffRate: 2,
    });

    // ── Top-level error handler ─────────────────────────────────────
    // If Prepare or Assemble fails catastrophically, mark the job as error
    const handlePipelineError = new sfn.Pass(this, "HandlePipelineError", {
      parameters: {
        "error": "Draft generation pipeline failed",
        "cause.$": "$.error.Cause",
      },
    });

    // ── Chain ───────────────────────────────────────────────────────
    const definition = prepareSections
      .next(generateAllSections)
      .next(assembleDraft);

    prepareSections.addCatch(handlePipelineError, { resultPath: "$.error" });
    assembleDraft.addCatch(handlePipelineError, { resultPath: "$.error" });

    // ── State Machine ───────────────────────────────────────────────
    const logGroup = new logs.LogGroup(this, "DraftGenerationLogs", {
      retention: logs.RetentionDays.ONE_MONTH,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    this.stateMachine = new sfn.StateMachine(this, "DraftGenerationSFN", {
      definitionBody: sfn.DefinitionBody.fromChainable(definition),
      stateMachineType: sfn.StateMachineType.STANDARD,
      timeout: cdk.Duration.minutes(15),
      logs: {
        destination: logGroup,
        level: sfn.LogLevel.ERROR,
        includeExecutionData: true,
      },
      tracingEnabled: true,
    });
  }
}
