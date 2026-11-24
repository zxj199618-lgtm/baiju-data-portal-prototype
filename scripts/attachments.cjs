/**
 * 图片附件：对话里粘贴的图片（发给模型，不落盘）和负反馈里的截图（落盘，管理员可查看）。
 * 前端先把图片缩到长边 ≤ 1600px 再用 data URL 传上来；这里只认 PNG / JPEG / WebP，
 * 并且核对文件头和声明的类型一致（不信任浏览器说的类型，也就挡住 SVG 之类可以带脚本的格式）。
 */
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const MAX_IMAGES = 3;
const MAX_IMAGE_BYTES = 1.5 * 1024 * 1024;
const TYPES = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp" };
const MIME_OF_EXT = { png: "image/png", jpg: "image/jpeg", webp: "image/webp" };

const startsWith = (buffer, bytes) => buffer.length >= bytes.length && bytes.every((byte, index) => buffer[index] === byte);
const SIGNATURES = {
  "image/png": buffer => startsWith(buffer, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  "image/jpeg": buffer => startsWith(buffer, [0xff, 0xd8, 0xff]),
  "image/webp": buffer => buffer.length >= 12 && buffer.toString("latin1", 0, 4) === "RIFF" && buffer.toString("latin1", 8, 12) === "WEBP"
};

/** 解析 data URL → { mime, ext, buffer, dataUrl }；不合格直接抛带中文说明的错误。 */
function parseDataUrl(value) {
  const match = typeof value === "string" ? value.match(/^data:([a-z0-9.+/-]+);base64,([A-Za-z0-9+/]+={0,2})$/i) : null;
  if (!match) throw new Error("不是有效的图片");
  const mime = match[1].toLowerCase();
  if (!TYPES[mime]) throw new Error("只支持 PNG、JPEG、WebP 图片");
  const buffer = Buffer.from(match[2], "base64");
  if (!buffer.length) throw new Error("不是有效的图片");
  if (!SIGNATURES[mime](buffer)) throw new Error("图片内容和类型不符");
  return { mime, ext: TYPES[mime], buffer, dataUrl: `data:${mime};base64,${match[2]}` };
}

/** 校验一组图片：不是数组 → 报错；空 / 未传 → []；超过张数或大小 → 报错。 */
function validateImages(list) {
  if (list === undefined || list === null) return [];
  if (!Array.isArray(list)) throw new Error("图片格式不对");
  if (list.length > MAX_IMAGES) throw new Error(`最多 ${MAX_IMAGES} 张图片`);
  return list.map(item => {
    const parsed = parseDataUrl(item);
    if (parsed.buffer.length > MAX_IMAGE_BYTES) throw new Error("单张图片不能超过 1.5 MB");
    return parsed;
  });
}

/** 反馈截图的落盘存储：只返回 id（24 位十六进制 + 扩展名），读取时严格校验 id，不会读到目录之外。 */
function createImageStore({ dir }) {
  const ID = /^[a-f0-9]{24}\.(png|jpg|webp)$/;
  const fileOf = id => (typeof id === "string" && ID.test(id) ? path.join(dir, id) : null);
  return {
    save(parsedList) {
      fs.mkdirSync(dir, { recursive: true });
      return parsedList.map(item => {
        const id = `${crypto.randomBytes(12).toString("hex")}.${item.ext}`;
        fs.writeFileSync(path.join(dir, id), item.buffer);
        return id;
      });
    },
    read(id) {
      const file = fileOf(id);
      if (!file) return null;
      try { return { buffer: fs.readFileSync(file), mime: MIME_OF_EXT[id.split(".").pop()] }; } catch { return null; }
    },
    remove(id) {
      const file = fileOf(id);
      if (!file) return false;
      try { fs.unlinkSync(file); return true; } catch { return false; }
    }
  };
}

/** 发给模型的内容：没有图片就是原来的字符串；有图片是「文字 + 每张图一个 image_url」（OpenAI 兼容的多模态格式）。 */
function toContentParts(text, parsedList) {
  if (!parsedList || !parsedList.length) return text;
  return [{ type: "text", text }, ...parsedList.map(item => ({ type: "image_url", image_url: { url: item.dataUrl } }))];
}

module.exports = { MAX_IMAGES, MAX_IMAGE_BYTES, parseDataUrl, validateImages, createImageStore, toContentParts };
