import { SFNClient, StartExecutionCommand, DescribeExecutionCommand } from "@aws-sdk/client-sfn";
import { updateProcessingStatus } from "../shared/status.mjs";

const sfnClient = new SFNClient();
const POLL_INTERVAL_MS = 15_000;
const TERMINAL_STATES = new Set(["SUCCEEDED", "FAILED", "TIMED_OUT", "ABORTED"]);

export const handler = async (event) => {
  const stateMachineArn = process.env.STATE_MACHINE_ARN;

  const batchItemFailures = [];

  for (const sqsRecord of event.Records) {
    try {
      const s3Event = JSON.parse(sqsRecord.body);

      for (const record of s3Event.Records || []) {
        const s3Bucket = record.s3.bucket.name;
        const documentKey = decodeURIComponent(
          record.s3.object.key.replace(/\+/g, " ")
        );
        const nofoName = documentKey.substring(0, documentKey.lastIndexOf("/"));

        await updateProcessingStatus(nofoName, "uploading");

        const executionInput = {
          s3Bucket,
          documentKey,
          nofoName,
          retryCount: 0,
          validationFeedback: null,
        };

        // Deterministic name: same SQS message retry produces the same name,
        // so StartExecution is idempotent (returns existing execution).
        const executionName = `${nofoName.replace(/[^a-zA-Z0-9_-]/g, "_")}-${sqsRecord.messageId.replace(/[^a-zA-Z0-9_-]/g, "_")}`.substring(0, 80);

        const startResult = await sfnClient.send(
          new StartExecutionCommand({
            stateMachineArn,
            name: executionName,
            input: JSON.stringify(executionInput),
          })
        );

        console.log(`Started SFN execution for ${nofoName}: ${startResult.executionArn}`);

        // Poll until the execution reaches a terminal state
        const executionArn = startResult.executionArn;
        let status = "RUNNING";

        while (!TERMINAL_STATES.has(status)) {
          await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
          const desc = await sfnClient.send(
            new DescribeExecutionCommand({ executionArn })
          );
          status = desc.status;
        }

        if (status === "SUCCEEDED") {
          console.log(`SFN execution completed for ${nofoName}`);
        } else {
          throw new Error(`SFN execution ${status} for ${nofoName} (${executionArn})`);
        }
      }
    } catch (error) {
      console.error("Error dispatching SQS record:", error);
      batchItemFailures.push({ itemIdentifier: sqsRecord.messageId });
    }
  }

  return { batchItemFailures };
};
