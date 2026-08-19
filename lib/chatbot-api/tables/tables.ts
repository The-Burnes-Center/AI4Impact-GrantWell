/**
 * This file defines an AWS CDK stack that creates and configures DynamoDB tables.
 * The tables are used for storing chat history and application data.
 * Each table is configured with partition keys, sort keys, and global secondary indexes.
 */

import { Stack, StackProps } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { AttributeType, Table, ProjectionType, BillingMode } from 'aws-cdk-lib/aws-dynamodb';

export class TableStack extends Stack {
  public readonly historyTable: Table;
  public readonly draftTable: Table;
  public readonly nofoMetadataTable: Table;
  public readonly draftGenerationJobsTable: Table;
  public readonly featureRolloutTable: Table;
  public readonly nofoProcessingReviewTable: Table;
  public readonly userNotificationPrefsTable: Table;
  public readonly digestSendLogTable: Table;
  public readonly digestSuppressionTable: Table;
  public readonly nofoStateOverlayTable: Table;
  public readonly analyticsTable: Table;

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
    // On-demand: landing-page reads scan StatusIndex on every load; provisioned 5 RCU throttled it.
    const nofoMetadataTable = new Table(this, 'NOFOMetadataTable', {
      partitionKey: { name: 'nofo_name', type: AttributeType.STRING },
      billingMode: BillingMode.PAY_PER_REQUEST,
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

    nofoMetadataTable.addGlobalSecondaryIndex({
      indexName: 'ContentHashIndex',
      partitionKey: { name: 'content_hash', type: AttributeType.STRING },
      projectionType: ProjectionType.KEYS_ONLY,
    });

    this.nofoMetadataTable = nofoMetadataTable;

    // Define the Draft Generation Jobs Table for async draft generation
    // Stores job status and results for polling
    const draftGenerationJobsTable = new Table(this, 'DraftGenerationJobsTable', {
      partitionKey: { name: 'jobId', type: AttributeType.STRING },
      timeToLiveAttribute: 'ttl', // Auto-delete jobs after expiry
    });

    this.draftGenerationJobsTable = draftGenerationJobsTable;

    // Generic feature rollout table keyed by feature and subject.
    const featureRolloutTable = new Table(this, 'FeatureRolloutTable', {
      partitionKey: { name: 'featureKey', type: AttributeType.STRING },
      sortKey: { name: 'subjectKey', type: AttributeType.STRING },
    });

    this.featureRolloutTable = featureRolloutTable;

    const nofoProcessingReviewTable = new Table(this, 'NOFOProcessingReviewTable', {
      partitionKey: { name: 'nofo_name', type: AttributeType.STRING },
      sortKey: { name: 'review_id', type: AttributeType.STRING },
      billingMode: BillingMode.PAY_PER_REQUEST,
      timeToLiveAttribute: 'ttl',
    });

    nofoProcessingReviewTable.addGlobalSecondaryIndex({
      indexName: 'StatusIndex',
      partitionKey: { name: 'status', type: AttributeType.STRING },
      sortKey: { name: 'created_at', type: AttributeType.STRING },
      projectionType: ProjectionType.ALL,
    });

    this.nofoProcessingReviewTable = nofoProcessingReviewTable;

    const userNotificationPrefsTable = new Table(this, 'UserNotificationPrefsTable', {
      partitionKey: { name: 'user_id', type: AttributeType.STRING },
      billingMode: BillingMode.PAY_PER_REQUEST,
    });

    userNotificationPrefsTable.addGlobalSecondaryIndex({
      indexName: 'FrequencyIndex',
      partitionKey: { name: 'frequency', type: AttributeType.STRING },
      projectionType: ProjectionType.ALL,
    });

    this.userNotificationPrefsTable = userNotificationPrefsTable;

    // One row per send attempt. (user_id, sent_at) doubles as the idempotency claim, where sent_at
    // is the cadence window key, so a retry or double-fire collides instead of mailing twice.
    const digestSendLogTable = new Table(this, 'DigestSendLogTable', {
      partitionKey: { name: 'user_id', type: AttributeType.STRING },
      sortKey: { name: 'sent_at', type: AttributeType.STRING },
      billingMode: BillingMode.PAY_PER_REQUEST,
      timeToLiveAttribute: 'expires_at',
    });

    this.digestSendLogTable = digestSendLogTable;

    // Hard bounces and complaints by lowercased email. Checked before every send, independent of
    // the user's prefs row.
    const digestSuppressionTable = new Table(this, 'DigestSuppressionTable', {
      partitionKey: { name: 'email', type: AttributeType.STRING },
      billingMode: BillingMode.PAY_PER_REQUEST,
    });

    this.digestSuppressionTable = digestSuppressionTable;

    // State-specific overlays on federal NOFOs. One row per (nofo, state): a state admin
    // attaches guidance shown only to their state's users, without mutating the shared
    // federal record. See nofo-state-overlay Lambda and the merge in retrieveNOFOSummary.
    const nofoStateOverlayTable = new Table(this, 'NOFOStateOverlayTable', {
      partitionKey: { name: 'nofo_name', type: AttributeType.STRING },
      sortKey: { name: 'state', type: AttributeType.STRING },
      billingMode: BillingMode.PAY_PER_REQUEST,
    });

    this.nofoStateOverlayTable = nofoStateOverlayTable;

    // Single-table store for the analytics dashboard: user profile rows and append-only usage
    // events share one table (pk/sk). Profile rows (sk=PROFILE) never expire; event rows
    // (sk=EVT#...) set `ttl` and self-delete. The sparse EventDayIndex holds only event rows
    // (only they carry event_day/event_sk), so the dashboard can query "events on day D" without
    // scanning. See lib/chatbot-api/functions/shared/analytics.mjs for the row shape.
    const analyticsTable = new Table(this, 'AnalyticsTable', {
      partitionKey: { name: 'pk', type: AttributeType.STRING },
      sortKey: { name: 'sk', type: AttributeType.STRING },
      billingMode: BillingMode.PAY_PER_REQUEST,
      timeToLiveAttribute: 'ttl',
    });

    analyticsTable.addGlobalSecondaryIndex({
      indexName: 'EventDayIndex',
      partitionKey: { name: 'event_day', type: AttributeType.STRING },
      sortKey: { name: 'event_sk', type: AttributeType.STRING },
      projectionType: ProjectionType.ALL,
    });

    this.analyticsTable = analyticsTable;
  }
}
