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
    modelId: "us.anthropic.claude-sonnet-4-20250514-v1:0",
    contentType: "application/json",
    accept: "application/json",
    body: JSON.stringify({
      anthropic_version: "bedrock-2023-05-31",
      messages: [
        {
          role: "user",
          content: `# Strategic NOFO Question Generator

## Task Overview
You are a specialized grant writing assistant tasked with creating 5-15 highly strategic questions based on the provided Notice of Funding Opportunity (NOFO). These questions will guide another AI in generating a complete, high-quality grant proposal.

## Input Materials
You have access to two key resources:
1. <structured_summary>${{summaryData}}</structured_summary>
2. <nofo_document>${{documentSample}}</nofo_document>

## Question Development Guidelines
- Generate between 5-15 questions (optimal range: 8-10)
- Each question must directly address specific requirements in the Project Narrative sections
- Questions should help applicants demonstrate how they meet all evaluation criteria
- Use the exact grant program name and issuing agency as specified in the NOFO
- Focus particularly on sections with higher point values or emphasized importance

## Question Writing Requirements
- **Specificity**: Each question must be unique and target a specific aspect of the NOFO
- **Clarity**: Use simple, accessible language for non-technical users with limited grant writing experience
- **Comprehensiveness**: Collectively, your questions should cover all major Project Narrative components
- **Actionability**: Questions should prompt concrete, evidence-based responses that reviewers will value
- **Alignment**: Use terminology consistent with the NOFO document

## Question Format Guidelines
- Begin questions with action-oriented phrases: "How will you...", "Describe your approach to...", "What evidence demonstrates..."
- Include specific references to NOFO requirements where appropriate
- Avoid yes/no questions; focus on questions that elicit detailed responses
- Keep questions concise but complete (typically 1-3 sentences)

## Output Format
Return your questions in this exact JSON format:

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

Review your final questions to ensure they collectively address all major components of the Project Narrative sections identified in the structured summary.

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

## Task Overview
You are an AI assistant specialized in analyzing Notice of Funding Opportunity (NOFO) documents. Your task is to extract and categorize key information from the provided NOFO summaries into a structured format that will help grant applicants understand the requirements.

## Input
<summaries>
{{summaries}}
</summaries>

## Instructions
Analyze all the provided NOFO summaries and extract the following information:
1. The grant name
2. Key information organized into four specific categories

## Categorization Guidelines

### For all categories:
- Extract information without duplication
- Include relevant links using markdown format: [Link Text](URL)
- Combine related items when possible
- Focus on high-level requirements rather than granular details

### Specific Category Guidelines:

<category name="Eligibility Criteria">
- Extract only the most important eligibility requirements
- Focus on who can apply (organizations, individuals, partnerships)
- Include any geographic, demographic, or organizational restrictions
- Keep descriptions concise (2-3 sentences per item)
</category>

<category name="Required Documents">
- Extract only the most critical documents needed for application
- Include submission format requirements when specified
- Keep descriptions concise (2-3 sentences per item)
</category>

<category name="Project Narrative Sections">
- Extract ALL required narrative components mentioned in the NOFO
- Include technical, administrative, and optional narrative elements
- EXCLUDE sections requiring applicant-specific financial/budget content (e.g., budget narrative, budget tables, cost breakdowns)
- Examples of sections to include: problem statement, project goals, methodology, timeline, stakeholder engagement, sustainability plan, evaluation plan, capacity statement, organizational background, etc.
- Keep descriptions concise (2-3 sentences per item)
</category>

<category name="Key Deadlines">
- Extract only the most important dates and deadlines
- Include application submission deadlines, review periods, and award dates
- Keep descriptions concise (2-3 sentences per item)
</category>

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
}

Provide only the JSON output without any additional explanations or preamble.
  

${contents}`
    : `# NOFO Document Categorization Assistant

## Task Overview
You are a specialized AI assistant tasked with analyzing Notice of Funding Opportunity (NOFO) documents and extracting key information into structured categories. Your goal is to help grant applicants quickly understand the most critical requirements and deadlines.

## Input
<nofo_document>
{{document}}
</nofo_document>

## Instructions
Extract and categorize the following information from the provided NOFO document:
1. The official name of the grant
2. Key information across four specific categories

## Extraction Guidelines
For each category, follow these strict requirements:
- Select only the 2-3 MOST IMPORTANT items per category
- Write concise descriptions of exactly 2-3 sentences for each item
- Focus on high-level requirements that are most critical for applicants
- Combine related items when possible to avoid fragmentation
- Include any relevant URLs mentioned in the document using markdown format: [Title](URL)
- Prioritize information that directly impacts application success

## Categories to Extract
1. **Eligibility Criteria**: Who can apply for this grant
2. **Required Documents**: Essential application materials that must be submitted
3. **Project Narrative Sections**: Key components that must be addressed in the proposal
4. **Key Deadlines**: Critical dates for submission and other important milestones

## Output Format
Provide your response in the following JSON structure:
{{"GrantName": "Name of the grant",
  "EligibilityCriteria": [
    { "item": "Eligibility Item 1", "description": "Concise explanation in 2-3 sentences, including any relevant [Resource Name](URL)."}},
    {{"item": "Eligibility Item 2", "description": "Concise explanation in 2-3 sentences, including any relevant [Resource Name](URL)."}}
  ],
  "RequiredDocuments": [
    {{"item": "Document Name 1", "description": "Concise explanation in 2-3 sentences, including any relevant [Resource Name](URL)."}},
    {{"item": "Document Name 2", "description": "Concise explanation in 2-3 sentences, including any relevant [Resource Name](URL)."}}
  ],
  "ProjectNarrativeSections": [
    {{"item": "Section Name 1", "description": "Concise explanation in 2-3 sentences, including any relevant [Resource Name](URL)."}},
    {{"item": "Section Name 2", "description": "Concise explanation in 2-3 sentences, including any relevant [Resource Name](URL)."}}
  ],
  "KeyDeadlines": [
    {{"item": "Deadline 1", "description": "Concise explanation in 2-3 sentences, including any relevant [Resource Name](URL)."}},
    {{"item": "Deadline 2", "description": "Concise explanation in 2-3 sentences, including any relevant [Resource Name](URL)."}}
  ]
}

Return ONLY the JSON object with the extracted information, without any additional explanations or commentary.

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