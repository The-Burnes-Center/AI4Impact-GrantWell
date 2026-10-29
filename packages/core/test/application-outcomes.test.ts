// Application outcomes ship on every deployment: their own backed-up table, five JWT-guarded routes,
// and the user-management function's right to de-identify rows when an account is deleted.
import { describe, expect, it } from "vitest";
import { ENVS, outDir } from "../scripts/synth-ci.mjs";
import { resourcesIn, type Resource } from "./variant-synth";

const ROUTES = [
  "GET /application-outcomes",
  "GET /application-outcomes/due",
  "POST /application-outcomes/snooze",
  "PUT /application-outcomes/{sessionId}",
  "GET /admin/application-outcomes",
];

const ofType = (all: Record<string, Resource>, type: string) => Object.entries(all).filter(([, r]) => r.Type === type);
const fn = (all: Record<string, Resource>, prefix: string) =>
  ofType(all, "AWS::Lambda::Function").find(([id]) => id.startsWith(prefix))![1];
const statementsOf = (all: Record<string, Resource>, f: Resource) => {
  const roleRef = f.Properties.Role["Fn::GetAtt"][0];
  return ofType(all, "AWS::IAM::Policy")
    .filter(([, p]) => p.Properties.Roles.some((r: any) => r.Ref === roleRef))
    .flatMap(([, p]) => p.Properties.PolicyDocument.Statement as any[]);
};

for (const env of Object.keys(ENVS) as (keyof typeof ENVS)[]) {
  describe(env, () => {
    const all = () => resourcesIn(outDir(env));

    it("keeps outcomes in a backed-up table no deploy can delete", () => {
      const [id, table] = ofType(all(), "AWS::DynamoDB::Table").find(([id]) => id.startsWith("ApplicationOutcomeTable"))!;
      expect(id).toBeDefined();
      expect(table.Properties).toMatchObject({
        KeySchema: [
          { AttributeName: "user_id", KeyType: "HASH" },
          { AttributeName: "session_id", KeyType: "RANGE" },
        ],
        BillingMode: "PAY_PER_REQUEST",
        DeletionProtectionEnabled: true,
        PointInTimeRecoverySpecification: { PointInTimeRecoveryEnabled: true },
      });
      expect((table as any).DeletionPolicy).toBe("Retain");
    });

    it("routes every outcome path through the JWT authorizer", () => {
      const routes = ofType(all(), "AWS::ApiGatewayV2::Route").map(([, r]) => r.Properties);
      for (const key of ROUTES) {
        const route = routes.find((r) => r.RouteKey === key);
        expect(route, key).toBeDefined();
        expect(route!.AuthorizationType).toBe("JWT");
      }
    });

    it("lets account deletion re-key outcome rows", () => {
      const resources = all();
      const users = fn(resources, "ChatbotAPIManageUsersFunction");
      expect(users.Properties.Environment.Variables).toHaveProperty("OUTCOME_TABLE_NAME");
      const actions = statementsOf(resources, users).flatMap((s) => [s.Action].flat());
      for (const a of ["dynamodb:Query", "dynamodb:PutItem", "dynamodb:DeleteItem", "dynamodb:BatchWriteItem"]) {
        expect(actions).toContain(a);
      }
    });
  });
}
