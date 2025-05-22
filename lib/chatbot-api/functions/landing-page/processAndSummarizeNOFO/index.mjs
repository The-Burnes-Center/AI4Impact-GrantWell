import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3";
import {
  TextractClient,
  StartDocumentTextDetectionCommand,
  GetDocumentTextDetectionCommand,
} from "@aws-sdk/client-textract";
import {
  BedrockRuntimeClient,
  InvokeModelCommand,
} from "@aws-sdk/client-bedrock-runtime";
import { Upload } from "@aws-sdk/lib-storage";
import { InvokeCommand, LambdaClient } from "@aws-sdk/client-lambda";

export const handler = async (event) => {
  const s3Client = new S3Client();
  const textractClient = new TextractClient({
    region: "us-east-1",
  });
  const bedrockClient = new BedrockRuntimeClient();

  for (const record of event.Records) {
    try {
      const s3Bucket = record.s3.bucket.name;
      const documentKey = decodeURIComponent(
        record.s3.object.key.replace(/\+/g, " ")
      );
      // Get specific object from S3
      const getObjectCommand = new GetObjectCommand({
        Bucket: s3Bucket,
        Key: documentKey,
      });
      const documentResult = await s3Client.send(getObjectCommand);

      let documentContent;
      if (documentKey.split("/").pop() == "NOFO-File-PDF") {
        // Use AWS Textract for PDF content extraction
        // Start Textract text detection on the PDF
        const startParams = {
          DocumentLocation: {
            S3Object: {
              Bucket: s3Bucket,
              Name: documentKey,
            },
          },
        };
        const startCommand = new StartDocumentTextDetectionCommand(startParams);
        const startResponse = await textractClient.send(startCommand);
        const jobId = startResponse.JobId;

        // Poll for the Textract job to complete
        let textractStatus = "IN_PROGRESS";
        while (textractStatus === "IN_PROGRESS") {
          await new Promise((resolve) => setTimeout(resolve, 5000)); // Wait for 5 seconds

          const getJobStatusCommand = new GetDocumentTextDetectionCommand({
            JobId: jobId,
          });
          const jobStatusResponse = await textractClient.send(
            getJobStatusCommand
          );

          textractStatus = jobStatusResponse.JobStatus;
        }

        if (textractStatus === "SUCCEEDED") {
          // Fetch all pages of results
          let textractResult = [];
          let nextToken = null;

          do {
            const getResultParams = {
              JobId: jobId,
              NextToken: nextToken,
            };
            const getResultCommand = new GetDocumentTextDetectionCommand(
              getResultParams
            );
            const response = await textractClient.send(getResultCommand);

            if (Array.isArray(response.Blocks)) {
              textractResult = textractResult.concat(response.Blocks);
            } else {
              console.warn(
                "No Blocks found in response, moving to next token if available"
              );
            }
            nextToken = response.NextToken;
          } while (nextToken);

          // Extract text from Textract response
          documentContent = textractResult
            .filter((block) => block.BlockType === "LINE")
            .map((line) => line.Text)
            .join("\n");
        } else {
          throw new Error(`Textract job failed with status: ${textractStatus}`);
        }
      } else if (documentKey.split("/").pop() == "NOFO-File-TXT") {
        // Handle text content directly
        documentContent = await streamToString(documentResult.Body);
      } else {
        throw new Error(
          "Unsupported file type. Only PDF and TXT are supported."
        );
      }

      if (!documentContent || documentContent.length === 0) {
        throw new Error("Document content is empty or null.");
      }

      // Chunk the document content if it exceeds the model's input limit
      const MAX_CHUNK_SIZE = 50000; // Adjust based on model's token limit
      const documentChunks = splitTextIntoChunks(
        documentContent,
        MAX_CHUNK_SIZE
      );

      const summaries = [];
      for (const chunk of documentChunks) {
        // Summarize document chunk using Claude via AWS Bedrock
        const bedrockCommand = createBedrockCommand(chunk);
        const response = await bedrockClient.send(bedrockCommand);

        // Decode Uint8Array directly instead of treating it as a stream
        const responseBody = new TextDecoder("utf-8").decode(response.body);
        let completion;
        try {
          completion = JSON.parse(responseBody);
        } catch (parseError) {
          throw new Error("Failed to parse the response from Claude.");
        }
        const completionExtract = completion.content[0].text;
        const requirementsJSON = completionExtract.match(/{[\s\S]*}/);

        if (requirementsJSON) {
          summaries.push(requirementsJSON[0]);
        }
      }
      if (summaries.length === 0) {
        throw new Error("No summaries were generated form the document chunks");
      }

      // Merge summaries if there are multiple chunks
      let mergedSummary;
      if (documentChunks.length > 1) {
        const bedrockCommand = createBedrockCommand(summaries, true);
        const response = await bedrockClient.send(bedrockCommand);

        // Decode Uint8Array directly instead of treating it as a stream
        const responseBody = new TextDecoder("utf-8").decode(response.body);
        let completion;
        try {
          completion = JSON.parse(responseBody);
        } catch (parseError) {
          throw new Error("Failed to parse the response from Claude.");
        }
        const completionExtract = completion.content[0].text;
        const requirementsJSON = completionExtract.match(/{[\s\S]*}/);

        if (requirementsJSON) {
          mergedSummary = JSON.parse(requirementsJSON[0]);
        } else {
          console.error(
            "Failed to extract JSON from the model's response: ",
            completionExtract
          );
        }
      } else {
        mergedSummary = JSON.parse(summaries[0]);
      }

      // Generate questions for each Project Narrative Section using both summary AND original document
      let questionsData = null;
      try {
        questionsData = await generateQuestionsForSections(
          mergedSummary,
          bedrockClient,
          documentContent
        );

        if (questionsData) {
          // Upload questions.json to S3
          const folderPath = documentKey.substring(
            0,
            documentKey.lastIndexOf("/") + 1
          );
          const questionsParams = {
            Bucket: s3Bucket,
            Key: `${folderPath}questions.json`,
            Body: JSON.stringify(questionsData, null, 2),
            ContentType: "application/json",
          };
          const questionsUpload = new Upload({
            client: s3Client,
            params: questionsParams,
          });
          await questionsUpload.done();
          console.log("Successfully uploaded questions.json");
        }
      } catch (error) {
        console.error("Error generating or uploading questions:", error);
        // Continue execution even if questions generation fails
      }

      // Upload summary to new S3 bucket in the same folder as the original document
      const folderPath = documentKey.substring(
        0,
        documentKey.lastIndexOf("/") + 1
      );
      const params = {
        Bucket: s3Bucket,
        Key: `${folderPath}summary.json`,
        Body: JSON.stringify(mergedSummary, null, 2),
        ContentType: "application/json",
      };

      const upload = new Upload({
        client: s3Client,
        params,
      });
      await upload.done();

      const lambdaClient = new LambdaClient();
      const invokeCommand = new InvokeCommand({
        FunctionName: process.env.SYNC_KB_FUNCTION_NAME,
        InvocationType: "Event",
      });
      try {
        await lambdaClient.send(invokeCommand);
      } catch (error) {
        console.error("Failed to invoke syncKBFunction:", error);
      }

      return {
        statusCode: 200,
        headers: {
          "Access-Control-Allow-Origin": "*",
        },
        body: JSON.stringify({
          summary: mergedSummary,
          questions: questionsData,
        }),
      };
    } catch (error) {
      console.error("Error processing document:", error);
      return {
        statusCode: 500,
        headers: {
          "Access-Control-Allow-Origin": "*",
        },
        body: JSON.stringify({
          message: "Failed to process document. Internal Server Error.",
          error: error.message,
        }),
      };
    }
  }
};

