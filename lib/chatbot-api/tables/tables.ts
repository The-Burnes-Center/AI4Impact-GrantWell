/**
 * This file defines an AWS CDK stack that creates and configures DynamoDB tables.
 * The tables are used for storing chat history and user feedback.
 * Each table is configured with partition keys, sort keys, and global secondary indexes.
 */

import { Stack, StackProps } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { AttributeType, Table, ProjectionType } from 'aws-cdk-lib/aws-dynamodb';

export class TableStack extends Stack {
  public readonly historyTable: Table;
  public readonly feedbackTable: Table;
  public readonly draftTable: Table;
  public readonly nofoMetadataTable: Table;
  public readonly searchJobsTable: Table;
  public readonly draftGenerationJobsTable: Table;

  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    // Define the Chat History Table
    const chatHistoryTable = new Table(this, 'ChatHistoryTable', {
      partitionKey: { name: 'user_id', type: AttributeType.STRING },
      sortKey: { name: 'session_id', type: AttributeType.STRING },
    });

    // Add a global secondary index to sort ChatHistoryTable by time_stamp
    chatHistoryTable.addGlobalSecondaryIndex({
      indexName: 'TimeIndex',
      partitionKey: { name: 'user_id', type: AttributeType.STRING },
      sortKey: { name: 'time_stamp', type: AttributeType.STRING },
      projectionType: ProjectionType.ALL,
    });

    this.historyTable = chatHistoryTable;

    // Define the User Feedback Table
    const userFeedbackTable = new Table(this, 'UserFeedbackTable', {
      partitionKey: { name: 'Topic', type: AttributeType.STRING },
      sortKey: { name: 'CreatedAt', type: AttributeType.STRING },
    });

    // Add a global secondary index to UserFeedbackTable with partition key CreatedAt
    userFeedbackTable.addGlobalSecondaryIndex({
      indexName: 'CreatedAtIndex',
      partitionKey: { name: 'CreatedAt', type: AttributeType.STRING },
      projectionType: ProjectionType.ALL,
    });

    // Add another global secondary index to UserFeedbackTable
    userFeedbackTable.addGlobalSecondaryIndex({
      indexName: 'AnyIndex',
      partitionKey: { name: 'Any', type: AttributeType.STRING },
      sortKey: { name: 'CreatedAt', type: AttributeType.STRING },
      projectionType: ProjectionType.ALL,
    });

    this.feedbackTable = userFeedbackTable;

    // Define the Draft Table with LastModifiedIndex GSI
    const draftTable = new Table(this, 'DraftTable', {
      partitionKey: { name: 'user_id', type: AttributeType.STRING },
      sortKey: { name: 'session_id', type: AttributeType.STRING },
    });

    // Add global secondary index to DraftTable by last_modified
    draftTable.addGlobalSecondaryIndex({
      indexName: 'LastModifiedIndex',
      partitionKey: { name: 'user_id', type: AttributeType.STRING },
      sortKey: { name: 'last_modified', type: AttributeType.STRING },
      projectionType: ProjectionType.ALL,
    });

    this.draftTable = draftTable;

    // Define the NOFO Metadata Table for caching NOFO information
    const nofoMetadataTable = new Table(this, 'NOFOMetadataTable', {
      partitionKey: { name: 'nofo_name', type: AttributeType.STRING },
    });

    // Add GSI for filtering by status (active/archived)
    nofoMetadataTable.addGlobalSecondaryIndex({
      indexName: 'StatusIndex',
      partitionKey: { name: 'status', type: AttributeType.STRING },
      sortKey: { name: 'created_at', type: AttributeType.STRING },
      projectionType: ProjectionType.ALL,
    });

    // Add GSI for filtering pinned grants
    nofoMetadataTable.addGlobalSecondaryIndex({
      indexName: 'PinnedIndex',
      partitionKey: { name: 'isPinned', type: AttributeType.STRING },
      sortKey: { name: 'created_at', type: AttributeType.STRING },
      projectionType: ProjectionType.ALL,
    });

    // Add GSI for filtering by category
    nofoMetadataTable.addGlobalSecondaryIndex({
      indexName: 'CategoryIndex',
      partitionKey: { name: 'category', type: AttributeType.STRING },
      sortKey: { name: 'created_at', type: AttributeType.STRING },
      projectionType: ProjectionType.ALL,
    });

    // Add GSI for filtering by agency
    // NOTE: Deploying in two steps due to DynamoDB limitation (only one GSI per update)
    // After CategoryIndex is deployed, uncomment this and deploy again
    // nofoMetadataTable.addGlobalSecondaryIndex({
    //   indexName: 'AgencyIndex',
    //   partitionKey: { name: 'agency', type: AttributeType.STRING },
    //   sortKey: { name: 'created_at', type: AttributeType.STRING },
    //   projectionType: ProjectionType.ALL,
    // });

    this.nofoMetadataTable = nofoMetadataTable;

    // Define the Search Jobs Table for async grant recommendation searches
    // Stores job status and results for polling
    const searchJobsTable = new Table(this, 'SearchJobsTable', {
      partitionKey: { name: 'jobId', type: AttributeType.STRING },
      timeToLiveAttribute: 'ttl', // Auto-delete jobs after expiry
    });

    this.searchJobsTable = searchJobsTable;
    this.exportValue(this.searchJobsTable.tableName, {
      name: 'gwstackstagingChatbotAPITableStack1CC2A7DA:ExportsOutputRefSearchJobsTableA2558B7A8D23931E',
    });
    this.exportValue(this.searchJobsTable.tableArn, {
      name: 'gwstackstagingChatbotAPITableStack1CC2A7DA:ExportsOutputFnGetAttSearchJobsTableA2558B7AArnA7DEE49B',
    });

    // Define the Draft Generation Jobs Table for async draft generation
    // Stores job status and results for polling
    const draftGenerationJobsTable = new Table(this, 'DraftGenerationJobsTable', {
      partitionKey: { name: 'jobId', type: AttributeType.STRING },
      timeToLiveAttribute: 'ttl', // Auto-delete jobs after expiry
    });

    this.draftGenerationJobsTable = draftGenerationJobsTable;
  }
}
