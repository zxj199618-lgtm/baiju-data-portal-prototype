/**
 * 灵犀智析的图片附件（对话里粘贴图片、负反馈加截图共用）与负反馈上下文的收集。
 * 纯函数在这里；真正读文件、画布压缩依赖浏览器，放在 compressImage / makeThumb 里。
 * 依赖 core.js（window.PortalVue）；必须先于 page-analysis-workbench.js 加载。
 */
(() => {
  "use strict";
  if (!window.PortalVue) return;

  const MAX_IMAGES = 3;
  const MAX_EDGE = 1600;          // 发给模型 / 服务器的图片长边上限
  const THUMB_EDGE = 160;         // 聊天记录里只留缩略图，原图不进历史
  const MAX_FILE_BYTES = 20 * 1024 * 1024; // 单个原始文件超过这个就不处理（压缩前）

  /** 等比缩到长边不超过 max，不放大；宽高至少为 1。 */
  function scaleToFit(width, height, max) {
    const w = Math.max(1, Number(width) || 1), h = Math.max(1, Number(height) || 1);
    const ratio = Math.min(1, max / Math.max(w, h));
    return { width: Math.max(1, Math.round(w * ratio)), height: Math.max(1, Math.round(h * ratio)) };
  }

  /** 从文件列表里挑图片：不是图片的忽略，按剩余名额截取，超出的张数和过大的文件数分别返回。 */
  function pickImageFiles(files, existingCount) {
    const result = { accepted: [], overflow: 0, tooBig: 0 };
    const room = Math.max(0, MAX_IMAGES - (Number(existingCount) || 0));
    for (const file of Array.isArray(files) ? files : Array.from(files || [])) {
      if (!file || typeof file.type !== "string" || !file.type.startsWith("image/")) continue;
      if (file.size > MAX_FILE_BYTES) { result.tooBig += 1; continue; }
      if (result.accepted.length < room) result.accepted.push(file); else result.overflow += 1;
    }
    return result;
  }

  /** 剪贴板 / 拖入的数据里取出图片文件（只看 kind 为 file 且类型是 image/* 的条目）。 */
  function filesFromClipboard(data) {
    if (!data) return [];
    const fromItems = Array.from(data.items || []).filter(item => item && item.kind === "file" && String(item.type).startsWith("image/")).map(item => item.getAsFile()).filter(Boolean);
    if (fromItems.length || (data.items && data.items.length)) return fromItems;
    return Array.from(data.files || []).filter(file => file && String(file.type).startsWith("image/"));
  }

  /** data URL 解码后的字节数（不真的解码，按 base64 长度算）。 */
  function dataUrlBytes(url) {
    const match = typeof url === "string" ? url.match(/^data:[^;]+;base64,([A-Za-z0-9+/]*)(={0,2})$/) : null;
    return match ? Math.floor((match[1].length + match[2].length) * 3 / 4) - match[2].length : 0;
  }

  /**
   * 负反馈自动带上的上下文：问题 = 这条回答前面最近的用户消息；对话 = 到这条回答为止的最近 6 条有内容的消息
   * （只取文字：不含图片、不含思考过程）；再加业务线、引用的表、模型、思考档位、skill、会话、页面、浏览器等。
   * textOf 由调用方传入（取一条消息的纯文字）。
   */
  function buildFeedbackContext({ messages, index, businessLine, tables, model, reasoning, skill, sessionId, page, userAgent, appVersion, viewport, elapsedSeconds, textOf }) {
    const upto = (messages || []).slice(0, index + 1);
    const turns = upto.map(msg => ({ role: msg.role === "assistant" ? "assistant" : "user", text: String(textOf(msg) || "").trim() })).filter(item => item.text);
    const lastUser = [...upto].reverse().find(msg => msg.role === "user");
    const context = {
      question: lastUser ? String(textOf(lastUser) || "").trim() : "",
      conversation: turns.slice(-6),
      businessLine: businessLine || "", tables: tables || [], model: model || "", reasoning: reasoning || "", skill: skill || "",
      sessionId: sessionId || "", page: page || "", userAgent: userAgent || "", appVersion: appVersion || "", viewport: viewport || ""
    };
    if (typeof elapsedSeconds === "number" && Number.isFinite(elapsedSeconds)) context.elapsedSeconds = elapsedSeconds;
    return context;
  }

  /* ---------- 以下依赖浏览器（画布 / FileReader），不在单元测试里跑 ---------- */
  const readAsDataUrl = file => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error("读取图片失败"));
    reader.readAsDataURL(file);
  });
  const loadImage = url => new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("这张图片无法打开"));
    image.src = url;
  });
  function drawToJpeg(image, maxEdge, quality) {
    const { width, height } = scaleToFit(image.naturalWidth || image.width, image.naturalHeight || image.height, maxEdge);
    const canvas = document.createElement("canvas");
    canvas.width = width; canvas.height = height;
    const context = canvas.getContext("2d");
    context.fillStyle = "#fff"; // 透明底（截图 / PNG）铺白，避免转 JPEG 后变黑
    context.fillRect(0, 0, width, height);
    context.drawImage(image, 0, 0, width, height);
    return canvas.toDataURL("image/jpeg", quality);
  }
  /** 读文件 → 长边 ≤ 1600 的 JPEG data URL（服务器只认 PNG / JPEG / WebP，统一转成 JPEG，体积也小）。 */
  async function compressImage(file) {
    const image = await loadImage(await readAsDataUrl(file));
    let quality = 0.85, url = drawToJpeg(image, MAX_EDGE, quality);
    while (dataUrlBytes(url) > 1.4 * 1024 * 1024 && quality > 0.4) { quality -= 0.15; url = drawToJpeg(image, MAX_EDGE, quality); } // 服务器单张上限 1.5 MB
    return url;
  }
  /** 聊天记录里用的缩略图。 */
  async function makeThumb(dataUrl) { return drawToJpeg(await loadImage(dataUrl), THUMB_EDGE, 0.7); }

  window.PortalVue.aiAttachments = { MAX_IMAGES, MAX_EDGE, THUMB_EDGE, scaleToFit, pickImageFiles, filesFromClipboard, dataUrlBytes, buildFeedbackContext, compressImage, makeThumb };
})();
