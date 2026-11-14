# Agent 任务交接与验收归档索引

> 本目录收纳原先平铺在仓库根目录的任务委托书（`agy-task-*.md`、`codex-task-*.md`）与阶段性验收报告（`result-*.md`、`result*.txt`），保持项目根目录聚焦于源码、构建配置、README 与开源许可文件。

## 整理原则

1. **有价值的任务书与简洁报告**：使用 `git mv` 保留原文件名迁入本目录，保持 Git 历史可追溯。
2. **大体积原始输出**：原先留在根目录的数百 KB 原始终端日志（`result-m4.txt`、`result-m5.txt`、`result.txt`）已提炼为精简 Markdown 摘要保留于本目录，并从主工作树移除原始大文本；未重写历史 Git 提交。
3. **防止回归污染**：已在根目录 `.gitignore` 中屏蔽 `/agy-task-*.md`、`/codex-task-*.md`、`/result-*.md`、`/result-*.txt`、`/result.txt` 与 `/*.log`。

## 归档清单

| 原根目录文件 | 当前位置与处理方式 | 说明 |
| --- | --- | --- |
| `agy-task-readme-p9.md` | [`agy-task-readme-p9.md`](agy-task-readme-p9.md)（`git mv`） | Preview 9 文档与 README 更新任务书 |
| `codex-task-endpoint-test.md` | [`codex-task-endpoint-test.md`](codex-task-endpoint-test.md)（`git mv`） | rc57 移动端出站端点修复测试任务书 |
| `codex-task-export.md` | [`codex-task-export.md`](codex-task-export.md)（`git mv`） | 角色卡三格式导出任务书 |
| `codex-task-import-code.md` | [`codex-task-import-code.md`](codex-task-import-code.md)（`git mv`） | 角色库导入码入口任务书 |
| `codex-task-import-fixes.md` | [`codex-task-import-fixes.md`](codex-task-import-fixes.md)（`git mv`） | 导出 YAML 导入回环与启动修复任务书 |
| `codex-task-m4.md` | [`codex-task-m4.md`](codex-task-m4.md)（`git mv`） | Preview 9 M4 角色自主表情包任务书 |
| `codex-task-m5.md` | [`codex-task-m5.md`](codex-task-m5.md)（`git mv`） | Preview 9 M5 角色自主语音与音色工作台任务书 |
| `codex-task-rc57-tests.md` | [`codex-task-rc57-tests.md`](codex-task-rc57-tests.md)（`git mv`） | rc57 测试套件修复任务书 |
| `codex-task-watchdog.md` | [`codex-task-watchdog.md`](codex-task-watchdog.md)（`git mv`） | QQ `SelfOffline` 看门狗任务书 |
| `result-export.md` | [`result-export.md`](result-export.md)（`git mv`） | 角色三格式导出验收报告 |
| `result-import-code.md` | [`result-import-code.md`](result-import-code.md)（`git mv`） | 角色库导入码入口验收报告 |
| `result-import-fixes.md` | [`result-import-fixes.md`](result-import-fixes.md)（`git mv`） | 导入与启动修复验收报告 |
| `result-watchdog.md` | [`result-watchdog.md`](result-watchdog.md)（`git mv`） | QQ 看门狗验收报告 |
| `result-rc57-tests.txt` | [`result-rc57-tests.txt`](result-rc57-tests.txt)（`git mv`） | rc57 测试修复详细报告（约 18 KB） |
| `result-m4.txt`（约 575 KB） | [`result-m4-summary.md`](result-m4-summary.md)（提炼摘要，移除原日志） | Preview 9 M4 实现清单、测试汇总与异常重试说明 |
| `result-m5.txt`（约 759 KB） | [`result-m5-summary.md`](result-m5-summary.md)（提炼摘要，移除原日志） | Preview 9 M5 实现清单、四道门禁结果与视觉证据索引（原 `docs/evidence/m5/README.md` 引用已更新） |
| `result.txt`（约 129 KB） | [`result-p0a-summary.md`](result-p0a-summary.md)（提炼摘要，移除原日志） | Preview 9 P0-a 已读水位与发送状态验收摘要 |
