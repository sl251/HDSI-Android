# 角色三格式导出结果

基于 main / df461b9；已读 result-import-code.md。未安装依赖，未 git commit。

## 实现与范围

- `apps/mobile-ui/main.tsx`：在现有角色操作区加入「导出」，挂载模态，接入 Android 返回键和全局忙碌保护；原「用导入码导入」链路保留。
- `apps/mobile-ui/CharacterExportModal.tsx`：三个单选格式（默认 ST V2）、当前故事提示、实时读取快照、导出与复制内容、保存路径、行内错误、Escape/返回键、关闭焦点。导出期间阻止关闭；角色/故事版本或生活配置在读取期间变化时拒绝过期结果。字段映射失败、读取/写入失败均保留模态；写入失败保留已生成内容供复制。
- `apps/mobile-ui/character-export.ts`：ST 白名单映射、typ0 根分区 payload、人设扁平转换、YAML 序列化、文件名处理和保存。复用已有 `yaml@2.9.1`，没有添加依赖。
- `apps/mobile-ui/build-share-sanitizer.mjs`、`share-sanitizer.js`、`share-sanitizer.d.ts`：用现有 esbuild 编译上游原版 `sanitizeSharePayload`，只保留它依赖的白名单和清洗逻辑，不重写函数。直接引用上游 TS 会遇到其缺失的 monorepo tsconfig，且牵入巨大类型图；编译后的浏览器模块不含 Node 文件系统助手，类型检查也无需遍历上游。更新上游后执行 `node apps/mobile-ui/build-share-sanitizer.mjs`；测试用原文件 SHA-256 检查同步状态。
- `tests/character-export.test.ts`：6 个新增单测，覆盖 ST 字段与隐私、预设清洗与原生人设往返、YAML 特殊文本/数组/数值/布尔/空值往返、缺省与异常字段、文件名/文本隐私、私有文件写入/关闭/失败中止、清洗产物同步。
- `tests/character-export-ui.mjs`：真实页面的三格式选择、当前快照、OPFS 保存读回、剪贴板、浏览器实际下载、忙碌/返回键、读取及写盘错误、失败后复制与 Escape。
- `README.md`：新增四行中文使用说明，包含用途与隐私边界。
- `result-export.md`：本任务明确要求的结果记录，作为允许源码目录之外的任务产物。

未修改 runtime、Android、upstream、依赖清单或 AGENTS.md；其余源码改动均在任务允许的 apps/mobile-ui、tests 和 README.md 内。

## 映射与隐私

实际 `StorySetting` 是 `character.name/profile`，没有独立性格、开场白、示例或系统提示字段。ST 优先使用当前故事字段，支持常见别名；缺少的可选文本输出空串，不拿旧角色卡覆盖当前人设。`world` 进入 scenario，也作为常驻世界书条目；存在 worldbook/lorebook/lore 条目数组时映射 content/keys/enabled 等 ST 字段，不携带原始扩展对象。

预设将当前故事转换为 typ0 使用的 `storyDefaults.characterName/characterProfile/userProfile` 等扁平字段；生活设置从 `mobileConfig.sections` 解包成根分区（不是把 `sections` 包装上传）。整个 payload 使用上游 `SHARE_SECTIONS` 白名单及递归清洗，剔除 model/onebot/embedding 等非分享分区和 apiKey/endpoint/token/secret/password/headers/proxy 等字段；另外过滤连接别名及结构化手机/QQ/账号字段，对可识别的手机号、带 QQ 标签的号码和常见凭据文本脱敏。不读取模型供应商、QQ 登录或消息历史。

上次导入码入口实际名称是「用导入码同步」，其作用是更新当前故事而非新增角色卡；本次按实际代码接入，没有重建或替换该模态。导出也读取当前故事；未选择角色/核心未唤醒时给出提示。

## 三格式样例（测试人设，截断）

ST V2：`星禾-st-v2.json`，其余必填空字段与默认值在此省略：

```json
{
  "spec": "chara_card_v2",
  "spec_version": "2.0",
  "data": {
    "name": "星禾",
    "description": "住在海边，修理收音机。",
    "personality": "",
    "scenario": "海边小镇",
    "first_mes": "",
    "mes_example": "",
    "creator_notes": "由 HDS-Interlude 导出",
    "system_prompt": "",
    "tags": [],
    "creator": "HDS-Interlude",
    "character_version": "1.0",
    "character_book": { "name": "世界设定", "extensions": {}, "entries": [
      { "id": 0, "keys": [], "content": "海边小镇", "constant": true, "enabled": true }
    ] }
  }
}
```

