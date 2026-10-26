<p align="center">
  <img src="docs/images/hdsi-hero.svg" alt="HDSI Android · A Story Beyond the Chat" width="100%">
</p>

<h1 align="center">让故事，在对话之外继续。</h1>

<p align="center">
  <strong>HDSI Android</strong> · 基于 <a href="https://github.com/ISEKAI-MomoiCore/HDS-Interlude">HDS-Interlude</a> 的 Android 客户端<br>
  把 HDS-Interlude 的故事、记忆和角色状态带到 Android，聊天之外的进展也能继续。
</p>

<p align="center">
  <a href="https://github.com/sl251/HDSI-Android/releases/latest"><img alt="Download Latest Preview" src="https://img.shields.io/badge/Download-Latest%20Preview-2e7d96?style=for-the-badge&logo=android&logoColor=white"></a>
  <a href="https://github.com/sl251/HDSI-Android/blob/main/LICENSE"><img alt="License AGPL-3.0" src="https://img.shields.io/badge/License-AGPL--3.0-7b659e?style=for-the-badge"></a>
  <img alt="Android 8.0+" src="https://img.shields.io/badge/Android-8.0%2B-627b72?style=for-the-badge">
</p>

<p align="center">
  <a href="#-下载安装">立即下载</a> ·
  <a href="#-最近更新">更新记录</a> ·
  <a href="#-它怎么在手机上运行">运行方式</a> ·
  <a href="#-快速开始">快速开始</a> ·
  <a href="#-技术与开源">技术与开源</a>
</p>

---

## ✦ 这是什么

