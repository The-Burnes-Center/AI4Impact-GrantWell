/**
 * This file defines a construct for creating a WebSocket API using AWS API Gateway v2.
 * The WebSocket API is configured with a production stage that auto-deploys changes.
 * This construct can be used to define WebSocket endpoints for real-time communication in the backend.
 */

import { aws_apigatewayv2 as apigwv2 } from "aws-cdk-lib";
import { Construct } from "constructs";

export class WebsocketBackendAPI extends Construct {
  public readonly wsAPI: apigwv2.WebSocketApi;
  public readonly wsAPIStage: apigwv2.WebSocketStage;

  constructor(scope: Construct, id: string) {
    super(scope, id);

    // Create the WebSocket API
    const webSocketApi = new apigwv2.WebSocketApi(this, 'WS-API');

    // Create the WebSocket API stage with auto-deploy enabled
    const webSocketApiStage = new apigwv2.WebSocketStage(this, 'WS-API-prod', {
      webSocketApi,
      stageName: 'prod',
      autoDeploy: true,
    });

    // Assign the created WebSocket API and stage to the class properties
    this.wsAPI = webSocketApi;
    this.wsAPIStage = webSocketApiStage;
  }
}
