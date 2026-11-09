import type { Template } from "../domain/schemas";

function blocks(guidance: [string, string, string, string, string]): Template["blocks"] {
  const [opening, context, body, ownValue, closing] = guidance;
  return [
    { id: "opening", title: "Opening", guidance: opening },
    { id: "context", title: "Context", guidance: context },
    { id: "body", title: "Body", guidance: body },
    { id: "own-value", title: "Own value", guidance: ownValue },
    { id: "closing", title: "Closing", guidance: closing },
  ];
}

export const DEFAULT_TEMPLATES: Template[] = [
  {
    id: "news",
    name: "News",
    blocks: blocks([
      "Hook with the main story.",
      "Explain why it matters.",
      "Cover 3 to 5 stories, each with an opinion.",
      "Explain what it means for people running local AI.",
      "Recap and close with a call to action.",
    ]),
  },
  {
    id: "comparison",
    name: "Comparison",
    blocks: blocks([
      "Pose the question: which one is worth it?",
      "Introduce the contenders and the criteria.",
      "Run one round per criterion.",
      "Give a verdict per use case.",
      "Name the winner and give a recommendation.",
    ]),
  },
  {
    id: "model-test",
    name: "Model test",
    blocks: blocks([
      "Set the model's promise against the doubt.",
      "Say what it is, its license, and its requirements.",
      "Walk through the tests with their results.",
      "Cover the good, the bad, and the odd.",
      "Answer whether it is worth installing.",
    ]),
  },
];