HDSI Android 是 [HDS-Interlude](https://github.com/ISEKAI-MomoiCore/HDS-Interlude) 的 Android 移植版。它把上游的叙事和长期记忆引擎放到手机本地运行，不是一个只负责发送和接收消息的聊天界面。

角色会参考过去的经历、当前心境和时间安排来行动。她可能主动找你聊天、发布动态，也可能暂时不想回应。这里说的「生活」是模型与叙事引擎模拟出的角色状态，不代表现实中的独立意识。

### 🎬 宣传短片

https://github.com/user-attachments/assets/809470b8-84a5-4e32-ac78-d59d217fac7b

<sub>50 秒概念宣传片。展示项目想做的体验，具体功能以当前版本为准。</sub>

## ✨ 目前能做什么

| 功能 | 目前支持 |
| --- | --- |
| **📖 聊天** | 流式回复、连续消息合并、失败重试、图片和录音输入 |
| **🧠 记忆与状态** | 查看、追溯和整理长期事实、心境、好感与待办 |
| **🌿 动态** | 发帖、点赞和评论按故事隔离；角色能感知互动，也可以不回应 |
| **🎨 表情、图片和语音** | 自主表情包；实验性的自拍、动态配图和语音。生图支持自动 / OpenAI Images / 聊天式 / Gemini 原生协议及参考图 |
| **🖼️ 角色视觉档案** | 独立头像、画风、衣装和可选参考图 |
| **⚙️ 模型分工** | 分别配置主叙事、记忆整理、心理分析、识图和检索模型 |
| **📦 存档** | 本地保存角色和故事、导入多种角色卡格式、完整 ZIP 备份与恢复 |

## 🏛️ 它怎么在手机上运行

App 内置 ARM64 Linux 运行环境，在手机上运行 HDS-Interlude 的核心引擎。界面、通知、文件、录音等功能通过 Android 适配层接入，不需要额外开一台电脑、VPS，也不用安装 Termux。

- 故事、长期记忆和角色状态由引擎管理，不只是把聊天记录塞进上下文。
- 主动联系、表情包、动态和图片会受设置、当前情境与角色意愿机制影响，并非每次互动都必须回应。
- 切换角色和故事、整理记忆、配置模型、查看诊断和导出备份，都可以直接在 App 里操作。

### 本地运行，不等于完全离线

角色卡、故事、记忆和配置主要保存在手机本地。**生成文本、识图、云端语音、STT 和生图仍然会向你配置的接口发送必要数据**。项目不提供统一的云端聊天中转。API Key 使用 Android Keystore 管理的密钥在本机加密，具体硬件保护能力取决于设备。

## 📥 下载安装

**当前版本：`0.1.0-preview.9.7`**（安装包以 Latest 发布页为准）

**[➡ 前往 GitHub Releases 下载签名 APK](https://github.com/sl251/HDSI-Android/releases/latest)**

- **支持设备：** Android 8.0 及以上，ARM64（arm64-v8a）。
- **安装包：** `HDS-Android-0.1.0-preview.9.7-arm64.apk`（当前文件名沿用旧命名，不影响使用）。
- **版本核对：** versionCode 36；可在系统「应用信息」中确认已覆盖到本版。
- **校验：** 请使用 Release 附件中的 `SHA256SUMS.txt` 核对文件完整性。
- **空间：** 建议至少预留 1.5 GB；如果启用实验性本地 QQ 接入，额外预留约 1.6 GB。

> [!IMPORTANT]
> **从旧版本升级，请先备份完整故事 ZIP，然后直接覆盖安装，不要先卸载。** 卸载 Android App 可能清空应用私有数据，包括故事、记忆及本机配置。
>
> 9.7 修复**恢复暂停时仍执行媒体任务**，增加**聊天历史分页与搜索、首次对话准备和省电模式**。9.7 可以恢复旧存档，新版导出的 ZIP 需要 9.7 或兼容的新版本恢复。详情见 [Preview 9.7](docs/PREVIEW9.7.md)。

## 🗞️ 最近更新

- **9.7**：暂停/恢复媒体保护、备份限制与真实版本清单、历史分页/搜索、可操作的首次对话准备、省电模式及运行时类型检查。
- **9.6.3**：生图排队任务改用执行时的最新渠道配置；已提交任务沿原渠道查询或下载；明确失败不再占用冷却；重启后未知提交不重复生成。
- **9.6.2**：支持自动 / OpenAI Images / 聊天式 / Gemini 原生四种生图协议，兼容参考图与多种响应格式；生图诊断按任务与消息关联，导出保持脱敏。
- **9.6**：流式聊天与失败重试、拍照/相册/录音与 STT、按故事隔离的动态、自主生图与独立头像、通知与安静时段。

完整条目见 [CHANGELOG](docs/CHANGELOG.md)；本次升级与验证说明见 [Preview 9.7](docs/PREVIEW9.7.md)。

## 🚀 快速开始

1. **安装 APK**：从上方发布页获取适合 ARM64 手机的安装包。
2. **连接模型**：进入「空间 → 模型连接」，填写自己的 API Key、测试连接；有需要再到「任务分工」配置其他模型。
3. **导入角色**：进入「空间 → 角色与故事」，导入 SillyTavern PNG/JSON、HDSI 配置或分享码。
4. **唤醒故事**：回到「故事」页，点击「唤醒」，开始聊天。

底部主要页面为 **故事 · 见闻 · 动态 · 空间**。QQ、模型、视觉档案、音色与诊断入口统一收纳在「空间」。

<details>
<summary><strong>首次使用与常见问题</strong></summary>

- **模型连接正常，但角色不回复？** 先检查当前角色是否已经唤醒、主叙事连接是否配置，再到「空间 → 消息诊断」查看失败原因。
- **能断网使用吗？** 已保存的故事、角色和记忆可以在本地读取；生成新的模型回复通常需要网络。
- **可以导入什么人设？** 支持 SillyTavern 角色卡 PNG/JSON、HDSI/typ0 配置以及分享码。角色可导出为多种格式。
- **如何换角色或重开故事？** 在故事顶栏切换角色或故事线；建议先导出 ZIP，再使用「从当前人设重新开始」。
- **系统频繁杀后台怎么办？** 请在手机系统设置里允许后台活动、自启动并取消电池优化；实际表现受厂商系统策略限制。
</details>

## 🧪 实验性能力与边界

项目还在 **Preview** 阶段。下面这些功能需要自行开启，实际表现也会受接口服务和手机系统影响：

- **角色自主语音：** 目前适配小米 MiMo TTS；音色设计、克隆、合成依赖其线上接口。合成失败时尽量回退至文字。
- **本地 QQ 互联：** 需自行下载组件，存在协议变化、连接中断和账号风控风险。建议只使用测试账号；自动回复默认关闭，并受白名单约束。
- **STT 与自主生图：** 可接入独立兼容服务或特定图片渠道；不同服务的真实兼容性、参考图支持和资费不保证一致。媒体生成默认关闭。
- **持续生活与后台行为：** 受系统省电策略、网络和配置影响；使用付费模型时请注意调用成本。

测试范围和已知问题见 [真机验收清单](docs/TEST-ON-PHONE.md)。目前没有在所有设备和接口服务上逐一验证。

## ⚙️ 技术与开源

```text
Android 应用（Capacitor / Kotlin）
  ├─ 故事 / 记忆 / 动态 / 模型配置界面
  ├─ Android 原生能力：通知、文件、录音、图片、密钥
  └─ 本地 ARM64 运行环境（PRoot + Linux userspace + Node.js）
        ├─ HDS-Interlude 核心叙事与长期记忆引擎
        ├─ HDSI Android 移动端宿主与适配补丁
        └─ 由用户自行配置的模型 / 媒体服务
```

上游核心来自 **[ISEKAI-MomoiCore/HDS-Interlude](https://github.com/ISEKAI-MomoiCore/HDS-Interlude)**。HDSI Android 负责 Android 运行环境、原生交互、配置与诊断，并加入部分移动端体验扩展；其架构与角色智能能力建立在上游工作之上。

本项目采用 **[AGPL-3.0](LICENSE)** 许可，第三方声明见 [NOTICE.md](NOTICE.md) 与 [THIRD_PARTY.md](docs/THIRD_PARTY.md)。

**开发与维护文档：** [Preview 9.7 改进与兼容性](docs/PREVIEW9.7.md) · [Android 适配补丁边界](docs/MOBILE-PATCHES.md) · [完整更新历史](docs/CHANGELOG.md) · [真机测试](docs/TEST-ON-PHONE.md)

<details>
<summary><strong>从源码构建</strong></summary>

构建环境建议：Node.js 24、Python 3.12、OpenJDK 21、Android SDK 35，详细构建与依赖以仓库 CI 配置为准。

```bash
npm ci --ignore-scripts
npm test
npm run android:sync
python3 scripts/build-runtime.py
cd android
./gradlew lintRelease testReleaseUnitTest assembleRelease
```

</details>

---

<p align="center">HDSI Android · Powered by <a href="https://github.com/ISEKAI-MomoiCore/HDS-Interlude">HDS-Interlude</a></p>
