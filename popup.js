const statusEl = document.querySelector("#status");
const outputEl = document.querySelector("#output");
const modeEl = document.querySelector("#mode");
const refreshBtn = document.querySelector("#refresh");
const copyBtn = document.querySelector("#copy");
const downloadMdBtn = document.querySelector("#downloadMd");
const downloadBtn = document.querySelector("#download");

function setStatus(message) {
  statusEl.textContent = message;
}

function formatDate(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toISOString();
}

function slugify(value) {
  const base = String(value || "twitter-export")
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/[^a-z0-9\u4e00-\u9fa5]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return base || "twitter-export";
}

function safeFileName(value, fallback = "x-article") {
  const name = String(value || fallback)
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[. ]+$/g, "")
    .slice(0, 120);
  return name || fallback;
}

function looksLikeUiTitle(value) {
  const text = String(value || "").trim();
  return !text ||
    ["对话", "文章", "主页", "搜索", "通知", "更多", "个人资料", "X", "Twitter"].includes(text) ||
    /^@\w+$/.test(text) ||
    /^https?:\/\//i.test(text);
}

function firstMeaningfulArticleText(article) {
  const block = (article?.blocks || []).find((item) => {
    const text = String(item?.text || "").trim();
    return item?.type === "text" &&
      text.length >= 8 &&
      !looksLikeUiTitle(text) &&
      !/^原文链接[:：]/.test(text) &&
      !/^发布时间[:：]/.test(text) &&
      !/^作者[:：]/.test(text);
  });
  return block?.text || "";
}

function firstMeaningfulTweetText(payload) {
  const tweet = (payload?.tweets || []).find((item) => String(item?.text || "").trim().length >= 8);
  return tweet?.text || "";
}

function exportBaseName(payload) {
  const articleTitle = payload?.article?.title || "";
  const candidate = looksLikeUiTitle(articleTitle)
    ? firstMeaningfulArticleText(payload?.article) || firstMeaningfulTweetText(payload) || payload?.page?.title
    : articleTitle;

  return safeFileName(candidate, "x-article");
}

let lastPayload = null;

function getImageExtension(src) {
  try {
    const url = new URL(src);
    const format = url.searchParams.get("format");
    if (format) return format.replace(/[^a-z0-9]/gi, "").toLowerCase() || "jpg";
    const match = url.pathname.match(/\.([a-z0-9]+)$/i);
    return match ? match[1].toLowerCase() : "jpg";
  } catch {
    return "jpg";
  }
}

function imageFileName(tweet, imageIndex, src) {
  const id = tweet.id || `tweet-${tweet.index || 0}`;
  return `images/${id}-image-${imageIndex + 1}.${getImageExtension(src)}`;
}

function articleImageFileName(article, imageIndex, src) {
  const sourceId = article.url ? slugify(article.url).slice(-60) : "article";
  return `images/${sourceId}-image-${imageIndex + 1}.${getImageExtension(src)}`;
}

function markdownForTweet(tweet, position, total, options = {}) {
  const author = tweet.author || {};
  const titleBits = [];
  if (author.name) titleBits.push(author.name);
  if (author.handle) titleBits.push(author.handle);
  const heading = titleBits.length ? titleBits.join(" ") : `Tweet ${position}`;
  const lines = [];

  lines.push(`## ${total > 1 ? `${position}. ` : ""}${heading}`);
  if (tweet.url) lines.push(`- 原文链接：${tweet.url}`);
  if (tweet.publishedAt) lines.push(`- 发布时间：${formatDate(tweet.publishedAt)}`);
  if (author.profileUrl) lines.push(`- 作者主页：${author.profileUrl}`);
  lines.push("");

  if (tweet.text) {
    lines.push(tweet.text);
    lines.push("");
  }

  if (tweet.images?.length) {
    lines.push("配图：");
    tweet.images.forEach((src, index) => {
      const imageSrc = options.embeddedImages?.[src] || (options.localImages ? imageFileName(tweet, index, src) : src);
      lines.push(`![${author.handle || "tweet"} image ${index + 1}](${imageSrc})`);
    });
    if (options.includeImageUrls !== false) {
      lines.push("");
      lines.push("配图 URL：");
      tweet.images.forEach((src, index) => {
        lines.push(`${index + 1}. ${src}`);
      });
    }
    lines.push("");
  }

  if (tweet.videos?.length) {
    lines.push("视频：");
    tweet.videos.forEach((src) => lines.push(`- ${src}`));
    lines.push("");
  }

  return lines.join("\n").trim();
}

