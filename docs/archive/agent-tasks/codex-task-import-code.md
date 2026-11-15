# 任务书：角色库页新增 typ0.space 导入码入口（Codex 委派）

## 背景
仓库：/root/hermes-workspace/hds-android（分支 main，commit 594531b，104/104 测试全绿）

上游 rc57 引入 presetSync（typ0.space 分享站）。移动端后端已就绪（9.1 就有）：
- `runtime/preset.ts`：`inspectPreset(ctx, code, current, fingerprint?)` → 拉取 typ0.space 分享码、算指纹、产出移动端可应用预览（config 变更 + changes 差异 + storyPatch 人设补丁）；fingerprint 不匹配时抛错防过期应用
- `runtime/host.ts` 已有 RPC：`preset.sync`（payload: `{code, current, fingerprint?}`）→ inspectPreset；`preset.syncStatus`
- `apps/mobile-ui/LifeSettings.tsx:57,115` 已有生活设置页的分享码 UI 范式（输入码→预览差异→应用，含 fingerprint 复核），可参考其交互

**当前缺口只有一个**：角色导入（page === 'cards'）没有分享码入口。用户拿到 8 位码后，无法在"导入角色"流程里直接用码导入人设。

## 任务
在 `apps/mobile-ui/main.tsx` 的角色库页（page === 'cards'）加"导入码"入口：

1. **入口按钮**：在现有 `<div className="actions">`（main.tsx:523）加第三个按钮"用导入码导入"，打开一个新模态（参照 createOpen 模态的写法）
2. **模态内容**：
   - 输入框：8 位分享码（maxLength 24，允许粘贴前后空格，trim 后使用）；参考 LifeSettings.tsx:115 的输入范式
   - "检查"按钮 → `bridge.rpc({ method: 'preset.sync', payload: { code, current: <当前配置> } })`
     - 注意：preset.sync 的 `current` 需要当前 MobileConfig。查看 main.tsx 现有 settings 状态的来源（settingsRef/visionProjection 附近），选择与 LifeSettings.tsx 一致的 current 获取方式；如果 main.tsx 拿不到完整 MobileConfig，允许走 `current: undefined` 时后端用默认值（读 runtime/host.ts:234 的 dispatch 实现确认 payload.current 缺省行为，如不支持缺省则用 runtime 侧已有 mobile 默认配置）
   - 展示结果：标题 title + revision、changes 差异列表（section.field: before → after）、removed 不支持项提示（有则显示"部分字段移动端不支持，已忽略"）
   - **人设导入的落点**：inspectPreset 返回的 storyPatch 是 StorySetting 补丁。导入角色语义下，需要把 storyPatch 保存为"新角色的故事设定"。查看现有 preview → savePreview 流程（main.tsx:574、savePreview 在 407 附近）和故事创建链路（bridge.saveCard / storyChanged），选择最小侵入方案：若 storyPatch 无法直接变成新角色卡，则**把导入码定位为"应用到当前故事的人设+生活配置同步"**——模态文案改为"输入 typ0.space 导入码，同步人设与生活配置到当前故事"，应用按钮执行 preset.sync 的 fingerprint 复核应用（与 LifeSettings 一致），并提示"人设将同步到当前故事，生活设置已更新，重启后生效"。**两条路线选一条能走通的，在结果文件里说明选了哪条及原因**
3. **UI 风格**：与现有模态一致（modal-backdrop/modal/section-title/caption/actions 类名），中文文案，无障碍属性（aria-label、autoFocus 关闭按钮）照现有模态补齐
4. **错误处理**：码不存在/网络失败/指纹过期 → 模态内显示错误（notify 或行内提示），不关闭模态；busy 期间禁用按钮

## 验收标准（全部满足才算完成）
- `npm run build:host` ✅、`npx tsc --noEmit` ✅
- `npm run test` 104/104 全绿（若为导入码加 UI 测试，加多少过多少）
- UI 测试：`node --import tsx --test tests/story-ui.mjs`（或现有 UI 测试入口）通过；**必须新增至少 1 个测试**：模拟 preset.sync RPC（成功返回 changes+storyPatch / 抛错两种），断言模态打开→输入码→显示差异→应用调用了带 fingerprint 的第二次 preset.sync（参考 LifeSettings 现有测试的 mock 范式，找 tests/ 下对应文件）
- **不要 git commit**
- 结果写入 `result-import-code.md`：选择的落点路线、改动文件、测试证据（贴关键输出行）、真机注意事项

## 纪律
- 只允许修改：`apps/mobile-ui/`（main.tsx 及按需新文件）、`tests/`
- 不装依赖、不 commit、不动 runtime/（RPC 已存在，纯 UI 接线）、不动 vendor
- 保持现有代码风格（紧凑 JSX、中文文案、现有类名体系）
