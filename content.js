(() => {
  const STATUS_RE = /\/status\/(\d+)/;
  const FLOATING_HOST_ID = "xtm-floating-export-host";
  const FLOATING_POSITION_KEY = "xtm-floating-export-position";

  function absoluteUrl(href) {
    if (!href) return "";
    try {
      return new URL(href, location.origin).toString();
    } catch {
      return href;
    }
  }

  function cleanText(value) {
    return (value || "")
      .replace(/\u00a0/g, " ")
      .replace(/[ \t]+\n/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }

  function escapeMarkdownText(value) {
    return cleanText(value)
      .replace(/\\/g, "\\\\")
      .replace(/\[/g, "\\[")
      .replace(/\]/g, "\\]");
  }

  function normalizeImageUrl(src) {
    if (!src) return "";
    try {
      const url = new URL(src);
      if (url.hostname.endsWith("twimg.com") && url.pathname.includes("/media/")) {
        url.searchParams.set("name", "large");
      }
      return url.toString();
    } catch {
      return src;
    }
  }

  function unique(items) {
    return [...new Set(items.filter(Boolean))];
  }

  function isVisible(element) {
    const rect = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    return rect.width > 0 && rect.height > 0 && style.visibility !== "hidden" && style.display !== "none";
  }

  function getStatusIdFromUrl(url) {
    const match = String(url || "").match(STATUS_RE);
    return match ? match[1] : "";
  }

  function getTweetUrl(article) {
    const time = article.querySelector("time");
    const statusLink = time?.closest("a") || article.querySelector('a[href*="/status/"]');
    return absoluteUrl(statusLink?.getAttribute("href") || "");
  }

  function getAuthor(article) {
    const userName = article.querySelector('[data-testid="User-Name"]');
    const text = cleanText(userName?.innerText || "");
    const lines = text.split("\n").map((line) => line.trim()).filter(Boolean);
    const handle = lines.find((line) => /^@/.test(line)) || "";
    const displayName = lines.find((line) => line && !/^@/.test(line) && !/^\d/.test(line)) || "";
    const profileLink = article.querySelector('a[href^="/"][role="link"]');

    return {
      name: displayName,
      handle,
      profileUrl: absoluteUrl(profileLink?.getAttribute("href") || "")
    };
  }

  function textNodeToMarkdown(root) {
    if (!root) return "";

    function walk(node) {
      if (node.nodeType === Node.TEXT_NODE) return node.textContent || "";
      if (node.nodeType !== Node.ELEMENT_NODE) return "";

      const element = node;
      const tagName = element.tagName.toLowerCase();

      if (tagName === "br") return "\n";
      if (tagName === "img") return element.getAttribute("alt") || "";
      if (tagName === "a") {
        const label = cleanText([...element.childNodes].map(walk).join(""));
        const href = absoluteUrl(element.getAttribute("href") || "");
        if (!label) return href;
        if (!href || href === label) return label;
        return `[${escapeMarkdownText(label)}](${href})`;
      }

      return [...element.childNodes].map(walk).join("");
    }

    return cleanText(walk(root));
  }

  function getTweetText(article) {
    const tweetText = article.querySelector('[data-testid="tweetText"]');
    const markdown = textNodeToMarkdown(tweetText);
    if (markdown) return markdown;

    const candidates = [...article.querySelectorAll('[lang], [dir="auto"]')]
      .map((node) => cleanText(node.innerText))
      .filter((text) => text && !/^@/.test(text) && !/^\d+[smhd]?$/.test(text));

    return candidates[0] || "";
  }

  function getImages(article) {
    const photoImages = [...article.querySelectorAll('[data-testid="tweetPhoto"] img')]
      .map((img) => normalizeImageUrl(img.currentSrc || img.src));

    const fallbackImages = [...article.querySelectorAll('img[src*="pbs.twimg.com/media"]')]
      .map((img) => normalizeImageUrl(img.currentSrc || img.src))
      .filter((src) => !src.includes("profile_images"));

    return unique([...photoImages, ...fallbackImages]);
  }

  function getVideos(article) {
    return unique([...article.querySelectorAll("video source, video")]
      .map((node) => node.currentSrc || node.src || node.getAttribute("src") || ""));
  }

  function extractTweet(article, index) {
    const url = getTweetUrl(article);
    const author = getAuthor(article);
    const time = article.querySelector("time");

    return {
      index,
      id: getStatusIdFromUrl(url),
      url,
      author,
      publishedAt: time?.getAttribute("datetime") || "",
      text: getTweetText(article),
      images: getImages(article),
      videos: getVideos(article)
    };
  }

  function getTopLevelTweets() {
    const articles = [...document.querySelectorAll('article[data-testid="tweet"]')];
    return articles.filter((article) => !article.parentElement?.closest('article[data-testid="tweet"]'));
  }

  function getCurrentTweetId() {
    return getStatusIdFromUrl(location.href);
  }

  function selectTweets(mode) {
    const tweets = getTopLevelTweets().map(extractTweet).filter((tweet) => tweet.text || tweet.images.length || tweet.url);
    if (mode !== "current") return tweets;

    const currentId = getCurrentTweetId();
    if (!currentId) return tweets.slice(0, 1);

    const exact = tweets.find((tweet) => tweet.id === currentId);
    return exact ? [exact] : tweets.slice(0, 1);
  }

  function textLooksLikeArticleChrome(text) {
    return (
      !text ||
      text === "文章" ||
      text === "显示更多" ||
      text === "回复" ||
      text === "转帖" ||
      text === "喜欢" ||
      text === "收藏" ||
      text === "分享" ||
      /^@\w+/.test(text) ||
      /^[\d.,万]+$/.test(text) ||
      /^[\d.,万]+\s*(次查看|views?)$/i.test(text) ||
      /^[\d.,万]+\s*(回复|转帖|喜欢|收藏|分享)$/.test(text)
    );
  }

  function primaryColumn() {
    return document.querySelector('[data-testid="primaryColumn"]') || document.querySelector("main") || document.body;
  }

  function looksLikeUiTitle(text) {
    return (
      !text ||
      ["\u5bf9\u8bdd", "\u6587\u7ae0", "\u4e3b\u9875", "\u641c\u7d22", "\u901a\u77e5", "\u66f4\u591a", "\u4e2a\u4eba\u8d44\u6599", "X", "Twitter"].includes(text) ||
      ["Conversation", "Articles", "Article", "Home", "Search", "Notifications", "More", "Profile"].includes(text) ||
      /^@\w+$/.test(text) ||
      /^https?:\/\//i.test(text)
    );
  }

  function normalizeTitleText(value) {
    return cleanText(value)
      .replace(/\s+/g, " ")
      .replace(/^["“”'‘’]+|["“”'‘’]+$/g, "")
      .trim();
  }

  function getDocumentTitleCandidate() {
    const title = normalizeTitleText(document.title)
      .replace(/^.+?\s+on\s+X\s*:\s*["“]?(.+?)["”]?\s*$/i, "$1")
      .replace(/\s*(?:\/|\||-)\s*(?:X|Twitter)\s*$/i, "")
      .trim();
    return looksLikeUiTitle(title) ? "" : title;
  }

  function getAuthorTitleRejects(root) {
    const userName = root.querySelector('[data-testid="User-Name"]');
    return cleanText(userName?.innerText || "")
      .split("\n")
      .map(normalizeTitleText)
      .filter(Boolean);
  }

  function isLikelyArticleTitle(text, rejects = []) {
    const value = normalizeTitleText(text);
    if (looksLikeUiTitle(value)) return false;
    if (value.length < 4 || value.length > 180) return false;
    if (/^[-•*]\s*/.test(value)) return false;
    if (/^(http|www\.)/i.test(value)) return false;
    if (/^\d+[\d.,\s]*(views?|likes?|reposts?|replies?)?$/i.test(value)) return false;
    if (rejects.some((item) => item === value)) return false;
    return true;
  }

  function sameTitle(a, b) {
    return normalizeTitleText(a).toLowerCase() === normalizeTitleText(b).toLowerCase();
  }

  function getArticleTitle(root, textBlocks = []) {
    const rootTop = root.getBoundingClientRect().top + scrollY;
    const documentTitle = getDocumentTitleCandidate();
    const authorRejects = getAuthorTitleRejects(root);
    const candidates = [];

    [...root.querySelectorAll('[role="heading"], h1, h2')]
      .filter(isVisible)
      .forEach((node) => {
        const text = normalizeTitleText(node.innerText || node.textContent || "");
        if (!isLikelyArticleTitle(text, authorRejects)) return;
        const rect = node.getBoundingClientRect();
        const style = getComputedStyle(node);
        candidates.push({
          text,
          source: "heading",
          top: rect.top + scrollY,
          fontSize: Number.parseFloat(style.fontSize) || 0
        });
      });

    textBlocks.slice(0, 8).forEach((block, index) => {
      const text = normalizeTitleText(block.text);
      if (!isLikelyArticleTitle(text, authorRejects)) return;
      candidates.push({
        text,
        source: "text",
        top: block.top,
        fontSize: 0,
        index
      });
    });

    if (documentTitle) {
      candidates.push({
        text: documentTitle,
        source: "document",
        top: rootTop,
        fontSize: 0
      });
    }

    const scored = candidates.map((candidate) => {
      let score = 0;
      if (candidate.source === "heading") score += 40;
      if (candidate.source === "document") score += 35;
      if (candidate.source === "text") score += 20 - (candidate.index || 0);
      if (documentTitle && (sameTitle(candidate.text, documentTitle) || documentTitle.includes(candidate.text) || candidate.text.includes(documentTitle))) score += 35;
      if (candidate.fontSize >= 24) score += 20;
      if (candidate.fontSize >= 18) score += 10;
      if (candidate.text.length >= 8 && candidate.text.length <= 90) score += 10;
      if (candidate.top - rootTop < 420) score += 10;
      return { ...candidate, score };
    });

    scored.sort((a, b) => (b.score - a.score) || (a.top - b.top) || (a.text.length - b.text.length));
    return scored[0]?.text || documentTitle || normalizeTitleText(textBlocks[0]?.text || "") || "X Article";
  }

  function getArticleTextBlocks(root) {
    const rootRect = root.getBoundingClientRect();
    const candidates = [...root.querySelectorAll('[data-testid="tweetText"], [dir="auto"], [lang], span')]
      .filter(isVisible)
      .filter((node) => !node.closest("button, nav, aside, [role='navigation']"))
      .filter((node) => {
        const rect = node.getBoundingClientRect();
        return rect.left >= rootRect.left - 4 && rect.right <= rootRect.right + 4;
      })
      .map((node) => {
        const text = textNodeToMarkdown(node);
        const rect = node.getBoundingClientRect();
        return {
          type: "text",
          text,
          top: rect.top + scrollY,
          left: rect.left + scrollX,
          height: rect.height
        };
      })
      .filter((block) => block.text.length > 1 && !textLooksLikeArticleChrome(block.text));

    const deduped = [];
    for (const block of candidates.sort((a, b) => (a.top - b.top) || (a.left - b.left) || (b.text.length - a.text.length))) {
      const sameText = deduped.some((item) => item.text === block.text);
      const containedByExisting = deduped.some((item) => {
        const verticallyClose = Math.abs(item.top - block.top) < Math.max(item.height, block.height, 24);
        return verticallyClose && item.text.includes(block.text) && item.text.length > block.text.length + 8;
      });
      const containsExisting = deduped.find((item) => {
        const verticallyClose = Math.abs(item.top - block.top) < Math.max(item.height, block.height, 24);
        return verticallyClose && block.text.includes(item.text) && block.text.length > item.text.length + 8;
      });

      if (sameText || containedByExisting) continue;
      if (containsExisting) {
        const index = deduped.indexOf(containsExisting);
        deduped.splice(index, 1, block);
      } else {
        deduped.push(block);
      }
    }

    return deduped.sort((a, b) => (a.top - b.top) || (a.left - b.left));
  }

  function getArticleImageBlocks(root) {
    return unique([...root.querySelectorAll('img[src*="pbs.twimg.com/media"], [data-testid="tweetPhoto"] img')]
      .filter(isVisible)
      .filter((img) => !img.src.includes("profile_images"))
      .map((img) => normalizeImageUrl(img.currentSrc || img.src)))
      .map((src) => {
        const img = [...root.querySelectorAll("img")].find((node) => normalizeImageUrl(node.currentSrc || node.src) === src);
        const rect = img?.getBoundingClientRect();
        return {
          type: "image",
          src,
          alt: img?.alt || "article image",
          top: (rect?.top || 0) + scrollY,
          left: (rect?.left || 0) + scrollX,
          height: rect?.height || 0
        };
      });
  }

  function extractLongformArticle() {
    const root = primaryColumn();
    const headerText = cleanText(root.innerText || "");
    const hasArticleHeader = headerText.split("\n").some((line) => line.trim() === "文章");
    const images = getArticleImageBlocks(root);
    const textBlocks = getArticleTextBlocks(root);

    if (!hasArticleHeader || textBlocks.length < 1) return null;

    const title = getArticleTitle(root, textBlocks);
    const titleIndex = textBlocks.findIndex((block) => sameTitle(block.text, title));
    const contentBlocks = textBlocks
      .filter((block, index) => index !== titleIndex)
      .filter((block) => !sameTitle(block.text, title))
      .filter((block) => !/^[-•]\s*原文链接/.test(block.text));

    const blocks = [...contentBlocks, ...images]
      .sort((a, b) => (a.top - b.top) || (a.left - b.left))
      .filter((block, index, all) => {
        if (block.type !== "text") return true;
        const previous = all[index - 1];
        return !(previous?.type === "text" && previous.text === block.text);
      });

    const tweetUrl = absoluteUrl(location.href);
    const author = getAuthor(root);
    const time = root.querySelector("time");

    return {
      type: "article",
      title,
      url: tweetUrl,
      author,
      publishedAt: time?.getAttribute("datetime") || "",
      blocks,
      images: images.map((image) => image.src)
    };
  }

  function pageInfo() {
    return {
      title: document.title,
      url: location.href,
      capturedAt: new Date().toISOString()
    };
  }

  function showFloatingToast(message) {
    const existing = document.querySelector("#xtm-floating-toast");
    existing?.remove();

    const toast = document.createElement("div");
    toast.id = "xtm-floating-toast";
    toast.textContent = message;
    Object.assign(toast.style, {
      position: "fixed",
      right: "24px",
      bottom: "92px",
      zIndex: "2147483647",
      maxWidth: "280px",
      padding: "10px 12px",
      color: "#ffffff",
      background: "#1f2937",
      borderRadius: "8px",
      boxShadow: "0 10px 30px rgba(0,0,0,0.22)",
      font: "13px/1.45 system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif"
    });
    document.documentElement.append(toast);
    setTimeout(() => toast.remove(), 3200);
  }

  function installFloatingButton() {
    if (document.getElementById(FLOATING_HOST_ID)) return;

    const host = document.createElement("div");
    host.id = FLOATING_HOST_ID;
    const shadow = host.attachShadow({ mode: "open" });
    const savedPosition = readFloatingPosition();

    Object.assign(host.style, {
      position: "fixed",
      right: savedPosition ? "auto" : "24px",
      bottom: savedPosition ? "auto" : "24px",
      left: savedPosition ? `${savedPosition.left}px` : "auto",
      top: savedPosition ? `${savedPosition.top}px` : "auto",
      zIndex: "2147483647"
    });

    shadow.innerHTML = `
      <style>
        :host {
          all: initial;
        }

        button {
          width: 56px;
          height: 56px;
          border: 0;
          border-radius: 50%;
          color: #fff;
          background: #246a73;
          box-shadow: 0 12px 28px rgba(15, 23, 42, 0.28);
          cursor: pointer;
          user-select: none;
          touch-action: none;
          font: 800 15px/1 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
          letter-spacing: 0;
        }

        button:hover {
          background: #1e5961;
          transform: translateY(-1px);
        }

        button:active {
          transform: translateY(0);
        }
      </style>
      <button type="button" title="打开 X/Twitter to Markdown">MD</button>
    `;

    const button = shadow.querySelector("button");
    let dragState = null;

    button.addEventListener("pointerdown", (event) => {
      const rect = host.getBoundingClientRect();
      dragState = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        left: rect.left,
        top: rect.top,
        moved: false
      };
      button.setPointerCapture(event.pointerId);
    });

    button.addEventListener("pointermove", (event) => {
      if (!dragState || dragState.pointerId !== event.pointerId) return;

      const deltaX = event.clientX - dragState.startX;
      const deltaY = event.clientY - dragState.startY;
      if (Math.abs(deltaX) + Math.abs(deltaY) > 4) dragState.moved = true;

      const nextLeft = clamp(dragState.left + deltaX, 8, window.innerWidth - 64);
      const nextTop = clamp(dragState.top + deltaY, 8, window.innerHeight - 64);
      setFloatingPosition(host, nextLeft, nextTop);
    });

    button.addEventListener("pointerup", (event) => {
      if (!dragState || dragState.pointerId !== event.pointerId) return;

      const wasDragged = dragState.moved;
      const rect = host.getBoundingClientRect();
      saveFloatingPosition(rect.left, rect.top);
      dragState = null;

      if (wasDragged) return;

      openExtensionPopupFromPage();
    });

    button.addEventListener("pointercancel", () => {
      dragState = null;
    });

    document.documentElement.append(host);
  }

  function openExtensionPopupFromPage() {
    try {
      if (!globalThis.chrome?.runtime?.id) {
        showFloatingToast("扩展刚刚更新过，请刷新当前 X 页面。");
        return;
      }

      chrome.runtime.sendMessage({ type: "XTM_OPEN_POPUP" }, (response) => {
        try {
          if (chrome.runtime.lastError) {
            showFloatingToast("无法打开弹窗，请刷新页面或从扩展图标打开一次。");
            return;
          }

          if (!response?.ok) {
            showFloatingToast(response?.error || "无法打开扩展弹窗。");
          }
        } catch {
          showFloatingToast("扩展上下文已更新，请刷新当前 X 页面。");
        }
      });
    } catch {
      showFloatingToast("扩展上下文已更新，请刷新当前 X 页面。");
    }
  }

  function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
  }

  function setFloatingPosition(host, left, top) {
    Object.assign(host.style, {
      left: `${left}px`,
      top: `${top}px`,
      right: "auto",
      bottom: "auto"
    });
  }

  function readFloatingPosition() {
    try {
      const raw = localStorage.getItem(FLOATING_POSITION_KEY);
      if (!raw) return null;
      const position = JSON.parse(raw);
      if (!Number.isFinite(position.left) || !Number.isFinite(position.top)) return null;
      return {
        left: clamp(position.left, 8, window.innerWidth - 64),
        top: clamp(position.top, 8, window.innerHeight - 64)
      };
    } catch {
      return null;
    }
  }

  function saveFloatingPosition(left, top) {
    try {
      localStorage.setItem(FLOATING_POSITION_KEY, JSON.stringify({
        left: clamp(left, 8, window.innerWidth - 64),
        top: clamp(top, 8, window.innerHeight - 64)
      }));
    } catch {
      // Ignore storage failures; the button still works for the current page.
    }
  }

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type === "XTM_PING") {
      sendResponse({ ok: true });
      return false;
    }

    if (message?.type !== "XTM_EXPORT_TWEETS") return false;

    try {
      const article = extractLongformArticle();
      sendResponse({
        ok: true,
        page: pageInfo(),
        article,
        tweets: selectTweets(message.mode || "visible")
      });
    } catch (error) {
      sendResponse({
        ok: false,
        error: error instanceof Error ? error.message : String(error)
      });
    }

    return true;
  });

  installFloatingButton();
})();