function markdownForArticle(article, options = {}) {
  const author = article.author || {};
  const lines = [`# ${article.title || "X Article"}`, ""];

  if (article.url) lines.push(`原文链接：${article.url}`);
  if (article.publishedAt) lines.push(`发布时间：${formatDate(article.publishedAt)}`);
  if (author.name || author.handle) lines.push(`作者：${[author.name, author.handle].filter(Boolean).join(" ")}`);
  if (author.profileUrl) lines.push(`作者主页：${author.profileUrl}`);
  lines.push("");

  let imageIndex = 0;
  (article.blocks || []).forEach((block) => {
    if (block.type === "text") {
      lines.push(block.text);
      lines.push("");
      return;
    }

    if (block.type === "image") {
      const originalSrc = block.src;
      const imageSrc = options.embeddedImages?.[originalSrc] ||
        (options.localImages ? articleImageFileName(article, imageIndex, originalSrc) : originalSrc);
      lines.push(`![${block.alt || "article image"}](${imageSrc})`);
      lines.push("");
      imageIndex += 1;
    }
  });

  return lines.join("\n").replace(/\n{3,}/g, "\n\n").trim() + "\n";
}

function buildMarkdown(payload, options = {}) {
  if (payload.article) {
    return markdownForArticle(payload.article, options);
  }

  const page = payload.page || {};
  const tweets = payload.tweets || [];
  const firstTweet = tweets[0] || {};
  const firstAuthor = firstTweet.author || {};
  const title = firstAuthor.handle
    ? `${firstAuthor.handle} Twitter Export`
    : page.title || "Twitter Export";

  const lines = [`# ${title}`, ""];

  if (page.url) lines.push(`页面来源：${page.url}`);
  if (page.capturedAt) lines.push(`抓取时间：${formatDate(page.capturedAt)}`);
  lines.push(`推文数量：${tweets.length}`);
  lines.push("");

  if (!tweets.length) {
    lines.push("> 没有在当前页面识别到可导出的推文。请先打开一条推文、线程或用户主页，并等待内容加载完成。");
  } else {
    lines.push(tweets.map((tweet, index) => markdownForTweet(tweet, index + 1, tweets.length, options)).join("\n\n---\n\n"));
  }

  return lines.join("\n").trim() + "\n";
}

function crc32(bytes) {
  let crc = -1;
  for (let i = 0; i < bytes.length; i += 1) {
    crc ^= bytes[i];
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }
  return (crc ^ -1) >>> 0;
}

function dosDateTime(date = new Date()) {
  const year = Math.max(1980, date.getFullYear());
  const dosTime = (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2);
  const dosDate = ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate();
  return { dosTime, dosDate };
}

function u16(value) {
  return [value & 255, (value >>> 8) & 255];
}

function u32(value) {
  return [value & 255, (value >>> 8) & 255, (value >>> 16) & 255, (value >>> 24) & 255];
}

function concatUint8Arrays(chunks) {
  const size = chunks.reduce((total, chunk) => total + chunk.length, 0);
  const output = new Uint8Array(size);
  let offset = 0;
  chunks.forEach((chunk) => {
    output.set(chunk, offset);
    offset += chunk.length;
  });
  return output;
}

