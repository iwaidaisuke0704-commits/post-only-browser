import crypto from "node:crypto";
import { put } from "@vercel/blob";

const GRAPH_VERSION = "v24.0";
const GRAPH_BASE = `https://graph.instagram.com/${GRAPH_VERSION}`;

const enc = (v) =>
  encodeURIComponent(String(v))
    .replace(/!/g, "%21")
    .replace(/'/g, "%27")
    .replace(/\(/g, "%28")
    .replace(/\)/g, "%29")
    .replace(/\*/g, "%2A");

const sleep = (ms) =>
  new Promise((resolve) => setTimeout(resolve, ms));

function auth(method, url, ck, cs, at, ats, bodyParams = {}) {
  const oauth = {
    oauth_consumer_key: ck,
    oauth_nonce: crypto.randomBytes(16).toString("hex"),
    oauth_signature_method: "HMAC-SHA1",
    oauth_timestamp: Math.floor(Date.now() / 1000).toString(),
    oauth_token: at,
    oauth_version: "1.0",
  };

  const params = Object.entries({ ...oauth, ...bodyParams })
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${enc(k)}=${enc(v)}`)
    .join("&");

  const base = [
    method.toUpperCase(),
    enc(url),
    enc(params),
  ].join("&");

  const key = `${enc(cs)}&${enc(ats)}`;

  oauth.oauth_signature = crypto
    .createHmac("sha1", key)
    .update(base)
    .digest("base64");

  return (
    "OAuth " +
    Object.entries(oauth)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${enc(k)}="${enc(v)}"`)
      .join(", ")
  );
}


// ========================================
// X
// ========================================

function getXCredentials() {
  const ck = process.env.X_CONSUMER_KEY;
  const cs = process.env.X_CONSUMER_SECRET;
  const at = process.env.X_ACCESS_TOKEN;
  const ats = process.env.X_ACCESS_TOKEN_SECRET;

  if (!ck || !cs || !at || !ats) {
    throw new Error(
      "Xの環境変数が設定されていません"
    );
  }

  return {
    ck,
    cs,
    at,
    ats,
  };
}


// Xへ画像1枚をアップロードして
// media_idを返す
async function uploadXImage(
  imageBase64,
  mimeType,
  credentials
) {
  const {
    ck,
    cs,
    at,
    ats,
  } = credentials;

  if (!imageBase64) {
    throw new Error(
      "X画像データがありません"
    );
  }

  const uploadUrl =
    "https://upload.twitter.com/1.1/media/upload.json";

  const form =
    new URLSearchParams();

  form.set(
    "media_data",
    imageBase64
  );

  const uploadResponse =
    await fetch(
      uploadUrl,
      {
        method: "POST",

        headers: {
          Authorization: auth(
            "POST",
            uploadUrl,
            ck,
            cs,
            at,
            ats,
            {
              media_data:
                imageBase64,
            }
          ),

          "Content-Type":
            "application/x-www-form-urlencoded",
        },

        body:
          form.toString(),
      }
    );

  const uploadData =
    await uploadResponse.json();

  console.log(
    "X upload response:",
    uploadResponse.status,
    uploadData
  );

  if (!uploadResponse.ok) {
    throw new Error(
      "X画像アップロード失敗: " +
      JSON.stringify(uploadData)
    );
  }

  const mediaId =
    uploadData.media_id_string;

  if (!mediaId) {
    throw new Error(
      "X画像アップロード後のmedia_idがありません"
    );
  }

  return mediaId;
}


