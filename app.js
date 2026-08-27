const file = document.querySelector("#file");
const preview = document.querySelector("#preview");
const pickArea = document.querySelector("#pickArea");
const pickText = document.querySelector("#pickText");
const imageTools = document.querySelector("#imageTools");
const imageCount = document.querySelector("#imageCount");
const addImages = document.querySelector("#addImages");
const clearImages = document.querySelector("#clearImages");
const caption = document.querySelector("#caption");
const toX = document.querySelector("#toX");
const toIg = document.querySelector("#toIg");
const send = document.querySelector("#send");
const status = document.querySelector("#status");
const postNow = document.querySelector("#postNow");
const postLater = document.querySelector("#postLater");
const scheduleBox = document.querySelector("#scheduleBox");
const scheduleButton = document.querySelector("#scheduleButton");
const scheduleButtonText = document.querySelector("#scheduleButtonText");
const scheduleAt = document.querySelector("#scheduleAt");
const aiInstruction = document.querySelector("#aiInstruction");
const aiGenerate = document.querySelector("#aiGenerate");

function showError(message) {
  status.classList.add("error");
  status.textContent = message;
}

function clearStatus() {
  status.classList.remove("error");
  status.textContent = "";
}

let selectedFiles = [];

function renderPreview() {
  preview.innerHTML = "";

  if (!selectedFiles.length) {
    pickText.style.display = "grid";
    imageTools.style.display = "none";
    imageCount.textContent = "";
    return;
  }

  pickText.style.display = "none";
  imageTools.style.display = "flex";
  imageCount.textContent = `${selectedFiles.length}枚選択中`;

  selectedFiles.forEach((f, index) => {
    const item = document.createElement("div");
    item.className = "previewItem";

    const img = document.createElement("img");
    const objectUrl = URL.createObjectURL(f);
    img.src = objectUrl;

    img.onload = () => URL.revokeObjectURL(objectUrl);

    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      showError(`画像${index + 1}のプレビューを表示できませんでした`);
    };

    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "removeImage";
    remove.textContent = "×";
    remove.setAttribute("aria-label", `${index + 1}枚目を削除`);

    remove.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      selectedFiles.splice(index, 1);
      renderPreview();
      clearStatus();
    });

    item.appendChild(img);
    item.appendChild(remove);
    preview.appendChild(item);
  });
}

file.addEventListener("change", () => {
  clearStatus();

  const newFiles = Array.from(file.files || []);
  if (!newFiles.length) return;

  selectedFiles = [...selectedFiles, ...newFiles];

  if (selectedFiles.length > 10) {
    selectedFiles = selectedFiles.slice(0, 10);
    status.textContent = "画像は最大10枚までです";
  }

  renderPreview();
  file.value = "";
});

function openImagePicker() {
  file.value = "";
  file.click();
}

addImages.addEventListener("click", (e) => {
  e.preventDefault();
  e.stopPropagation();
  openImagePicker();
});

pickArea.addEventListener("click", (e) => {
  if (e.target === file) return;
  if (e.target.closest(".removeImage")) return;
  openImagePicker();
});

pickArea.addEventListener("keydown", (e) => {
  if (e.key === "Enter" || e.key === " ") {
    e.preventDefault();
    openImagePicker();
  }
});

clearImages.addEventListener("click", (e) => {
  e.preventDefault();
  e.stopPropagation();

  selectedFiles = [];
  file.value = "";
  renderPreview();
  clearStatus();
});

function updateTimingUI() {
  if (postLater.checked) {
    scheduleBox.style.display = "block";
    send.textContent = "投稿を予約する";
  } else {
    scheduleBox.style.display = "none";
    send.textContent = "投稿する";
  }
}

postNow.addEventListener("change", updateTimingUI);
postLater.addEventListener("change", updateTimingUI);

function updateMinimumScheduleTime() {
  const now = new Date();
  const local = new Date(
    now.getTime() - now.getTimezoneOffset() * 60000
  );
  scheduleAt.min = local.toISOString().slice(0, 16);
}

