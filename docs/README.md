# HDSI-Android 文档导航

本索引帮助开发者、测试人员与贡献者快速定位当前开发计划、构建调试指南、历史版本说明、验收证据以及开源合规文件。

## 当前开发计划与 UI 调研

| 文档 | 说明 |
| --- | --- |
| [2026-11-16～11-22 UI 与仓库整理 TODO](plans/2026-11-16-22-ui-repo-cleanup-todo.md) | 故事页极简化、输入栏底部停靠、贴纸对齐、液态玻璃、空间子页重构、轻量动效与仓库整理清单 |
| [聊天与角色扮演 UI 开源参考调研](agy-ui-research.md) | 聊天布局、输入栏、玻璃材质与移动端交互参考调研报告 |

## 入口指南与维护者说明

| 文档 | 说明 |
| --- | --- |
| [项目主页 README](../README.md) | 功能概览、下载安装、快速开始与源码构建命令 |
| [版本变更日志 CHANGELOG](CHANGELOG.md) | 各 Preview 版本的累积更新记录 |
| [真机验收清单 TEST-ON-PHONE](TEST-ON-PHONE.md) | Preview 9.7 真机安装、权限、模型与后台保活验收步骤 |
| [消息诊断指南 diagnostics-guide](diagnostics-guide.md) | 如何阅读与排查「空间 → 消息诊断」条目 |
| [移动宿主与上游边界 MOBILE-PATCHES](MOBILE-PATCHES.md) | HDS-Interlude 上游引擎与 Android 移动宿主补丁边界说明 |
| [功能对照表 feature-parity](feature-parity.md) · ([CSV](feature-parity.csv)) | 上游 HDS-Interlude 与移动端能力对齐情况 |
| [运行时类型检查 RUNTIME-TYPECHECK](RUNTIME-TYPECHECK.md) | 运行时宿主与脚本 TypeScript 检查说明 |

## 版本发布说明与专题设计（历史脉络）

- **Preview 9.7 系列**：
  - [Preview 9.7.3](PREVIEW9.7.3.md)（液态玻璃交互、输入栏停靠、角色切换与人格库入口）
  - [Preview 9.7.2](PREVIEW9.7.2.md)（M3 样式优化与按住说话录音交互）
  - [Preview 9.7.1](PREVIEW9.7.1.md)（免费生图网页验证接回、图片诊断与防重提示）
  - [Preview 9.7](PREVIEW9.7.md)（省电模式、历史查找、备份校验与兼容提醒）
- **Preview 9.6 系列**：
  - [Preview 9.6.3](PREVIEW9.6.3.md) · [Preview 9.6.2](PREVIEW9.6.2.md) · [Preview 9.6.1](PREVIEW9.6.1.md) · [Preview 9.6](PREVIEW9.6.md)
  - 专题修复：[9.6.2 生图配置拦截修复](IMAGE-ROUTE-FIX.md) · [9.6.1 生图修复交接](IMAGE-GENERATION-FIX.md)
- **Preview 9.0–9.5 与体验设计**：
  - [Preview 9.5.3](PREVIEW9.5.3.md) · [Preview 9.5.2](PREVIEW9.5.2.md) · [Preview 9.5 模型稳定性与诊断重做](preview95-model-reliability.md)
  - [Preview 9.4 表情与语音投递修复](preview94-media-delivery-fix.md) · [Preview 9.3 后续优化验证](NEXT-OPTIMIZATION-VALIDATION.md) · [下一轮优化交接](NEXT-OPTIMIZATION-HANDOFF.md)
  - [Preview 9 总览](PREVIEW9.md) · [Preview 9 架构与实现方案](PREVIEW9-PLAN.md)
  - [下一阶段体验设计（2026-10-23）](NEXT-EXPERIENCE-DESIGN-2026-10-23.md) · [体验更新实施记录（2026-10-23）](NEXT-EXPERIENCE-IMPLEMENTATION-2026-10-23.md)
- **早期 Preview 3–8**：
  - [Preview 8.2](PREVIEW8.2.md) · [Preview 8.1](PREVIEW8.1.md) · [Preview 8](PREVIEW8.md) · [Preview 7](PREVIEW7.md) · [Preview 6](STORY-EXPERIENCE-PREVIEW6.md)
  - [Preview 5 本地 QQ 路线图](QQ-ROADMAP.md) · [Preview 5.1 手机反馈修复](QQ-PREVIEW5-FEEDBACK.md)
  - [Preview 4 模型中心与人设管理](MODEL-CENTER-AND-PERSONAS.md) · [Preview 3 启动与模型地址修复](STARTUP-AND-MODEL-FIX.md)

## 验证证据与归档

| 目录 | 说明 |
| --- | --- |
| [Agent 任务与验收归档](archive/agent-tasks/README.md) | 从根目录归档的任务书、验收报告与大体积日志的精简摘要 |
| [Preview 9 M5 视觉证据](evidence/m5/README.md) | 角色语音聊天气泡与音色工作台截图及 SHA-256 记录 |
| [Preview 9.1 M0 基线](evidence/PREVIEW9.1-M0.md) | Preview 9.1 阶段基线验证记录 |
| [Preview 8 发布记录](evidence/preview8/release.md) | Preview 8 发布留档 |
| [Preview 4 审计说明](evidence/preview4/README.md) · [替换包说明](evidence/preview4-replacement/README.md) | 历史 APK 审计与本地检查 JSON |
| [Preview 3 APK 审计](evidence/preview3/apk-audit.json) · [N01](evidence/N01/baseline.md) · [N06](evidence/N06/TEST-UPGRADE.md) · [T01](evidence/T01/baseline.md) · [T04](evidence/T04/preview-0.1.0.md) | 早期阶段构建与设备基线报告 |

## 开源许可与第三方声明

- 仓库主许可：[LICENSE (AGPL-3.0)](../LICENSE) · 附加声明：[NOTICE.md](../NOTICE.md)
- 上游许可全文：[HDS-Interlude-AGPL-3.0.txt](legal/HDS-Interlude-AGPL-3.0.txt)
- 第三方组件清单：[THIRD_PARTY.md](THIRD_PARTY.md) · [license-inventory.csv](license-inventory.csv)