// Xへ投稿
// imagesは最大4枚
async function postToX(
  text,
  images = []
) {
  const credentials =
    getXCredentials();

  if (!Array.isArray(images)) {
    images = [];
  }

  if (images.length > 4) {
    throw new Error(
      "Xは画像を最大4枚まで投稿できます"
    );
  }

  const mediaIds = [];


  // ------------------------------
  // 各画像をXへアップロード
  // ------------------------------

  for (
    let i = 0;
    i < images.length;
    i++
  ) {

    const image =
      images[i];

    if (!image?.imageBase64) {
      throw new Error(
        `X画像${i + 1}のデータがありません`
      );
    }

    console.log(
      `X image upload ${i + 1}/${images.length}`
    );

    const mediaId =
      await uploadXImage(
        image.imageBase64,
        image.mimeType,
        credentials
      );

    mediaIds.push(
      mediaId
    );
  }


  // ------------------------------
  // Tweet作成
  // ------------------------------

  const url =
    "https://api.x.com/2/tweets";

  const tweetBody = {
    text,
  };

  if (mediaIds.length) {
    tweetBody.media = {
      media_ids: mediaIds,
    };
  }

  const response =
    await fetch(
      url,
      {
        method: "POST",

        headers: {
          Authorization: auth(
            "POST",
            url,
            credentials.ck,
            credentials.cs,
            credentials.at,
            credentials.ats
          ),

          "Content-Type":
            "application/json",
        },

        body:
          JSON.stringify(tweetBody),
      }
    );

  const data =
    await response.json();

  console.log(
    "X publish response:",
    response.status,
    data
  );

  if (!response.ok) {
    throw new Error(
      "X投稿失敗: " +
      JSON.stringify(data)
    );
  }

  return data;
}


// ========================================
// Instagram 共通
// ========================================

function getInstagramCredentials() {
  const userId =
    process.env.INSTAGRAM_USER_ID;

  const accessToken =
    process.env.INSTAGRAM_ACCESS_TOKEN;

  if (!userId || !accessToken) {
    throw new Error(
      "Instagramの環境変数が設定されていません"
    );
  }

  return {
    userId,
    accessToken,
  };
}


async function uploadInstagramBlob(
  imageBase64,
  mimeType
) {
  const type =
    mimeType || "image/jpeg";

  let ext = "jpg";

  if (type === "image/png") {
    ext = "png";
  }

  if (type === "image/webp") {
    ext = "webp";
  }

  const buffer =
    Buffer.from(
      imageBase64,
      "base64"
    );

  const filename =
    `instagram/${Date.now()}-${crypto.randomUUID()}.${ext}`;

  const blob =
    await put(
      filename,
      buffer,
      {
        access: "public",
        contentType: type,
        addRandomSuffix: false,
      }
    );

  console.log(
    "Instagram Blob URL:",
    blob.url
  );

  return blob.url;
}


// Instagramコンテナが
// FINISHEDになるまで待つ
async function waitForInstagramReady(
  creationId,
  accessToken,
  label = "media"
) {
  let lastStatus = null;

  // 最大約40秒
  for (
    let i = 0;
    i < 20;
    i++
  ) {

    await sleep(2000);

    const statusUrl =
      `${GRAPH_BASE}/${creationId}` +
      `?fields=status_code,status` +
      `&access_token=${encodeURIComponent(accessToken)}`;

    const response =
      await fetch(statusUrl);

    const data =
      await response.json();

    console.log(
      `Instagram ${label} status ${i + 1}:`,
      response.status,
      data
    );

    if (!response.ok) {
      throw new Error(
        "Instagram状態確認失敗: " +
        JSON.stringify(data)
      );
    }

    lastStatus = data;

    if (
      data.status_code ===
      "FINISHED"
    ) {
      return data;
    }

    if (
      data.status_code ===
        "ERROR" ||
      data.status_code ===
        "EXPIRED"
    ) {
      throw new Error(
        "Instagram画像処理失敗: " +
        JSON.stringify(data)
      );
    }
  }

  throw new Error(
    "Instagram画像処理が時間内に完了しませんでした: " +
    JSON.stringify(lastStatus)
  );
}