// Generate strategic questions covering all Project Narrative Sections using original NOFO document
async function generateQuestionsForSections(
  mergedSummary,
  bedrockClient,
  originalDocumentContent
) {
  if (
    !mergedSummary.ProjectNarrativeSections ||
    mergedSummary.ProjectNarrativeSections.length === 0
  ) {
    console.log("No Project Narrative Sections found to generate questions");
    return null;
  }

  // Include both summary data and original document content
  const summaryData = JSON.stringify(mergedSummary, null, 2);

  // Truncate original document if too long to fit in prompt (keep first 30000 chars as sample)
  const documentSample =
    originalDocumentContent.length > 30000
      ? originalDocumentContent.substring(0, 30000) +
        "\n\n[Document truncated for length...]"
      : originalDocumentContent;

  // Create prompt for Bedrock to generate NOFO-specific strategic questions
  const bedrockCommand = new InvokeModelCommand({
    modelId: "anthropic.claude-3-5-sonnet-20240620-v1:0",
    contentType: "application/json",
    accept: "application/json",
    body: JSON.stringify({
      anthropic_version: "bedrock-2023-05-31",
      messages: [
        {
          role: "user",
          content: `You are tasked with creating 5-15 strategic questions specifically tailored to this NOFO that will enable AI to write a comprehensive grant proposal covering all required Project Narrative Sections.

IMPORTANT GUIDELINES:
1. Generate between 5-15 questions total (aim for around 10-12 questions)
2. Questions must be HIGHLY SPECIFIC to this particular NOFO and its exact requirements
3. Use the exact language, terminology, and phrases from the original NOFO document
4. Reference specific section names, requirements, and evaluation criteria mentioned in the original document
5. Address the specific program goals, target populations, and focus areas outlined in this NOFO
6. Include questions about compliance with specific eligibility requirements mentioned
7. Reference exact deadlines, submission requirements, and deliverables from the original document
8. Use the precise grant program name and funding agency terminology
9. Address specific methodologies, approaches, or frameworks mentioned in the original NOFO

APPROACH:
- Read both the structured summary AND the original NOFO document text
- Extract the most critical information needs based on evaluation criteria in the original document
- Use exact quotes and references from the original NOFO where appropriate
- Ensure questions cover all major Project Narrative Sections comprehensively
- Focus on information that directly addresses what grant reviewers will evaluate
- Include questions that help applicants demonstrate alignment with specific program priorities

The questions should demonstrate deep understanding of this specific funding opportunity and gather information that directly matches what the original NOFO document is requesting from applicants.

Return the questions in JSON format as follows:
{
"totalQuestions": 11,
"questions": [
  {
    "id": 1,
    "question": "How does your project specifically address [exact quote from NOFO about program goals] and demonstrate measurable impact on [specific target population mentioned in NOFO]?"
  },
  {
    "id": 2, 
    "question": "Describe how your organization meets the specific eligibility requirement that [exact eligibility criteria from NOFO], and provide documentation of [specific requirement]."
  }
]
}

STRUCTURED SUMMARY:
${summaryData}

ORIGINAL NOFO DOCUMENT:
${documentSample}`,
        },
      ],
      max_tokens: 4000,
      temperature: 0.1,
    }),
  });

  try {
    const response = await bedrockClient.send(bedrockCommand);
    const responseBody = new TextDecoder("utf-8").decode(response.body);
    const completion = JSON.parse(responseBody);
    const completionText = completion.content[0].text;

    // Extract JSON from response with improved error handling
    const jsonMatch = completionText.match(/\{[\s\S]*\}/);

    if (jsonMatch) {
      try {
        const questionsData = JSON.parse(jsonMatch[0]);

        // Validate the response structure and question count
        if (questionsData.questions && Array.isArray(questionsData.questions)) {
          const questionCount = questionsData.questions.length;

          if (questionCount < 5 || questionCount > 15) {
            console.warn(
              `Generated ${questionCount} questions, expected 5-15. Proceeding anyway.`
            );
          }

          // Ensure totalQuestions field matches actual count
          questionsData.totalQuestions = questionCount;

          console.log(
            `Successfully generated ${questionCount} NOFO-specific questions using original document content`
          );
          return questionsData;
        } else {
          console.error("Invalid questions data structure");
          return null;
        }
      } catch (parseError) {
        console.error("Failed to parse questions JSON:", parseError);
        // Attempt a more forgiving extraction approach
        try {
          const sanitizedJson = jsonMatch[0]
            .replace(/[\u0000-\u001F]+/g, " ")
            .trim();
          const retryData = JSON.parse(sanitizedJson);
          if (retryData.questions) {
            retryData.totalQuestions = retryData.questions.length;
            return retryData;
          }
          return null;
        } catch (secondParseError) {
          console.error("Failed secondary parse attempt:", secondParseError);
          return null;
        }
      }
    } else {
      console.error(
        "Failed to extract questions JSON from the model's response"
      );
      console.error("Model response:", completionText);
      return null;
    }
  } catch (error) {
    console.error("Error calling Bedrock for question generation:", error);
    return null;
  }
}

