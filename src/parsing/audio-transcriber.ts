import fs from "node:fs";
import OpenAI from "openai";
import { ExternalServiceError } from "../shared/errors.js";

export class OpenAiAudioTranscriber {
  private readonly client: OpenAI;

  constructor(
    apiKey: string,
    private readonly model: string,
  ) {
    this.client = new OpenAI({ apiKey });
  }

  async transcribe(filePath: string): Promise<string> {
    try {
      const response = await this.client.audio.transcriptions.create({
        file: fs.createReadStream(filePath),
        model: this.model,
        language: "tr",
        response_format: "json",
      });
      return response.text.replace(/\s+/gu, " ").trim();
    } catch (error) {
      throw new ExternalServiceError(
        classifyAudioError(error),
      );
    }
  }
}

function classifyAudioError(error: unknown): string {
  const message = error instanceof Error ? error.message : "OpenAI audio transcription failed";
  const lower = message.toLocaleLowerCase("tr-TR");
  if (lower.includes("model") || lower.includes("transcription")) return `model: ${message}`;
  if (lower.includes("audio") || lower.includes("file") || lower.includes("format")) {
    return `audio: ${message}`;
  }
  return `unknown: ${message}`;
}
