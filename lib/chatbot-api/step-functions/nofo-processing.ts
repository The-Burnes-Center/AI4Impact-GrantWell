import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import * as sfn from "aws-cdk-lib/aws-stepfunctions";
import * as tasks from "aws-cdk-lib/aws-stepfunctions-tasks";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as logs from "aws-cdk-lib/aws-logs";

export interface NofoProcessingStateMachineProps {
  extractTextFunction: lambda.Function;
  extractAndAnalyzeFunction: lambda.Function;
  synthesizeFunction: lambda.Function;
  validateFunction: lambda.Function;
  publishFunction: lambda.Function;
  quarantineFunction: lambda.Function;
}

export class NofoProcessingStateMachine extends Construct {
  public readonly stateMachine: sfn.StateMachine;

  constructor(
    scope: Construct,
    id: string,
    props: NofoProcessingStateMachineProps
  ) {
    super(scope, id);

    // Step 1: Extract text from PDF/TXT
    const extractText = new tasks.LambdaInvoke(this, "ExtractText", {
      lambdaFunction: props.extractTextFunction,
      outputPath: "$.Payload",
      retryOnServiceExceptions: true,
    });
    extractText.addRetry({
      errors: ["ProvisionedThroughputExceededException"],
      interval: cdk.Duration.seconds(30),
      maxAttempts: 4,
      backoffRate: 2,
    });
    extractText.addRetry({
      errors: ["States.TaskFailed"],
      interval: cdk.Duration.seconds(10),
      maxAttempts: 2,
      backoffRate: 2,
    });

    // Quarantine (needs review)
    const quarantine = new tasks.LambdaInvoke(this, "Quarantine", {
      lambdaFunction: props.quarantineFunction,
      outputPath: "$.Payload",
      retryOnServiceExceptions: true,
    });

    const quarantineDuplicate = new sfn.Pass(this, "QuarantineDuplicate", {
      parameters: {
        "nofoName.$": "$.nofoName",
        "s3Bucket.$": "$.s3Bucket",
        "rawTextKey.$": "$.rawTextKey",
        "documentKey.$": "$.documentKey",
        "source": "duplicate",
        "errorMessage.$": "States.Format('Duplicate of {}', $.duplicateOf)",
      },
    });
    quarantineDuplicate.next(quarantine);

    const quarantineQualityFailed = new sfn.Pass(this, "QuarantineQualityFailed", {
      parameters: {
        "nofoName.$": "$.nofoName",
        "s3Bucket.$": "$.s3Bucket",
        "rawTextKey.$": "$.rawTextKey",
        "documentKey.$": "$.documentKey",
        "source": "quality",
        "errorMessage.$": "States.JsonToString($.qualityIssues)",
      },
    });
    quarantineQualityFailed.next(quarantine);

    // Step 2: Single-pass extraction and analysis
    const extractAndAnalyze = new tasks.LambdaInvoke(this, "ExtractAndAnalyze", {
      lambdaFunction: props.extractAndAnalyzeFunction,
      outputPath: "$.Payload",
      retryOnServiceExceptions: true,
    });
    extractAndAnalyze.addRetry({
      errors: ["ThrottlingException", "TooManyRequestsException"],
      interval: cdk.Duration.seconds(30),
      maxAttempts: 6,
      backoffRate: 2,
      jitterStrategy: sfn.JitterType.FULL,
    });

    // Step 3: Synthesize (generate questions, extract deadline)
    const synthesize = new tasks.LambdaInvoke(this, "Synthesize", {
      lambdaFunction: props.synthesizeFunction,
      outputPath: "$.Payload",
      retryOnServiceExceptions: true,
    });
    synthesize.addRetry({
      errors: ["ThrottlingException", "TooManyRequestsException"],
      interval: cdk.Duration.seconds(20),
      maxAttempts: 5,
      backoffRate: 2,
      jitterStrategy: sfn.JitterType.FULL,
    });

    // Step 4: Validate
    const validate = new tasks.LambdaInvoke(this, "Validate", {
      lambdaFunction: props.validateFunction,
      outputPath: "$.Payload",
      retryOnServiceExceptions: true,
    });
    validate.addRetry({
      errors: ["ThrottlingException", "TooManyRequestsException"],
      interval: cdk.Duration.seconds(20),
      maxAttempts: 5,
      backoffRate: 2,
      jitterStrategy: sfn.JitterType.FULL,
    });

    // Step 5: Publish (for auto-approved PASS results)
    const publish = new tasks.LambdaInvoke(this, "Publish", {
      lambdaFunction: props.publishFunction,
      outputPath: "$.Payload",
      retryOnServiceExceptions: true,
    });

    // Retry loop: increment counter and re-run extraction with validation feedback
    const incrementRetry = new sfn.Pass(this, "IncrementRetry", {
      parameters: {
        "s3Bucket.$": "$.s3Bucket",
        "documentKey.$": "$.documentKey",
        "nofoName.$": "$.nofoName",
        "rawTextKey.$": "$.rawTextKey",
        "documentLength.$": "$.documentLength",
        "contentHash.$": "$.contentHash",
        "retryCount.$": "States.MathAdd($.retryCount, 1)",
        "validationFeedback.$": "States.JsonToString($.validationResult.issues)",
      },
    });

    // Route based on validation verdict:
    //   PASS          → auto-publish (no admin review needed)
    //   FAIL + retry  → re-run extraction with feedback
    //   NEEDS_REVIEW  → quarantine for admin approval before publishing
    const evaluateValidation = new sfn.Choice(this, "EvaluateValidation")
      .when(
        sfn.Condition.stringEquals(
          "$.validationResult.overallVerdict",
          "PASS"
        ),
        publish
      )
      .when(
        sfn.Condition.and(
          sfn.Condition.stringEquals(
            "$.validationResult.overallVerdict",
            "FAIL"
          ),
          sfn.Condition.numberLessThan("$.retryCount", 2)
        ),
        incrementRetry.next(extractAndAnalyze)
      )
      .otherwise(quarantine);

    // Error handler for failures AFTER extract-text (rawTextKey is available)
    const handleError = new sfn.Pass(this, "HandleError", {
      parameters: {
        "nofoName.$": "$.nofoName",
        "s3Bucket.$": "$.s3Bucket",
        "documentKey.$": "$.documentKey",
        "rawTextKey.$": "$.rawTextKey",
        "errorMessage.$": "$.error.Cause",
        "source": "pipeline",
        "retryCount": 0,
        "qualityScore": 0,
      },
    });
    handleError.next(quarantine);

    // Error handler for failures DURING extract-text (rawTextKey doesn't exist yet)
    const handleExtractTextError = new sfn.Pass(this, "HandleExtractTextError", {
      parameters: {
        "nofoName.$": "$.nofoName",
        "s3Bucket.$": "$.s3Bucket",
        "documentKey.$": "$.documentKey",
        "rawTextKey": "",
        "errorMessage.$": "$.error.Cause",
        "source": "pipeline",
        "retryCount": 0,
        "qualityScore": 0,
      },
    });
    handleExtractTextError.next(quarantine);

    // After text extraction: route duplicates/quality-failed to quarantine, otherwise extract
    const afterExtractText = new sfn.Choice(this, "AfterExtractText")
      .when(sfn.Condition.isPresent("$.duplicateOf"), quarantineDuplicate)
      .when(sfn.Condition.isPresent("$.sourceQualityFailed"), quarantineQualityFailed)
      .otherwise(extractAndAnalyze);

    extractText.next(afterExtractText);

    // Main chain: extract -> synthesize -> validate -> evaluate
    extractAndAnalyze.next(synthesize).next(validate).next(evaluateValidation);

    const definition = extractText;

    extractText.addCatch(handleExtractTextError, { resultPath: "$.error" });
    extractAndAnalyze.addCatch(handleError, { resultPath: "$.error" });
    synthesize.addCatch(handleError, { resultPath: "$.error" });
    validate.addCatch(handleError, { resultPath: "$.error" });

    const logGroup = new logs.LogGroup(this, "NofoProcessingLogs", {
      retention: logs.RetentionDays.ONE_MONTH,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    this.stateMachine = new sfn.StateMachine(this, "NofoProcessingSFN", {
      definitionBody: sfn.DefinitionBody.fromChainable(definition),
      stateMachineType: sfn.StateMachineType.STANDARD,
      timeout: cdk.Duration.minutes(30),
      logs: {
        destination: logGroup,
        level: sfn.LogLevel.ERROR,
        includeExecutionData: true,
      },
      tracingEnabled: true,
    });
  }
}
