import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { Bot } from "grammy";
import type { MyContext } from "../create-bot.js";
import { expenseConfirmationKeyboard } from "../keyboards/expense-confirmation.keyboard.js";
import { expensePreview } from "../messages/expense.messages.js";
import { todayInTimezone } from "../../shared/dates.js";
import { logger } from "../../shared/logger.js";

const MAX_AUDIO_BYTES = 10 * 1024 * 1024;

export function registerAudioHandler(bot: Bot<MyContext>): void {
  bot.on(["message:voice", "message:audio"], async (ctx) => {
    const fileRef = audioFileRef(ctx);
    if (!fileRef) {
      await ctx.reply("Sesi okuyamadım. Sesli mesaj olarak tekrar gönderebilirsin.");
      return;
    }
    if (fileRef.fileSize !== undefined && fileRef.fileSize > MAX_AUDIO_BYTES) {
      await ctx.reply("Ses dosyası çok büyük. Daha kısa bir sesli mesaj gönderebilir misin?");
      return;
    }

    await ctx.reply("Sesli gideri yazıya çeviriyorum.");
    const filePath = path.join(
      os.tmpdir(),
      `expense-audio-${ctx.message.message_id}${fileRef.extension}`,
    );
    try {
      await downloadTelegramFile(ctx, fileRef.fileId, filePath);
      const transcript = await ctx.services.transcriber.transcribe(filePath);
      if (!transcript) {
        await ctx.reply("Sesli mesajda gider metni duyamadım.");
        return;
      }
      if (transcript.length > ctx.env.MAX_MESSAGE_LENGTH) {
        await ctx.reply("Sesli mesaj metni çok uzun. Daha kısa bir gider mesajı gönderebilir misin?");
        return;
      }

      const today = todayInTimezone(ctx.env.DEFAULT_TIMEZONE);
      const draft = await ctx.services.parser.parseExpense(
        transcript,
        ctx.message.message_id,
        today,
        ctx.env.DEFAULT_TIMEZONE,
      );
      if (!draft) {
        await ctx.reply(`Ses yazıya çevrildi ama gider anlaşılamadı:\n\n${transcript}`);
        return;
      }

      const pending = ctx.services.expense.createPending({
        ...draft,
        rawMessage: `Sesli mesaj: ${transcript}`,
      });
      await ctx.reply(`Duyduğum metin:\n${transcript}\n\n${expensePreview(pending)}`, {
        reply_markup: expenseConfirmationKeyboard(pending.id),
      });
    } catch (error) {
      logger.warn(
        {
          eventType: "audio_expense_parse_failed",
          errorCode: error instanceof Error ? error.name : "unknown",
          errorReason: audioErrorReason(error),
          errorMessage: error instanceof Error ? error.message.slice(0, 500) : "unknown",
        },
        "Audio expense parse failed",
      );
      await ctx.reply(audioErrorMessage(error));
    } finally {
      fs.rmSync(filePath, { force: true });
    }
  });
}

function audioFileRef(
  ctx: MyContext,
): { fileId: string; extension: ".ogg" | ".mp3" | ".m4a"; fileSize?: number } | null {
  const voice = ctx.message?.voice;
  if (voice) {
    return {
      fileId: voice.file_id,
      extension: ".ogg",
      ...(voice.file_size ? { fileSize: voice.file_size } : {}),
    };
  }

  const audio = ctx.message?.audio;
  if (audio) {
    return {
      fileId: audio.file_id,
      extension: audioExtension(audio.mime_type),
      ...(audio.file_size ? { fileSize: audio.file_size } : {}),
    };
  }
  return null;
}

function audioExtension(mimeType: string | undefined): ".ogg" | ".mp3" | ".m4a" {
  if (mimeType === "audio/mpeg") return ".mp3";
  if (mimeType === "audio/mp4" || mimeType === "audio/x-m4a") return ".m4a";
  return ".ogg";
}

async function downloadTelegramFile(ctx: MyContext, fileId: string, outputPath: string): Promise<void> {
  const file = await ctx.api.getFile(fileId);
  if (!file.file_path) throw new Error("Telegram file path missing");
  const url = `https://api.telegram.org/file/bot${ctx.env.TELEGRAM_BOT_TOKEN}/${file.file_path}`;
  const response = await fetch(url);
  if (!response.ok) throw new Error("Telegram file download failed");
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length > MAX_AUDIO_BYTES) throw new Error("Telegram file too large");
  fs.writeFileSync(outputPath, bytes);
}

function audioErrorReason(error: unknown): string {
  if (!(error instanceof Error)) return "unknown";
  const lower = error.message.toLocaleLowerCase("tr-TR");
  if (lower.startsWith("model:")) return "model";
  if (lower.startsWith("audio:")) return "audio";
  if (lower.includes("telegram")) return "telegram";
  return "unknown";
}

function audioErrorMessage(error: unknown): string {
  const reason = audioErrorReason(error);
  if (reason === "model") {
    return "Ses transkripsiyon modeli çalışmadı. `.env` içindeki `OPENAI_TRANSCRIPTION_MODEL` değerini kontrol et.";
  }
  if (reason === "audio") {
    return "Ses dosyası okunamadı. Daha kısa ve net bir sesli mesaj gönderebilirsin.";
  }
  if (reason === "telegram") {
    return "Ses dosyası Telegram'dan indirilemedi. Bir kez daha sesli mesaj olarak gönderebilir misin?";
  }
  return "Sesli mesajı gider kaydına çeviremedim. Loglarda hata sebebini kontrol etmek iyi olur.";
}
