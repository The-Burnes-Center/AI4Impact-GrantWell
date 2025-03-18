/**
 * This file defines a construct for creating an HTTP API using AWS API Gateway v2.
 * The API is configured with CORS settings to allow cross-origin requests.
 * This construct can be used to define RESTful endpoints for the backend.
 */

import { Construct } from "constructs";
import { Duration, aws_apigatewayv2 as apigwv2 } from "aws-cdk-lib";

export interface RestBackendAPIProps {
  // Define any properties needed for the RestBackendAPI construct here
}

export class RestBackendAPI extends Construct {
  public readonly restAPI: apigwv2.HttpApi;

  constructor(scope: Construct, id: string, props: RestBackendAPIProps) {
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
          apigwv2.CorsHttpMethod.DELETE,
        ],
        allowOrigins: ['*'],
        maxAge: Duration.days(10),
      },
    });

    // Assign the created HTTP API to the restAPI property
    this.restAPI = httpApi;
  }
}
