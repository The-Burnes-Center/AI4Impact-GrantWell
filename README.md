# Welcome to GrantWell

## Overview
GrantWell is a generative AI-powered grant-writing assistant designed to streamline the process of applying for federal funding. GrantWell scans lengthy Notices of Funding Opportunities (NOFOs) for municipalities looking to apply for a given grant and assists users with drafting their project's narrative. Currently, it is released for internal use for the Massachusetts Federal Funds and Infrastructure (FFIO) staff.

## GrantWell Features
GrantWell is organized into three key pages:
1. **Homepage**: For selecting NOFOs.
2. **Extracted Requirements Page**: For reviewing summarized NOFO documents and uploading relevant backend files.
3. **Narrative Drafting Page**: For engaging with the chatbot to draft grant narratives.

# Homepage
The homepage of GrantWell provides admin users with the ability to upload NOFOs that they want summarized. Once the system parses through the document and extracts the necessary requirements, grant applicants can select the NOFO that they'd like to work on from the top of the screen.

<img src="https://github.com/Anuttan/Grantwell-MVP/blob/main/lib/user-interface/app/public/images/landingpage.gif?raw=true" alt="Homepage gif" width="500">

# Extracted Requirements Page
Grant applicants can review the output of the summarized NOFO document on this page, as well as upload any relevant backend files that they would like the chatbot to have access to.

<img src="https://github.com/Anuttan/Grantwell-MVP/blob/main/lib/user-interface/app/public/images/reqpage.gif?raw=true" alt="Requirements gif" width="500">

# Narrative Drafting Page
The chatbot will prompt the applicant to provide details about who is applying for the grant. Users are encouraged to upload as much supplementary, application-related data to the backend before engaging in conversation with the chatbot.

<img src="https://github.com/Anuttan/Grantwell-MVP/blob/main/lib/user-interface/app/public/images/chatbotreal-compress.gif?raw=true" alt="Requirements gif" width="500">

## Important Notes
- This tool is functional but has undergone minimal user testing. Bugs may arise; please report any issues through the Google Form at the bottom of the landing page.
- Ensure you upload your supplementary data to the backend before starting a conversation with the chatbot. The chatbot's knowledge is limited to the documents in the knowledge base.
- NOFO documents must be properly named on your Desktop before uploading to GrantWell. The documents will show up in the system as the file's name at the time of upload.
- PDFs are preferred for file uploads, but keep in mind that GrantWell _cannot_ read .zip files.
- Always fact-check any information provided by GrantWell that you are uncertain about.

# Architecture 
<img src="https://raw.githubusercontent.com/Anuttan/Grantwell-MVP/main/lib/user-interface/app/public/images/architecture.png" alt="FFIO Architecture" width="500">

For more information, visit the [AWS GenAI LLM Chatbot](https://aws-samples.github.io/aws-genai-llm-chatbot/).

## Developers
- [Anjith Prakash](https://github.com/Anuttan)
- [Jai Surya Kode](https://github.com/KodeJaiSurya)
- [Deepika Mettu](https://github.com/deepikasai-mettu)
- [Serena Green](https://github.com/serenagreenx)
- [Shreya Thalvayapati](https://github.com/shreyathal)