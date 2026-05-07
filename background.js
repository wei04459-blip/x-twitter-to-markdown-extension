chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== "XTM_OPEN_POPUP") return false;

  if (!chrome.action?.openPopup) {
    sendResponse({
      ok: false,
      error: "当前 Chrome 版本不支持从页面按钮打开扩展弹窗。"
    });
    return false;
  }

  chrome.action.openPopup()
    .then(() => sendResponse({ ok: true }))
    .catch((error) => {
      sendResponse({
        ok: false,
        error: error instanceof Error ? error.message : String(error)
      });
    });

  return true;
});
