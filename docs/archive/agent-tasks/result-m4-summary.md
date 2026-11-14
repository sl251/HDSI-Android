# Preview 9 M4 验收摘要（原 result-m4.txt 精简版）

> 归档说明：原根目录大体积原始日志已从主树清理，本文件保留精简验收摘要与验证结论；如需完整日志可按命令本地复验或查阅清理前 Git 历史。

HDS-Android Preview 9 M4 验收报告
工作分支：codex/p9-m4；基于 3ced081。任务书：codex-task-m4.md。

实现摘要：复用 rc51 扫描、描述、阈值和发送流程，接通 App 当前包清单 → 原生启动导出 → mobile-local catalog → 原字节 media RPC → 角色无气泡贴纸。无热同步，下次启动生效。空文件库 disabled，空 catalog 指令为精确空字符串，并去掉上游通用写作段中的残余 sticker 举例；前端过滤未知媒体标记。保留用户贴纸原件及已发送媒体，不清聊天记录，不新增 npm 依赖。

提交状态：环境阻塞，未 commit、未 push。git add runtime/stickers.ts tests/m4.test.ts 返回 128：无法在只读 .git 创建 index.lock；因此无法按任务书更新 codex/p9-m4 的索引/提交。未绕过沙箱，也未改 main。建议提交信息：feat: Preview 9 M4 — 角色自主表情包与空库兜底。任务书、result-m4.txt 和原有 result.txt 均不应 commit；其他无关用户文件未修改。

改动文件清单与动机（共 19 个实现、测试、补丁文档文件）：
- upstream/hds-interlude/src/service.ts：仅扩展 stickerCatalogForSession 平台门禁，mobile-local 与原 OneBot 条件并列；QQ 发送/决策逻辑未改。
- upstream/hds-interlude/src/narrator.ts：导出原有 stickerInstruction 供直接锁定空路径；新增默认未设置的 mobileSystemPrompt 钩子。
- runtime/stickers.ts：新增导出库非空检测、资产 URL/库内路径解析与 realpath 边界校验；空清单时移除 rc51 通用 prompt 的三句 sticker 示例及一处动作标签示例。
- runtime/host.ts：从当前导出目录启用 stickers；空 catalog 使用宿主 prompt 过滤；LocalBot 保存图片字节的 media ID，并按文本/贴纸拆为消息，时间戳单调以保持历史顺序。
- runtime/media.ts：增加有 10 MiB 上限的原始 GIF/PNG/WebP/JPEG 注册与 MIME 读取；沿用 SHA-256 ID，原 JPEG 上传契约保留。
- runtime/message-push.ts：贴纸媒体消息通知及离线补偿正文回落 [表情包]，不泄漏图片 URL/markup；原未知图片回落兼容。
- runtime/mobile-config.ts：将 App 视觉开启/独立识图连接或主模型视觉路线映射为 useForStickers；明确不支持图片的模型不分配。
- runtime/model-config.ts：在既有模型配置归一化过程中应用贴纸视觉路由。
- android/app/src/main/java/io/hdsinterlude/android/StickerStore.kt：保存仅包含当前包名和素材 ID 的清单；启动时分组原字节导出，暂存目录替换与失败保留旧快照；历史原件/已注册媒体不删除。
- android/app/src/main/java/io/hdsinterlude/android/HdsRuntimePlugin.kt：增加 syncStickerLibrary 原生桥接口，调用现有串行 IO executor。
- android/app/src/main/java/io/hdsinterlude/android/HdsRuntime.kt：启动前导出当前用户库到绑定 /hds-data 的 profile；images.get 响应上限提升至 14 MiB 以容纳 10 MiB 原件的 base64。
- packages/contracts/index.ts：增加包清单同步桥接口，不改变已有 Message 数据兼容性。
- apps/mobile-ui/sticker-state.ts：仅投影当前 packs 的素材 ID，不把 messages 中已删除包的历史素材重新启用。
- apps/mobile-ui/main.tsx：唤醒/重启/恢复角色前同步最新包清单；角色纯图片直接通过 media RPC 无气泡展示。
- apps/mobile-ui/MessageContent.tsx：过滤角色未知贴纸/媒体括号标记（中英文、方括号/中文括号），保留普通括号文本；用户原话展示不受影响。
- tests/m4.test.ts：新增 6 项单测/真实 HDS 宿主集成，覆盖平台门禁、空指令及空库系统 prompt、清单与路径边界、原件注册/删除后读取、视觉映射、标记过滤、GIF 描述和两种投递顺序、无视觉模型 warn。
- tests/story-ui.mjs：保持完整旧回归，增加角色 standalone/after-text GIF、media RPC、无用户映射/气泡、标记剥离和空库入口/多宽度验证。
- android/app/src/test/java/io/hdsinterlude/android/StickerStoreTest.kt：新增导出/空库同步/不删历史、GIF 原字节/安全唯一分组/失败快照保护、超过旧 4 MiB 上限的 media RPC 读取测试。
- docs/MOBILE-PATCHES.md：登记最小上游补丁与宿主边界；全局包的角色专属过滤保留 TODO。

