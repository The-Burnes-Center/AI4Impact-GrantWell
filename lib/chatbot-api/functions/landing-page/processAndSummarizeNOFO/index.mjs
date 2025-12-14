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

      // Extract application deadline from KeyDeadlines
      let applicationDeadline = null;
      if (mergedSummary.KeyDeadlines && mergedSummary.KeyDeadlines.length > 0) {
        try {
          applicationDeadline = await extractApplicationDeadline(
            mergedSummary.KeyDeadlines,
            bedrockClient
          );
          if (applicationDeadline) {
            mergedSummary.application_deadline = applicationDeadline;
            console.log(`Extracted application deadline: ${applicationDeadline}`);
          } else {
            console.log('Could not extract application deadline from KeyDeadlines');
          }
        } catch (error) {
          console.error('Error extracting application deadline:', error);
          // Non-critical error, continue without deadline
        }
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
            expiration_date: applicationDeadline || null,
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
    modelId: "us.anthropic.claude-haiku-4-5-20251001-v1:0",
    contentType: "application/json",
    accept: "application/json",
    body: JSON.stringify({
      anthropic_version: "bedrock-2023-05-31",
      messages: [
        {
          role: "user",
          content: `# Generate Strategic NOFO Questions

Analyze the NOFO document and generate 5-15 strategic questions (ideally 8-10) to guide grant proposal development.

## Input
<summary_data>${summaryData}</summary_data>
<nofo_document>${documentSample}</nofo_document>

## Requirements

**Question Criteria:**
- Address all critical Project Narrative requirements and evaluation criteria
- Target distinct aspects; use clear, non-technical language
- Prompt concrete evidence and specific details
- Focus on high-point-value sections
- Use NOFO's exact terminology

**Question Format:**
- Start with action phrases: "How will you...", "Describe your...", "What evidence..."
- Concise (1-3 sentences), avoid yes/no questions
- Reference specific NOFO requirements

## Process
1. Identify Project Narrative sections, evaluation criteria, and point values
2. Determine components needing detailed responses
3. Create questions covering each critical element

## Output (JSON only, no other text)

{
  "totalQuestions": [number],
  "questions": [
    {"id": 1, "question": "[question text]"},
    {"id": 2, "question": "[question text]"}
  ]
}

Ensure questions collectively address all major Project Narrative components.`,
        },
      ],
      max_tokens: 2000,
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

/**
 * Extract application deadline date from KeyDeadlines array
 * Uses Bedrock to parse natural language dates into ISO format
 */
async function extractApplicationDeadline(keyDeadlines, bedrockClient) {
  if (!keyDeadlines || keyDeadlines.length === 0) {
    return null;
  }

  try {
    // Find the application submission deadline
    const deadlineText = keyDeadlines
      .map(d => `${d.item}: ${d.description}`)
      .join('\n');

    const prompt = `# Extract Application Deadline

Extract the APPLICATION SUBMISSION DEADLINE from this text (not letter of intent, notification, or award dates):

${deadlineText}

**Rules:**
1. Convert to ISO 8601 format: YYYY-MM-DDTHH:mm:ssZ (UTC)
2. If time missing: use 23:59:59 in specified timezone
3. If timezone missing: assume US Eastern Time
4. Return "null" if no application deadline found

Output only the ISO date string or "null" - no explanation.`;

    const command = new InvokeModelCommand({
      modelId: 'us.anthropic.claude-haiku-4-5-20251001-v1:0',
      contentType: 'application/json',
      accept: 'application/json',
      body: JSON.stringify({
        anthropic_version: 'bedrock-2023-05-31',
        messages: [
          {
            role: 'user',
            content: prompt,
          },
        ],
        max_tokens: 100,
        temperature: 0.1,
      }),
    });

    const response = await bedrockClient.send(command);
    const content = JSON.parse(
      new TextDecoder().decode(response.body)
    ).content[0].text.trim();

    // Parse the response
    if (content.toLowerCase() === 'null' || !content) {
      console.log('No application deadline found in KeyDeadlines');
      return null;
    }

    // Validate it's a valid ISO date
    const date = new Date(content);
    if (isNaN(date.getTime())) {
      console.warn(`Invalid date extracted: ${content}`);
      return null;
    }

    // Return in ISO format
    return date.toISOString();
  } catch (error) {
    console.error('Error extracting application deadline:', error);
    return null;
  }
}

// Helper function to create Bedrock command
function createBedrockCommand(contents, isMerged = false) {
  const prompt = isMerged
    ? `# NOFO Summaries Categorization

Analyze the NOFO summaries and extract structured information to help grant applicants understand requirements and eligibility:

<summaries>
${contents}
</summaries>

## Task: Extract Information in Four Categories

**Grant Name**: Extract the complete official title

### 1. Eligibility Criteria
Extract key eligibility requirements:
- Applicant types (non-profits, educational institutions, government entities, individuals)
- Geographic restrictions (states, regions, countries)
- Demographic requirements (populations served)
- Organizational qualifications (experience, certifications)
- Partnership requirements (consortia, collaborations)

### 2. Required Documents
Extract critical application documents:
- Application forms and templates
- Letters (support, commitment, intent)
- Certifications and assurances
- Submission format specifications (PDF, Word, online portal)
- Page limits and formatting requirements

### 3. Project Narrative Sections
Extract ALL required narrative components mentioned:
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

**IMPORTANT**: Exclude sections requiring budget-specific financial content (budget narratives, budget tables, cost breakdowns)

### 4. Key Deadlines
Extract important dates:
- Letter of intent deadline
- Application submission deadline (include date, time, and timezone)
- Expected notification dates
- Award start dates
- Project period/duration

## Extraction Guidelines

- Avoid duplication; combine related items
- Keep descriptions concise (2-3 sentences per item)
- Include relevant links in markdown format: [Link Text](URL)
- Focus on high-level requirements, not granular procedural details
- Preserve original terminology from the summaries
- Maintain accuracy while summarizing

## Output Format

Return ONLY this JSON structure with no additional text:
{
  "GrantName": "Complete grant title",
  "EligibilityCriteria": [
    {"item": "Eligibility requirement name", "description": "2-3 sentence explanation of the requirement, including any [relevant links](URL)"}
  ],
  "RequiredDocuments": [
    {"item": "Document name", "description": "2-3 sentence explanation of the document purpose and requirements, including any [relevant links](URL)"}
  ],
  "ProjectNarrativeSections": [
    {"item": "Section name", "description": "2-3 sentence explanation of what should be addressed in this section, including any [relevant links](URL)"}
  ],
  "KeyDeadlines": [
    {"item": "Deadline name", "description": "2-3 sentence explanation with specific date/time and significance, including any [relevant links](URL)"}
  ]
}  

${contents}`
    : `# NOFO Document Categorization

Analyze the NOFO document and extract structured information to help grant applicants understand requirements and eligibility:

<nofo_document>
${contents}
</nofo_document>

## Task: Extract Information in Four Categories

**Grant Name**: Extract the complete official title

### 1. Eligibility Criteria
Extract key eligibility requirements:
- Applicant types (non-profits, educational institutions, government entities, individuals)
- Geographic restrictions (states, regions, countries)
- Demographic requirements (populations served)
- Organizational qualifications (experience, certifications)
- Partnership requirements (consortia, collaborations)

### 2. Required Documents
Extract critical application documents:
- Application forms and templates
- Letters (support, commitment, intent)
- Certifications and assurances
- Submission format specifications (PDF, Word, online portal)
- Page limits and formatting requirements

### 3. Project Narrative Sections
Extract ALL required narrative components mentioned in the NOFO:
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

**IMPORTANT**: Exclude sections requiring budget-specific financial content (budget narratives, budget tables, cost breakdowns)

### 4. Key Deadlines
Extract important dates:
- Letter of intent deadline
- Application submission deadline (include date, time, and timezone)
- Expected notification dates
- Award start dates
- Project period/duration

## Extraction Guidelines

- Avoid duplication; combine related items
- Keep descriptions concise (2-3 sentences per item)
- Include relevant links in markdown format: [Link Text](URL)
- Focus on high-level requirements, not granular procedural details
- Preserve original terminology from the NOFO
- Maintain accuracy while summarizing

## Output Format

Return ONLY this JSON structure with no additional text:
{
  "GrantName": "Complete grant title",
  "EligibilityCriteria": [
    {"item": "Eligibility requirement name", "description": "2-3 sentence explanation of the requirement, including any [relevant links](URL)"}
  ],
  "RequiredDocuments": [
    {"item": "Document name", "description": "2-3 sentence explanation of the document purpose and requirements, including any [relevant links](URL)"}
  ],
  "ProjectNarrativeSections": [
    {"item": "Section name", "description": "2-3 sentence explanation of what should be addressed in this section, including any [relevant links](URL)"}
  ],
  "KeyDeadlines": [
    {"item": "Deadline name", "description": "2-3 sentence explanation with specific date/time and significance, including any [relevant links](URL)"}
  ]
}
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