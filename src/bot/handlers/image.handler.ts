import type { Bot } from "grammy";
import type { MyContext } from "../create-bot.js";
import {
  batchConfirmationKeyboard,
  expenseConfirmationKeyboard,
} from "../keyboards/expense-confirmation.keyboard.js";
import { expensePreview } from "../messages/expense.messages.js";
import { todayInTimezone } from "../../shared/dates.js";
import { logger } from "../../shared/logger.js";

const MAX_DOWNLOAD_BYTES = 5 * 1024 * 1024;

export function registerImageHandler(bot: Bot<MyContext>): void {
  bot.on(["message:photo", "message:document"], async (ctx) => {
    const fileRef = imageFileRef(ctx);
    if (!fileRef) {
      await ctx.reply(
        "Görseli okuyamadım. Banka ekran görüntüsünü veya alışveriş fişini fotoğraf/resim dosyası olarak gönderebilirsin.",
      );
      return;
    }
    if (fileRef.fileSize !== undefined && fileRef.fileSize > MAX_DOWNLOAD_BYTES) {
      await ctx.reply("Görsel çok büyük. Daha küçük bir ekran görüntüsü gönderebilir misin?");
      return;
    }

    await ctx.reply("Görseldeki giderleri analiz ediyorum.");
    try {
      const image = await downloadTelegramImage(ctx, fileRef.fileId, fileRef.mimeType);
      const today = todayInTimezone(ctx.env.DEFAULT_TIMEZONE);
      const drafts = await ctx.services.imageParser.parseExpenseImage(
        image,
        ctx.message.message_id,
        today,
        ctx.env.DEFAULT_TIMEZONE,
      );
      if (drafts.length === 0) {
        await ctx.reply("Bu görselde kaydedilecek gider bulamadım.");
        return;
      }

      const pendingIds: number[] = [];
      await ctx.reply(`${drafts.length} gider bulundu. Onay için hazırladım.`);
      for (const draft of drafts) {
        const pending = ctx.services.expense.createPending(draft);
        pendingIds.push(pending.id);
        await ctx.reply(expensePreview(pending), {
          reply_markup: expenseConfirmationKeyboard(pending.id),
        });
      }
      if (pendingIds.length > 1) {
        await ctx.reply("İstersen tümünü tek seferde onaylayabilirsin.", {
          reply_markup: batchConfirmationKeyboard(pendingIds),
        });
      }
    } catch (error) {
      logger.warn(
        {
          eventType: "expense_image_parse_failed",
          errorCode: error instanceof Error ? error.name : "unknown",
        },
        "Expense image parse failed",
      );
      await ctx.reply("Görseldeki giderleri anlayamadım. Daha net bir fotoğraf deneyebilirsin.");
    }
  });
}

function imageFileRef(ctx: MyContext): { fileId: string; mimeType: string; fileSize?: number } | null {
  const photos = ctx.message?.photo;
  const photo = photos?.[photos.length - 1];
  if (photo) {
    return {
      fileId: photo.file_id,
      mimeType: "image/jpeg",
      ...(photo.file_size ? { fileSize: photo.file_size } : {}),
    };
  }

  const document = ctx.message?.document;
  if (document?.mime_type?.startsWith("image/")) {
    return {
      fileId: document.file_id,
      mimeType: document.mime_type,
      ...(document.file_size ? { fileSize: document.file_size } : {}),
    };
  }
  return null;
}

async function downloadTelegramImage(
  ctx: MyContext,
  fileId: string,
  fallbackMimeType: string,
): Promise<{ base64: string; mimeType: string }> {
  const file = await ctx.api.getFile(fileId);
  if (!file.file_path) throw new Error("Telegram file path missing");
  const url = `https://api.telegram.org/file/bot${ctx.env.TELEGRAM_BOT_TOKEN}/${file.file_path}`;
  const response = await fetch(url);
  if (!response.ok) throw new Error("Telegram file download failed");
  const contentType = response.headers.get("content-type") ?? fallbackMimeType;
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length > MAX_DOWNLOAD_BYTES) throw new Error("Telegram file too large");
  return { base64: bytes.toString("base64"), mimeType: contentType };
}