function updateScheduleButton() {
  if (!scheduleAt.value) {
    scheduleButtonText.textContent = "📅 日時を選ぶ";
    scheduleButton.classList.remove("selected");
    return;
  }

  const date = new Date(scheduleAt.value);

  if (Number.isNaN(date.getTime())) {
    scheduleButtonText.textContent = "📅 日時を選ぶ";
    scheduleButton.classList.remove("selected");
    return;
  }

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hour = String(date.getHours()).padStart(2, "0");
  const minute = String(date.getMinutes()).padStart(2, "0");

  scheduleButtonText.textContent =
    `📅 ${year}/${month}/${day} ${hour}:${minute}`;

  scheduleButton.classList.add("selected");
}

scheduleButton.addEventListener("click", () => {
  clearStatus();
  updateMinimumScheduleTime();

  try {
    if (typeof scheduleAt.showPicker === "function") {
      scheduleAt.showPicker();
      return;
    }
  } catch (error) {
    console.log("showPicker fallback:", error);
  }

  scheduleAt.focus();
  scheduleAt.click();
});

scheduleAt.addEventListener("change", updateScheduleButton);
scheduleAt.addEventListener("input", updateScheduleButton);

async function uploadFileToBlob(f) {
  const response = await fetch("/api/upload", {
    method: "POST",
    headers: {
      "Content-Type": f.type || "application/octet-stream",
      "X-File-Name": encodeURIComponent(f.name || "image"),
    },
    body: f,
  });

  let result;

  try {
    result = await response.json();
  } catch {
    throw new Error(
      `画像アップロード応答エラー (${response.status})`
    );
  }

  if (!response.ok || !result.ok) {
    throw new Error(
      result.error ||
      `画像アップロード失敗 (${response.status})`
    );
  }

  return {
    url: result.url,
    mimeType:
      result.mimeType ||
      f.type ||
      "image/jpeg",
  };
}

async function makeInstagramBlob(f) {
  const bitmap = await createImageBitmap(f);
  const canvas = document.createElement("canvas");

  canvas.width = 1080;
  canvas.height = 1350;

  const ctx = canvas.getContext("2d");

  if (!ctx) {
    bitmap.close();
    throw new Error("画像処理用Canvasを作成できませんでした");
  }

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, 1080, 1350);

  const scale = Math.min(
    1080 / bitmap.width,
    1350 / bitmap.height
  );

  const drawWidth = Math.round(bitmap.width * scale);
  const drawHeight = Math.round(bitmap.height * scale);
  const x = Math.round((1080 - drawWidth) / 2);
  const y = Math.round((1350 - drawHeight) / 2);

  ctx.drawImage(bitmap, x, y, drawWidth, drawHeight);
  bitmap.close();

  const jpegBlob = await new Promise((resolve, reject) => {
    canvas.toBlob(
      value => value
        ? resolve(value)
        : reject(new Error("Instagram画像の生成に失敗しました")),
      "image/jpeg",
      0.92
    );
  });

  return uploadFileToBlob(
    new File(
      [jpegBlob],
      `instagram-${crypto.randomUUID()}.jpg`,
      { type: "image/jpeg" }
    )
  );
}


aiGenerate.addEventListener("click", async () => {
  clearStatus();

  const instruction = aiInstruction.value.trim();
  const currentCaption = caption.value.trim();

  if (!instruction && !currentCaption) {
    status.textContent = "AIへの指示か、元になる投稿文を入力してください";
    return;
  }

  aiGenerate.disabled = true;
  status.textContent = "AIが文章を作っています…";

  try {
    const prompt = [
      instruction || "投稿文を自然で読みやすく整えてください。",
      currentCaption ? `元の投稿文:\n${currentCaption}` : ""
    ].filter(Boolean).join("\n\n");

    const response = await fetch("/api/ai", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: prompt })
    });

    let result;
    try {
      result = await response.json();
    } catch {
      throw new Error(`AIサーバー応答エラー (${response.status})`);
    }

    if (!response.ok || !result.ok) {
      throw new Error(result.error || `AI生成に失敗しました (${response.status})`);
    }

    caption.value = result.text || "";
    status.textContent = "✓ AI文章を作成しました";
  } catch (error) {
    console.error("AI generation error:", error);
    showError(error?.message || "AI文章生成でエラーが発生しました");
  } finally {
    aiGenerate.disabled = false;
  }
});

