/**
 * This Lambda function lists all users from the Cognito user pool.
 * It checks if the requester is an admin before allowing the operation.
 */

const {
  CognitoIdentityProviderClient,
  ListUsersCommand,
} = require("@aws-sdk/client-cognito-identity-provider");

const client = new CognitoIdentityProviderClient();
const USER_POOL_ID = process.env.USER_POOL_ID;

exports.handler = async (event) => {
  console.log("Received event:", JSON.stringify(event, null, 2));

  // Check if the requester is an admin
  try {
    const claims = event.requestContext.authorizer.jwt.claims;
    const roles = JSON.parse(claims["custom:role"]);
    if (!roles.includes("Admin")) {
      return {
        statusCode: 403,
        headers: {
          "Access-Control-Allow-Origin": "*",
        },
        body: JSON.stringify({
          success: false,
          message: "User is not authorized to perform this action",
        }),
      };
    }
  } catch (e) {
    console.error("Error checking authorization:", e);
    return {
      statusCode: 500,
      headers: {
        "Access-Control-Allow-Origin": "*",
      },
      body: JSON.stringify({
        success: false,
        message:
          "Unable to check user role, please ensure you have Cognito configured correctly with a custom:role attribute.",
      }),
    };
  }

  try {
    console.log("Listing users from Cognito user pool:", USER_POOL_ID);

    // List users from Cognito
    const command = new ListUsersCommand({
      UserPoolId: USER_POOL_ID,
      Limit: 60, // Adjust as needed
    });

    const response = await client.send(command);
    console.log(`Found ${response.Users.length} users`);

    // Format the response to match the expected structure
    const formattedUsers = response.Users.map((user) => {
      // Extract attributes
      const attributes = {};
      user.Attributes.forEach((attr) => {
        attributes[attr.Name] = attr.Value;
      });

      // Get role and format if available
      let role = "User";
      if (attributes["custom:role"]) {
        try {
          const roles = JSON.parse(attributes["custom:role"]);
          role = roles.join(", ");
        } catch (e) {
          // If parsing fails, use the raw value
          role = attributes["custom:role"];
        }
      }

      // Calculate last active time in a human-readable format
      const lastModified = user.UserLastModifiedDate;
      const now = new Date();
      const diffMs = now - lastModified;
      const diffMins = Math.floor(diffMs / 60000);
      const diffHours = Math.floor(diffMins / 60);
      const diffDays = Math.floor(diffHours / 24);

      let lastActive;
      if (diffMins < 60) {
        lastActive = diffMins <= 5 ? "Just now" : `${diffMins} minutes ago`;
      } else if (diffHours < 24) {
        lastActive = `${diffHours} hours ago`;
      } else {
        lastActive = `${diffDays} days ago`;
      }

      return {
        id: user.Username,
        name: attributes["name"] || attributes["email"] || user.Username,
        email: attributes["email"] || "",
        role: role,
        lastActive: lastActive,
        enabled: user.Enabled,
        created: user.UserCreateDate,
        status: user.UserStatus,
      };
    });

    return {
      statusCode: 200,
      headers: {
        "Access-Control-Allow-Origin": "*",
      },
      body: JSON.stringify({
        success: true,
        users: formattedUsers,
      }),
    };
  } catch (error) {
    console.error("Error listing users:", error);

    return {
      statusCode: 500,
      headers: {
        "Access-Control-Allow-Origin": "*",
      },
      body: JSON.stringify({
        success: false,
        message: "Failed to list users",
        error: error.name,
      }),
    };
  }
};
