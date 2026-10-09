import { readFileSync } from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const aws = vi.hoisted(() => {
  class Command {
    constructor(public input: any) {}
  }
  const command = (name: string) => ({ [name]: class extends Command {} })[name];
  const client = (send: (cmd: any) => unknown) =>
    class {
      send = send;
    };
  return { command, client, logs: vi.fn(), cloudwatch: vi.fn() };
});

vi.mock("@aws-sdk/client-cloudwatch-logs", () => ({
  CloudWatchLogsClient: aws.client(async (cmd: any) => aws.logs(cmd.constructor.name, cmd.input)),
  DescribeLogGroupsCommand: aws.command("DescribeLogGroupsCommand"),
  StartQueryCommand: aws.command("StartQueryCommand"),
  GetQueryResultsCommand: aws.command("GetQueryResultsCommand"),
  StopQueryCommand: aws.command("StopQueryCommand"),
}));
vi.mock("@aws-sdk/client-cloudwatch", () => ({
  CloudWatchClient: aws.client(async (cmd: any) => aws.cloudwatch(cmd.constructor.name, cmd.input)),
  PutMetricDataCommand: aws.command("PutMetricDataCommand"),
}));

const handlerPath = path.join(__dirname, "../lib/monitoring/functions/init-error-scan/index.mjs");
const scanModule = await import(handlerPath);
const { QUERY, batches, describe: describeLine, functionNameOf, queryWindow, runQuery, scan, summarize, WINDOW_MINUTES } = scanModule;

const row = (log: string, message: string) => [
  { field: "@timestamp", value: "2026-10-09 12:00:00.000" },
  { field: "@log", value: `123456789012:/aws/lambda/${log}` },
  { field: "@message", value: message },
];

const NODE_IMPORT_ERROR =
  '2026-10-09T12:00:00.000Z\tundefined\tERROR\tUncaught Exception \t{"errorType":"Runtime.ImportModuleError","errorMessage":"Error: Cannot find module \'grantwell-shared\'\\nRequire stack:\\n- /var/task/index.mjs","stack":["Runtime.ImportModuleError: Error: Cannot find module"]}';
const NODE_SYNTAX_ERROR =
  '2026-10-09T12:00:00.000Z\tundefined\tERROR\tUncaught Exception \t{"errorType":"Runtime.UserCodeSyntaxError","errorMessage":"SyntaxError: Unexpected token \'export\'","stack":[]}';
const PYTHON_IMPORT_ERROR =
  "[ERROR] Runtime.ImportModuleError: Unable to import module 'handler': No module named 'pydantic'\nTraceback (most recent call last):";
const INIT_REPORT =
  "INIT_REPORT Init Duration: 412.03 ms\tPhase: init\tStatus: error\tError Type: Runtime.ImportModuleError";
const INIT_REPORT_NO_TYPE = "INIT_REPORT Init Duration: 10002.11 ms\tPhase: invoke\tStatus: error";

