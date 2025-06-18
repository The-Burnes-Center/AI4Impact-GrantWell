# Automated NOFO Scraper Integration Guide

## Overview

This guide explains how to integrate the automated NOFO (Notice of Funding Opportunity) scraper into your GrantWell MVP application. The scraper automatically fetches new grant opportunities from Simpler.Grants.gov API, downloads their attachments, and uploads them to your S3 bucket for processing.

## Features

- **Automated Daily Scraping**: Runs automatically at 9 AM UTC daily via EventBridge
- **Manual Trigger**: Admin can manually trigger scraping from the dashboard
- **Duplicate Prevention**: Checks if NOFOs already exist before downloading
- **Rate Limiting**: Respects API rate limits to avoid overwhelming the service
- **Error Handling**: Comprehensive error handling and logging
- **Integration**: Seamlessly integrates with existing NOFO processing pipeline

## Prerequisites

1. **Grants.gov API Key**: You need a valid API key from Simpler.Grants.gov
2. **AWS CDK**: Ensure you have AWS CDK installed and configured
3. **Environment Variables**: Set up the required environment variables

## Setup Instructions

### 1. Environment Variables

#### Option A: Local Development
Set the following environment variable for local development:

```bash
export GRANTS_GOV_API_KEY="your_grants_gov_api_key_here"
```

#### Option B: GitHub Actions Deployment (Recommended)
1. Go to your GitHub repository
2. Navigate to **Settings** → **Secrets and variables** → **Actions**
3. Click **New repository secret**
4. Name: `GRANTS_GOV_API_KEY`
5. Value: Your actual Grants.gov API key
6. Click **Add secret**

The GitHub Actions workflow will automatically use this secret during deployment.

### 2. Install Dependencies

The automated scraper requires the following npm packages. They should be installed in the Lambda function directory:

```bash
cd lib/chatbot-api/functions/landing-page/automated-nofo-scraper
npm install @aws-sdk/client-s3 axios
```

### 3. Deploy the Infrastructure

#### Option A: Local Deployment
Deploy the updated CDK stack locally:

```bash
cd GrantWell-MVP
npm run build
cdk deploy
```

#### Option B: GitHub Actions Deployment (Recommended)
1. Commit and push your changes to the `main` branch
2. The GitHub Actions workflow will automatically:
   - Set the `GRANTS_GOV_API_KEY` from GitHub secrets
   - Deploy the CDK stack with the API key
   - Handle all infrastructure updates

You can monitor the deployment progress in the **Actions** tab of your GitHub repository.

### 4. Verify Deployment

After deployment, verify that the following resources were created:

- **Lambda Function**: `AutomatedNofoScraperFunction`
- **EventBridge Rule**: `AutomatedNofoScraperRule` (runs daily at 9 AM UTC)
- **API Gateway Route**: `/automated-nofo-scraper` (for manual triggering)
- **IAM Permissions**: S3 read/write permissions for the NOFO bucket

## How It Works

### Automated Flow

1. **Daily Trigger**: EventBridge triggers the scraper at 9 AM UTC
2. **Fetch Opportunities**: Retrieves the latest 10 grant opportunities from Simpler.Grants.gov
3. **Filter Attachments**: Only processes opportunities with exactly one attachment
4. **Check Duplicates**: Verifies if the NOFO already exists in S3
5. **Download & Upload**: Downloads the attachment and uploads to S3
6. **Create Metadata**: Generates a `summary.json` file with NOFO metadata
7. **Trigger Processing**: The existing S3 event trigger automatically processes the new NOFO

### Manual Trigger

1. **Admin Access**: Only admin users can trigger the scraper manually
2. **Dashboard Button**: Click "Auto-Scrape NOFOs" button in the admin dashboard
3. **Real-time Feedback**: Shows progress and results in the UI
4. **Auto-refresh**: Automatically refreshes the NOFO list after successful scraping

## API Endpoints

