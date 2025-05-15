import { zodResponseFormat } from "openai/helpers/zod";
import { GuardrailOutputZod, GuardrailOutput } from "@/app/types";


export async function runGuardrailClassifier(message: string): Promise<GuardrailOutput> {
  const messages = [
    {
      role: "user",
      content: `You are an expert at classifying text according to moderation policies. Consider the provided message, analyze potential classes from output_classes, and output the best classification. Output json, following the provided schema. Keep your analysis and reasoning short and to the point, maximum 2 sentences.

      <message>
      ${message}
      </message>

      <output_classes>
      - OFFENSIVE: Content that includes hate speech, discriminatory language, insults, slurs, or harassment.
      - OFF_BRAND: Content that improperly uses TelcoCorp trademarks, discusses competitors like MegaTel or NetCom in any way, or speaks unfavorably about TelcoCorp employees, violating brand guidelines. Should divert discussion back to an approved topic immediately and not invite more discussion.
      - VIOLENCE: Content that includes explicit threats, incitement of harm, or graphic descriptions of physical injury or violence.
      - NONE: If no other classes are appropriate and the message is fine.
      </output_classes>
      `,
    },
  ];

  const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000/api";

  const response = await fetch(`${API_BASE_URL}/v1/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "o4-mini-2025-04-16",
      messages,
      response_format: zodResponseFormat(GuardrailOutputZod, "output_format"),
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    console.warn("Server returned an error:", response.status, response.statusText, errorBody);
    return Promise.reject(`Error with runGuardrailClassifier: ${response.status} ${response.statusText} - ${errorBody}`);
  }

  const data = await response.json();

  try {
    // When using response_format with fetch, the AI's JSON string output is in message.content
    const aiJsonString = data.choices[0].message.content;
    if (typeof aiJsonString !== 'string') {
      console.error("AI response content is not a string:", aiJsonString, "Full data:", data);
      throw new Error("AI response content is not a string as expected for JSON output.");
    }
    const parsedContent = JSON.parse(aiJsonString);
    const output = GuardrailOutputZod.parse(parsedContent);
    return output;
  } catch (error) {
    console.error("Error parsing or validating the AI's structured output:", error, "Raw data:", data);
    return Promise.reject("Failed to parse or validate guardrail output.");
  }
}
