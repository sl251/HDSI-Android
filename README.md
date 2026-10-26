<p align="center">
  <img src="docs/images/hdsi-hero.svg" alt="HDSI Android · A Story Beyond the Chat" width="100%">
</p>

<h1 align="center">让故事，在对话之外继续。</h1>

<p align="center">
  <strong>HDSI Android</strong> · 基于 <a href="https://github.com/ISEKAI-MomoiCore/HDS-Interlude">HDS-Interlude</a> 的 Android 客户端<br>
  在 Android 手机本地运行 HDS-Interlude 的叙事与长期记忆引擎。
</p>

<p align="center">
  <a href="https://github.com/sl251/HDSI-Android/releases/latest"><img alt="Download Latest Preview" src="https://img.shields.io/badge/Download-Latest%20Preview-2e7d96?style=for-the-badge&logo=android&logoColor=white"></a>
  <a href="https://github.com/sl251/HDSI-Android/blob/main/LICENSE"><img alt="License AGPL-3.0" src="https://img.shields.io/badge/License-AGPL--3.0-7b659e?style=for-the-badge"></a>
  <img alt="Android 8.0+" src="https://img.shields.io/badge/Android-8.0%2B-627b72?style=for-the-badge">
</p>

<p align="center">
  <a href="#-下载安装">下载 APK</a> ·
  <a href="#-功能一览">功能</a> ·
  <a href="#-快速开始">快速开始</a> ·
  <a href="#-最近更新">版本更新</a> ·
  <a href="#-技术与开源">技术与开源</a>
</p>

---

## ✦ 聊天结束了，故事不一定结束

HDSI 的角色有长期记忆、心境和日程系统，可以主动联系你、发布动态，也可能选择不回复。聊天、记忆和动态按故事区分，切换故事时不会把不同故事线的动态混在一起。

