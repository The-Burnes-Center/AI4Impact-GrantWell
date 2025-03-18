/**
 * This Lambda function creates a new user in Cognito and assigns them the "User" role.
 * It checks if the requester is an admin before allowing the operation.
 */

import { CognitoIdentityProviderClient, AdminCreateUserCommand } from "@aws-sdk/client-cognito-identity-provider";

const client = new CognitoIdentityProviderClient();
const USER_POOL_ID = process.env.USER_POOL_ID;

export const handler = async (event) => {
  // Check if the requester is an admin
  try {
    const claims = event.requestContext.authorizer.jwt.claims;
    const roles = JSON.parse(claims['custom:role']);
    if (!roles.includes("Admin")) {
      return {
        statusCode: 403,
        headers: {
          'Access-Control-Allow-Origin': '*'
        },
        body: JSON.stringify({ 
          success: false,
          message: 'User is not authorized to perform this action' 
        }),
      };
    }
  } catch (e) {
    return {
      statusCode: 500,
      headers: {
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify({ 
        success: false,
        message: 'Unable to check user role, please ensure you have Cognito configured correctly with a custom:role attribute.' 
      }),
    };
  }

  // Parse the request body
  const body = JSON.parse(event.body);
  const { email, message } = body;

  if (!email || !email.includes('@')) {
    return {
      statusCode: 400,
      headers: {
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify({ 
        success: false,
        message: 'Invalid email address' 
      }),
    };
  }

  try {
    // Create the user in Cognito with custom message
    const command = new AdminCreateUserCommand({
      UserPoolId: USER_POOL_ID,
      Username: email,
      UserAttributes: [
        {
          Name: 'email',
          Value: email
        },
        {
          Name: 'email_verified',
          Value: 'true'
        },
        {
          Name: 'custom:role',
          Value: JSON.stringify(["User"])
        }
      ],
      DesiredDeliveryMediums: ['EMAIL'],
      MessageAction: 'SUPPRESS' // Use this if you want to completely customize the message
    });

    // If a custom message was provided, add it to the command
    if (message) {
      command.input.EmailMessage = message;
    } else {
      command.input.EmailMessage = `
Hello,

You have been invited to join GrantWell, an AI tool to help Massachusetts communities secure federal grants.

Your username is: {username}
Your temporary password is: {####}

Please use these credentials to sign in at: https://d1rj02c84jtl1i.cloudfront.net/

You will be prompted to change your password on first login.

Thank you,
The GrantWell Team
      `;
    }

    const response = await client.send(command);

    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify({ 
        success: true,
        message: 'User created successfully',
        user: {
          username: response.User.Username,
          email: email,
          created: response.User.UserCreateDate
        }
      }),
    };
  } catch (error) {
    console.error('Error creating user:', error);
    
    let errorMessage = 'Failed to create user';
    if (error.name === 'UsernameExistsException') {
      errorMessage = 'A user with this email already exists';
    } else if (error.name === 'InvalidParameterException' && error.message.includes('EmailMessage')) {
      errorMessage = 'Invalid email message format';
    }
    
    return {
      statusCode: error.name === 'UsernameExistsException' ? 400 : 500,
      headers: {
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify({ 
        success: false,
        message: errorMessage,
        error: error.name
      }),
    };
  }
}; 