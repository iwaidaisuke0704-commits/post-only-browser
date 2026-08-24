import {
  list,
  put,
} from "@vercel/blob";


// ========================================
// 設定
// ========================================

const SCHEDULE_PREFIX =
  "scheduled/";


// ========================================
// JSON取得
// ========================================

async function loadJson(url) {

  const response =
    await fetch(
      url,
      {
        cache: "no-store",
      }
    );


  if (!response.ok) {

    throw new Error(
      `予約データ取得失敗 (${response.status})`
    );
  }


  return await response.json();
}


// ========================================
// 予約データ更新
// ========================================

async function saveJob(
  pathname,
  job
) {

  await put(
    pathname,
    JSON.stringify(job),
    {
      access: "public",

      contentType:
        "application/json",

      addRandomSuffix:
        false,

      /*
        同じ予約JSONを
        status更新するため上書き
      */

      allowOverwrite:
        true,
    }
  );
}


// ========================================
// publish APIのURLを作る
// ========================================

function getPublishUrl(req) {

  /*
    Vercel上では
    x-forwarded-proto / host
    から自分自身のURLを作る
  */

  const proto =
    req.headers[
      "x-forwarded-proto"
    ] || "https";


  const host =
    req.headers[
      "x-forwarded-host"
    ] ||
    req.headers.host;


  if (!host) {

    throw new Error(
      "ホスト名を取得できません"
    );
  }


  return (
    `${proto}://${host}` +
    `/api/publish`
  );
}


// ========================================
// 1件投稿
// ========================================

async function publishJob(
  req,
  job
) {

  const publishUrl =
    getPublishUrl(req);


  const body = {

    caption:
      job.caption,

    x:
      Boolean(job.x),

    instagram:
      Boolean(
        job.instagram
      ),

    images:
      Array.isArray(
        job.images
      )
        ? job.images
        : [],

    xImages:
      Array.isArray(
        job.xImages
      )
        ? job.xImages
        : [],


    /*
      古い1枚形式との互換性
    */

    imageBase64:
      job.imageBase64 ||
      undefined,

    mimeType:
      job.mimeType ||
      undefined,
  };


  console.log(
    "Scheduled publish start:",
    job.id,
    publishUrl
  );


  const response =
    await fetch(
      publishUrl,
      {
        method:
          "POST",

        headers: {

          "Content-Type":
            "application/json",
        },

        body:
          JSON.stringify(
            body
          ),
      }
    );


  let data;


  try {

    data =
      await response.json();

  } catch {

    throw new Error(
      `publish API応答エラー (${response.status})`
    );
  }


  console.log(
    "Scheduled publish response:",
    job.id,
    response.status,
    data
  );


  if (
    !response.ok ||
    !data.ok
  ) {

    throw new Error(
      data.error ||
      Object
        .values(
          data.errors || {}
        )
        .join(" / ") ||
      `投稿失敗 (${response.status})`
    );
  }


  return data;
}


// ========================================
// API本体
// ========================================

export default async function handler(
  req,
  res
) {

  /*
    Vercel CronはGETで呼ぶ。

    手動テストしやすいように
    POSTも許可しておく。
  */

  if (
    req.method !== "GET" &&
    req.method !== "POST"
  ) {

    return res
      .status(405)
      .json({
        error:
          "Method not allowed",
      });
  }


  try {

    console.log(
      "run-scheduled start:",
      new Date().toISOString()
    );


    // ====================================
    // scheduled/ 一覧取得
    // ====================================

    const {
      blobs,
    } =
      await list({
        prefix:
          SCHEDULE_PREFIX,
      });


    console.log(
      "Scheduled files:",
      blobs.length
    );


    const now =
      Date.now();


    const results =
      [];


    // ====================================
    // 予約を順番に確認
    // ====================================

    for (
      const blob of blobs
    ) {

      try {

        const job =
          await loadJson(
            blob.url
          );


        // ------------------------------
        // pending以外は無視
        // ------------------------------

        if (
          job.status !==
          "pending"
        ) {

          continue;
        }


        // ------------------------------
        // 日時確認
        // ------------------------------

        const scheduledTime =
          new Date(
            job.scheduleAt
          ).getTime();


        if (
          Number.isNaN(
            scheduledTime
          )
        ) {

          console.error(
            "Invalid schedule:",
            job.id
          );

          continue;
        }


        // ------------------------------
        // まだ時間前
        // ------------------------------

        if (
          scheduledTime >
          now
        ) {

          continue;
        }


        console.log(
          "Scheduled job ready:",
          job.id,
          job.scheduleAt
        );


        // =================================
        // 実行中に変更
        // =================================

        const runningJob = {

          ...job,

          status:
            "running",

          startedAt:
            new Date()
              .toISOString(),
        };


        await saveJob(
          blob.pathname,
          runningJob
        );


        // =================================
        // 投稿
        // =================================

        try {

          const publishResult =
            await publishJob(
              req,
              runningJob
            );


          // ===============================
          // 成功
          // ===============================

          const completedJob = {

            ...runningJob,

            status:
              "completed",

            completedAt:
              new Date()
                .toISOString(),

            result:
              publishResult,
          };


          await saveJob(
            blob.pathname,
            completedJob
          );


          results.push({

            id:
              job.id,

            status:
              "completed",
          });


          console.log(
            "Scheduled job completed:",
            job.id
          );


        } catch (
          publishError
        ) {

          // ===============================
          // 投稿失敗
          // ===============================

          const failedJob = {

            ...runningJob,

            status:
              "failed",

            failedAt:
              new Date()
                .toISOString(),

            error:
              String(
                publishError
                  ?.message ||
                publishError
              ),
          };


          await saveJob(
            blob.pathname,
            failedJob
          );


          results.push({

            id:
              job.id,

            status:
              "failed",

            error:
              failedJob.error,
          });


          console.error(
            "Scheduled job failed:",
            job.id,
            publishError
          );
        }


      } catch (
        jobError
      ) {

        console.error(
          "Scheduled file error:",
          blob.pathname,
          jobError
        );


        results.push({

          pathname:
            blob.pathname,

          status:
            "error",

          error:
            String(
              jobError
                ?.message ||
              jobError
            ),
        });
      }
    }


    // ====================================
    // 完了
    // ====================================

    return res
      .status(200)
      .json({

        ok:
          true,

        checked:
          blobs.length,

        processed:
          results.length,

        results,
      });


  } catch (error) {

    console.error(
      "run-scheduled error:",
      error
    );


    return res
      .status(500)
      .json({

        ok:
          false,

        error:
          String(
            error?.message ||
            error
          ),
      });
  }
      }
