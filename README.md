# GrantWell

An AI-powered grant-writing assistant designed to streamline the process of applying for state and federal funding opportunities.

## Demo

The application features multiple interactive interfaces including a landing page, requirements gathering page, chatbot interface, and document editor.

## What It Does

- **Smart Grant Matching**  
  AI-powered system that analyzes and matches grants to user needs, providing personalized recommendations based on project requirements.

  <img src="packages/ui/public/images/Landing Page.png" alt="Landing page" width="500">

- **Requirements Analysis**  
  Automatically scans and summarizes Notices of Funding Opportunities (NOFOs), presenting key information about eligibility, required documents, narrative sections, and deadlines.

  <img src="packages/ui/public/images/Req Page.png" alt="Requirements page" width="500">

- **AI-Powered Writing Assistant**  
  Interactive chatbot that assists in drafting grant narratives by prompting for organization details and incorporating information from uploaded documents.
  
  <img src="packages/ui/public/images/Chatbot Page.png" alt="Chatbot interface" width="500">

- **Document Editor**  
  Section-based editor for drafting and refining grant narratives with AI assistance, progress tracking, and export capabilities.

  <img src="packages/ui/public/images/Writing Page.png" alt="Document editor page" width="500">

- **Dashboard**  
  Administrative dashboard for managing NOFOs, automated NOFO scraping, and inviting new users.

  <img src="packages/ui/public/images/Dashboard Page.png" alt="Dashboard page" width="500">

## Architecture

[![GrantWell Architecture Diagram](https://drive.google.com/thumbnail?id=1_bfNqxH3opOZFXm4___pQd5Y1hLC-ryQ&sz=w1600)](https://drive.google.com/file/d/1_bfNqxH3opOZFXm4___pQd5Y1hLC-ryQ/view?usp=sharing)

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
git clone https://github.com/The-Burnes-Center/AI4Impact-GrantWell.git
cd AI4Impact-GrantWell

# Install dependencies
cd packages/core
npm install

# For frontend development, navigate to the app directory
cd ../ui
npm install
npm run dev
```

> Environment variables and AWS credentials need to be configured for full functionality.

### Prerequisites
- Node.js (Latest LTS version recommended)
- AWS CLI configured with appropriate credentials
- AWS CDK installed globally (`npm install -g aws-cdk`)

### Repository layout

| Path | Contents |
|---|---|
| `packages/core` | CDK constructs, Lambdas and step functions, packed as `grantwell-core-<version>.tgz` |
| `packages/ui` | React app source, packed as `grantwell-ui-<version>.tgz` |
| `template/` | Starting repo for a state: config plus the two .tgz files in `vendor/` |
| `instances/generic` | grantwell.us, built from `template/`; its `vendor/` holds the last release |
| `scripts/pack.sh` | Builds both .tgz files; `--dev` builds Generic from source in `build/generic/` (gitignored) |
| `scripts/release.sh` | Stamps a release version (`prepare`) and builds the release files from a tag (`build`, run by `release.yml`) |

### Working on `packages/`

Dev (`grantwell-burnes-staging`) runs source, prod runs releases. Every push to `staging` runs CI, then deploys dev from `scripts/pack.sh --dev` (Generic's config with vendor/ packed from that commit) and posts a read-only diff against live prod in the run summary. `instances/generic/vendor/` only changes when a release is prepared.

To synth or test locally, run `scripts/pack.sh --dev`, then `npm run synth:ci` and `npm test` in `packages/core`. Never commit `build/`.

Prod deploys from `main` use the committed `instances/generic/vendor/`, and fail unless it equals a fresh pack of that commit's source: merge to `main` only a commit where a release was prepared.

### Releasing

Releases are GitHub Releases on this repo, versioned `X.Y.Z` from `main` and `X.Y.Z-rc.N` from `staging`.

1. On a clean checkout of the branch, run `scripts/release.sh prepare <version>`. It stamps the version into `packages/core`, `packages/ui` and `template/package.json`, and re-packs `instances/generic/vendor/`.
2. Commit and push. Wait for CI to pass.
3. Tag the commit `v<version>` and push the tag. `release.yml` runs CI, checks the commit is on `staging` (rc) or `main`, rebuilds both .tgz files, fails unless they equal the committed `vendor/`, and publishes them with a CycloneDX SBOM each and `SHA256SUMS`.

States upgrade with `scripts/upgrade.sh <version>` in their own repo (see `template/README.md`).

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

## Contributing

Please contact the administrators for access and contribution guidelines.

## License

Apache License 2.0: see [LICENSE](LICENSE) and [NOTICE](NOTICE).

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
