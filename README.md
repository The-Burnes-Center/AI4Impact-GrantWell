# Welcome to GrantWell

# Overview
GrantWell is generative AI-powered grant-writing assistant designed to streamline the process of applying for federal funding. GrantWell will scan lengthy Notice of Funding Opportunities (NOFOs) for municipalities looking to apply for a given grant. It will then assist users with drafting their project's narrative. Currently released for internal use for the Massachusetts Federal Funds and Infrastructure (FFIO) staff. 

# GrantWell Features
GrantWell is organized into three key pages: 1) a homepage for selecting NOFOs, 2) an extracted requirements page, and 3) a narrative drafting page.

# Homepage
The homepage of GrantWell provides admin users with the ability to upload NOFOs that they want summarized. Once the system parses through the document and extracts the necessary requirements, grant applicants can select the NOFO that they'd like to work on from the top of the screen.

<img src="https://github.com/deepikasai-mettu/FFIO-MVP-RAG-chatbot/blob/main/lib/user-interface/app/public/images/landingpage.gif?raw=true" alt="Homepage gif" width="500">

# Extracted Requirements Page
Grant applicants can review the output of the summarized NOFO document on this page, as well as upload any relevant backend files that they would like the chatbot to have access to.

<img src="https://github.com/deepikasai-mettu/FFIO-MVP-RAG-chatbot/blob/main/lib/user-interface/app/public/images/reqpage.gif?raw=true" alt="Requirements gif" width="500">

# Narrative Drafting Page
The chatbot will prompt the applicant to provide details about who is applying for the grant. Users are encouraged to upload as much supplementary, application-related data to the backend before engaging in conversation with the chatbot.

<img src="https://github.com/deepikasai-mettu/FFIO-MVP-RAG-chatbot/blob/main/lib/user-interface/app/public/images/chatbotreal-compress.gif?raw=true" alt="Requirements gif" width="500">

# Important Notes
- This tool is functional, but has undergone minimal user testing. Thus, bugs may arise. Report any bugs through the Google Form at the bottom of the landing page.
- Before beginning any conversation with the chatbot about your grant application, ensure you upload your supplementary data to the backend. The scope of the chatbot's knowledge is limited to the documents in the knowledge base.
- NOFO documents must be properly named on your Desktop before upload to GrantWell. The documents you upload will show up in the system as the file's name at time of upload.
- PDF's are preferred for file upload, but keep in mind that GrantWell _cannot_ read .zip files.
- Ensure you fact-check any information that GrantWell provides that you are uncertain about.

# Architecture 
<img src="https://raw.githubusercontent.com/deepikasai-mettu/FFIO-MVP-RAG-chatbot/main/lib/user-interface/app/public/images/architecture.png" alt="FFIO Architecture" width="500">

<p>For more information, visit the <a href="https://aws-samples.github.io/aws-genai-llm-chatbot/" target="_blank">AWS GenAI LLM Chatbot</a>.</p>

# Developers 
<p><a href="https://github.com/deepikasai-mettu" target="_blank">Deepika Mettu</a></p>

<p><a href="https://github.com/serenagreenx" target="_blank">Serena Green</a></p>

<p><a href="https://github.com/shreyathal" target="_blank">Shreya Thalvayapati</a></p>

<p><a href="https://github.com/Anuttan" target="_blank">Anjith Prakash</a></p>

<p><a href="https://github.com/KodeJaiSurya" target="_blank">Jai Surya Kode</a></p>
