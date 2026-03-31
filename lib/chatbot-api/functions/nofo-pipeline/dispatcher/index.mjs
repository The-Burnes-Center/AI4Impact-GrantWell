import { SFNClient, StartExecutionCommand, DescribeExecutionCommand, StopExecutionCommand, ListExecutionsCommand } from "@aws-sdk/client-sfn";
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

        const sanitizedNofo = nofoName.replace(/[^a-zA-Z0-9_-]/g, "_");
        const executionName = `${sanitizedNofo}-${Date.now()}`.substring(0, 80);

        // Stop any running executions for this NOFO before starting a new one
        const running = await sfnClient.send(
          new ListExecutionsCommand({
            stateMachineArn,
            statusFilter: "RUNNING",
            maxResults: 100,
          })
        );
        for (const exec of running.executions || []) {
          if (exec.name.startsWith(sanitizedNofo.substring(0, 40))) {
            await sfnClient.send(
              new StopExecutionCommand({
                executionArn: exec.executionArn,
                cause: "Reprocessing requested",
              })
            );
            console.log(`Stopped old execution: ${exec.executionArn}`);
          }
        }

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