### Manual Trigger Endpoint

- **URL**: `POST /automated-nofo-scraper`
- **Authentication**: Required (Admin role)
- **Response**: 
  ```json
  {
    "message": "Automated NOFO scraper triggered successfully",
    "result": {
      "processed": 3,
      "errors": 0,
      "processedOpportunities": [...],
      "errors": [...]
    },
    "timestamp": "2024-01-15T09:00:00.000Z"
  }
  ```

## Configuration Options

### Rate Limiting

The scraper includes built-in rate limiting to respect API limits:

```javascript
const RATE_LIMIT_DELAY = 250; // milliseconds between requests
```

### Batch Size

Control how many opportunities to process per run:

```javascript
const MAX_OPPORTUNITIES_PER_RUN = 10; // limit to prevent timeout
```

### Scheduling

Modify the daily schedule in `lib/chatbot-api/functions/functions.ts`:

```typescript
const scraperRule = new events.Rule(scope, 'AutomatedNofoScraperRule', {
  schedule: events.Schedule.cron({
    minute: '0',
    hour: '9', // Change this to modify the hour
    day: '*',
    month: '*',
    year: '*',
  }),
  description: 'Trigger automated NOFO scraper daily at 9 AM UTC',
});
```

## Monitoring and Logs

### CloudWatch Logs

Monitor the scraper execution in CloudWatch Logs:

- **Log Group**: `/aws/lambda/AutomatedNofoScraperFunction`
- **Key Metrics**: 
  - Number of opportunities processed
  - Number of errors
  - Processing time
  - API response times

### Dashboard Notifications

The frontend provides real-time feedback:

- **Success**: Shows number of NOFOs processed
- **No New Data**: Indicates when no new opportunities are found
- **Errors**: Displays error messages for failed operations

## Troubleshooting

### Common Issues

1. **API Key Issues**
   - Verify `GRANTS_GOV_API_KEY` is set correctly
   - Check API key permissions and rate limits

2. **S3 Permission Errors**
   - Ensure the Lambda function has proper S3 permissions
   - Verify the bucket name is correct

3. **Timeout Issues**
   - Reduce `MAX_OPPORTUNITIES_PER_RUN` if timeouts occur
   - Increase Lambda timeout if needed

4. **Rate Limiting**
   - Increase `RATE_LIMIT_DELAY` if hitting API limits
   - Monitor API usage in Grants.gov dashboard

### Debug Mode

Enable detailed logging by checking CloudWatch Logs for the Lambda function. The scraper logs:

- Each opportunity being processed
- Download and upload operations
- Error details with stack traces
- Final summary statistics

## Security Considerations

1. **API Key Security**: The API key is stored as an environment variable in the Lambda function
2. **Access Control**: Only admin users can manually trigger the scraper
3. **S3 Permissions**: Minimal required permissions for S3 operations
4. **Error Handling**: Sensitive information is not logged

## Cost Optimization

1. **Lambda Execution**: Minimal cost as it runs once daily
2. **S3 Storage**: Only stores new NOFOs, avoids duplicates
3. **API Calls**: Efficient batching and rate limiting
4. **EventBridge**: Low cost for daily scheduling

## Future Enhancements

Potential improvements for future versions:

1. **Incremental Updates**: Only fetch opportunities newer than last run
2. **Multiple Sources**: Support for additional grant databases
3. **Advanced Filtering**: Filter by agency, funding amount, etc.
4. **Email Notifications**: Send alerts for new NOFOs
5. **Analytics Dashboard**: Track scraping statistics over time

## Support

For issues or questions:

1. Check CloudWatch Logs for detailed error information
2. Verify environment variables and API key
3. Test manual trigger functionality
4. Review IAM permissions and S3 bucket access

---

**Note**: This automated scraper is designed to complement your existing manual NOFO upload process, providing a way to automatically discover and import new grant opportunities while maintaining full control over the process. 