// Helper function to convert stream to string
async function streamToString(stream) {
  const chunks = [];
  for await (const chunk of stream) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString("utf8");
}

// Helper function to split text into chunks based on token size
function splitTextIntoChunks(text, maxTokens) {
  //const chunkSize = Math.floor(maxTokens * 4); // Estimate token limit in terms of characters (for simplicity)
  const chunks = [];
  let currentIndex = 0;
  while (currentIndex < text.length) {
    chunks.push(text.substring(currentIndex, currentIndex + maxTokens));
    currentIndex += maxTokens;
  }
  return chunks;
}

// Helper function to create Bedrock command
function createBedrockCommand(contents, isMerged = false) {
  const prompt = isMerged
    ? `You are an AI assistant that helps categorize NOFO documents into various categories. Here are multiple summaries. Read all the summaries and extract relevant information without duplicating information. Please extract the grant name and categorize the information into 4 categories: Eligibility Criteria, Required Documents, Project Narrative Sections, and Key Deadlines. For each item in each category, provide a detailed description in 2-3 sentences. **If there are any relevant websites or links provided in the NOFO document associated with an item, include them within the description using markdown format (e.g., [EPA Guidelines](https://www.epa.gov)).** Do not create a separate section for links. **Ensure that each description includes any applicable links related to the item if available.** If any of the items are missing, mention that the section is missing in the summary. Format the output in JSON format. The expected format is as follows:
    {
    "GrantName": "Name of the grant",
    "EligibilityCriteria": [
        { "item": "Eligibility Item 1", "description": "Explanation of what Eligibility Item 1 means, including any relevant [EPA Guidelines](https://www.epa.gov)." },
        { "item": "Eligibility Item 2", "description": "Explanation of what Eligibility Item 2 means, including any relevant [EPA Guidelines](https://www.epa.gov)." }
    ],
    "RequiredDocuments": [
        { "item": "Document Name 1", "description": "Explanation of what Document Name 1 means, including any relevant [EPA Requirements](https://www.epa.gov)." },
        { "item": "Document Name 2", "description": "Explanation of what Document Name 2 means, including any relevant [EPA Requirements](https://www.epa.gov)." }
    ],
    "ProjectNarrativeSections": [
        { "item": "Section Name 1", "description": "Explanation of what Section Name 1 means, including any relevant [EPA Guidelines](https://www.epa.gov)." },
        { "item": "Section Name 2", "description": "Explanation of what Section Name 2 means, including any relevant [EPA Guidelines](https://www.epa.gov)." }
    ],
    "KeyDeadlines": [
        { "item": "Deadline 1", "description": "Explanation of what Deadline 1 means, including any relevant [Submission Guidelines](https://www.epa.gov)." },
        { "item": "Deadline 2", "description": "Explanation of what Deadline 2 means, including any relevant [Submission Guidelines](https://www.epa.gov)." }
    ]
    }

    ${contents}`
    : `You are an AI assistant that helps categorize NOFO documents into various categories. Here is a NOFO document. Please extract the name of the grant and categorize the information into 4 categories: Eligibility Criteria, Required Documents, Project Narrative Sections, and Key Deadlines. For each item in each category, provide a detailed description in 2-3 sentences. **If there are any relevant websites or links provided in the NOFO document associated with an item, include them within the description using markdown format (e.g., [EPA Website](https://www.epa.gov)).** Do not create a separate section for links. **Ensure that each description includes any applicable links related to the item if available.** If any of the items are missing, mention that the section is missing in the summary. Format the output in JSON format. The expected format is as follows:
    {
    "GrantName": "Name of the grant",
    "EligibilityCriteria": [
        { "item": "Eligibility Item 1", "description": "Explanation of what Eligibility Item 1 means, including any relevant [EPA Guidelines](https://www.epa.gov)." },
        { "item": "Eligibility Item 2", "description": "Explanation of what Eligibility Item 2 means, including any relevant [EPA Guidelines](https://www.epa.gov)." }
    ],
    "RequiredDocuments": [
        { "item": "Document Name 1", "description": "Explanation of what Document Name 1 means, including any relevant [EPA Requirements](https://www.epa.gov)." },
        { "item": "Document Name 2", "description": "Explanation of what Document Name 2 means, including any relevant [EPA Requirements](https://www.epa.gov)." }
    ],
    "ProjectNarrativeSections": [
        { "item": "Section Name 1", "description": "Explanation of what Section Name 1 means, including any relevant [EPA Guidelines](https://www.epa.gov)." },
        { "item": "Section Name 2", "description": "Explanation of what Section Name 2 means, including any relevant [EPA Guidelines](https://www.epa.gov)." }
    ],
    "KeyDeadlines": [
        { "item": "Deadline 1", "description": "Explanation of what Deadline 1 means, including any relevant [Submission Guidelines](https://www.epa.gov)." },
        { "item": "Deadline 2", "description": "Explanation of what Deadline 2 means, including any relevant [Submission Guidelines](https://www.epa.gov)." }
    ]
    }

    ${contents}`;
  return new InvokeModelCommand({
    modelId: "anthropic.claude-3-5-sonnet-20240620-v1:0",
    contentType: "application/json",
    accept: "application/json",
    body: JSON.stringify({
      anthropic_version: "bedrock-2023-05-31",
      messages: [
        {
          role: "user",
          content: prompt,
        },
      ],
      max_tokens: 3500,
      temperature: 0,
    }),
  });
}
