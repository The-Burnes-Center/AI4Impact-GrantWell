/** The chat's Haiku meaning check, faked: `rule` gives each sentence's verdict (all supported by default). */
export function haikuJudge(rule: (sentence: string) => string = () => "supported") {
  return (input: { body?: unknown }) => {
    const prompt = JSON.parse(String(input.body)).messages[0].content.at(-1).text as string;
    const verdicts = [...prompt.matchAll(/<sentence id="(\d+)">\n<text>([^<]*)<\/text>/g)].map((m) => ({
      id: Number(m[1]),
      verdict: rule(m[2]),
      reason: "checked",
    }));
    return {
      body: new TextEncoder().encode(
        JSON.stringify({ content: [{ type: "text", text: JSON.stringify({ verdicts }) }], stop_reason: "end_turn", usage: { input_tokens: 300, output_tokens: 40 } })
      ),
    } as any;
  };
}
