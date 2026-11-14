# 任务书：角色导出三格式（酒馆卡 / 预设 JSON / YAML 视图）+ README 更新（Codex 委派）

## 背景
仓库：/root/hermes-workspace/hds-android（分支 main，最新提交见 git log）
上一任务刚在 `apps/mobile-ui/main.tsx` 角色库页加了"用导入码导入"模态（result-import-code.md 有记录）。本任务在同页加**导出**功能。

## 前置（必做）
`cat result-import-code.md` 了解上一个任务落了什么（避免冲突/重复）。若导入码模态代码与任务书假设不符（比如函数名不同），以实际代码为准，任务书中的锚点行号是"写任务书时"的，先重新定位。

## 任务 A：角色导出（apps/mobile-ui/main.tsx 角色库页）
在现有"角色操作区"（含"用导入码导入"按钮的 actions div）加"导出"按钮，打开导出模态：

1. **格式选择**（三个单选项）：
   - **SillyTavern V2 角色卡**（默认）：生成 ST V2 JSON 卡
   - **HDSI 预设 JSON**：生成与 typ0.space 上传格式一致的预设 payload（分区白名单对象，不含连接字段）
   - **YAML 视图**：预设 payload 的 YAML 序列化（人类可读分享用）
2. **SillyTavern V2 卡字段映射**（从角色当前 story 设置映射）：
   - `spec: 'chara_card_v2'`, `spec_version: '2.0'`
   - `data.name` ← 角色名
   - `data.description` ← 人物设定主文本（storySetting 中的人设描述字段；查 StorySetting 类型定义选最贴切的字段，如 description/persona/characterProfile，用 union 兜底）
   - `data.personality` ← 性格相关字段
   - `data.first_mes` ← 开场白/第一条消息字段（无则空串）
   - `data.mes_example` ← 对话示例字段（无则空串）
   - `data.creator_notes` ← `由 HDS-Interlude 导出`
   - `data.system_prompt` ← 人设中系统性指令字段（无则空串）
   - `data.character_book` ← 若 storySetting 有世界观/世界书类字段（worldbook/lore 类），转成 ST character_book 格式（entries 数组：content/keys/…）；无则省略
   - 其余 ST V2 必填字段（`data.tags`, `data.creator`, `data.character_version`）填合理默认
   - **不要在导出中包含任何 API key/endpoint/token/手机号/QQ号**——导出前过一遍 sanitizer（复用 sanitizeSharePayload 的思路，FORBIDDEN_FIELDS 深扫剔除，或更严格：ST 卡只映射白名单字段，天然不含连接信息）
3. **HDSI 预设 JSON / YAML**：
   - 载荷结构：`{ storyDefaults: <当前角色 story 设置>, sections… }` 参照 typ0.space 预设 payload 的分区结构（读 upstream/hds-interlude/src/share-sync.ts 的 SHARE_SECTIONS 和 sanitizeSharePayload 确认结构）
   - **必须经过 sanitizeSharePayload 等效清洗**（绝不含 apiKey/endpoint/token 等连接字段）——从 upstream 导入函数或 runtime 侧复用，不重写
   - YAML 视图：项目里若无 yaml 序列化库（查 package.json），手写一个最小 YAML 序列化（对象/数组/字符串/数字/布尔，字符串含特殊字符时加引号），不新装依赖
4. **导出动作**：模态内点"导出"→ 生成内容 → 存储为文件（用 App 环境可用的文件保存方式；查现有代码里是否有保存/分享文件机制（bridge 侧 web save/download），有就复用，没有就写文件到 App 可访问目录并在 UI 显示路径+提供复制内容按钮）
5. **错误处理**：字段映射失败/文件写失败 → 模态内行内错误，不关模态

## 任务 B：README 导出功能说明（AGENTS.md 顺带）
`README.md` 的功能特性/使用说明区，加导出功能一段（3-5 行，中文）：三格式、用途（ST 酒馆可直接导入；预设 JSON 可上传 typ0.space；YAML 人读分享）、隐私边界（连接字段已剔除）。

## 验收标准（全部满足）
- `npm run build:host` ✅、`npx tsc --noEmit` ✅
- `npm run test` 全绿（现有 + 新增测试全过）
- **至少 2 个新测试**：
  1. ST V2 卡生成：角色→JSON，断言 spec/data.name/description 映射正确且**不含连接字段**（grep 断言无 apiKey/endpoint/token）
  2. 预设 JSON 清洗：构造含 apiKey 的配置 → 导出 → 断言被剔除
- **不要 git commit**，结果写 `result-export.md`：改动文件、三格式样例（截断贴）、测试证据、真机注意事项
- **纪律**：只改 apps/mobile-ui/、tests/、README.md；不动 runtime/（若确需 runtime 侧桥接改动，先在结果中说明理由，最小化）；不装依赖

## 纪律（同前）
- 只允许修改：apps/mobile-ui/、tests/、README.md
- 保持现有代码风格（紧凑 JSX、中文文案、现有类名体系）
- 若 result-import-code.md 显示的导入码模态与本任务书冲突，以实际代码为准并在结果中说明
