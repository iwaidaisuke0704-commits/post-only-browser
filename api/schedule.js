import { put } from "@vercel/blob";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({
      ok: false,
      error: "Method not allowed",
    });
  }

  try {
    const body = req.body || {};

    const caption =
      typeof body.caption === "string"
        ? body.caption.trim()
        : "";

    const x = Boolean(body.x);
    const instagram = Boolean(body.instagram);
    const scheduleAt = body.scheduleAt;

    // =====================================
    // 基本チェック
    // =====================================

    if (!caption) {
      return res.status(400).json({
        ok: false,
        error: "投稿文がありません",
      });
    }

    if (!x && !instagram) {
      return res.status(400).json({
        ok: false,
        error: "投稿先が選択されていません",
      });
    }

    if (!scheduleAt) {
      return res.status(400).json({
        ok: false,
        error: "予約日時がありません",
      });
    }

    const scheduledDate =
      new Date(scheduleAt);

    if (
      Number.isNaN(
        scheduledDate.getTime()
      )
    ) {
      return res.status(400).json({
        ok: false,
        error: "予約日時が正しくありません",
      });
    }

    if (
      scheduledDate.getTime() <=
      Date.now()
    ) {
      return res.status(400).json({
        ok: false,
        error: "未来の日時を指定してください",
      });
    }

    // =====================================
    // Blob画像URLを整える
    // =====================================

    function normalizeImages(value) {
      if (!Array.isArray(value)) {
        return [];
      }

      return value
        .map((item) => {

          // URL文字列だけの場合
          if (
            typeof item === "string" &&
            /^https?:\/\//i.test(item)
          ) {
            return {
              url: item,
              mimeType: "image/jpeg",
            };
          }

          // { url, mimeType } の場合
          if (
            item &&
            typeof item === "object" &&
            typeof item.url === "string" &&
            /^https?:\/\//i.test(item.url)
          ) {
            return {
              url: item.url,

              mimeType:
                typeof item.mimeType === "string" &&
                item.mimeType
                  ? item.mimeType
                  : "image/jpeg",
            };
          }

          return null;
        })
        .filter(Boolean);
    }

    const xImages =
      normalizeImages(
        body.xImages
      );

    const images =
      normalizeImages(
        body.images
      );

    // =====================================
    // 枚数チェック
    // =====================================

    if (
      x &&
      xImages.length > 4
    ) {
      return res.status(400).json({
        ok: false,
        error: "Xは最大4枚です",
      });
    }

    if (
      instagram &&
      images.length > 10
    ) {
      return res.status(400).json({
        ok: false,
        error: "Instagramは最大10枚です",
      });
    }

    if (
      instagram &&
      images.length === 0
    ) {
      return res.status(400).json({
        ok: false,
        error: "Instagram投稿には画像が必要です",
      });
    }

    // =====================================
    // Blob URL変換失敗チェック
    // =====================================

    if (
      x &&
      Array.isArray(body.xImages) &&
      body.xImages.length > 0 &&
      xImages.length !==
        body.xImages.length
    ) {
      return res.status(400).json({
        ok: false,
        error:
          "X画像のBlob URLが正しくありません",
      });
    }

    if (
      instagram &&
      Array.isArray(body.images) &&
      body.images.length > 0 &&
      images.length !==
        body.images.length
    ) {
      return res.status(400).json({
        ok: false,
        error:
          "Instagram画像のBlob URLが正しくありません",
      });
    }

    // =====================================
    // 予約ID
    // =====================================

    const id =
      crypto.randomUUID();

    // =====================================
    // 予約データ
    //
    // ★ Base64画像本体は保存しない
    // ★ Blob URLだけ保存
    // =====================================

    const job = {
      id,

      status: "pending",

      createdAt:
        new Date().toISOString(),

      scheduleAt:
        scheduledDate.toISOString(),

      caption,

      x,

      instagram,

      xImages,

      images,
    };

    // =====================================
    // Vercel Blobへ予約JSON保存
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

        xImages:
          xImages.length,

        images:
          images.length,
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
        error?.message ||
        String(error),
    });
  }
}