send.addEventListener("click", async () => {
  clearStatus();

  const text = caption.value.trim();
  const files = [...selectedFiles];

  if (!text) {
    status.textContent = "投稿文を入力してください";
    return;
  }

  if (!toX.checked && !toIg.checked) {
    status.textContent = "投稿先を選んでください";
    return;
  }

  if (toIg.checked && files.length === 0) {
    status.textContent = "Instagram投稿には画像が必要です";
    return;
  }

  if (toX.checked && files.length > 4) {
    status.textContent = "Xは最大4枚です";
    return;
  }

  if (toIg.checked && files.length > 10) {
    status.textContent = "Instagramは最大10枚です";
    return;
  }

  let scheduledDate = null;

  if (postLater.checked) {
    if (!scheduleAt.value) {
      status.textContent = "予約日時を選んでください";
      return;
    }

    scheduledDate = new Date(scheduleAt.value);

    if (Number.isNaN(scheduledDate.getTime())) {
      status.textContent = "予約日時が正しくありません";
      return;
    }

    if (scheduledDate.getTime() <= Date.now()) {
      status.textContent = "未来の日時を選んでください";
      return;
    }
  }

  send.disabled = true;
  addImages.disabled = true;
  clearImages.disabled = true;

  try {
    const body = {
      caption: text,
      x: toX.checked,
      instagram: toIg.checked,
      images: [],
      xImages: []
    };

    if (toX.checked && files.length) {
      status.textContent =
        `X用画像をアップロード中… ${files.length}枚`;

      body.xImages = await Promise.all(
        files.map((f) => uploadFileToBlob(f))
      );
    }

    if (toIg.checked && files.length) {
      status.textContent =
        `Instagram用画像をアップロード中… ${files.length}枚`;

      body.images = await Promise.all(
        files.map((f) => makeInstagramBlob(f))
      );
    }

    let endpoint;

    if (postLater.checked) {
      body.scheduleAt = scheduledDate.toISOString();
      endpoint = "/api/schedule";
      status.textContent = "予約を保存しています…";
    } else {
      endpoint = "/api/publish";
      status.textContent = "投稿中…";
    }

    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(body)
    });

    let result;

    try {
      result = await response.json();
    } catch {
      throw new Error(
        `サーバー応答エラー (${response.status})`
      );
    }

    if (response.ok && result.ok) {
      status.textContent =
        postLater.checked
          ? "✓ 投稿を予約しました"
          : "✓ 投稿しました";

      caption.value = "";
      selectedFiles = [];
      file.value = "";
      renderPreview();

      if (postLater.checked) {
        scheduleAt.value = "";
        updateScheduleButton();
        updateMinimumScheduleTime();
      }

      return;
    }

    throw new Error(
      result.errors?.instagram ||
      result.errors?.x ||
      result.error ||
      (
        postLater.checked
          ? `予約できませんでした (${response.status})`
          : `投稿できませんでした (${response.status})`
      )
    );

  } catch (error) {
    console.error(
      postLater.checked
        ? "Schedule error:"
        : "Publish error:",
      error
    );

    showError(
      error?.message ||
      (
        postLater.checked
          ? "予約処理でエラーが発生しました"
          : "画像処理または接続でエラーが発生しました"
      )
    );

  } finally {
    send.disabled = false;
    addImages.disabled = false;
    clearImages.disabled = false;
  }
});

window.addEventListener("error", (event) => {
  console.error(
    "JavaScript Error:",
    event.error || event
  );

  const line =
    event.lineno
      ? ` / 行:${event.lineno}`
      : "";

  const column =
    event.colno
      ? `:${event.colno}`
      : "";

  showError(
    `JSエラー: ${
      event.message ||
      "不明なエラー"
    }${line}${column}`
  );
});

window.addEventListener(
  "unhandledrejection",
  (event) => {
    console.error(
      "Unhandled Promise Rejection:",
      event.reason
    );

    const reason =
      event.reason?.message ||
      String(
        event.reason ||
        "不明なエラー"
      );

    showError(
      `Promiseエラー: ${reason}`
    );
  }
);

renderPreview();
updateTimingUI();
updateMinimumScheduleTime();
updateScheduleButton();
