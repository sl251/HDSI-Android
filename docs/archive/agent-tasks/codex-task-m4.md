# HDS-Android Preview 9 — M4 角色自主表情包（mobile-local 通道）

## 背景与目标

Preview 9 的 M1–M3 已合并 main（CI 全绿）。本批次实现 M4：**角色在 App 内可以自主发送表情包**，复用上游 HDS-Interlude rc51 已有的本地表情包机制；表情包库 = 用户在 App 内导入的库（M3 的 StickerStore）。硬性兜底（用户明确要求）：**库为空时 prompt 不得注入任何贴纸概念/标记语法；前端解析层剥离未知标记防乱码**。

## 关键代码事实（主代理已核实，直接采用）

- 上游 vendored 代码在 `upstream/hds-interlude/src`（基线 1.0.1-rc51，固定提交 9a77fadb）。改动受 `docs/MOBILE-PATCHES.md` 补丁纪律约束；`scripts/vendor-hds.mjs` 重导入会覆盖补丁，所以补丁必须最小、且在 MOBILE-PATCHES.md 增补说明。
- 上游已有完整机制，不要重写：
  - 配置：`src/index.ts` L484–497（stickers.enabled / directory / catalogLimit / descriptionResponseFormat / descriptionMaxTokens）+ L58 视觉模型 `useForStickers` flag。
  - 扫描与描述：`service.ts` 约 L3580–3640，目录扫描建 `interlude_sticker` 表 → 视觉模型逐张生成 description/aliases → status 'active' → `refreshStickerCatalog`。
  - prompt 注入：`narrator.ts` `stickerInstruction()`（L1730–1733）把清单注入 system prompt（`localMedia: {assetId, placement, willingness}`，阈值默认 0.7）。**catalog 为空时指令为空字符串——这就是空库兜底，必须保持并加测试锁死**。
  - 执行：`resolveSticker` 校验决策后经 `bot.sendMessage` 发 `h('img', { src: stickerDeliveryUrl(base, assetId) })`。
- 堵点 1：`service.ts` `stickerCatalogForSession`（约 L3698）以 `isOneBotPlatform(session.platform)` 为门禁（isOneBotPlatform 只认 onebot/napcat 家族，定义同文件），mobile-local 平台永远拿不到清单。**解除这层门禁是本批次核心上游补丁**；QQ 路径行为不得变化。
- 堵点 2：`runtime/host.ts` `LocalBot.sendMessage`（L46–54）把 content 经 `h.parse` 后**全部压成纯文本**，img 元素会丢。必须识别 img 并透传。
- 用户库（M3 已有）：Android `StickerStore.kt`（`noBackupFilesDir/hds/stickers`，sha256 命名，10MiB 上限，JPEG 代理进图片 RPC 的先例在 `AppearanceStore.image`）；前端 `sticker-state.ts` 存 localStorage `hds-stickers-v1`（packs + messages），`main.tsx` MessageRow 的 sticker 分支目前只对 `direction==='user'` 查 `stickers.messages`。
- media RPC：`runtime/media.ts` + host.ts `messages.sendLocal` 的 images 走 `media.get(id)`；前端 `StoredImage` 经 bridge RPC 读 dataUri。
- 模型配置：`runtime/mobile-config.ts` normalize；视觉模型已有 `vision.enabled` 路由（ModelCenter / `activeVision`）。

## 实现要求

1. **上游补丁（最小化）**：让 mobile-local 通道在 stickers.enabled 时能拿到 stickerCatalog（改门禁或加平台分支）。QQ 路径行为不变。如需"角色专属包"分组过滤钩子且代价小可加，代价大就留 TODO，不硬塞。
2. **库桥接（App → runtime）**：
   - 原生侧把 StickerStore 当前文件按包同步到 PRoot 可见的数据目录（如 `dataDir/stickers/<包名>/`，包名=group），运行时把 `stickers.directory` 指过去；用户库为空时 `stickers.enabled=false`（空库兜底第一层）。
   - 视觉描述：把 App 已配置的视觉模型映射到 `useForStickers`（mobile-config.ts）；无视觉模型时沿用上游"发现素材但等待描述"的 warn 行为，不得静默失败。
   - 用户增删贴纸后，下次运行时启动同步即可，不做热同步。
3. **角色发送链路**：
   - `LocalBot.sendMessage` 识别 img 元素：从 src 解析 assetId（stickerDeliveryUrl 或本地路径），从贴纸目录读字节注册进 media RPC 得 mediaId，写 `mobile_message`：placement=standalone → `images:[mediaId]`、`content:''`；after-text → 先文本消息再贴纸消息（两条）。纯文本路径不得回归。
   - `runtime/message-push.ts` 通知正文对贴纸消息回落 "[表情包]"，不得把 URL/markup 当正文。
4. **前端**：
   - 角色方向贴纸消息无气泡渲染（复用 M3 的 sticker-body 样式），不走用户 `stickers.messages` 查找。
   - `MessageContent` 对角色消息剥离未知贴纸/媒体括号标记（如 `[表情包]`【贴纸】`[图片]` 等），防降级乱码。
5. **空库兜底（验收硬条件）**：
   - 库空时 system prompt 无任何贴纸概念/标记语法（单测断言 stickerInstruction 空路径 + host 集成路径）。
   - 前端空库时表情入口隐藏（M3 已实现，回归即可）。

## 测试与验收（四道，全绿才算完成）

- `npm run typecheck`、`npm test` 全绿；新增 M4 单测：门禁补丁、LocalBot img 透传、同步清单、标记剥离、空库无注入。
- `HDS_BROWSER=/root/.cache/ms-playwright/chromium-1223/chrome-linux64/chrome npm run test:ui` 全绿（角色贴纸渲染、文本+贴纸序列）。
- Gradle Robolectric：StickerStore 导出/同步与 media 注册路径（工具链 `/tmp/hds-p0b-toolchain`：sdk/jdk/gradle；具体命令以 `.github/workflows` 与仓库历史为准）。
- 上游基线：不为过测改写原始断言；vendored 补丁最小化并在 `docs/MOBILE-PATCHES.md` 增补一段。

## 约束

- 不新增 npm 依赖；不动 QQ 集成代码；API key 不进命令行参数。
- 修改保持用户数据兼容：不清用户贴纸库与聊天记录。

## 流程

- 在分支 `codex/p9-m4` 上工作并 commit（不得动 main）。commit message 风格沿用历史：`feat: Preview 9 M4 — …`。如沙箱内 push 不可用则本地留分支并如实报告，push 由主代理完成。
- 本文件（codex-task-m4.md）与 `result-m4.txt` 不要 commit。
- 验收报告写入 `result-m4.txt`：改动文件清单+动机、Diff 摘要、每道验证的命令与退出码、原始输出、异常与重试说明。诚实报告，不编造输出；非交互沙箱内做不到的步骤写明阻塞点。
