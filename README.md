# X/Twitter to Markdown

一个 Chrome 扩展，用来把 X/Twitter 的长文章、推文和线程导出成 Markdown。

它特别适合把 X Articles 长文保存下来，或者复制给 AI 阅读：标题、正文段落和配图会按原文顺序尽量还原。

## 功能

- 识别 X/Twitter Articles 长文章页面。
- 按文章原始顺序导出标题、正文段落和中间配图。
- 导出当前推文，适合单条推文详情页。
- 导出页面可见推文/线程，适合线程页或用户主页。
- 保留原文链接、发布时间、作者信息。
- 支持复制完整 Markdown，图片可嵌入为 base64，方便粘贴到 Markdown 编辑器或发给 AI。
- 支持下载完整 `.md` 文件，文件名优先使用文章标题。
- 支持下载离线 zip 包，包含 `index.md` 和 `images/` 图片文件夹。
- 页面右下角有可拖动的 `MD` 悬浮按钮，不用每次点浏览器工具栏扩展图标。

## 安装

1. 打开 Chrome。
2. 进入 `chrome://extensions/`。
3. 打开右上角“开发者模式”。
4. 点击“加载已解压的扩展程序”。
5. 选择解压后的 `twitter-to-markdown-extension` 文件夹。

## 使用

1. 打开 `https://x.com` 或 `https://twitter.com` 上的 X 文章、单条推文、线程或用户主页。
2. 等页面内容加载完成。
3. 点击页面右下角的 `MD` 悬浮按钮，或点击浏览器工具栏里的扩展图标。
4. 选择“当前推文”或“页面可见推文/线程”。
5. 点击“生成”。
6. 根据需要选择：
   - “复制完整 Markdown”：适合直接粘贴到 Markdown 编辑器或 AI 对话框。
   - “下载完整 .md”：适合保存单个 Markdown 文件。
   - “下载离线包”：适合长期归档，图片会保存到 `images/` 文件夹。

## 离线包

“下载离线包”会生成一个 zip 文件：

- `index.md`：文章/推文正文，图片路径指向本地 `images/`。
- `images/`：真实下载下来的推文配图。
- `README.txt`：离线包说明。

解压 zip 后，用 VS Code、Obsidian、Typora、MarkText 等支持 Markdown 预览的软件打开 `index.md`，断网后图片也能显示。

## 限制

- X/Twitter 的网页结构经常变化，如果页面 DOM 改版，选择器可能需要维护。
- 只能导出页面已经加载到浏览器里的内容；用户主页或长线程历史内容需要先滚动加载出来。
- 视频/GIF 的可提取地址取决于页面是否暴露了 video source。
- base64 嵌图会让 Markdown 文件变大，图片很多时部分在线 Markdown 编辑器可能会卡顿。

## 后续可加

- 自动滚动并批量抓取某个用户主页。
- 线程排序和引用推文层级整理。
- Obsidian / Hugo / Hexo front matter 模板。

## License

MIT