describe("init-error scan: matching", () => {
  // Insights `like /regex/` uses the same syntax as a JS regex for this pattern.
  const pattern = new RegExp(QUERY.match(/like \/(.+)\//)![1]);

  it.each([
    ["Node import error", NODE_IMPORT_ERROR],
    ["Node syntax error", NODE_SYNTAX_ERROR],
    ["Python import error", PYTHON_IMPORT_ERROR],
    ["INIT_REPORT with an error type", INIT_REPORT],
    ["INIT_REPORT without one", INIT_REPORT_NO_TYPE],
    ["Init Error", "Init Error: something went wrong"],
  ])("matches a %s", (_, line) => {
    expect(pattern.test(line)).toBe(true);
  });

  it.each([
    "INIT_REPORT Init Duration: 120.1 ms\tPhase: init\tStatus: success",
    "START RequestId: abc Version: $LATEST",
    "Error processing record: timeout",
  ])("ignores %s", (line) => {
    expect(pattern.test(line)).toBe(false);
  });

  it("looks back past the 15-minute schedule so runs overlap", () => {
    expect(WINDOW_MINUTES).toBeGreaterThan(15);
    expect(queryWindow(1_700_000_000_500)).toEqual({ endTime: 1_700_000_000, startTime: 1_700_000_000 - WINDOW_MINUTES * 60 });
  });

  it("splits log groups into queries of at most 50", () => {
    const groups = Array.from({ length: 101 }, (_, i) => `g${i}`);
    expect(batches(groups).map((b: string[]) => b.length)).toEqual([50, 50, 1]);
    expect(batches([])).toEqual([]);
  });
});

describe("init-error scan: parsing", () => {
  it("takes the function name from @log", () => {
    expect(functionNameOf("123456789012:/aws/lambda/grantwell-staging-ChatHandler-abc")).toBe("grantwell-staging-ChatHandler-abc");
  });

  it("reads the error type and first message line from each runtime's format", () => {
    expect(describeLine(NODE_IMPORT_ERROR)).toMatchObject({
      errorType: "Runtime.ImportModuleError",
      message: "Error: Cannot find module 'grantwell-shared'",
      isReport: false,
    });
    expect(describeLine(PYTHON_IMPORT_ERROR)).toMatchObject({
      errorType: "Runtime.ImportModuleError",
      message: "Runtime.ImportModuleError: Unable to import module 'handler': No module named 'pydantic'",
    });
    expect(describeLine(INIT_REPORT)).toMatchObject({ errorType: "Runtime.ImportModuleError", isReport: true });
    expect(describeLine(INIT_REPORT_NO_TYPE).errorType).toBe("unknown");
  });

  it("caps the message at one short line", () => {
    const long = `{"errorType":"Runtime.UserCodeSyntaxError","errorMessage":"${"x".repeat(1000)}"}`;
    expect(describeLine(long).message).toHaveLength(300);
  });

  it("reports one entry per function, preferring the runtime's own error over INIT_REPORT", () => {
    const affected = summarize([
      row("fn-b", INIT_REPORT),
      row("fn-b", NODE_IMPORT_ERROR),
      row("fn-b", INIT_REPORT_NO_TYPE),
      row("fn-a", PYTHON_IMPORT_ERROR),
    ]);
    expect(affected).toEqual([
      { functionName: "fn-a", errorType: "Runtime.ImportModuleError", message: expect.stringContaining("pydantic"), count: 1 },
      { functionName: "fn-b", errorType: "Runtime.ImportModuleError", message: "Error: Cannot find module 'grantwell-shared'", count: 3 },
    ]);
  });
});

describe("init-error scan: run", () => {
  const env = {
    LOG_GROUP_PREFIX: "/aws/lambda/grantwell-staging-",
    EXCLUDE_LOG_GROUP: "/aws/lambda/grantwell-staging-self",
    METRIC_NAMESPACE: "grantwell-generic-prod",
    METRIC_NAME: "LambdaInitErrors",
  };
  const logs = { send: (cmd: any) => aws.logs(cmd.constructor.name, cmd.input) };
  const cloudwatch = { send: (cmd: any) => aws.cloudwatch(cmd.constructor.name, cmd.input) };
  const groupNames = [env.EXCLUDE_LOG_GROUP, ...Array.from({ length: 60 }, (_, i) => `/aws/lambda/grantwell-staging-fn${i}`)];

  beforeEach(() => {
    aws.logs.mockReset();
    aws.cloudwatch.mockReset().mockResolvedValue({});
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  function fakeLogs(rowsByQuery: unknown[][]) {
    let started = 0;
    aws.logs.mockImplementation(async (name: string, input: any) => {
      if (name === "DescribeLogGroupsCommand") {
        const page = input.nextToken ? groupNames.slice(50) : groupNames.slice(0, 50);
        return { logGroups: page.map((logGroupName) => ({ logGroupName })), nextToken: input.nextToken ? undefined : "page2" };
      }
      if (name === "StartQueryCommand") return { queryId: `q${started++}` };
      if (name === "GetQueryResultsCommand") return { status: "Complete", results: rowsByQuery[Number(input.queryId.slice(1))] };
      throw new Error(`unexpected ${name}`);
    });
  }

  it("pages through every log group, skips its own, batches queries and publishes the count", async () => {
    fakeLogs([[row("grantwell-staging-fn3", NODE_SYNTAX_ERROR)], [row("grantwell-staging-fn55", INIT_REPORT)]]);
    const summary = await scan({ logs, cloudwatch, env, nowMs: Date.UTC(2026, 9, 9, 12, 0, 0), queryOptions: { pollMs: 0 } });

    const prefixes = aws.logs.mock.calls.filter(([n]) => n === "DescribeLogGroupsCommand").map(([, i]) => i.logGroupNamePrefix);
    expect(prefixes).toEqual([env.LOG_GROUP_PREFIX, env.LOG_GROUP_PREFIX]);
    const queried = aws.logs.mock.calls.filter(([n]) => n === "StartQueryCommand").map(([, i]) => i.logGroupNames);
    expect(queried.map((q) => q.length)).toEqual([50, 10]);
    expect(queried.flat()).not.toContain(env.EXCLUDE_LOG_GROUP);

    expect(aws.cloudwatch).toHaveBeenCalledWith("PutMetricDataCommand", {
      Namespace: env.METRIC_NAMESPACE,
      MetricData: [expect.objectContaining({ MetricName: "LambdaInitErrors", Value: 2, Unit: "Count" })],
    });
    expect(summary.affected.map((a: any) => a.functionName)).toEqual(["grantwell-staging-fn3", "grantwell-staging-fn55"]);
    expect(console.error).toHaveBeenCalledWith(expect.stringMatching(/^Lambda init error in grantwell-staging-fn3: Runtime.UserCodeSyntaxError: /));
  });

  it("publishes zero when nothing failed, so the heartbeat sees every run", async () => {
    fakeLogs([[], []]);
    await scan({ logs, cloudwatch, env, nowMs: Date.now(), queryOptions: { pollMs: 0 } });
    expect(aws.cloudwatch.mock.calls[0][1].MetricData[0].Value).toBe(0);
    expect(console.error).not.toHaveBeenCalled();
  });

  it("fails without publishing when a query fails, so the heartbeat notices", async () => {
    fakeLogs([]);
    aws.logs.mockImplementation(async (name: string) => {
      if (name === "DescribeLogGroupsCommand") return { logGroups: [{ logGroupName: "/aws/lambda/grantwell-staging-a" }] };
      if (name === "StartQueryCommand") return { queryId: "q0" };
      return { status: "Failed" };
    });
    await expect(scan({ logs, cloudwatch, env, nowMs: Date.now(), queryOptions: { pollMs: 0 } })).rejects.toThrow(/status Failed/);
    expect(aws.cloudwatch).not.toHaveBeenCalled();
  });

  it("stops a query that runs past its deadline", async () => {
    aws.logs.mockImplementation(async (name: string) => {
      if (name === "StartQueryCommand") return { queryId: "slow" };
      if (name === "GetQueryResultsCommand") return { status: "Running" };
      return {};
    });
    await expect(runQuery(logs, ["g"], queryWindow(Date.now()), { pollMs: 0, deadlineMs: 0 })).rejects.toThrow(/did not finish/);
    expect(aws.logs).toHaveBeenCalledWith("StopQueryCommand", { queryId: "slow" });
  });
});

// Verified against @aws-sdk/client-cloudwatch-logs and client-cloudwatch 3.1105.0, the SDK the nodejs24.x runtime ships.
const RUNTIME_SDK_3_1105_0: Record<string, string[]> = {
  "@aws-sdk/client-cloudwatch-logs": [
    "CloudWatchLogsClient",
    "DescribeLogGroupsCommand",
    "GetQueryResultsCommand",
    "StartQueryCommand",
    "StopQueryCommand",
  ],
  "@aws-sdk/client-cloudwatch": ["CloudWatchClient", "PutMetricDataCommand"],
};

it("imports only names the runtime's SDK 3.1105.0 has", () => {
  const source = readFileSync(handlerPath, "utf8");
  const imports = [...source.matchAll(/import\s*\{([^}]*)\}\s*from\s*"(@aws-sdk\/[^"]+)"/g)];
  expect(imports.map(([, , pkg]) => pkg).sort()).toEqual(Object.keys(RUNTIME_SDK_3_1105_0).sort());
  for (const [, names, pkg] of imports) {
    for (const name of names.split(",").map((n) => n.trim()).filter(Boolean)) {
      expect(RUNTIME_SDK_3_1105_0[pkg], `${pkg} ${name}`).toContain(name);
    }
  }
});
