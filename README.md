# ZShell

**[English](./README.en.md)** ｜ **中文**

![version](https://img.shields.io/github/v/tag/Amwidtf/zshell?label=version&color=blue)
![platform](https://img.shields.io/badge/platform-Android-3DDC84?logo=android&logoColor=white)
![react native](https://img.shields.io/badge/React%20Native-0.82-61DAFB?logo=react)
![license](https://img.shields.io/badge/license-MIT-green)

ZCode 与 Kimi Code 桌面端「远程控制」的手机壳客户端。非官方、开源、零收集。

配对有三种入口：相机扫码、粘贴链接、从相册选一张二维码截图（PNG/JPEG 解码全在本地做，没有为此引入原生依赖）。凭据进加密存储，然后在一个加固的 WebView 里使用官方控制台。ZCode 与 Kimi Code 的配对链接都只含设备标识（ZCode 旧版链接含 `sid`/`hash`，新版 relay v2 与 Kimi 一样不含密钥），账号登录在你设备上的官方页面内完成（ZCode 需登录与桌面端一致的账号），登录态由系统 WebView 保管（登录一次，重启免登录）。官方网页给不了的部分——凭据管理、应用锁、多机收藏、移动端体验修补——由这个壳补齐。

> ⚠️ 非官方项目，与 ZCode / 智谱 AI / Moonshot AI 没有关联，也未获授权。你需要自己的、已开启「远程控制」的桌面端（Kimi Code 远程控制还需你本人的 Kimi 账号及相应会员权益）。细节见[免责声明](./docs/DISCLAIMER.md)。

## 功能

- **双宿主兼容**：同一套壳管理 ZCode（zcode.z.ai / zcode.chatglm.site）与 Kimi Code（code-rc.kimi.com / code-rc.kimi.ai）两种桌面端，机器列表按宿主分类展示
- **网页登录管理**：账号登录在应用内完成（Kimi Code 支持覆盖层授权，ZCode 在控制台页内登录），登录态由系统 WebView 保管（默认跨重启保留，可关闭），机器卡片实时显示登录状态，支持一键退出账号 / 清除全部网页登录数据
- **机器管理**：自定义命名、收藏置顶、手动排序；同一台机器重复配对会合并记录并更新凭据
- **加密存储**：配对凭据（ZCode 的 sid 及路由参数，Kimi Code 的设备标识）AES 落盘，密钥托管在 Android Keystore，明文不落闪存
- **应用锁**：指纹 / 人脸、图案、密码可以同时开着，任意一种都能解锁，单一方式失灵不至于被锁在外面；后台切回自动重新上锁；生物识别可用性按设备实际能力动态检测
- **连接状态与通知**：控制台顶部实时状态条（连接中 / 已连接 / 等待桌面端 / 已断开 / 被顶下线）；断线、被顶、Agent 等待批准时发本地通知
- **应用内更新**：检查 GitHub Releases 新版本，下载进度、失败原因、浏览器兜底下载都有；启动时可自动检查（可关，只提醒不自动装）
- **下载管理**：更新包和控制台页面里下载的文件统一列在一处，进度、暂停继续、取消、打开、删除、失败重试；暂停有通知与原因提示，长时间无响应的任务自动取消并提示
- **行为补丁**：document-start 注入、带探针自退役。比如修掉某些移动浏览器上"回车变成发送"的问题
- **合规**：首次启动弹《用户协议》《隐私政策》同意门，设置里有法律文档中心；不收集任何数据
- **体验细节**：系统返回键先走网页历史、无历史再回应用；边到边（全面屏与安卓容器）适配；键盘会把输入框顶起来

## 架构

```
zshell/                            # npm workspaces monorepo
├── packages/
│   ├── core-shell/              # 零框架依赖的纯 TS 核心（严格 TS 子集，ArkTS 兼容）：
│   │                            #   配对解析 / endpoint 选择 / 状态机 / 机器注册表 /
│   │                            #   应用锁 / SHA-256+HMAC+PBKDF2+Base64
│   └── patch-bundle/            # 注入官方页面的行为补丁
└── apps/mobile/                 # React Native 0.82 应用（新架构，Android 先行）
```

一条原则：**逻辑单源**。core-shell 不依赖任何框架，平台能力通过接口注入（存储、生物识别各有端口），所以将来换壳（RN 换 ArkTS 原生）时逻辑原样带走。展开见[架构设计](./docs/architecture.md)。

## 快速开始

环境：Node ≥ 22、npm ≥ 12、JDK 17–21、Android SDK（API 36）。动手前先读[构建指南](./docs/build.md)，里面有 monorepo 路径、npm 补丁、Windows 260 字符限制、国内镜像这几个已知坑。

```bash
npm install                          # 安装全部依赖（含 npm patch）
npx vitest run                       # core-shell 单元测试
cd apps/mobile/android
./gradlew assembleRelease            # 产出可独立运行的 release APK
```

已发布版本在 [Releases](https://github.com/Amwidtf/zshell/releases)，打 tag 自动构建。

## 多平台路线

| 平台 | 状态 | 说明 |
|---|---|---|
| Android | ✅ 可用 | RN 0.82，新架构（Fabric） |
| HarmonyOS NEXT | 📋 规划中 | 同一工程 + RNOH，Windows 上可构建 |
| iOS | 📋 规划中 | 脚手架已备好，构建需要 macOS 或云 Mac |

## 安全与隐私

零收集是底线：无后端、无账号、无遥测，所有数据只在本机加密存储里。配对凭据本质是长期凭据（等同密码），建议在桌面端定期轮换。另有一点要知情：远程会话经官方中继传输，本应用不新增暴露面，但中继侧的可见性由官方设计决定，处理敏感代码库前自己权衡。

全文：[隐私政策](./docs/PRIVACY.md)、[安全说明](./docs/SECURITY.md)、[免责声明](./docs/DISCLAIMER.md)。

## 文档

| 文档 | 内容 |
|---|---|
| [CHANGELOG.md](./CHANGELOG.md) | 更新日志，Release 说明从这里取 |
| [CONTRIBUTING.md](./CONTRIBUTING.md) | 参与贡献指南 |
| [AGENTS.md](./AGENTS.md) | AI 代理与贡献者工作指南 |
| [docs/architecture.md](./docs/architecture.md) | 架构设计 |
| [docs/build.md](./docs/build.md) | 构建指南与已知坑 |
| [docs/release.md](./docs/release.md) | 发版流程 |
| [docs/compliance.md](./docs/compliance.md) | 合规实现与上架材料 |

## 开发方式

这个项目用 AI 结对的方式开发：ZCode 编程智能体（GLM 模型驱动）写了几乎全部代码和文档，人类维护者负责提需求、做技术决策和验收。提交历史就是这份协作的记录。

## 许可

[MIT](./LICENSE) © 2026 ZShell Contributors

基于 React Native 等开源软件构建（许可证清单见应用内"开源许可"）；所有第三方组件只做本地功能，不改变零收集的承诺。
