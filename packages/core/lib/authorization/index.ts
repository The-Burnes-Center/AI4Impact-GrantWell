import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { cognitoDomainName, emailConfig, MFA_REQUIRED, stackName } from '../constants';
import { UserPool, UserPoolClient, FeaturePlan} from 'aws-cdk-lib/aws-cognito';
import * as cognito from "aws-cdk-lib/aws-cognito";
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as ses from 'aws-cdk-lib/aws-ses';
import * as path from 'path';
import { SUPPORTED_STATES } from '../shared/states';
import { genericBrandingData } from '../shared/generic-branding';

const SUPPORTED_STATES_ENV: string = JSON.stringify(
  SUPPORTED_STATES.map((s) => ({ code: s.code, name: s.name }))
);

const verificationSender =
  process.env.NOTIFICATION_SENDER || genericBrandingData.senderEmail;
const verificationSenderDomain =
  verificationSender.split('@')[1] || genericBrandingData.senderEmail.split('@')[1];

export interface AuthorizationStackProps {
  readonly turnstileSecretKey: string;
}

export class AuthorizationStack extends Construct {
  public readonly lambdaAuthorizer: lambda.Function;
  public readonly userPool: UserPool;
  public readonly userPoolClient: UserPoolClient;

  constructor(scope: Construct, id: string, props: AuthorizationStackProps) {
    super(scope, id);

    // Suppression stays off: one bounce would suppress the address and lock the user out of password reset.
    const authEmailConfigurationSet = new ses.ConfigurationSet(this, 'AuthEmailConfigurationSet', {
      configurationSetName: `${process.env.ENVIRONMENT || stackName}-auth`,
      disableSuppressionList: true,
      reputationMetrics: true,
    });

    authEmailConfigurationSet.addEventDestination('CloudWatchMetrics', {
      destination: ses.EventDestination.cloudWatchDimensions([
        {
          source: ses.CloudWatchDimensionSource.MESSAGE_TAG,
          name: 'ses:configuration-set',
          defaultValue: `${process.env.ENVIRONMENT || stackName}-auth`,
        },
      ]),
      events: [
        ses.EmailSendingEvent.SEND,
        ses.EmailSendingEvent.DELIVERY,
        ses.EmailSendingEvent.BOUNCE,
        ses.EmailSendingEvent.COMPLAINT,
        ses.EmailSendingEvent.REJECT,
      ],
    });

    // withSES rejects an unresolved region, and the stack is environment-agnostic without an instance config.
    const stackRegion = cdk.Stack.of(this).region;
    const sesRegion = cdk.Token.isUnresolved(stackRegion)
      ? process.env.CDK_DEFAULT_REGION || process.env.AWS_REGION || 'us-east-1'
      : stackRegion;

    const userPool = new UserPool(this, 'UserPool', {
      removalPolicy: cdk.RemovalPolicy.RETAIN,
      selfSignUpEnabled: true,
      mfa: MFA_REQUIRED ? cognito.Mfa.REQUIRED : cognito.Mfa.OPTIONAL,
      // No phone number is collected, so SMS would leave MFA unenrollable.
      mfaSecondFactor: { sms: false, otp: true },
      featurePlan: FeaturePlan.PLUS,
      autoVerify: { email: true },
      signInAliases: {
        email: true,
      },
      customAttributes: {
        'role': new cognito.StringAttribute({ minLen: 0, maxLen: 30, mutable: true }),
        'state': new cognito.StringAttribute({ minLen: 0, maxLen: 50, mutable: true })
      },
      userInvitation: {
        emailSubject: 'Your GrantWell account is ready',
        emailBody:
          'Hello,<br><br>' +
          'An account has been created for you on GrantWell.<br><br>' +
          '<strong>Sign in:</strong> <a href="' + emailConfig.deploymentUrl + '/">' + emailConfig.deploymentUrl + '</a><br>' +
          '<strong>Username:</strong> {username}<br>' +
          '<strong>Temporary password:</strong> {####}<br><br>' +
          'You will be asked to choose your own password the first time you sign in. The temporary password above can only be used once.<br><br>' +
          'If you were not expecting this invitation, you can ignore this email.<br><br>' +
          'The GrantWell Team'
      },
      // Cognito uses this one template for both signup verification and password reset.
      userVerification: {
        emailSubject: 'Your GrantWell verification code',
        emailBody:
          'Hello,<br><br>' +
          'Your GrantWell verification code is <strong>{####}</strong><br><br>' +
          'Enter this code in GrantWell to confirm it was you. The code is single-use and expires shortly.<br><br>' +
          'If you did not ask for this code, you can ignore this email. Nothing changes on your account unless the code is entered.<br><br>' +
          'The GrantWell Team'
      },
      email: cognito.UserPoolEmail.withSES({
        fromEmail: verificationSender,
        fromName: 'GrantWell',
        replyTo: genericBrandingData.supportEmail,
        sesRegion,
        sesVerifiedDomain: verificationSenderDomain,
        configurationSetName: authEmailConfigurationSet.configurationSetName,
      })
    });
    // Must come after the event destination, or metrics miss the first messages.
    userPool.node.addDependency(authEmailConfigurationSet);
    this.userPool = userPool;

    const signupTriggerFunction = new lambda.Function(this, 'SignUpTriggerFunction', {
      runtime: lambda.Runtime.NODEJS_24_X,
      code: lambda.Code.fromAsset(path.join(__dirname, 'signup-triggers')),
      handler: 'index.handler',
      environment: {
        SUPPORTED_STATES: SUPPORTED_STATES_ENV,
        TURNSTILE_SECRET_KEY: props.turnstileSecretKey,
      },
      timeout: cdk.Duration.seconds(5),
    });

    userPool.addTrigger(cognito.UserPoolOperation.PRE_SIGN_UP, signupTriggerFunction);
    userPool.addTrigger(
      cognito.UserPoolOperation.POST_CONFIRMATION,
      signupTriggerFunction
    );
    userPool.addTrigger(
      cognito.UserPoolOperation.PRE_AUTHENTICATION,
      signupTriggerFunction
    );
    signupTriggerFunction.addToRolePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: [
          'cognito-idp:AdminUpdateUserAttributes',
          'cognito-idp:AdminUserGlobalSignOut',
        ],
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
      preventUserExistenceErrors: true,
      // AdminUserGlobalSignOut is inert unless the client has token revocation enabled.
      enableTokenRevocation: true,
      // The authorizers never check revocation, so a revoked session lives until its access token expires.
      accessTokenValidity: cdk.Duration.minutes(15),
      idTokenValidity: cdk.Duration.minutes(15),
      refreshTokenValidity: cdk.Duration.days(7),
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
