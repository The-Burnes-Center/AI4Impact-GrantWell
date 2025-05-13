# Welcome to GrantWell

## Overview
GrantWell is a generative AI-powered grant-writing assistant designed to streamline the process of applying for federal funding. GrantWell scans lengthy Notices of Funding Opportunities (NOFOs) for municipalities looking to apply for a given grant and assists users with drafting their project's narrative. Currently, it is released for internal use for the Massachusetts Federal Funds and Infrastructure (FFIO) staff.

## GrantWell Features
GrantWell is organized into the following key pages:
1. **Landing Page**: For browsing and selecting NOFOs.
2. **Requirements Gathering Page**: For reviewing summarized NOFO documents and uploading relevant backend files.
3. **Chatbot Interface**: For engaging with the AI to draft grant narratives.
4. **Document Editor**: For collaboratively drafting, editing, and finalizing grant narratives.
5. **Dashboard**: For administrators to manage NOFOs, users, and track progress.

## Landing Page
The landing page of GrantWell provides users with a streamlined interface to browse and select from available NOFOs. It shows recently viewed NOFOs and allows users to search through the catalog. Administrators can upload new NOFOs that they want summarized by the system.

<img src="https://github.com/Anuttan/Grantwell-MVP/blob/main/lib/user-interface/app/public/images/landingpage.gif?raw=true" alt="Landing page gif" width="500">

## Requirements Gathering Page
Grant applicants can review the output of the summarized NOFO document on this page, organized into intuitive sections for eligibility criteria, required documents, narrative sections, and deadlines.

<img src="https://github.com/Anuttan/Grantwell-MVP/blob/main/lib/user-interface/app/public/images/reqpage.gif?raw=true" alt="Requirements page gif" width="500">

## Chatbot Interface
The AI chatbot assists applicants in drafting grant narratives by prompting for details about the applying organization and incorporating information from uploaded documents. The interface provides contextual help and allows for uploading additional reference materials during the conversation.

<img src="https://github.com/Anuttan/Grantwell-MVP/blob/main/lib/user-interface/app/public/images/chatbotreal-compress.gif?raw=true" alt="Chatbot interface gif" width="500">

## Document Editor
The document editor provides a collaborative environment for drafting and refining grant narratives. It features:
- Section-based organization following NOFO requirements
- AI assistance for content generation and improvement
- Progress tracking for narrative completion
- Export capabilities for finished documents

## Dashboard
The administrative dashboard allows for:
- Managing NOFOs (adding, editing, archiving)
- Tracking progress across multiple grant applications
- User management and access control
- System usage analytics

## Important Notes
- This tool is functional but has undergone minimal user testing. Bugs may arise; please report any issues through the feedback form available in the application.
- Ensure you upload your supplementary data before starting a conversation with the chatbot. The AI's knowledge is limited to the documents in the knowledge base.
- NOFO documents must be properly named before uploading to GrantWell. The documents will show up in the system as the file's name at the time of upload.
- PDFs are preferred for file uploads. GrantWell _cannot_ read .zip files.
- Always fact-check any information provided by GrantWell that you are uncertain about.

## Architecture 
<img src="https://raw.githubusercontent.com/Anuttan/Grantwell-MVP/main/lib/user-interface/app/public/images/architecture.png" alt="FFIO Architecture" width="500">

For more information, visit the [AWS GenAI LLM Chatbot](https://aws-samples.github.io/aws-genai-llm-chatbot/).

## Developers
- [Anjith Prakash](https://github.com/Anuttan)
- [Jai Surya Kode](https://github.com/KodeJaiSurya)
- [Deepika Mettu](https://github.com/deepikasai-mettu)
- [Serena Green](https://github.com/serenagreenx)
- [Shreya Thalvayapati](https://github.com/shreyathal)