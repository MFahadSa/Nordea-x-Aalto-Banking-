// One small module for every call to a language model, so the provider can be swapped later
// (e.g. an OpenAI-compatible university gateway, or Claude) without touching the rest of the app.
import { GoogleGenAI, FunctionCallingConfigMode } from '@google/genai';

export interface ToolDecl {
  name: string;
  description: string;
  /** Plain JSON Schema for the arguments. */
  parameters: Record<string, unknown>;
}

export interface ToolCall {
  id?: string;
  name: string;
  args: Record<string, any>;
}

/** Provider-neutral conversation item. */
export type Turn =
  | { role: 'user'; text: string; files?: { mimeType: string; data: string }[] }
  | { role: 'model'; text: string }
  | { role: 'model_calls'; calls: ToolCall[]; raw?: unknown }
  | { role: 'tool_results'; results: { call: ToolCall; result: unknown }[] };

export interface StepResult {
  calls: ToolCall[];
  text?: string;
  raw?: unknown;
}

export interface LlmProvider {
  name: string;
  isConfigured(): boolean;
  /** One model step. The model must answer with tool calls (Abel always ends with finishReply). */
  step(args: { system: string; turns: Turn[]; tools: ToolDecl[]; temperature?: number }): Promise<StepResult>;
}

// The model name lives in one place. "gemini-flash-latest" is the alias used in the @google/genai SDK docs.
// Change it with the GEMINI_MODEL environment variable if Google renames it.
const MODEL = process.env.GEMINI_MODEL || 'gemini-flash-latest';

function geminiConfigured() {
  const k = process.env.GEMINI_API_KEY;
  return !!k && k !== 'MY_GEMINI_API_KEY';
}

const gemini: LlmProvider = {
  name: `gemini (${MODEL})`,
  isConfigured: geminiConfigured,
  async step({ system, turns, tools, temperature = 0.3 }) {
    // The key stays on the server: this file only runs in server.ts, never in the browser.
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    const contents: any[] = [];
    for (const t of turns) {
      if (t.role === 'user')
        contents.push({ role: 'user', parts: [...(t.files || []).map((f) => ({ inlineData: { mimeType: f.mimeType, data: f.data } })), { text: t.text }] });
      else if (t.role === 'model') contents.push({ role: 'model', parts: [{ text: t.text }] });
      else if (t.role === 'model_calls')
        contents.push((t.raw as any) || { role: 'model', parts: t.calls.map((c) => ({ functionCall: { id: c.id, name: c.name, args: c.args } })) });
      else
        contents.push({
          role: 'user',
          parts: t.results.map((r) => ({ functionResponse: { id: r.call.id, name: r.call.name, response: { result: r.result } } })),
        });
    }
    const res = await ai.models.generateContent({
      model: MODEL,
      contents,
      config: {
        systemInstruction: system,
        temperature,
        tools: [{ functionDeclarations: tools.map((t) => ({ name: t.name, description: t.description, parametersJsonSchema: t.parameters })) }],
        toolConfig: { functionCallingConfig: { mode: FunctionCallingConfigMode.ANY } },
      },
    });
    const calls: ToolCall[] = (res.functionCalls || []).map((c) => ({ id: c.id, name: c.name || '', args: (c.args as any) || {} }));
    return { calls, text: res.text, raw: res.candidates?.[0]?.content };
  },
};

let override: LlmProvider | null = null;
/** Tests can plug in a scripted provider. Never used in the real app. */
export function setProviderForTests(p: LlmProvider | null) {
  override = p;
}

export function getProvider(): LlmProvider {
  return override || gemini;
}