function bytesToBase64(bytes) {
  const chunkSize = 0x8000;
  let binary = "";
  for (let index = 0; index < bytes.length; index += chunkSize) {
    const chunk = bytes.subarray(index, index + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
}

function mimeFromImage(src, contentType) {
  if (contentType && /^image\//i.test(contentType)) return contentType.split(";")[0];
  const ext = getImageExtension(src);
  if (ext === "png") return "image/png";
  if (ext === "webp") return "image/webp";
  if (ext === "gif") return "image/gif";
  return "image/jpeg";
}

async function fetchImageAsDataUrl(src) {
  const response = await fetch(src, { credentials: "omit" });
  if (!response.ok) {
    throw new Error(`图片下载失败：${src}`);
  }
  const bytes = new Uint8Array(await response.arrayBuffer());
  const mime = mimeFromImage(src, response.headers.get("content-type") || "");
  return `data:${mime};base64,${bytesToBase64(bytes)}`;
}

async function buildEmbeddedMarkdown(payload) {
  const embeddedImages = {};
  const imageUrls = [];

  if (payload.article) {
    (payload.article.images || []).forEach((src) => {
      if (!embeddedImages[src]) imageUrls.push(src);
    });
  }

  (payload.tweets || []).forEach((tweet) => {
    (tweet.images || []).forEach((src) => {
      if (!embeddedImages[src]) imageUrls.push(src);
    });
  });

  for (let index = 0; index < imageUrls.length; index += 1) {
    const src = imageUrls[index];
    setStatus(`正在嵌入配图 ${index + 1}/${imageUrls.length}...`);
    embeddedImages[src] = await fetchImageAsDataUrl(src);
  }

  return buildMarkdown(payload, {
    embeddedImages,
    includeImageUrls: false
  });
}

function createZip(files) {
  const encoder = new TextEncoder();
  const now = dosDateTime();
  const localChunks = [];
  const centralChunks = [];
  let offset = 0;

  files.forEach((file) => {
    const name = encoder.encode(file.name.replace(/\\/g, "/"));
    const data = file.data instanceof Uint8Array ? file.data : encoder.encode(file.data);
    const crc = crc32(data);

    const localHeader = new Uint8Array([
      ...u32(0x04034b50),
      ...u16(20),
      ...u16(0x0800),
      ...u16(0),
      ...u16(now.dosTime),
      ...u16(now.dosDate),
      ...u32(crc),
      ...u32(data.length),
      ...u32(data.length),
      ...u16(name.length),
      ...u16(0)
    ]);

    localChunks.push(localHeader, name, data);

    const centralHeader = new Uint8Array([
      ...u32(0x02014b50),
      ...u16(20),
      ...u16(20),
      ...u16(0x0800),
      ...u16(0),
      ...u16(now.dosTime),
      ...u16(now.dosDate),
      ...u32(crc),
      ...u32(data.length),
      ...u32(data.length),
      ...u16(name.length),
      ...u16(0),
      ...u16(0),
      ...u16(0),
      ...u16(0),
      ...u32(0),
      ...u32(offset)
    ]);

    centralChunks.push(centralHeader, name);
    offset += localHeader.length + name.length + data.length;
  });

  const centralSize = centralChunks.reduce((total, chunk) => total + chunk.length, 0);
  const centralOffset = offset;
  const endRecord = new Uint8Array([
    ...u32(0x06054b50),
    ...u16(0),
    ...u16(0),
    ...u16(files.length),
    ...u16(files.length),
    ...u32(centralSize),
    ...u32(centralOffset),
    ...u16(0)
  ]);

  return new Blob([...localChunks, ...centralChunks, endRecord], { type: "application/zip" });
}

async function getActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

async function ensureContentScript(tabId) {
  try {
    await chrome.tabs.sendMessage(tabId, { type: "XTM_PING" });
  } catch {
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ["content.js"]
    });
  }
}

async function exportTweets() {
  refreshBtn.disabled = true;
  copyBtn.disabled = true;
  downloadBtn.disabled = true;
  setStatus("正在读取页面内容...");

  try {
    const tab = await getActiveTab();
    const url = tab?.url || "";

    if (!/^https:\/\/(x|twitter)\.com\//.test(url)) {
      throw new Error("请先切换到 x.com 或 twitter.com 页面。");
    }

    await ensureContentScript(tab.id);
    const payload = await chrome.tabs.sendMessage(tab.id, {
      type: "XTM_EXPORT_TWEETS",
      mode: modeEl.value
    });

    if (!payload?.ok) {
      throw new Error(payload?.error || "页面提取失败。");
    }

    const markdown = buildMarkdown(payload);
    lastPayload = payload;
    outputEl.value = markdown;
    setStatus(payload.article ? "已生成 1 篇 X 文章的 Markdown。" : `已生成 ${payload.tweets.length} 条推文的 Markdown。`);
    copyBtn.disabled = !markdown;
    downloadMdBtn.disabled = !markdown;
    downloadBtn.disabled = !markdown;
  } catch (error) {
    outputEl.value = "";
    setStatus(error instanceof Error ? error.message : String(error));
  } finally {
    refreshBtn.disabled = false;
  }
}

async function copyMarkdown() {
  copyBtn.disabled = true;
  downloadMdBtn.disabled = true;
  downloadBtn.disabled = true;

  try {
    if (!lastPayload) {
      await exportTweets();
    }

    const markdown = await buildEmbeddedMarkdown(lastPayload);
    await navigator.clipboard.writeText(markdown);
    outputEl.value = markdown;
    setStatus("已复制完整 Markdown，图片已嵌入文本。");
  } finally {
    copyBtn.disabled = false;
    downloadMdBtn.disabled = false;
    downloadBtn.disabled = false;
  }
}

async function downloadEmbeddedMarkdown() {
  downloadMdBtn.disabled = true;
  copyBtn.disabled = true;
  downloadBtn.disabled = true;

  try {
    if (!lastPayload) {
      await exportTweets();
    }

    const markdown = await buildEmbeddedMarkdown(lastPayload);
    outputEl.value = markdown;
    const blob = new Blob([markdown], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${exportBaseName(lastPayload)}.md`;
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
    setStatus("已开始下载完整 Markdown 文件。");
  } finally {
    downloadMdBtn.disabled = false;
    copyBtn.disabled = false;
    downloadBtn.disabled = false;
  }
}

async function downloadOfflinePackage() {
  if (!lastPayload) {
    await exportTweets();
  }

  const payload = lastPayload;
  const files = [];
  const imageJobs = [];

  if (payload.article) {
    (payload.article.images || []).forEach((src, index) => {
      imageJobs.push({ src, name: articleImageFileName(payload.article, index, src) });
    });
  }

  (payload.tweets || []).forEach((tweet) => {
    (tweet.images || []).forEach((src, index) => {
      imageJobs.push({ src, name: imageFileName(tweet, index, src) });
    });
  });

  setStatus(`正在下载 ${imageJobs.length} 张配图...`);
  downloadBtn.disabled = true;

  for (let index = 0; index < imageJobs.length; index += 1) {
    const job = imageJobs[index];
    const response = await fetch(job.src, { credentials: "omit" });
    if (!response.ok) {
      throw new Error(`图片下载失败：${job.src}`);
    }
    const data = new Uint8Array(await response.arrayBuffer());
    files.push({ name: job.name, data });
    setStatus(`正在下载配图 ${index + 1}/${imageJobs.length}...`);
  }

  const offlineMarkdown = buildMarkdown(payload, {
    localImages: true,
    includeImageUrls: false
  });

  files.unshift({ name: "index.md", data: offlineMarkdown });
  files.push({
    name: "README.txt",
    data: "解压这个 zip 后，用支持 Markdown 预览的软件打开 index.md。图片已保存在 images 文件夹，断网后仍可查看。\n"
  });

  const blob = createZip(files);
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `${exportBaseName(payload)}-离线包.zip`;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
  setStatus("已开始下载离线 zip 包。");
  downloadBtn.disabled = false;
}

refreshBtn.addEventListener("click", exportTweets);
copyBtn.addEventListener("click", copyMarkdown);
downloadMdBtn.addEventListener("click", () => {
  downloadEmbeddedMarkdown().catch((error) => {
    setStatus(error instanceof Error ? error.message : String(error));
    downloadMdBtn.disabled = false;
    copyBtn.disabled = false;
    downloadBtn.disabled = false;
  });
});
downloadBtn.addEventListener("click", () => {
  downloadOfflinePackage().catch((error) => {
    setStatus(error instanceof Error ? error.message : String(error));
    downloadBtn.disabled = false;
  });
});
modeEl.addEventListener("change", exportTweets);

copyBtn.disabled = true;
downloadMdBtn.disabled = true;
downloadBtn.disabled = true;
exportTweets();