async function publishInstagramContainer(
  creationId,
  userId,
  accessToken
) {
  const publishUrl =
    `${GRAPH_BASE}/${userId}/media_publish`;

  const publishBody =
    new URLSearchParams({
      creation_id:
        creationId,

      access_token:
        accessToken,
    });

  const response =
    await fetch(
      publishUrl,
      {
        method: "POST",

        headers: {
          "Content-Type":
            "application/x-www-form-urlencoded",
        },

        body:
          publishBody.toString(),
      }
    );

  const data =
    await response.json();

  console.log(
    "Instagram publish response:",
    response.status,
    data
  );

  if (!response.ok) {
    throw new Error(
      "Instagram公開失敗: " +
      JSON.stringify(data)
    );
  }

  return data;
}


// ========================================
// Instagram 1枚投稿
// ========================================

async function postSingleInstagram(
  text,
  image
) {
  const {
    userId,
    accessToken,
  } =
    getInstagramCredentials();

  if (!image?.imageBase64) {
    throw new Error(
      "Instagram投稿には画像が必要です"
    );
  }

  const imageUrl =
    await uploadInstagramBlob(
      image.imageBase64,
      image.mimeType
    );

  const createUrl =
    `${GRAPH_BASE}/${userId}/media`;

  const createBody =
    new URLSearchParams({
      image_url:
        imageUrl,

      caption:
        text,

      access_token:
        accessToken,
    });

  const response =
    await fetch(
      createUrl,
      {
        method: "POST",

        headers: {
          "Content-Type":
            "application/x-www-form-urlencoded",
        },

        body:
          createBody.toString(),
      }
    );

  const data =
    await response.json();

  console.log(
    "Instagram single media response:",
    response.status,
    data
  );

  if (
    !response.ok ||
    !data.id
  ) {
    throw new Error(
      "Instagramメディア作成失敗: " +
      JSON.stringify(data)
    );
  }

  await waitForInstagramReady(
    data.id,
    accessToken,
    "single"
  );

  return await publishInstagramContainer(
    data.id,
    userId,
    accessToken
  );
}


// ========================================
// Instagram カルーセル
// ========================================

async function postInstagramCarousel(
  text,
  images
) {
  const {
    userId,
    accessToken,
  } =
    getInstagramCredentials();

  if (
    !Array.isArray(images) ||
    images.length < 2
  ) {
    throw new Error(
      "カルーセルには2枚以上の画像が必要です"
    );
  }

  if (images.length > 10) {
    throw new Error(
      "Instagramカルーセルは最大10枚です"
    );
  }

  const childIds = [];


  // ------------------------------
  // 1. 子コンテナ作成
  // ------------------------------

  for (
    let i = 0;
    i < images.length;
    i++
  ) {

    const image =
      images[i];

    if (!image?.imageBase64) {
      throw new Error(
        `Instagram画像${i + 1}のデータがありません`
      );
    }

    const imageUrl =
      await uploadInstagramBlob(
        image.imageBase64,
        image.mimeType
      );

    const createUrl =
      `${GRAPH_BASE}/${userId}/media`;

    const createBody =
      new URLSearchParams({
        image_url:
          imageUrl,

        is_carousel_item:
          "true",

        access_token:
          accessToken,
      });

    const response =
      await fetch(
        createUrl,
        {
          method: "POST",

          headers: {
            "Content-Type":
              "application/x-www-form-urlencoded",
          },

          body:
            createBody.toString(),
        }
      );

    const data =
      await response.json();

    console.log(
      `Instagram carousel child ${i + 1}:`,
      response.status,
      data
    );

    if (
      !response.ok ||
      !data.id
    ) {
      throw new Error(
        `Instagramカルーセル画像${i + 1}作成失敗: ` +
        JSON.stringify(data)
      );
    }

    await waitForInstagramReady(
      data.id,
      accessToken,
      `child-${i + 1}`
    );

    childIds.push(
      data.id
    );
  }


  // ------------------------------
  // 2. 親カルーセル作成
  // ------------------------------

  const carouselUrl =
    `${GRAPH_BASE}/${userId}/media`;

  const carouselBody =
    new URLSearchParams({
      media_type:
        "CAROUSEL",

      children:
        childIds.join(","),

      caption:
        text,

      access_token:
        accessToken,
    });

  const carouselResponse =
    await fetch(
      carouselUrl,
      {
        method: "POST",

        headers: {
          "Content-Type":
            "application/x-www-form-urlencoded",
        },

        body:
          carouselBody.toString(),
      }
    );

  const carouselData =
    await carouselResponse.json();

  console.log(
    "Instagram carousel parent:",
    carouselResponse.status,
    carouselData
  );

  if (
    !carouselResponse.ok ||
    !carouselData.id
  ) {
    throw new Error(
      "Instagramカルーセル作成失敗: " +
      JSON.stringify(carouselData)
    );
  }


  // ------------------------------
  // 3. 親の処理完了待ち
  // ------------------------------

  await waitForInstagramReady(
    carouselData.id,
    accessToken,
    "carousel-parent"
  );


  // ------------------------------
  // 4. 公開
  // ------------------------------

  return await publishInstagramContainer(
    carouselData.id,
    userId,
    accessToken
  );
}


