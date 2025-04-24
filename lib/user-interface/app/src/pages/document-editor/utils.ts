// Default section guidance text
export const getDefaultGuidanceText = (sectionTitle: string): string => {
  const guidanceMap: Record<string, string> = {
    "Executive Summary":
      "Provide a brief overview of your project, including its purpose, scope, and expected outcomes. This section should be concise but comprehensive.",
    "Project Description":
      "Detail the specific activities, methodologies, and approaches that will be employed in this project. Explain what will be done and how it will be implemented.",
    "Goals and Objectives":
      "Clearly state the goals and objectives of the project, ensuring they are specific, measurable, achievable, relevant, and time-bound (SMART).",
    Timeline:
      "Provide a detailed timeline for the project, including key milestones and deliverables. This should demonstrate a realistic schedule for completion.",
    Budget:
      "Explain how project funds will be allocated and justify each expenditure. Show how the budget aligns with project activities.",
    Background:
      "Describe the context and background information relevant to your project. Explain why this project is necessary and important.",
    Evaluation:
      "Outline how you will measure the success of your project. Include specific metrics and methods for evaluation.",
    Sustainability:
      "Explain how the project will continue after grant funding ends. Describe plans for long-term viability.",
    "Staff Qualifications":
      "Provide information about the key personnel who will work on the project and their relevant qualifications and experience.",
  };

  // Try to find a match for the section title or partial match
  for (const [key, guidance] of Object.entries(guidanceMap)) {
    if (sectionTitle.toLowerCase().includes(key.toLowerCase())) {
      return guidance;
    }
  }

  // Default guidance if no match found
  return "Provide detailed information for this section based on the grant requirements.";
};

// Function to get section description
export const getSectionDescription = (sectionTitle: string): string => {
  const descriptionMap: Record<string, string> = {
    "Executive Summary":
      "Provide a concise overview of your entire proposal, highlighting the problem, solution, goals, methods, and expected impact. This section should be brief but compelling.",
    "Project Description":
      "Describe your project in detail, including the specific activities, methodologies, and approaches. Explain what will be done, how it will be implemented, and who will benefit.",
    "Goals and Objectives":
      "List specific, measurable, achievable, relevant, and time-bound (SMART) goals and objectives. Clearly articulate what success looks like for this project.",
    "Project Timeline":
      "Present a chronological schedule of project activities, milestones, and deliverables. Include start and end dates for major phases and demonstrate that the timeline is realistic.",
    "Budget Narrative":
      "Explain and justify each line item in your budget. Show how costs are necessary, reasonable, and directly aligned with project activities.",
    Background:
      "Provide context for your project by describing the problem or need, relevant research, previous efforts, and why your approach is necessary.",
    "Need Statement":
      "Present data and evidence demonstrating why this project is needed. Explain the gap your project will fill and why it matters to the community.",
    Methods:
      "Detail the specific methods, tools, techniques, and approaches you will use to accomplish your objectives.",
    "Evaluation Plan":
      "Describe how you will measure success, including specific metrics, data collection methods, and analysis approaches.",
    Sustainability:
      "Explain how the project will continue after grant funding ends, including future funding sources and long-term maintenance plans.",
    "Organizational Capacity":
      "Highlight your organization's qualifications, experience, and resources that make it capable of successfully implementing this project.",
    "Staff Qualifications":
      "Describe the key personnel who will work on the project, their roles, qualifications, and relevant experience.",
    "Dissemination Plan":
      "Explain how project results will be shared with stakeholders, the public, or the field.",
    Collaboration:
      "Describe partnerships with other organizations and how they will contribute to the project's success.",
    "Community Engagement":
      "Detail how the community will be involved in planning, implementing, and evaluating the project.",
  };

  // Try to find a match for the section title or partial match
  for (const [key, description] of Object.entries(descriptionMap)) {
    if (sectionTitle.toLowerCase().includes(key.toLowerCase())) {
      return description;
    }
  }

  // Default description if no match found
  return "Create content for this section that addresses the specific requirements outlined in the grant guidelines. Include relevant details, data, and explanations to strengthen your proposal.";
};
