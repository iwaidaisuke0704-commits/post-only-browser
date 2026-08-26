<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8">
<title>run-scheduled.js</title>
</head>
<body>
<pre>import { list, put } from &quot;@vercel/blob&quot;;

const SCHEDULE_PREFIX = &quot;scheduled/&quot;;

async function loadJson(url) {
  const response = await fetch(url, { cache: &quot;no-store&quot; });
  if (!response.ok) throw new Error(`予約データ取得失敗 (${response.status})`);
  return await response.json();
}

async function saveJob(pathname, job) {
  await put(pathname, JSON.stringify(job), {
    access: &quot;public&quot;,
    contentType: &quot;application/json&quot;,
    addRandomSuffix: false,
    allowOverwrite: true,
  });
}

function getPublishUrl(req) {
  const proto = req.headers[&quot;x-forwarded-proto&quot;] || &quot;https&quot;;
  const host = req.headers[&quot;x-forwarded-host&quot;] || req.headers.host;
  if (!host) throw new Error(&quot;ホスト名を取得できません&quot;);
  return `${proto}://${host}/api/publish`;
}

function isHttpUrl(value) {
  return typeof value === &quot;string&quot; &amp;&amp; /^https?:\/\//i.test(value);
}

async function blobImageToBase64(item) {
  const url = typeof item === &quot;string&quot; ? item : item?.url;
  const fallbackMime =
    typeof item === &quot;object&quot; &amp;&amp; typeof item?.mimeType === &quot;string&quot;
      ? item.mimeType
      : &quot;image/jpeg&quot;;

  if (!isHttpUrl(url)) throw new Error(&quot;予約画像のBlob URLが正しくありません&quot;);

  const response = await fetch(url, { cache: &quot;no-store&quot; });
  if (!response.ok) throw new Error(`予約画像取得失敗 (${response.status})`);

  const arrayBuffer = await response.arrayBuffer();
  const mimeType = response.headers.get(&quot;content-type&quot;) || fallbackMime || &quot;image/jpeg&quot;;

  return {
    imageBase64: Buffer.from(arrayBuffer).toString(&quot;base64&quot;),
    mimeType,
  };
}

async function normalizeScheduledImages(items) {
  if (!Array.isArray(items)) return [];

  return await Promise.all(
    items.map(async (item) =&gt; {
      if (
        isHttpUrl(item) ||
        (item &amp;&amp; typeof item === &quot;object&quot; &amp;&amp; isHttpUrl(item.url))
      ) {
        return await blobImageToBase64(item);
      }

      if (
        item &amp;&amp;
        typeof item === &quot;object&quot; &amp;&amp;
        typeof item.imageBase64 === &quot;string&quot; &amp;&amp;
        item.imageBase64
      ) {
        return {
          imageBase64: item.imageBase64,
          mimeType: item.mimeType || &quot;image/jpeg&quot;,
        };
      }

      throw new Error(&quot;予約画像データの形式が正しくありません&quot;);
    })
  );
}

async function publishJob(req, job) {
  const publishUrl = getPublishUrl(req);

  const images = await normalizeScheduledImages(job.images);
  const xImages = await normalizeScheduledImages(job.xImages);

  const body = {
    caption: job.caption,
    x: Boolean(job.x),
    instagram: Boolean(job.instagram),
    images,
    xImages,
    imageBase64: job.imageBase64 || undefined,
    mimeType: job.mimeType || undefined,
  };

  const response = await fetch(publishUrl, {
    method: &quot;POST&quot;,
    headers: { &quot;Content-Type&quot;: &quot;application/json&quot; },
    body: JSON.stringify(body),
  });

  let data;
  try {
    data = await response.json();
  } catch {
    throw new Error(`publish API応答エラー (${response.status})`);
  }

  if (!response.ok || !data.ok) {
    throw new Error(
      data.error ||
        Object.values(data.errors || {}).join(&quot; / &quot;) ||
        `投稿失敗 (${response.status})`
    );
  }

  return data;
}

export default async function handler(req, res) {
  if (req.method !== &quot;GET&quot; &amp;&amp; req.method !== &quot;POST&quot;) {
    return res.status(405).json({ ok: false, error: &quot;Method not allowed&quot; });
  }

  try {
    const { blobs } = await list({ prefix: SCHEDULE_PREFIX });
    const now = Date.now();
    const results = [];

    for (const blob of blobs) {
      try {
        const job = await loadJson(blob.url);

        if (job.status !== &quot;pending&quot;) continue;

        const scheduledTime = new Date(job.scheduleAt).getTime();
        if (Number.isNaN(scheduledTime)) continue;
        if (scheduledTime &gt; now) continue;

        const runningJob = {
          ...job,
          status: &quot;running&quot;,
          startedAt: new Date().toISOString(),
        };

        await saveJob(blob.pathname, runningJob);

        try {
          const publishResult = await publishJob(req, runningJob);

          const completedJob = {
            ...runningJob,
            status: &quot;completed&quot;,
            completedAt: new Date().toISOString(),
            result: publishResult,
          };

          await saveJob(blob.pathname, completedJob);
          results.push({ id: job.id, status: &quot;completed&quot; });
        } catch (publishError) {
          const failedJob = {
            ...runningJob,
            status: &quot;failed&quot;,
            failedAt: new Date().toISOString(),
            error: String(publishError?.message || publishError),
          };

          await saveJob(blob.pathname, failedJob);

          results.push({
            id: job.id,
            status: &quot;failed&quot;,
            error: failedJob.error,
          });
        }
      } catch (jobError) {
        results.push({
          pathname: blob.pathname,
          status: &quot;error&quot;,
          error: String(jobError?.message || jobError),
        });
      }
    }

    return res.status(200).json({
      ok: true,
      checked: blobs.length,
      processed: results.length,
      results,
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: String(error?.message || error),
    });
  }
}
</pre>
</body>
</html>