HDSI Android 把上游 [HDS-Interlude](https://github.com/ISEKAI-MomoiCore/HDS-Interlude) 的核心引擎移植到 Android 本地，并适配通知、录音、文件和后台运行等手机功能。不需要额外部署电脑或 VPS，也不用手动配置 Termux。

<sub>角色行为由模型和叙事引擎模拟；后台运行和主动联系会受到网络、设置及手机系统限制。</sub>

### 🎬 50 秒宣传短片

https://github.com/user-attachments/assets/809470b8-84a5-4e32-ac78-d59d217fac7b

<sub>概念宣传片，包含对体验的演绎。实际支持的功能请以下面及发布说明为准。</sub>

## ✨ 功能一览

| 功能 | 可以做什么 |
| --- | --- |
| **故事与聊天** | 流式回复、连续消息合并、失败重试；支持照片、相册图片和录音输入 |
| **持续生活** | 角色根据时间、日程、心境和设置推进故事，可能主动联系，也可能选择不回应 |
| **记忆与状态** | 查看和整理长期事实、心境、好感与待办，故事可以接着之前的进展继续 |
| **动态** | 用户和角色都可以发帖、点赞、评论；按故事隔离，角色可以感知互动 |
| **表情与视觉** | 自主表情包、独立角色头像和视觉档案；自拍、动态配图、生图属于实验性功能 |
| **模型连接** | 自己填写 API Key，按主叙事、记忆整理、心理分析、识图和检索等任务分配模型 |
| **故事存档** | 支持 SillyTavern PNG/JSON、HDSI/typ0 配置与分享码；可导出完整 ZIP 备份并恢复 |
| **排查问题** | 按消息查看提交、模型、决策、语音和投递等环节的诊断信息 |

底部有 **故事、见闻、动态、空间** 四个页面。模型、角色与故事、视觉档案、QQ、音色以及诊断设置集中在「空间」。

## 📥 下载安装

**当前文档对应版本：`0.1.0-preview.9.7`**。如果发布了更新版本，以 [GitHub Releases](https://github.com/sl251/HDSI-Android/releases/latest) 为准。

**[前往 Releases 下载签名 APK](https://github.com/sl251/HDSI-Android/releases/latest)**

- **系统要求：** Android 8.0 及以上，ARM64（arm64-v8a）。
- **9.7 安装包：** `HDS-Android-0.1.0-preview.9.7-arm64.apk`。文件名还沿用旧的 HDS-Android，不影响安装。
- **版本号：** versionCode 36，可在系统「应用信息」中核对。
- **文件校验：** 使用 Release 附件中的 `SHA256SUMS.txt`。
- **存储空间：** 建议预留至少 1.5 GB；开启实验性本地 QQ 接入还需额外约 1.6 GB。

> [!IMPORTANT]
> **升级前先导出完整故事 ZIP，再覆盖安装，不要先卸载。** 卸载可能清除应用私有数据，包括故事、记忆和配置。
>
> 9.7 能读取旧格式的备份；**9.7 新导出的 ZIP 无法用旧版 APK 恢复**。需要回退版本时尤其要注意。具体兼容范围见 [Preview 9.7 说明](docs/PREVIEW9.7.md)。

## 🚀 快速开始

1. 从 Releases 安装 APK。
2. 打开「空间 → 模型连接」，添加自己的 API Key 并测试连接。测试可能产生少量接口费用。
3. 在「空间 → 角色与故事」导入角色卡、HDSI 配置或分享码。
4. 回到「故事」，点击「唤醒」，开始第一段对话。

需要给不同任务分配模型，可以到「空间 → 任务分工」调整。

## 🗞️ 最近更新

**Preview 9.7（2026-10-25）** 主要更新：

- 暂停故事时，恢复中的媒体任务不再继续执行。
- 聊天历史支持分页、关键词和日期查找；从后台返回时也会补上遗漏的消息。
- 新增可操作的首次对话准备流程，以及可选的省电模式。
- 备份校验与兼容限制更明确，构建和运行时检查也补强了。

另外，9.6 系列加入了流式聊天、图片与录音输入、按故事隔离的动态和自主生图；9.6.2～9.6.3 继续完善生图协议及任务恢复。

详细变更见 [CHANGELOG](docs/CHANGELOG.md)，9.7 的兼容性和测试范围见 [PREVIEW9.7.md](docs/PREVIEW9.7.md)。

## 🧪 目前的限制

目前还是 **Preview** 版本，部分功能仍在测试。语音、生图、QQ 和后台运行在不同设备上的表现可能有差异：

- **语音：** 角色自主语音目前适配小米 MiMo TTS，音色设计、克隆和合成都依赖线上服务；失败时会尽量回退文字。
- **生图与语音转文字：** 可以自行配置相关服务。生图支持自动、OpenAI Images、聊天式和 Gemini 原生协议，也可使用参考图；实际兼容性和费用取决于服务商。媒体生成默认关闭。
- **本地 QQ 互联：** 需要另行下载组件，可能遇到连接中断、协议变更或账号风控。建议只用测试账号；自动回复默认关闭，并受白名单限制。
- **后台持续生活：** Android 的省电、锁屏和厂商后台策略会影响主动联系及消息时效。9.7 可以切换持续在线和节省电量模式，后者可能延迟后台消息。

**本地运行仍需要联网调用模型。** 角色卡、故事、记忆和配置主要保存在手机上；文本生成、识图、STT、云端语音与生图仍会向你配置的服务发送必要数据，使用付费模型还会产生费用。项目不提供统一的云端聊天中转。API Key 使用 Android Keystore 管理的密钥在本机加密存储，硬件保护情况取决于设备。

真实设备和服务的验证仍有限，测试记录见 [真机验收清单](docs/TEST-ON-PHONE.md)。

## ❓ 遇到问题怎么办

<details>
<summary><strong>常见问题</strong></summary>

- **模型测试成功，角色却不回复？** 确认角色已唤醒、主叙事任务已配置，再打开「空间 → 消息诊断」查看是哪一步失败。
- **断网还能使用吗？** 已保存的角色、故事和记忆可以本地查看。生成新回复通常需要网络。
- **可以切换角色或重新开始吗？** 可以切换角色与故事线。准备重开前建议先备份，再用「从当前人设重新开始」。
- **锁屏后不再主动发消息？** 检查后台运行方式，以及系统的自启动、后台活动和电池优化设置。不同厂商的限制不一样。
- **能直接覆盖旧版吗？** 通常先备份，再覆盖安装。不要先卸载，注意上方的 9.7 备份兼容提醒。

</details>

发现 bug 可以到 [Issues](https://github.com/sl251/HDSI-Android/issues) 反馈。最好带上 App 版本、Android 系统版本、复现步骤和脱敏后的诊断信息。**不要公开 API Key、私人聊天内容或未脱敏的日志。**

## ⚙️ 技术与开源

```text
Android 应用（Capacitor / Kotlin）
  ├─ 故事 / 记忆 / 动态 / 模型配置界面
  ├─ Android 原生能力：通知、文件、录音、图片、密钥
  └─ 本地 ARM64 运行环境（PRoot + Linux userspace + Node.js）
        ├─ HDS-Interlude 核心叙事与长期记忆引擎
        ├─ HDSI Android 移动端宿主与适配补丁
        └─ 用户自行配置的模型 / 媒体服务
```

核心叙事、长期记忆和角色行为机制来自上游 **[HDS-Interlude](https://github.com/ISEKAI-MomoiCore/HDS-Interlude)**。这个仓库负责把它移植到 Android，处理手机运行环境、原生功能、设置、诊断和移动端扩展。有关适配边界，可以看 [MOBILE-PATCHES.md](docs/MOBILE-PATCHES.md)。

本项目采用 **[AGPL-3.0](LICENSE)** 许可。第三方声明见 [NOTICE.md](NOTICE.md) 与 [THIRD_PARTY.md](docs/THIRD_PARTY.md)。

<details>
<summary><strong>从源码构建</strong></summary>

建议环境：Node.js 24、Python 3.12、OpenJDK 21、Android SDK 35。实际依赖以仓库 CI 为准。

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

<p align="center">HDSI Android · 基于 <a href="https://github.com/ISEKAI-MomoiCore/HDS-Interlude">HDS-Interlude</a></p>
