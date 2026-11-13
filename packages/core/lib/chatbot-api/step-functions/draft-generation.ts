import * as cdk from "aws-cdk-lib";
import { NagSuppressions } from "cdk-nag";
import { Construct } from "constructs";
import * as sfn from "aws-cdk-lib/aws-stepfunctions";
import * as tasks from "aws-cdk-lib/aws-stepfunctions-tasks";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as logs from "aws-cdk-lib/aws-logs";
import { ITable } from "aws-cdk-lib/aws-dynamodb";

export interface DraftGenerationStateMachineProps {
  prepareFunction: lambda.Function;
  generateSectionFunction: lambda.Function;
  assembleFunction: lambda.Function;
  draftGenerationJobsTable: ITable;
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
    // Fetches the NOFO summary and splits it into N section items
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

    // ── Step 2: Plan — which sections have material to draft ────────
    // Runs in the section function, which reads the applicant's documents. If it fails, prepare's
    // split stands and every section is drafted.
    const planSections = new tasks.LambdaInvoke(this, "PlanSections", {
      lambdaFunction: props.generateSectionFunction,
      payload: sfn.TaskInput.fromObject({ step: "plan", "state.$": "$" }),
      outputPath: "$.Payload",
      retryOnServiceExceptions: true,
    });
    planSections.addRetry({
      errors: ["States.TaskFailed"],
      interval: cdk.Duration.seconds(10),
      maxAttempts: 1,
      backoffRate: 2,
    });
    const planFailed = new sfn.Pass(this, "PlanFailed");
    planSections.addCatch(planFailed, { resultPath: "$.planError" });

    // ── Step 3: Map — fan out N parallel section generators ─────────
    // Per-section error handler: catch failures gracefully so the Map
    // never aborts — failed sections return a stub with status "error"
    const sectionTask = (suffix: string) => {
      const sectionErrorFallback = new sfn.Pass(this, `SectionErrorFallback${suffix}`, {
        parameters: {
          "sectionId.$": "$.sectionItem.id",
          "sectionName.$": "$.sectionItem.item",
          "status": "error",
        },
      });

      const generateSection = new tasks.LambdaInvoke(
        this,
        `GenerateSection${suffix}`,
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

      generateSection.addCatch(sectionErrorFallback, {
        resultPath: "$.error",
      });
      return generateSection;
    };

    const itemSelector = {
      "sectionItem.$": "$$.Map.Item.Value",
      "jobId.$": "$.jobId",
      "query.$": "$.query",
      "documentIdentifier.$": "$.documentIdentifier",
      "projectBasics.$": "$.projectBasics",
      "questionnaire.$": "$.questionnaire",
      "questionnaireAnswers.$": "$.questionnaireAnswers",
      "additionalInfo.$": "$.additionalInfo",
      "sessionId.$": "$.sessionId",
      "userId.$": "$.userId",
      "documentOwner.$": "$.documentOwner",
      "documentKeys.$": "$.documentKeys",
      "userState.$": "$.userState",
      "totalSections.$": "$.totalSections",
      "sectionNames.$": "$.sectionNames",
      "outline.$": "$.outline",
    };

    // A cache entry is readable only once its first response starts, so sections started together
    // would each write the shared grant prefix. One section writes it; the rest then read it.
    const warmSection = new sfn.Map(this, "GenerateFirstSection", {
      maxConcurrency: 1,
      itemsPath: "$.warmSections",
      resultPath: "$.warmResults",
      itemSelector,
    });
    warmSection.itemProcessor(sectionTask("First"));

    const generateAllSections = new sfn.Map(this, "GenerateAllSections", {
      maxConcurrency: 5,
      itemsPath: "$.remainingSections",
      resultPath: "$.sectionResults",
      itemSelector,
    });
    generateAllSections.itemProcessor(sectionTask(""));

    // Summaries are written from the drafted sections, so they go last.
    const generateSummarySections = new sfn.Map(this, "GenerateSummarySections", {
      maxConcurrency: 5,
      itemsPath: "$.summarySections",
      resultPath: "$.summaryResults",
      itemSelector,
    });
    generateSummarySections.itemProcessor(sectionTask("Summary"));

    // ── Step 4: Assemble ────────────────────────────────────────────
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
    // If Prepare or Assemble fails catastrophically, mark the job as error.
    // This has to be a real write: a Pass state here left the row on
    // "in_progress" forever, so the editor polled a job that would never finish
    // and the user watched a spinner with no way to tell it had died.
    const markJobFailed = new tasks.DynamoUpdateItem(this, "MarkJobFailed", {
      table: props.draftGenerationJobsTable,
      key: {
        jobId: tasks.DynamoAttributeValue.fromString(
          sfn.JsonPath.stringAt("$.jobId")
        ),
      },
      updateExpression:
        "SET #status = :status, #error = :error, #completedAt = :completedAt",
      expressionAttributeNames: {
        "#status": "status",
        "#error": "error",
        "#completedAt": "completedAt",
      },
      expressionAttributeValues: {
        ":status": tasks.DynamoAttributeValue.fromString("error"),
        ":error": tasks.DynamoAttributeValue.fromString(
          sfn.JsonPath.stringAt("$.error.Cause")
        ),
        ":completedAt": tasks.DynamoAttributeValue.fromString(
          sfn.JsonPath.stringAt("$$.State.EnteredTime")
        ),
      },
      resultPath: sfn.JsonPath.DISCARD,
    });

    // Surface the failure to Step Functions too — reporting SUCCEEDED for a dead
    // pipeline meant no alarm could ever fire on it.
    const pipelineFailed = new sfn.Fail(this, "PipelineFailed", {
      error: "DraftGenerationFailed",
      cause: "Draft generation pipeline failed; job marked as error.",
    });

    const handlePipelineError = markJobFailed.next(pipelineFailed);

    // ── Chain ───────────────────────────────────────────────────────
    planFailed.next(warmSection);
    const definition = prepareSections
      .next(planSections)
      .next(warmSection)
      .next(generateAllSections)
      .next(generateSummarySections)
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
      timeout: cdk.Duration.minutes(45),
      logs: {
        destination: logGroup,
        level: sfn.LogLevel.ERROR,
        includeExecutionData: true,
      },
      tracingEnabled: true,
    });
    NagSuppressions.addResourceSuppressions(this.stateMachine, [
      { id: "AwsSolutions-SF1", reason: "Errors are logged with their execution data; logging every step would copy grant and draft text (user content) into logs." },
    ]);
  }
}