HDSI：`星禾-hdsi.json`。样例输入在 agency 内放入了 apiKey，输出已移除：

```json
{
  "agency": { "enabled": true },
  "storyDefaults": {
    "world": "海边小镇",
    "timezone": "Asia/Shanghai",
    "characterName": "星禾",
    "characterProfile": "住在海边，修理收音机。",
    "userProfile": "老朋友"
  }
}
```

YAML：`星禾-hdsi.yaml`，与上一 JSON 是同一个 payload：

```yaml
agency:
  enabled: true
storyDefaults:
  world: 海边小镇
  timezone: Asia/Shanghai
  characterName: 星禾
  characterProfile: 住在海边，修理收音机。
  userProfile: 老朋友
```

完整生成样例位于本次环境 `/tmp/hds-export-samples.txt`。

## 测试证据

`npm run build:host`：退出 0，日志 `/tmp/hds-export-build-host.log`：

```text
Compiled actual HDS rc57 and mobile host from sources
```

`npx tsc --noEmit`：退出 0，无诊断，日志 `/tmp/hds-export-tsc-final.log`。

`npx vite build`：退出 0，134 个模块，日志 `/tmp/hds-export-vite-final.log`。

新增单测：`node --import tsx --test tests/character-export.test.ts`，6/6 通过，日志 `/tmp/hds-export-unit.log`。ST 断言 spec/data.name/description、世界书、连接字段/值缺失和角色卡解析往返；预设断言嵌套 apiKey/endpoint/token 被剔除及上游人设映射往返。

导出 UI：`HDS_BROWSER=/root/.cache/ms-playwright/chromium-1223/chrome-linux64/chrome node tests/character-export-ui.mjs`，退出 0，日志 `/tmp/hds-export-ui.log`：

```text
PASS character export UI: three formats, fresh snapshot, OPFS readback, clipboard, browser download, busy/back guard, inline read/write errors and Escape.
```

原有分享人设 UI 回归：同一 Chromium，`node --import tsx --test tests/share-persona-ui.mjs`，1/1 通过，日志 `/tmp/hds-export-share-persona-ui.log`。

首轮 `npm run test` 为 109/110，既有 `scheduled-contact` 用例在“the failing provider must actually be called”断言失败，附近日志含 ECONNRESET；当时并行运行浏览器和构建。该用例及 runtime 未修改。已结束开发服务和浏览器检查，单独重跑完整测试，退出 0，**110/110 全通过**（原有 104 + 新增 6），包括首轮失败的定时联系用例。最终日志 `/tmp/hds-export-test-final.log`：

```text
> npm run build:host && node --import tsx --test --test-concurrency=1 tests/*.test.ts
Compiled actual HDS rc57 and mobile host from sources
ℹ tests 110
ℹ pass 110
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ duration_ms 202146.720622
```

开发服务已停止，浏览器检查均自行关闭会话。

`git diff --check`：退出 0。

## 真机注意事项

1. 先选择角色并唤醒故事，再从角色库「导出」。数据来自点击时的 `story.snapshot` 和当前生活配置；不包含聊天/记忆。完整存档仍使用原 ZIP 功能。
2. 现有原生桥接只有专用的 ZIP/诊断/二维码导出，没有通用文本写文件入口。在不改 runtime/Android 的范围内，App 使用 WebView 的 OPFS（Origin Private File System）写文件，成功后显示 `opfs:/hds-exports/星禾-hdsi.json` 等路径。该路径是 App 可读的私有目录标识，不是文件管理器能直接浏览的 Android 绝对路径；同名文件会覆盖。
3. 使用「复制内容」粘贴到其他应用即可另存或分享；内容框也可手动选择。卸载/清除应用或 WebView 站点数据会丢失这些私有导出文件。浏览器分支触发下载，只显示「已请求浏览器下载」，最终保存由浏览器管理。
4. 旧 Android System WebView 若没有 OPFS 或磁盘写入失败，模态显示错误并保留生成内容，可继续复制。真机需复核 WebView 支持、剪贴板权限、软键盘/返回键及私有文件持久化。
5. 结构化连接/联系方式清洗并不等同于匿名化全部人设；用户人设、关系和世界文本是预设的正常内容。分享前可在模态查看生成内容。
6. 已以 Chromium + native bridge fixture 验证文件读回、实际浏览器下载与复制；未安装 APK 在 Android 真机验证，也未向 typ0.space 上传或向 SillyTavern 实例实际导入。ST 使用仓库角色卡解析器验证，预设使用上游 `storyDefaultsToSettingPatch` 验证往返。
