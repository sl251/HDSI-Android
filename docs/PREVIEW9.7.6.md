# HDSI Android 0.1.0-preview.9.7.6

本版主要是 **移动端前端架构整理与构建发布流程修复**，延续 Preview 9.7.5 的界面和功能，不新增角色玩法。Android `versionCode` 升为 **42**，包名仍为 `io.hdsinterlude.android`，沿用原有预览版签名配置，可在 9.7.5 及符合签名条件的旧版上覆盖安装。

## 前端组件化重构

- 根据 [PR #30](https://github.com/sl251/HDSI-Android/pull/30)，将原来 1197 行的 `apps/mobile-ui/main.tsx` 精简为 14 行入口；新增 `App.tsx`，按页面、UI 组件和 Hooks 拆分聊天、故事、空间、导航、返回栈以及 Native/RPC 副作用。
- 重点保持**现有用户行为不变**：界面文案与布局、消息处理、输入草稿、历史读取/位置恢复、Native Bridge/RPC、模型配置、轮询、角色/故事与 ZIP 存档协议均按重构前的设计保留。
- 这是一轮等价拆分，不代表上游叙事引擎已升级，也不是新增独立功能。

## 构建与发布

- `package.json`、`package-lock.json`、Android `versionName` 与 `versionCode` 同步至 Preview 9.7.6。
- 发布工作流不再硬编码 9.7.5；自动从项目版本生成 Release tag、APK/source 附件名与说明文档路径。发现版本 Release 已存在时保留原附件并正常跳过，避免普通 `main` 提交重复创建 Release。
- Release 应包含签名 ARM64 APK、源码压缩包和 `SHA256SUMS.txt`，由 CI 在宿主、Android 检查及打包完成后上传。

## 验证范围

- PR #30 合并前的验证记录：`npm run typecheck` 与 `npm run build` 通过，`npm test` **254 PASS / 0 FAIL**，`npm run test:ui` **39 PASS / 0 FAIL**；并有 GitHub Actions 的 Android 编译与 ARM64 运行时验证记录。
- **上述结果不等于本次 9.7.6 的真机测试。** 发布包仍需在设备上检查首启、唤醒、角色切换、中文软键盘、消息/语音/图片混排、屏幕安全区、历史记录、后台恢复及从旧版升级。见 [真机验收清单](TEST-ON-PHONE.md)。

## 安装与升级

- 从本 Release 下载 `HDS-Android-0.1.0-preview.9.7.6-arm64.apk`，用 `SHA256SUMS.txt` 校验文件。
- **升级前先导出完整故事 ZIP 备份，直接覆盖安装，切勿先卸载旧版。** 卸载可能删除应用私有数据。
- 继续适用 9.7 系列的备份兼容约束：9.7 新导出 ZIP 不保证能由更旧的 APK 恢复。实验性 QQ、语音、生图、后台行为仍受到设备、网络和服务商限制。
