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
import { DynamoDBClient, PutItemCommand } from "@aws-sdk/client-dynamodb";
import { marshall } from "@aws-sdk/util-dynamodb";

export const handler = async (event) => {
  const s3Client = new S3Client();
  const textractClient = new TextractClient({
    region: "us-east-1",
  });
  const bedrockClient = new BedrockRuntimeClient();

  // Handle SQS messages (S3 events are in the message body)
  for (const sqsRecord of event.Records) {
    try {
      // Parse S3 event from SQS message body
      const s3Event = JSON.parse(sqsRecord.body);
      
      // Process each S3 record in the event
      for (const record of s3Event.Records || []) {
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

      // Extract NOFO name from folder path (remove trailing slash)
      const nofoName = folderPath.replace(/\/$/, '');
      
      // Create metadata file for NOFO document to enable metadata filtering
      try {
        // Extract documentIdentifier from folder path (e.g., "grants/2024/transportation-grant-001")
        const documentIdentifier = nofoName;
        
        const metadata = {
          metadataAttributes: {
            documentType: "NOFO",
            documentIdentifier: documentIdentifier,
            bucket: "nofo",
            nofoName: nofoName,
            processedAt: new Date().toISOString()
          }
        };

        // Create metadata file for the NOFO PDF/TXT file
        const nofoFileKey = documentKey; // Original NOFO file
        const metadataKey = `${nofoFileKey}.metadata.json`;
        
        const metadataParams = {
          Bucket: s3Bucket,
          Key: metadataKey,
          Body: JSON.stringify(metadata, null, 2),
          ContentType: "application/json",
        };

        const metadataUpload = new Upload({
          client: s3Client,
          params: metadataParams,
        });
        await metadataUpload.done();
        console.log(`Successfully created NOFO metadata file: ${metadataKey}`);
      } catch (metadataError) {
        console.error("Error creating NOFO metadata file:", metadataError);
        // Non-critical error, continue execution
      }
      
      // Write to DynamoDB if enabled
      const tableName = process.env.NOFO_METADATA_TABLE_NAME;
      const enableDynamoDBCache = process.env.ENABLE_DYNAMODB_CACHE === 'true';
      
      if (enableDynamoDBCache && tableName) {
        try {
          const dynamoClient = new DynamoDBClient();
          const now = new Date().toISOString();
          
          const item = {
            nofo_name: nofoName,
            status: mergedSummary.status || 'active',
            isPinned: String(mergedSummary.isPinned || false),
            created_at: now,
            updated_at: now,
          };

          const putCommand = new PutItemCommand({
            TableName: tableName,
            Item: marshall(item),
          });

          await dynamoClient.send(putCommand);
          console.log(`Successfully wrote NOFO metadata to DynamoDB for ${nofoName}`);
        } catch (error) {
          console.error(`Failed to write to DynamoDB for ${nofoName}:`, error);
          // Continue execution - S3 is the source of truth
        }
      }

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
    } catch (error) {
      console.error("Error parsing SQS message:", error);
      // Continue to next SQS record if this one fails
      continue;
    }
  }
  
  // Return success if all records processed
  return {
    statusCode: 200,
    headers: {
      "Access-Control-Allow-Origin": "*",
    },
    body: JSON.stringify({
      message: "All records processed",
    }),
  };
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
    modelId: "us.anthropic.claude-sonnet-4-20250514-v1:0",
    contentType: "application/json",
    accept: "application/json",
    body: JSON.stringify({
      anthropic_version: "bedrock-2023-05-31",
      messages: [
        {
          role: "user",
          content: `# Strategic NOFO Question Generator

## Task Description
You are a specialized grant writing assistant. Your task is to analyze a Notice of Funding Opportunity (NOFO) document and generate strategic questions that will guide the development of a competitive grant proposal. These questions will be used by another AI system to create a complete grant application.

## Input Materials
You will analyze two key resources:
<summary_data>${summaryData}</summary_data>
<nofo_document>${documentSample}</nofo_document>

## Objective
Generate 5-15 strategic questions (ideally 8-10) that will:
- Address all critical requirements in the Project Narrative sections
- Help applicants demonstrate how they meet each evaluation criterion
- Guide non-technical users with limited grant writing experience
- Focus on sections with higher point values or emphasized importance

## Question Development Requirements
1. **Specificity**: Each question must target a distinct aspect of the NOFO requirements
2. **Clarity**: Use accessible language that non-technical grant writers can understand
3. **Comprehensiveness**: Collectively cover all major Project Narrative components
4. **Actionability**: Prompt responses that provide concrete evidence and specific details
5. **Alignment**: Use terminology consistent with the NOFO document

## Question Formatting Guidelines
- Begin with action-oriented phrases (e.g., "How will you...", "Describe your approach to...", "What evidence demonstrates...")
- Reference specific NOFO requirements where appropriate
- Avoid yes/no questions; focus on eliciting detailed responses
- Keep questions concise but complete (1-3 sentences)
- Use the exact grant program name and issuing agency as specified in the NOFO

## Analysis Process
1. First, carefully review both the structured summary and NOFO document
2. Identify the Project Narrative sections and their relative importance
3. Note any evaluation criteria and their point values
4. Determine which elements require the most detailed responses
5. Craft questions that address each critical component

## Output Format
Your response must be in the following JSON format without any additional text:

{{"totalQuestions": [number of questions],
  "questions": [
    {
      "id": 1,
      "question": "[your first question]"}},
    {{"id": 2,
      "question": "[your second question]"}},
    ...
  ]
}

Before submitting, verify that your questions collectively address all major components of the Project Narrative sections identified in the structured summary.

Provide your JSON response with the strategic questions without any preamble or additional explanation.`,
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
    ? `# NOFO Document Categorization Assistant

## Task Description
You are a specialized AI assistant tasked with analyzing Notice of Funding Opportunity (NOFO) documents. Your goal is to extract and categorize critical information from NOFO summaries into a structured format that will help grant applicants quickly understand requirements and eligibility.

## Input Data
<summaries>
${contents}
</summaries>

## Detailed Instructions
Carefully analyze all provided NOFO summaries and extract the following information:
1. The complete grant name/title
2. Key information organized into four specific categories as detailed below

## Information Categories

### Category 1: Eligibility Criteria
Extract the most important eligibility requirements including:
- Who can apply (e.g., non-profits, educational institutions, government entities, individuals)
- Geographic restrictions (e.g., specific states, regions, or countries)
- Demographic requirements (e.g., serving specific populations)
- Organizational qualifications (e.g., years of experience, certifications)
- Partnership requirements (e.g., consortia, collaborations)

### Category 2: Required Documents
Extract the most critical documents needed for application including:
- Application forms and templates
- Letters (e.g., support, commitment, intent)
- Certifications and assurances
- Submission format specifications (e.g., PDF, Word, online portal)
- Page limits and formatting requirements

### Category 3: Project Narrative Sections
Extract ALL required narrative components mentioned in the NOFO including:
- Problem statement/needs assessment
- Project goals and objectives
- Implementation methodology
- Project timeline/work plan
- Stakeholder engagement strategy
- Sustainability plan
- Evaluation framework
- Organizational capacity statement
- Staff qualifications
- Innovation components
- Risk mitigation strategies

NOTE: EXCLUDE sections requiring applicant-specific financial/budget content (e.g., budget narrative, budget tables, cost breakdowns)

### Category 4: Key Deadlines
Extract the most important dates and deadlines including:
- Letter of intent deadline (if applicable)
- Application submission deadline (date and time, including time zone)
- Expected notification dates
- Award start dates
- Project period/duration

## Extraction Guidelines
For all categories:
- Extract information without duplication
- Include relevant links using markdown format: [Link Text](URL)
- Combine related items when appropriate
- Focus on high-level requirements rather than granular details
- Keep descriptions concise (2-3 sentences per item)
- Maintain the original meaning while summarizing
- Use bullet points for clarity when appropriate

## Output Format
Provide your response in the following JSON format:
{{"GrantName": "Name of the grant",
  "EligibilityCriteria": [
    { "item": "Eligibility Item 1", "description": "Explanation of what Eligibility Item 1 means in 2-3 sentences, including any relevant [EPA Guidelines](https://www.epa.gov)."}}
  ],
  "RequiredDocuments": [
    {{"item": "Document Name 1", "description": "Explanation of what Document Name 1 means in 2-3 sentences, including any relevant [EPA Requirements](https://www.epa.gov)."}}
  ],
  "ProjectNarrativeSections": [
    {{"item": "Section Name 1", "description": "Explanation of what Section Name 1 means in 2-3 sentences, including any relevant [EPA Guidelines](https://www.epa.gov)."}}
  ],
  "KeyDeadlines": [
    {{"item": "Deadline 1", "description": "Explanation of what Deadline 1 means in 2-3 sentences, including any relevant [Submission Guidelines](https://www.epa.gov)."}}
  ]

Return ONLY the JSON output without any additional explanations, comments, or preamble.
  

${contents}`
    : `# NOFO Document Categorization Assistant

## Task Description
You are a specialized AI assistant tasked with analyzing Notice of Funding Opportunity (NOFO) documents. Your goal is to extract and categorize critical information from NOFO summaries into a structured format that will help grant applicants quickly understand requirements and eligibility.

## Input Data
<nofo_document>
${contents}
</nofo_document>

## Detailed Instructions
Carefully analyze all provided NOFO summaries and extract the following information:
1. The complete grant name/title
2. Key information organized into four specific categories as detailed below

## Information Categories

### Category 1: Eligibility Criteria
Extract the most important eligibility requirements including:
- Who can apply (e.g., non-profits, educational institutions, government entities, individuals)
- Geographic restrictions (e.g., specific states, regions, or countries)
- Demographic requirements (e.g., serving specific populations)
- Organizational qualifications (e.g., years of experience, certifications)
- Partnership requirements (e.g., consortia, collaborations)

### Category 2: Required Documents
Extract the most critical documents needed for application including:
- Application forms and templates
- Letters (e.g., support, commitment, intent)
- Certifications and assurances
- Submission format specifications (e.g., PDF, Word, online portal)
- Page limits and formatting requirements

### Category 3: Project Narrative Sections
Extract ALL required narrative components mentioned in the NOFO including:
- Problem statement/needs assessment
- Project goals and objectives
- Implementation methodology
- Project timeline/work plan
- Stakeholder engagement strategy
- Sustainability plan
- Evaluation framework
- Organizational capacity statement
- Staff qualifications
- Innovation components
- Risk mitigation strategies

NOTE: EXCLUDE sections requiring applicant-specific financial/budget content (e.g., budget narrative, budget tables, cost breakdowns)

### Category 4: Key Deadlines
Extract the most important dates and deadlines including:
- Letter of intent deadline (if applicable)
- Application submission deadline (date and time, including time zone)
- Expected notification dates
- Award start dates
- Project period/duration

## Extraction Guidelines
For all categories:
- Extract information without duplication
- Include relevant links using markdown format: [Link Text](URL)
- Combine related items when appropriate
- Focus on high-level requirements rather than granular details
- Keep descriptions concise (2-3 sentences per item)
- Maintain the original meaning while summarizing
- Use bullet points for clarity when appropriate

## Output Format
Provide your response in the following JSON format:
{{"GrantName": "Name of the grant",
  "EligibilityCriteria": [
    { "item": "Eligibility Item 1", "description": "Explanation of what Eligibility Item 1 means in 2-3 sentences, including any relevant [EPA Guidelines](https://www.epa.gov)."}}
  ],
  "RequiredDocuments": [
    {{"item": "Document Name 1", "description": "Explanation of what Document Name 1 means in 2-3 sentences, including any relevant [EPA Requirements](https://www.epa.gov)."}}
  ],
  "ProjectNarrativeSections": [
    {{"item": "Section Name 1", "description": "Explanation of what Section Name 1 means in 2-3 sentences, including any relevant [EPA Guidelines](https://www.epa.gov)."}}
  ],
  "KeyDeadlines": [
    {{"item": "Deadline 1", "description": "Explanation of what Deadline 1 means in 2-3 sentences, including any relevant [Submission Guidelines](https://www.epa.gov)."}}
  ]

Return ONLY the JSON output without any additional explanations, comments, or preamble.

${contents}`;
  return new InvokeModelCommand({
    modelId: "us.anthropic.claude-sonnet-4-20250514-v1:0",
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