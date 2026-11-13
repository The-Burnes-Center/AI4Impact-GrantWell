// Every field a section writer reads must be forwarded by the Map's ItemSelector, or it silently arrives undefined.
import * as fs from "node:fs";
import * as path from "node:path";
import { describe, expect, it } from "vitest";
import { ENVS, outDir } from "../scripts/synth-ci.mjs";

function stateMachineDefinitions(env: string): string[] {
  const dir = outDir(env);
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".template.json"))
    .flatMap((f) => Object.values<any>(JSON.parse(fs.readFileSync(path.join(dir, f), "utf8")).Resources ?? {}))
    .filter((r) => r.Type === "AWS::StepFunctions::StateMachine")
    .map((r) => {
      const def = r.Properties.DefinitionString;
      if (typeof def === "string") return def;
      return (def["Fn::Join"][1] as unknown[]).map((p) => (typeof p === "string" ? p : "<ref>")).join("");
    });
}

describe.each(Object.keys(ENVS))("draft generation state machine (%s)", (env) => {
  it("hands each section writer the answers, additional information and what it needs to search, but no passages", () => {
    const def = stateMachineDefinitions(env).find((d) => d.includes('"GenerateAllSections"'));
    expect(def).toBeDefined();
    const selector = JSON.parse(def!.replace(/<ref>/g, "x")).States.GenerateAllSections.ItemSelector;
    expect(selector).toMatchObject({
      "questionnaire.$": "$.questionnaire",
      "questionnaireAnswers.$": "$.questionnaireAnswers",
      "additionalInfo.$": "$.additionalInfo",
      "documentIdentifier.$": "$.documentIdentifier",
      "userId.$": "$.userId",
      "userState.$": "$.userState",
    });
    expect(selector).not.toHaveProperty("grantInfos.$");
    expect(selector).not.toHaveProperty("applicantDocuments.$");
  });

  it("plans the sections before writing them, and writes summaries last", () => {
    const def = JSON.parse(stateMachineDefinitions(env).find((d) => d.includes('"GenerateAllSections"'))!.replace(/<ref>/g, "x"));
    const shape = Object.fromEntries(
      Object.entries<any>(def.States).map(([name, state]) => [
        name,
        {
          Type: state.Type,
          Next: state.Next,
          ItemsPath: state.ItemsPath,
          ResultPath: state.ResultPath,
          Payload: state.Parameters?.Payload,
          Catch: state.Catch?.map((c: any) => ({ Next: c.Next, ResultPath: c.ResultPath })),
          Items: state.ItemProcessor ? Object.keys(state.ItemProcessor.States) : undefined,
        },
      ])
    );
    expect(def.StartAt).toBe("PrepareSections");
    expect(JSON.parse(JSON.stringify(shape))).toMatchSnapshot();
    const selector = def.States.GenerateSummarySections.ItemSelector;
    expect(selector).toEqual(def.States.GenerateAllSections.ItemSelector);
    expect(selector).toMatchObject({ "outline.$": "$.outline", "sessionId.$": "$.sessionId" });
  });
});