Diff 摘要（以下 git diff --stat 不含两个新增的未跟踪 TS 文件 runtime/stickers.ts、tests/m4.test.ts）：
 .../java/io/hdsinterlude/android/HdsRuntime.kt     |  4 +-
 .../io/hdsinterlude/android/HdsRuntimePlugin.kt    |  3 +
 .../java/io/hdsinterlude/android/StickerStore.kt   | 57 ++++++++++++++++
 .../io/hdsinterlude/android/StickerStoreTest.kt    | 76 ++++++++++++++++++++++
 apps/mobile-ui/MessageContent.tsx                  |  5 +-
 apps/mobile-ui/main.tsx                            | 14 ++--
 apps/mobile-ui/sticker-state.ts                    |  3 +
 docs/MOBILE-PATCHES.md                             |  2 +
 packages/contracts/index.ts                        |  1 +
 runtime/host.ts                                    | 37 +++++++++--
 runtime/media.ts                                   | 19 +++++-
 runtime/message-push.ts                            |  8 +--
 runtime/mobile-config.ts                           |  6 ++
 runtime/model-config.ts                            |  3 +-
 tests/story-ui.mjs                                 | 35 +++++++++-
 upstream/hds-interlude/src/narrator.ts             |  5 +-
 upstream/hds-interlude/src/service.ts              |  2 +-
 17 files changed, 257 insertions(+), 23 deletions(-)

验证结果：
npm-test-retry.log: ℹ tests 67; ℹ pass 67; ℹ fail 0; ℹ skipped 0; Exit code: 0
typecheck-final.log: Exit code: 0
ui-retry.log: Exit code: 0
gradle-retry.log: BUILD SUCCESSFUL in 6m 45s; Exit code: 0
upstream-current.log: # tests 838; # pass 827; # fail 7; # skipped 4; Exit code: 1
upstream-head.log: # tests 838; # pass 827; # fail 7; # skipped 4; Exit code: 1
upstream-compare.log: MATCH unchanged upstream assertion failures and test counts; Exit code: 0
upstream-focused.log: ℹ tests 42; ℹ pass 42; ℹ fail 0; ℹ skipped 0; Exit code: 0
diff-check.log: Exit code: 0
boundaries.log: Exit code: 0
Android XML 合计：{'tests': 68, 'failures': 0, 'errors': 0, 'skipped': 1}
跳过：io.hdsinterlude.android.RootfsExtractorTest.extractsActualPreviewOneArchiveWhenProvided（{}）
StickerStoreTest: {'name': 'io.hdsinterlude.android.StickerStoreTest', 'tests': '5', 'skipped': '0', 'failures': '0', 'errors': '0', 'timestamp': '2026-10-16T15:58:34', 'hostname': 'losvps-0628', 'time': '10.09'}
  safRecursesNamesFolderCopiesOriginalAndCountsUnsupported
  exportGroupsOriginalsAndReplacesSnapshotWithoutDeletingHistoryOrLibrary
  exportGifBytesUsesSafeUniqueGroupsAndRejectsTraversalIds
  gifOriginalSurvivesImportAndFileIdentifiersCannotEscapePrivateDirectory
  registeredMediaRpcCanReadLargeOriginalStickerDataUri

异常与重试：
1. M4 首轮测试直接 ESM 导入 Koishi 触发其 loader 类型异常（退出 1）；改为本仓库宿主测试既用的 createRequire 加载方法。
2. 次轮 M4 测试 4/6：严格空系统 prompt 断言发现 rc51 的通用 typed-message 示例和平台动作标签仍含 sticker。保持断言强度，增加仅由宿主安装的过滤钩子；随后 M4 6/6，全量 npm 67/67。
3. 初次 Gradle、浏览器与宿主测试并行时，约 936 MiB 内存环境产生明显争用；主动中断 Gradle 与 UI（均 130），改为顺序执行，Gradle 使用 384 MiB heap；中断不记为通过。
4. 为限制 npm 测试并发试过 NODE_OPTIONS=--test-concurrency=1 npm test；Node 禁止该 NODE_OPTIONS，退出 9。随后直接执行原要求 npm test 并通过，没有修改 npm scripts。
5. Gradle 可能报告 /root/.android/analytics.settings 只读的指标初始化警告；具体编译/测试结果以下方原始输出为准。
6. 上游原始断言未修改；HEAD 对照快照从 git archive 提取到 /tmp/hds-m4-baseline，只读复用同一 node_modules。全量原测试两轮均 838 tests / 827 pass / 7 fail / 4 skip，失败名称逐项一致，对照检查退出 0；原有相关 5 个测试文件另外执行 42/42 通过。这里的 HEAD 已含 M1–M3 移动补丁，不等同于早期 T01 的原始 rc51 基线；不把原套件自身的非零退出计为全绿。
7. git add 退出 128，.git/index.lock 为只读文件系统阻塞，无法 commit；push 未执行，需主代理在可写 Git 环境完成。

范围与证据：模型请求采用本地固定 fixture；浏览器原生桥为 fixture，原生文件/RPC 链由 Robolectric 验证。未声称 Android 真机/付费模型验收。Robolectric 的单项 skip 是 extractsActualPreviewOneArchiveWhenProvided，因未提供 HDS_LEGACY_ROOTFS（CI 专用旧版归档）。截图 artifacts/preview9-m4-character-stickers.png（已查看）：角色 GIF 独立展示，文本先行，用户括号原话保留。角色专属包过滤未加，现有全局库 group 保留安全化后的包名，同名组加序号；未修改 QQ 策略。

