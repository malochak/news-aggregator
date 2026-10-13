import { generateText, Output, type LanguageModel } from "ai";
import { z } from "zod";
import type { MediaType } from "@/db/schema";

const schema = z.object({
  bullets: z
    .array(z.string())
    .min(1)
    .max(5)
    .describe("3-5 short bullet points, each one plain sentence of at most ~25 words"),
});

const INSTRUCTIONS = `You summarize content for a personal reading list.
Return 3-5 bullet points in English, whatever the language of the source.
Each bullet is one concrete takeaway: a fact, claim, number, argument or conclusion.
No filler such as "The article discusses". No markdown, no leading dashes.
If the text is only a teaser or description, summarize what the piece promises to cover.
Respond with JSON only, shaped like {"bullets": ["first point", "second point", "third point"]}.`;

export const MAX_INPUT_CHARS = 24_000;

export async function summarize(
  model: LanguageModel,
  input: { title: string; mediaType: MediaType; source?: string | null; text: string },
): Promise<string[]> {
  const kind = { article: "article", video: "video", audio: "podcast episode", post: "post" }[input.mediaType];
  const { output } = await generateText({
    model,
    instructions: INSTRUCTIONS,
    output: Output.object({ schema }),
    prompt: [
      `Type: ${kind}`,
      input.source ? `Source: ${input.source}` : null,
      `Title: ${input.title}`,
      "",
      input.text.slice(0, MAX_INPUT_CHARS),
    ]
      .filter((l) => l !== null)
      .join("\n"),
    maxRetries: 1,
    abortSignal: AbortSignal.timeout(60_000),
  });
  return output.bullets.map((b) => b.replace(/^[-•*\s]+/, "").trim()).filter(Boolean);
}
