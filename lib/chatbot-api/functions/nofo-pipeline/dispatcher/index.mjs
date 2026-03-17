import { SFNClient, StartExecutionCommand } from "@aws-sdk/client-sfn";

const sfnClient = new SFNClient();

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

        const executionInput = {
          s3Bucket,
          documentKey,
          nofoName,
          retryCount: 0,
          validationFeedback: null,
        };

        const executionName = `${nofoName.replace(/[^a-zA-Z0-9_-]/g, "_")}-${Date.now()}`.substring(0, 80);

        await sfnClient.send(
          new StartExecutionCommand({
            stateMachineArn,
            name: executionName,
            input: JSON.stringify(executionInput),
          })
        );

        console.log(`Started Step Functions execution for ${nofoName}`);
      }
    } catch (error) {
      console.error("Error dispatching SQS record:", error);
      batchItemFailures.push({ itemIdentifier: sqsRecord.messageId });
    }
  }

  return { batchItemFailures };
};
