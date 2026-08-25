import { handleUpload } from "@vercel/blob/client";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({
      error: "Method not allowed",
    });
  }

  try {
    console.log("=== /api/upload START ===");
    console.log("Method:", req.method);
    console.log("Has body:", !!req.body);
    console.log("BLOB_READ_WRITE_TOKEN exists:", !!process.env.BLOB_READ_WRITE_TOKEN);
    console.log("BLOB_STORE_ID exists:", !!process.env.BLOB_STORE_ID);

    const body = req.body;

    const jsonResponse = await handleUpload({
      body,
      request: req,

      onBeforeGenerateToken: async (pathname) => {
        console.log("onBeforeGenerateToken called");
        console.log("pathname:", pathname);

        return {
          allowedContentTypes: [
            "image/jpeg",
            "image/png",
            "image/webp",
            "image/heic",
            "image/heif",
          ],

          addRandomSuffix: true,

          tokenPayload: JSON.stringify({
            purpose: "scheduled-post",
          }),
        };
      },

      onUploadCompleted: async ({
        blob,
        tokenPayload,
      }) => {
        console.log("=== UPLOAD COMPLETED ===");
        console.log("Blob URL:", blob?.url);
        console.log("Token payload:", tokenPayload);
      },
    });

    console.log("=== handleUpload SUCCESS ===");
    console.log("Response type:", jsonResponse?.type);

    return res.status(200).json(jsonResponse);
  } catch (error) {
    console.error("========== UPLOAD ERROR ==========");
    console.error("Error object:", error);
    console.error("Error name:", error?.name);
    console.error("Error message:", error?.message);
    console.error("Error stack:", error?.stack);
    console.error("Error cause:", error?.cause);

    try {
      console.error(
        "Error JSON:",
        JSON.stringify(
          error,
          Object.getOwnPropertyNames(error),
          2
        )
      );
    } catch (jsonError) {
      console.error(
        "Could not stringify error:",
        jsonError
      );
    }

    console.error(
      "BLOB_READ_WRITE_TOKEN exists:",
      !!process.env.BLOB_READ_WRITE_TOKEN
    );

    console.error(
      "BLOB_STORE_ID exists:",
      !!process.env.BLOB_STORE_ID
    );

    console.error("========== END UPLOAD ERROR ==========");

    return res.status(500).json({
      error: error?.message || String(error),
      name: error?.name || null,
      cause: error?.cause
        ? String(error.cause)
        : null,
    });
  }
}
