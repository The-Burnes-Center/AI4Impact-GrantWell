/**
 * This file defines a construct for creating an HTTP API using AWS API Gateway v2.
 * The API is configured with CORS settings to allow cross-origin requests.
 * This construct can be used to define RESTful endpoints for the backend.
 */

import * as logs from "aws-cdk-lib/aws-logs";
import { Construct } from "constructs";
import { Duration, aws_apigatewayv2 as apigwv2 } from "aws-cdk-lib";
import type { Throttle } from "../../config/instance-config";

export class RestBackendAPI extends Construct {
  public readonly restAPI: apigwv2.HttpApi;

  constructor(scope: Construct, id: string, props: { throttle: Throttle; allowedOrigins: string[] }) {
    super(scope, id);

    // Create an HTTP API with CORS configuration
    const httpApi = new apigwv2.HttpApi(this, 'HTTP-API', {
      corsPreflight: {
        allowHeaders: ['*'],
        allowMethods: [
          apigwv2.CorsHttpMethod.GET,
          apigwv2.CorsHttpMethod.HEAD,
          apigwv2.CorsHttpMethod.OPTIONS,
          apigwv2.CorsHttpMethod.POST,
          apigwv2.CorsHttpMethod.PUT,
          apigwv2.CorsHttpMethod.PATCH,
          apigwv2.CorsHttpMethod.DELETE,
        ],
        allowOrigins: props.allowedOrigins,
        maxAge: Duration.days(10),
      },
    });

    const accessLogs = new logs.LogGroup(this, "HttpApiAccessLogs", { retention: logs.RetentionDays.THREE_MONTHS });
    // HttpApi takes no throttle or access log setting for the stage it creates itself.
    (httpApi.defaultStage!.node.defaultChild as apigwv2.CfnStage).accessLogSettings = {
      destinationArn: accessLogs.logGroupArn,
      format: JSON.stringify({
        requestId: "$context.requestId",
        time: "$context.requestTime",
        ip: "$context.identity.sourceIp",
        user: "$context.authorizer.claims.sub",
        route: "$context.routeKey",
        status: "$context.status",
        latencyMs: "$context.responseLatency",
        integrationError: "$context.integrationErrorMessage",
      }),
    };
    (httpApi.defaultStage!.node.defaultChild as apigwv2.CfnStage).defaultRouteSettings = {
      throttlingRateLimit: props.throttle.rateLimit,
      throttlingBurstLimit: props.throttle.burstLimit,
    };

    // Assign the created HTTP API to the restAPI property
    this.restAPI = httpApi;
  }
}
