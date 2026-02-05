# GrantWell

An AI-powered grant-writing assistant designed to streamline the process of applying for federal funding, specifically for Massachusetts communities pursuing federal funding opportunities.

## Demo

The application features multiple interactive interfaces including a landing page, requirements gathering page, chatbot interface, and document editor.

## What It Does

- **Smart Grant Matching**  
  AI-powered system that analyzes and matches grants to user needs, providing personalized recommendations based on project requirements.

  <img src="lib/user-interface/app/public/images/Landing Page.png" alt="Landing page" width="500">

- **Requirements Analysis**  
  Automatically scans and summarizes Notices of Funding Opportunities (NOFOs), presenting key information about eligibility, required documents, narrative sections, and deadlines.

  <img src="lib/user-interface/app/public/images/Req Page.png" alt="Requirements page" width="500">

- **AI-Powered Writing Assistant**  
  Interactive chatbot that assists in drafting grant narratives by prompting for organization details and incorporating information from uploaded documents.
  
  <img src="lib/user-interface/app/public/images/Chatbot Page.png" alt="Chatbot interface" width="500">

- **Document Editor**  
  Section-based editor for drafting and refining grant narratives with AI assistance, progress tracking, and export capabilities.

  <img src="lib/user-interface/app/public/images/Writing Page.png" alt="Document editor page" width="500">

- **Dashboard**  
  Administrative dashboard for managing NOFOs, automated NOFO scraping, and inviting new users.

  <img src="lib/user-interface/app/public/images/Dashboard Page.png" alt="Dashboard page" width="500">

## Architecture

<img src="https://raw.githubusercontent.com/Anuttan/Grantwell-MVP/main/lib/user-interface/app/public/images/architecture.png" alt="System Architecture" width="500">

For more information about the architecture, visit the [AWS GenAI LLM Chatbot](https://aws-samples.github.io/aws-genai-llm-chatbot/).

## Tech Stack

| Layer          | Tools & Frameworks                                      |
|----------------|---------------------------------------------------------|
| **Frontend**   | React, TypeScript, AWS Amplify, Cloudscape Design System |
| **Backend**    | AWS Lambda, AWS API Gateway, AWS CDK                     |
| **AI/ML**      | AWS Bedrock, Mistral, Claude                            |
| **Auth**       | AWS Cognito                                             |
| **Storage**    | AWS S3, DynamoDB                                        |
| **DevOps**     | AWS CDK for infrastructure as code                      |

## Setup

```bash
# Clone the repo
git clone https://github.com/Anuttan/GrantWell-MVP.git
cd GrantWell-MVP

# Install dependencies
npm install

# For frontend development, navigate to the app directory
cd lib/user-interface/app
npm install
npm run dev
```

> Environment variables and AWS credentials need to be configured for full functionality.

### Prerequisites
- Node.js (Latest LTS version recommended)
- AWS CLI configured with appropriate credentials
- AWS CDK installed globally (`npm install -g aws-cdk`)

## Core Modules

| Module              | Description                                                                 |
|---------------------|-----------------------------------------------------------------------------|
| `landing-page`      | Browse and select from available NOFOs with smart search capabilities        |
| `requirements`      | Review summarized NOFO documents and upload relevant backend files           |
| `chatbot`          | AI-powered interface for drafting grant narratives                           |
| `document-editor`  | Collaborative environment for drafting and finalizing grant narratives       |
| `dashboard`        | Administrative interface for managing NOFOs, users, and tracking progress     |


## Grant Writing Flow

1. **Grant Selection** → Browse and select from available NOFOs
2. **Project Basics** → Enter basic project information
3. **Questionnaire** → Complete project-specific questions
4. **Document Upload** → Submit supporting documentation
5. **Section Editor** → Draft and refine narrative sections
6. **Review** → Final review and export of completed application

## Security & Privacy

- AWS Cognito-based authentication
- Self-signup enabled - users can create accounts directly
- Secure file storage in AWS S3
- Role-based access control with admin privileges
- Encrypted data transmission
- PDFs are preferred for file uploads (ZIP files not supported)

## Roadmap

- [ ] Enhanced grant matching algorithms
- [ ] Collaborative editing features
- [ ] Advanced document version control
- [ ] Expanded analytics and reporting

## Contributing

This is an internal tool for Massachusetts Federal Funds and Infrastructure (FFIO) staff. Please contact the administrators for access and contribution guidelines.


## License

MIT License – see `LICENSE.md` for details.

## Authors & Acknowledgements

- Built by the GrantWell Team
  - [Anjith Prakash](https://github.com/Anuttan)
  - [Jai Surya Kode](https://github.com/KodeJaiSurya)
  - [Deepika Mettu](https://github.com/deepikasai-mettu)
  - [Serena Green](https://github.com/serenagreenx)
  - [Shreya Thalvayapati](https://github.com/shreyathal)
- In partnership with the Burnes Center for Social Change
- For the Massachusetts Federal Funds and Infrastructure Office

## Important Notes

- This tool is functional but has undergone minimal user testing. Please report any issues through the feedback form available in the application.
- Ensure you upload your supplementary data before starting a conversation with the chatbot.
- NOFO documents must be properly named before uploading to GrantWell.
- Always fact-check any information provided by GrantWell that you are uncertain about.

## Feedback

Help us make GrantWell better by sharing your thoughts and suggestions through our [feedback form](https://forms.gle/M2PHgWTVVRrRubpc7).