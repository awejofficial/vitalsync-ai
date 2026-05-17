import { createServerFn } from "@tanstack/react-start";
import { generateText, Output } from "ai";
import { z } from "zod";
import { createLovableAiGatewayProvider } from "./ai-gateway";

const TriageSchema = z.object({
  severity: z.enum(["CRITICAL", "URGENT", "MODERATE", "LOW"]),
  condition: z.string().describe("Most likely medical condition / emergency type"),
  specialist: z.string().describe("Type of specialist required (e.g. Cardiologist)"),
  timeSensitivityMin: z.number().int().min(1).max(240).describe("Minutes before serious deterioration"),
  requiredEquipment: z.array(z.string()).max(8),
  preparationSteps: z.array(z.string()).max(6).describe("Hospital prep checklist"),
  reasoning: z.string().describe("One short sentence explaining the triage"),
});

const InputSchema = z.object({
  symptoms: z.string().min(3).max(2000),
  age: z.number().int().min(0).max(120),
  gender: z.string().min(1).max(20),
  medicalHistory: z.string().max(1000),
});

export const triagePatient = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => InputSchema.parse(input))
  .handler(async ({ data }) => {
    const key = process.env.LOVABLE_API_KEY;
    if (!key) throw new Error("LOVABLE_API_KEY missing");

    const gateway = createLovableAiGatewayProvider(key);
    const model = gateway("google/gemini-3-flash-preview");

    const prompt = `You are MediRelay's Triage AI for Indian emergency response.
Analyze this patient and respond with a structured triage classification.

Patient: ${data.age}-year-old ${data.gender}
Medical history: ${data.medicalHistory || "none reported"}
Reported symptoms: ${data.symptoms}

Rules:
- CRITICAL = life-threatening within minutes (cardiac arrest, stroke, severe trauma, anaphylaxis)
- URGENT = serious, needs care within an hour
- MODERATE = needs ER but stable
- LOW = non-urgent
Be decisive. Pick ONE primary condition.`;

    try {
      const { experimental_output } = await generateText({
        model,
        prompt,
        experimental_output: Output.object({ schema: TriageSchema }),
      });
      return experimental_output;
    } catch (e: unknown) {
      // Surface rate limit / credits clearly
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes("429")) throw new Error("AI rate limited. Try again in a moment.");
      if (msg.includes("402")) throw new Error("AI credits exhausted. Add credits in Workspace settings.");
      throw new Error(`Triage failed: ${msg}`);
    }
  });
