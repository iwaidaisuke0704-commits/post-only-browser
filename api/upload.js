export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({
      error: "Method not allowed",
    });
  }

  try {
    console.log("=== /api/upload START ===");

    console.log(
      "BLOB_READ_WRITE_TOKEN exists:",
      !!process.env.BLOB_READ_WRITE_TOKEN
    );

    console.log(
      "BLOB_STORE_ID exists:",
      !!process.env.BLOB_STORE_ID
    );

    // -----------------------------------------
    // Dynamic import
    // -----------------------------------------
    let handleUpload;

    try {
      console.log(
        "Trying dynamic import: @vercel/blob/client"
      );

      const blobClient = await import(
        "@vercel/blob/client"
      );

      console.log(
        "Dynamic import SUCCESS"
      );

      console.log(
        "Module exports:",
        Object.keys(blobClient)
      );

      handleUpload = blobClient.handleUpload;

      if (typeof handleUpload !== "function") {
        throw new Error(
          "handleUpload was not exported from @vercel/blob/client"
        );
      }

    } catch (importError) {

      console.error(
        "========== BLOB IMPORT ERROR =========="
      );

      console.error(
        "Import error object:",
        importError
      );

      console.error(
        "Import error name:",
        importError?.name
      );

      console.error(
        "Import error message:",
        importError?.message
      );

      console.error(
        "Import error stack:",
        importError?.stack
      );

      console.error(
        "Import error cause:",
        importError?.cause
      );

      console.error(
        "========== END BLOB IMPORT ERROR =========="
      );

      return res.status(500).json({
        stage: "dynamic-import",
        error:
          importError?.message ||
          String(importError),
        name:
          importError?.name ||
          null,
        stack:
          importError?.stack ||
          null,
        cause:
          importError?.cause
            ? String(importError.cause)
            : null,
      });
    }


    // -----------------------------------------
    // Blob client token
    // -----------------------------------------

    const body = req.body;

    console.log(
      "Calling handleUpload..."
    );

    const jsonResponse =
      await handleUpload({
        body,
        request: req,

        onBeforeGenerateToken:
          async (pathname) => {

            console.log(
              "onBeforeGenerateToken called"
            );

            console.log(
              "pathname:",
              pathname
            );

            return {
              allowedContentTypes: [
                "image/jpeg",
                "image/png",
                "image/webp",
                "image/heic",
                "image/heif",
              ],

              addRandomSuffix: true,

              tokenPayload:
                JSON.stringify({
                  purpose:
                    "scheduled-post",
                }),
            };
          },

        onUploadCompleted:
          async ({
            blob,
            tokenPayload,
          }) => {

            console.log(
              "=== UPLOAD COMPLETED ==="
            );

            console.log(
              "Blob URL:",
              blob?.url
            );

            console.log(
              "Token payload:",
              tokenPayload
            );
          },
      });


    console.log(
      "=== handleUpload SUCCESS ==="
    );

    return res
      .status(200)
      .json(jsonResponse);


  } catch (error) {

    console.error(
      "========== HANDLE UPLOAD ERROR =========="
    );

    console.error(
      "Error object:",
      error
    );

    console.error(
      "Error name:",
      error?.name
    );

    console.error(
      "Error message:",
      error?.message
    );

    console.error(
      "Error stack:",
      error?.stack
    );

    console.error(
      "Error cause:",
      error?.cause
    );

    console.error(
      "BLOB_READ_WRITE_TOKEN exists:",
      !!process.env.BLOB_READ_WRITE_TOKEN
    );

    console.error(
      "BLOB_STORE_ID exists:",
      !!process.env.BLOB_STORE_ID
    );

    console.error(
      "========== END HANDLE UPLOAD ERROR =========="
    );

    return res.status(500).json({
      stage: "handle-upload",

      error:
        error?.message ||
        String(error),

      name:
        error?.name ||
        null,

      stack:
        error?.stack ||
        null,

      cause:
        error?.cause
          ? String(error.cause)
          : null,
    });
  }
}
