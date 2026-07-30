import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { cognitoDomainName, emailConfig } from '../constants';
import { UserPool, UserPoolClient, FeaturePlan} from 'aws-cdk-lib/aws-cognito';
import * as cognito from "aws-cdk-lib/aws-cognito";
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as path from 'path';
import { SUPPORTED_STATES } from '../shared/states';

const SUPPORTED_STATES_ENV: string = JSON.stringify(
  SUPPORTED_STATES.map((s) => ({ code: s.code, name: s.name }))
);

export class AuthorizationStack extends Construct {
  public readonly lambdaAuthorizer: lambda.Function;
  public readonly userPool: UserPool;
  public readonly userPoolClient: UserPoolClient;

  constructor(scope: Construct, id: string) {
    super(scope, id);

    const userPool = new UserPool(this, 'UserPool', {
       removalPolicy: cdk.RemovalPolicy.RETAIN,
      selfSignUpEnabled: true,
      mfa: cognito.Mfa.OPTIONAL,
      featurePlan: FeaturePlan.PLUS,
      autoVerify: { email: true, phone: true },
      signInAliases: {
        email: true,
      },
      customAttributes: {
        'role': new cognito.StringAttribute({ minLen: 0, maxLen: 30, mutable: true }),
        'state': new cognito.StringAttribute({ minLen: 0, maxLen: 50, mutable: true })
      },
      userInvitation: {
        emailSubject: 'Welcome to GrantWell!',
        emailBody:
          'Hello everyone,<br><br>' +
          'We\'re excited to share that the custom deployment link for the GrantWell tool is now live and ready for testing. All upcoming updates and improvements will be applied to this version moving forward.<br><br>' +
          'Please note that the tool is still under active development, so you may encounter occasional issues during use. Your feedback will be invaluable in helping us refine and enhance the overall experience.<br><br>' +
          '<strong>Access the Application:</strong><br>' +
          '<a href="' + emailConfig.deploymentUrl + '/">GrantWell Application</a><br><br>' +
          '<strong>Login Credentials:</strong><br>' +
          'Username: {username}<br>' +
          'Temporary Password: {####}<br><br>' +
          'Thank you all for your continued support and collaboration as we move into this next phase of testing.<br><br>' +
          'Warm regards,<br>' +
          'The GrantWell Team',
        smsMessage: 'Hello {username}, your temporary password for GrantWell is {####}'
      },
      userVerification: {
        emailSubject: 'Verify Your Account on GrantWell',
        emailBody:
          'Hello everyone,<br><br>' +
          'We are thrilled to have you join GrantWell!<br><br>' +
          'The verification code for your new account is {####}. Please enter this code on the verification page to complete the signup process.<br><br>' +
          'Thank you for choosing GrantWell!<br><br>Warm regards,<br>The GrantWell Team',
        smsMessage: 'Hello {username}, your temporary password for GrantWell is {####}'
      }
    });
    this.userPool = userPool;

    const signupTriggerFunction = new lambda.Function(this, 'SignUpTriggerFunction', {
      runtime: lambda.Runtime.NODEJS_24_X,
      code: lambda.Code.fromAsset(path.join(__dirname, 'signup-triggers')),
      handler: 'index.handler',
      environment: {
        SUPPORTED_STATES: SUPPORTED_STATES_ENV,
      },
      timeout: cdk.Duration.seconds(30),
    });

    userPool.addTrigger(cognito.UserPoolOperation.PRE_SIGN_UP, signupTriggerFunction);
    userPool.addTrigger(
      cognito.UserPoolOperation.POST_CONFIRMATION,
      signupTriggerFunction
    );
    // Wildcard, not userPool.grant(): addTrigger already points the pool at this function, so
    // referencing the pool back would be a dependency cycle.
    signupTriggerFunction.addToRolePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ['cognito-idp:AdminUpdateUserAttributes'],
        resources: [
          cdk.Stack.of(this).formatArn({
            service: 'cognito-idp',
            resource: 'userpool',
            resourceName: '*',
          }),
        ],
      })
    );

    userPool.addDomain('CognitoDomain', {
      cognitoDomain: {
        domainPrefix: cognitoDomainName,
      },
    });

    const clientAttributes = new cognito.ClientAttributes()
      .withStandardAttributes({
        email: true,
        emailVerified: true,
      })
      .withCustomAttributes('role', 'state');

    const userPoolClient = new UserPoolClient(this, 'UserPoolClient', {
      userPool,
      authFlows: {
        userPassword: true,
        userSrp: true,
      },
      readAttributes: clientAttributes,
      writeAttributes: new cognito.ClientAttributes()
        .withStandardAttributes({ email: true }),
    });

    this.userPoolClient = userPoolClient;

    const authorizerHandlerFunction = new lambda.Function(this, 'AuthorizationFunction', {
      runtime: lambda.Runtime.PYTHON_3_12,
      code: lambda.Code.fromAsset(path.join(__dirname, 'websocket-api-authorizer')),
      handler: 'lambda_function.lambda_handler',
      environment: {
        "USER_POOL_ID" : userPool.userPoolId,
        "APP_CLIENT_ID" : userPoolClient.userPoolClientId
      },
      timeout: cdk.Duration.seconds(30)
    });

    this.lambdaAuthorizer = authorizerHandlerFunction;
    
    new cdk.CfnOutput(this, "UserPool ID", {
      value: userPool.userPoolId || "",
    });

    new cdk.CfnOutput(this, "UserPool Client ID", {
      value: userPoolClient.userPoolClientId || "",
    });
  }
}