// ========================================
// API本体
// ========================================

export default async function handler(
  req,
  res
) {
  if (
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

    const {
      caption: text,

      // 旧形式
      imageBase64,
      mimeType,

      // Instagram用
      images,

      // X用
      xImages,

      x,
      instagram,

    } =
      req.body || {};


    if (!text) {
      return res
        .status(400)
        .json({
          error:
            "投稿文がありません",
        });
    }


    if (
      !x &&
      !instagram
    ) {
      return res
        .status(400)
        .json({
          error:
            "投稿先が選択されていません",
        });
    }


    const results = {};
    const errors = {};


    // ====================================
    // X
    // ====================================

    if (x) {

      try {

        let finalXImages =
          Array.isArray(xImages)
            ? xImages
            : [];


        /*
          古い1枚形式にも対応
        */

        if (
          finalXImages.length === 0 &&
          imageBase64
        ) {

          finalXImages = [
            {
              imageBase64,

              mimeType:
                mimeType ||
                "image/jpeg",
            },
          ];
        }


        if (
          finalXImages.length > 4
        ) {
          throw new Error(
            "Xは画像を最大4枚まで投稿できます"
          );
        }


        results.x =
          await postToX(
            text,
            finalXImages
          );


      } catch (error) {

        errors.x =
          String(
            error?.message ||
            error
          );
      }
    }


    // ====================================
    // Instagram
    // ====================================

    if (instagram) {

      try {

        let instagramImages =
          Array.isArray(images)
            ? images
            : [];


        /*
          古い1枚形式にも対応
        */

        if (
          instagramImages.length === 0 &&
          imageBase64
        ) {

          instagramImages = [
            {
              imageBase64,

              mimeType:
                mimeType ||
                "image/jpeg",
            },
          ];
        }


        if (
          instagramImages.length === 0
        ) {

          throw new Error(
            "Instagram投稿には画像が必要です"
          );
        }


        if (
          instagramImages.length === 1
        ) {

          results.instagram =
            await postSingleInstagram(
              text,
              instagramImages[0]
            );

        } else {

          results.instagram =
            await postInstagramCarousel(
              text,
              instagramImages
            );
        }


      } catch (error) {

        errors.instagram =
          String(
            error?.message ||
            error
          );
      }
    }


    const ok =
      Object.keys(errors)
        .length === 0;


    return res
      .status(
        ok ? 200 : 500
      )
      .json({
        ok,
        results,
        errors,

        error:
          ok
            ? undefined
            : Object
                .values(errors)
                .join(" / "),
      });


  } catch (error) {

    console.error(
      "Publish error:",
      error
    );

    return res
      .status(500)
      .json({
        error:
          String(
            error?.message ||
            error
          ),
      });
  }
}
