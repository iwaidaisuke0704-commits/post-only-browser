
import { put } from "@vercel/blob";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({
      error: "Method not allowed",
    });
  }

  try {
    const {
      caption,
      x,
      instagram,
      images = [],
      xImages = [],
      imageBase64,
      mimeType,
      scheduleAt,
    } = req.body || {};

    // =====================================
    // 基本チェック
    // =====================================

    if (!caption?.trim()) {
      return res.status(400).json({
        error: "投稿文がありません",
      });
    }

    if (!x && !instagram) {
      return res.status(400).json({
        error: "投稿先が選択されていません",
      });
    }

    if (!scheduleAt) {
      return res.status(400).json({
        error: "予約日時がありません",
      });
    }

    const scheduledDate = new Date(scheduleAt);

    if (
      Number.isNaN(
        scheduledDate.getTime()
      )
    ) {
      return res.status(400).json({
        error: "予約日時が正しくありません",
      });
    }

    if (
      scheduledDate.getTime() <=
      Date.now()
    ) {
      return res.status(400).json({
        error: "未来の日時を指定してください",
      });
    }

    // =====================================
    // 枚数チェック
    // =====================================

    if (
      x &&
      Array.isArray(xImages) &&
      xImages.length > 4
    ) {
      return res.status(400).json({
        error: "Xは最大4枚です",
      });
    }

    if (
      instagram &&
      Array.isArray(images) &&
      images.length > 10
    ) {
      return res.status(400).json({
        error: "Instagramは最大10枚です",
      });
    }

    if (
      instagram &&
      (!Array.isArray(images) ||
        images.length === 0) &&
      !imageBase64
    ) {
      return res.status(400).json({
        error:
          "Instagram投稿には画像が必要です",
      });
    }

    // =====================================
    // 予約ID
    // =====================================

    const id =
      crypto.randomUUID();

    // =====================================
    // 保存する予約データ
    // =====================================

    const job = {
      id,

      status: "pending",

      createdAt:
        new Date().toISOString(),

      scheduleAt:
        scheduledDate.toISOString(),

      caption:
        caption.trim(),

      x:
        Boolean(x),

      instagram:
        Boolean(instagram),

      images:
        Array.isArray(images)
          ? images
          : [],

      xImages:
        Array.isArray(xImages)
          ? xImages
          : [],

      // 旧形式互換
      imageBase64:
        imageBase64 || null,

      mimeType:
        mimeType || null,
    };

    // =====================================
    // Vercel Blobへ保存
    // =====================================

    const filename =
      `scheduled/${id}.json`;

    const blob =
      await put(
        filename,
        JSON.stringify(job),
        {
          access: "public",

          contentType:
            "application/json",

          addRandomSuffix:
            false,
        }
      );

    console.log(
      "Scheduled post saved:",
      {
        id,
        scheduleAt:
          job.scheduleAt,
        url:
          blob.url,
      }
    );

    // =====================================
    // 成功
    // =====================================

    return res.status(200).json({
      ok: true,

      id,

      scheduleAt:
        job.scheduleAt,

      message:
        "予約を保存しました",
    });

  } catch (error) {
    console.error(
      "Schedule error:",
      error
    );

    return res.status(500).json({
      ok: false,

      error:
        String(
          error?.message ||
          error
        ),
    });
  }
}
