# Preview 9 P0-a 验收摘要（原 result.txt 精简版）

> 归档说明：原根目录大体积原始日志已从主树清理，本文件保留精简验收摘要与验证结论；如需完整日志可按命令本地复验或查阅清理前 Git 历史。

P0-a 已完成，未 commit。PREVIEW9-PLAN.md 未修改；未实现 P0-b、M2、M3、P3；未新增依赖。

改动文件清单与动机：
- apps/mobile-ui/main.tsx：接入派生已读水位与统一状态组件；保护切换会话期间的历史读取；失败消息和保留草稿均复用原发送链路、requestId 与图片；移除“核心已接收”提示。
- apps/mobile-ui/MessageStatus.tsx（新增）：集中呈现静态内联 SVG 双勾、已送达/已读、失败重试按钮、开场白居中分隔线与三点输入气泡。
- apps/mobile-ui/message-state.ts（新增）：按 cardId 仅持久化 lastCharacterReplyTs；排除开场白/失败记录；兼容历史窗口截断与存储不可用。不修改 Message.status，不回写 PRoot/SQLite。
- apps/mobile-ui/StoryManagement.tsx：仅在重开或恢复故事后通知清除水位，导出存档保留水位。
- apps/mobile-ui/style.css：增加双勾、状态按钮、开场白分隔线与静态三点气泡样式，避免旧 small 选择器覆盖状态布局。
- packages/contracts/index.ts：统一状态文案；严格按 lastCharacterReplyTs > Date.parse(message.occurredAt) 派生已读；角色 delivered 返回空文案；保留开场白文案。
- tests/message-contract.test.ts：更新旧状态文案断言。
- tests/preview9.test.ts（新增）：5 项单测覆盖文案、SVG、严格时间比较、会话隔离/持久化/重置、无存储回退和输入气泡。
- tests/story-ui.mjs：最小发送 mock 扩展，验证发送期间气泡、已送达转已读、两类重试、原 requestId/图片保留、导出水位保留和 flex 布局；调整旧保存失败 mock 的解除时机，防止排队自动保存先移除重试按钮。
- result.txt：本次验收报告和原始测试输出。

Diff 摘要：9 个实现/测试文件，另加结果文件；已读仅为前端派生视图，消息契约 status 字段未变。正在输入仅根据 requestState === 'sending' 近似显示，没有桥接层/Koishi 改动和新增动效。

验收：
- npm test：退出码 0，51 tests / 51 pass / 0 fail。
- npm run typecheck：退出码 0。
- HDS_BROWSER=/root/.cache/ms-playwright/chromium-1223/chrome-linux64/chrome npm run test:ui：退出码 0，新增与既有 UI 回归均通过。
- git diff --check：退出码 0。

首次运行说明：
- 首轮 npm test 为 50/51，既有 QQ 集成用例的“Real HDS delivery must appear in QQ inbox”断言失败；独立重跑全量 51/51，通过期间未修改 QQ 代码/测试。
- UI 两次在旧“重试保存”用例遇到按钮移除竞态，另一次完整通过；将解除 mock 保存失败与调用重试处理器放在同次测试操作后，最终完整 UI 回归通过。应用自动保存逻辑未改。
- 原始尝试记录保留在 /tmp/hds-preview9-checks/ 下。

