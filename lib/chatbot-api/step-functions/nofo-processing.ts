import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import * as sfn from "aws-cdk-lib/aws-stepfunctions";
import * as tasks from "aws-cdk-lib/aws-stepfunctions-tasks";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as logs from "aws-cdk-lib/aws-logs";

export interface NofoProcessingStateMachineProps {
  extractTextFunction: lambda.Function;
  detectSectionsFunction: lambda.Function;
  analyzeSectionFunction: lambda.Function;
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

    // Quarantine (needs review) - defined early so duplicate/quality paths can reference it
    const quarantine = new tasks.LambdaInvoke(this, "Quarantine", {
      lambdaFunction: props.quarantineFunction,
      outputPath: "$.Payload",
      retryOnServiceExceptions: true,
    });

    // Route duplicates to quarantine (skip LLM stages)
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

    // Route quality-failed documents to quarantine (skip LLM stages)
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

    // Step 2: Detect document sections
    const detectSections = new tasks.LambdaInvoke(this, "DetectSections", {
      lambdaFunction: props.detectSectionsFunction,
      outputPath: "$.Payload",
      retryOnServiceExceptions: true,
    });
    detectSections.addRetry({
      errors: ["States.TaskFailed"],
      interval: cdk.Duration.seconds(5),
      maxAttempts: 2,
      backoffRate: 2,
    });

    // Step 3: Analyze sections in parallel (Map state)
    const analyzeSectionTask = new tasks.LambdaInvoke(
      this,
      "AnalyzeSingleSection",
      {
        lambdaFunction: props.analyzeSectionFunction,
        outputPath: "$.Payload",
        retryOnServiceExceptions: true,
      }
    );
    analyzeSectionTask.addRetry({
      errors: ["ThrottlingException", "TooManyRequestsException"],
      interval: cdk.Duration.seconds(15),
      maxAttempts: 4,
      backoffRate: 2,
    });

    const analyzeSections = new sfn.Map(this, "AnalyzeSections", {
      maxConcurrency: 5,
      itemsPath: "$.sections",
      resultPath: "$.sectionResults",
      parameters: {
        "title.$": "$$.Map.Item.Value.title",
        "category.$": "$$.Map.Item.Value.category",
        "text.$": "$$.Map.Item.Value.text",
        "nofoName.$": "$.nofoName",
        "s3Bucket.$": "$$.Map.Item.Value.s3Bucket",
        "validationFeedback.$": "$.validationFeedback",
      },
    });
    analyzeSections.itemProcessor(analyzeSectionTask);

    // Step 4: Synthesize (merge, generate questions, extract deadline)
    const synthesize = new tasks.LambdaInvoke(this, "Synthesize", {
      lambdaFunction: props.synthesizeFunction,
      outputPath: "$.Payload",
      retryOnServiceExceptions: true,
    });
    synthesize.addRetry({
      errors: ["ThrottlingException", "TooManyRequestsException"],
      interval: cdk.Duration.seconds(10),
      maxAttempts: 3,
      backoffRate: 2,
    });

    // Step 5: Validate
    const validate = new tasks.LambdaInvoke(this, "Validate", {
      lambdaFunction: props.validateFunction,
      outputPath: "$.Payload",
      retryOnServiceExceptions: true,
    });
    validate.addRetry({
      errors: ["ThrottlingException", "TooManyRequestsException"],
      interval: cdk.Duration.seconds(10),
      maxAttempts: 3,
      backoffRate: 2,
    });

    // Step 6a: Publish (auto-approved)
    const publish = new tasks.LambdaInvoke(this, "Publish", {
      lambdaFunction: props.publishFunction,
      outputPath: "$.Payload",
      retryOnServiceExceptions: true,
    });

    // Increment retry counter for the feedback loop
    const incrementRetry = new sfn.Pass(this, "IncrementRetry", {
      parameters: {
        "s3Bucket.$": "$.s3Bucket",
        "documentKey.$": "$.documentKey",
        "nofoName.$": "$.nofoName",
        "rawTextKey.$": "$.rawTextKey",
        "documentLength.$": "$.documentLength",
        "sections.$": "$.sections",
        "retryCount.$":
          "States.MathAdd($.retryCount, 1)",
        "validationFeedback.$":
          "States.JsonToString($.validationResult.issues)",
      },
    });

    // Decision: route based on validation result
    const evaluateValidation = new sfn.Choice(this, "EvaluateValidation")
      .when(
        sfn.Condition.and(
          sfn.Condition.stringEquals(
            "$.validationResult.overallVerdict",
            "PASS"
          )
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
        incrementRetry.next(analyzeSections)
      )
      .otherwise(quarantine);

    // Error handler: quarantine on unrecoverable errors
    const handleError = new sfn.Pass(this, "HandleError", {
      parameters: {
        "nofoName.$": "$.nofoName",
        "s3Bucket.$": "$.s3Bucket",
        "rawTextKey.$": "$.rawTextKey",
        "documentKey.$": "$.documentKey",
        "errorMessage.$": "$.error.Cause",
        "source": "pipeline",
        "retryCount": 0,
        "qualityScore": 0,
      },
    });
    handleError.next(quarantine);

    // Choice after ExtractText: route duplicates or quality-failed to quarantine
    const afterExtractText = new sfn.Choice(this, "AfterExtractText")
      .when(sfn.Condition.isPresent("$.duplicateOf"), quarantineDuplicate)
      .when(sfn.Condition.isPresent("$.sourceQualityFailed"), quarantineQualityFailed)
      .otherwise(detectSections);

    extractText.next(afterExtractText);

    // Build detectSections -> analyzeSections -> synthesize -> validate -> evaluateValidation
    detectSections.next(analyzeSections).next(synthesize).next(validate).next(evaluateValidation);

    // Start with extractText (flows to Choice, then detectSections or quarantine)
    const definition = extractText;

    // Add catch to each critical step
    extractText.addCatch(handleError, { resultPath: "$.error" });
    detectSections.addCatch(handleError, { resultPath: "$.error" });
    synthesize.addCatch(handleError, { resultPath: "$.error" });
    validate.addCatch(handleError, { resultPath: "$.error" });

    // Log group for Express workflow
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
