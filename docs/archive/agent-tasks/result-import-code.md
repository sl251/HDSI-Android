# 角色库导入码入口结果

已完成，基于 main / 594531b；未安装依赖，未 git commit。

## 选择的落点

采用任务书的第二条路线：**同步人设与生活配置到当前故事**。

`inspectPreset` 返回的是可含世界、关系、视角等字段的 `StorySetting` 补丁，并不直接返回 `Card` 或可保存的角色卡原文。现有 `savePreview → bridge.saveCard({card, base64})` 链路需要完整角色卡；要把任意补丁变成新角色还需新增转换逻辑。因此复用生活设置页已有的 `preset.sync → fingerprint 复核 → story.applySetting` 链路，保持改动集中于 UI。

角色库新增第三个按钮“用导入码导入”。模态明确说明“输入 typ0.space 导入码，同步人设与生活配置到当前故事”，展示当前故事、标题/修订、生活配置 before → after、人设内容及不支持项。成功后提示“人设已同步到当前故事，生活设置已更新，重启后生效。”此操作不会新增角色卡。

`current` 使用 `settingsRef.current.mobileConfig ?? {}`，与 LifeSettings 的 `value={settings.mobileConfig}`、缺省 `value={}` 一致。已只读确认 `runtime/host.ts` 的 dispatch 也支持缺省 current 时采用运行配置；本实现不依赖该缺省分支。

应用时重新请求 `preset.sync` 并携带第一次预览的 fingerprint，使用复核返回的人设补丁与配置。生活配置接入现有保存队列，并等待 `bridge.saveSettings` 成功后才关闭模态；人设应用后刷新故事快照。修改输入会废弃预览；预览之后或请求期间发生配置/故事变化会要求重新检查。错误在模态内显示，保留输入；忙碌期间禁用输入与按钮并拦截关闭/返回。支持关闭按钮自动聚焦、dialog 无障碍属性与 Escape/Android 返回键。

## 改动文件

- `apps/mobile-ui/main.tsx`：角色库按钮、模态、检查/复核/应用、配置保存与错误处理。
- `apps/mobile-ui/LifeSettings.tsx`：导出共享 `PresetPreview` 类型与 `storyFields` 展示映射；原有同步行为保持一致。
- `tests/story-ui.mjs`：扩充 native RPC fixture，新增导入码成功与失败两组 UI 场景。
- `result-import-code.md`：本结果记录，为任务书明确要求的根目录产物。

未修改 runtime/vendor 或其他目录的受版本控制源码。验收构建生成的 host bundle 属于原有构建流程。已有未跟踪任务书文件未改动。

## 测试证据

以下最终检查均退出 0，完整日志保存在本次环境的 `/tmp/hds-import-code-*.log`。

`npm run build:host`：

```text
> node scripts/build-mobile-host.mjs
Compiled actual HDS rc57 and mobile host from sources
```

`npx tsc --noEmit`：退出码 0，无诊断输出。

`npm run test`：

```text
ℹ tests 104
ℹ pass 104
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ duration_ms 378709.657458
```

UI 环境：`npm run dev -- --port 5173 --strictPort`，使用已安装 Chromium，无新增依赖。

```sh
HDS_BROWSER=/root/.cache/ms-playwright/chromium-1223/chrome-linux64/chrome node --import tsx --test tests/story-ui.mjs
```

关键输出：

```text
PASS import-code: library modal, trimmed code, config/persona preview, ignored fields, busy/back guard and fingerprint recheck before persona apply and native settings save.
PASS import-code errors: missing code, network failure, edited-code invalidation, stale fingerprint and persona write failure keep modal open without applying settings.
✔ tests/story-ui.mjs (208331.109356ms)
ℹ tests 1
ℹ pass 1
ℹ fail 0
```

成功场景断言模态打开、关闭按钮焦点、空输入禁用、maxLength=24、带空格输入被 trim、差异/人设/忽略项可见、检查期间禁用与返回保护，以及第二次 `preset.sync` 携带 fingerprint 后才调用 `story.applySetting`、持久化生活配置。另核对模型连接、模型分工、用户身份、总开关和当前角色不被覆盖。失败场景模拟码不存在、网络失败、fingerprint 过期及人设写入错误，断言模态保留输入、预览失效且不保存生活配置。完整脚本的原有消息、布局及图片手势用例也通过。

首轮完整 UI 运行在补充故事切换保护时被 Vite 页面热刷新打断；固定最终代码后完整重跑，得到上面的通过结果。

另运行原有生活设置分享人设回归：

```sh
HDS_BROWSER=/root/.cache/ms-playwright/chromium-1223/chrome-linux64/chrome node --import tsx --test tests/share-persona-ui.mjs
```

```text
PASS share persona UI: before/after diff, default on, opt out, life-only, fingerprint rejection, RPC failure.
✔ tests/share-persona-ui.mjs (14979.530541ms)
ℹ tests 1
ℹ pass 1
ℹ fail 0
```

`git diff --check`：退出码 0。验收后已停止本次启动的 Vite 服务；UI 测试自行关闭浏览器。

## 真机注意事项

- 先选择角色并唤醒故事，再从角色库打开导入码入口。粘贴 typ0.space 的 8 位码即可，允许前后空格；检查需要设备能访问分享站。
- 人设更新作用于当前故事，既有角色库文件不会新增或改写；生活配置保存后需要重启核心生效。应用前应核对模态展示的当前故事与人设内容。
- 不支持项明确列为忽略。分享内容在检查后变化时会拒绝应用，需重新检查。
- 人设写入与生活配置保存是两个现有接口，不具备跨接口事务：若人设写入成功而后续保存/刷新失败，人设可能已经生效；模态会显示错误并保留输入，不承诺整体回滚。
- 浏览器 UI 测试使用 native bridge fixtures，尚未在 Android 真机验证真实分享站连通性、软键盘/返回键体验、重启后配置和故事内容的持久化；这些应在设备上复核。
