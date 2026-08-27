function getRunUrl(req) {
  const host = req.headers["x-forwarded-host"] || req.headers.host;
  if (!host) throw new Error("ホスト名を取得できません");
  return `https://${host}/api/run-scheduled`;
}

function normalizeImages(value) {
  if (!Array.isArray(value)) return [];
  return value.map((item) => {
    if (typeof item === "string" && /^https?:\/\//i.test(item)) {
      return { url: item, mimeType: "image/jpeg" };
    }
    if (item && typeof item === "object" &&
        typeof item.url === "string" && /^https?:\/\//i.test(item.url)) {
      return {
        url: item.url,
        mimeType: typeof item.mimeType === "string" && item.mimeType
          ? item.mimeType : "image/jpeg",
      };
    }
    return null;
  }).filter(Boolean);
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ ok:false, error:"Method not allowed" });
  }

  try {
    const body = req.body || {};
    const caption = typeof body.caption === "string" ? body.caption.trim() : "";
    const x = Boolean(body.x);
    const instagram = Boolean(body.instagram);
    const scheduleAt = body.scheduleAt;

    if (!caption) return res.status(400).json({ ok:false, error:"投稿文がありません" });
    if (!x && !instagram) return res.status(400).json({ ok:false, error:"投稿先が選択されていません" });
    if (!scheduleAt) return res.status(400).json({ ok:false, error:"予約日時がありません" });

    const scheduledDate = new Date(scheduleAt);
    if (Number.isNaN(scheduledDate.getTime())) {
      return res.status(400).json({ ok:false, error:"予約日時が正しくありません" });
    }
    if (scheduledDate.getTime() <= Date.now()) {
      return res.status(400).json({ ok:false, error:"未来の日時を指定してください" });
    }

    const xImages = normalizeImages(body.xImages);
    const images = normalizeImages(body.images);

    if (x && xImages.length > 4) return res.status(400).json({ ok:false, error:"Xは最大4枚です" });
    if (instagram && images.length > 10) return res.status(400).json({ ok:false, error:"Instagramは最大10枚です" });
    if (instagram && images.length === 0) return res.status(400).json({ ok:false, error:"Instagram投稿には画像が必要です" });

    const token = process.env.QSTASH_TOKEN;
    if (!token) return res.status(500).json({ ok:false, error:"QSTASH_TOKEN がありません" });

    const id = crypto.randomUUID();
    const job = {
      id,
      status: "pending",
      createdAt: new Date().toISOString(),
      scheduleAt: scheduledDate.toISOString(),
      caption, x, instagram, xImages, images,
    };

    const destination = getRunUrl(req);
    const qstashUrl =
      (process.env.QSTASH_URL || "https://qstash-us-east-1.upstash.io")
        .replace(/\/$/, "");

    const publishUrl =
      `${qstashUrl}/v2/publish/${destination}`;

    const notBefore = Math.floor(scheduledDate.getTime() / 1000);

    const response = await fetch(publishUrl, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${token}`,
        "Content-Type": "application/json",
        "Upstash-Not-Before": String(notBefore),
        "Upstash-Retries": "3",
        "Upstash-Deduplication-Id": id,
      },
      body: JSON.stringify(job),
    });

    const text = await response.text();
    let data = {};
    try { data = text ? JSON.parse(text) : {}; } catch {}

    if (!response.ok) {
      throw new Error(data?.error || text || `QStash登録失敗 (${response.status})`);
    }

    return res.status(200).json({
      ok: true,
      id,
      messageId: data.messageId || null,
      scheduleAt: job.scheduleAt,
      message: "QStashに予約しました",
    });
  } catch (error) {
    console.error("QSTASH SCHEDULE ERROR:", error);
    return res.status(500).json({ ok:false, error:error?.message || String(error) });
  }
}
