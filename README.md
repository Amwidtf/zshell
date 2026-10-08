# ZShell

**[English](./README.en.md)** ｜ **中文**

![android](https://github.com/Amwidtf/zshell/actions/workflows/android.yml/badge.svg)

ZCode 远程控制的手机壳客户端（非官方第三方工具）· 当前版本 `v0.0.1-alpha.3`（Android）

ZShell 把 ZCode 桌面端的「Web 远程控制」装进手机：扫码（或粘贴链接 / 相册识别二维码截图）配对，安全保存配对凭据，然后在一个加固的 WebView 中使用官方远程控制台——并补上官方网页版做不到的能力：**本地加密存储、应用锁（指纹 / 人脸 / 图案 / 密码）、收藏多机管理、移动端体验修补**。

> ⚠️ **非官方声明**：本项目与 ZCode / 智谱 AI 无任何关联，亦未获其授权或认可。使用需自备已启用「Web 远程控制」的 ZCode 桌面端。详见[免责声明](./docs/DISCLAIMER.md)。

## 功能

- **双入口配对**：相机扫码 / 手动粘贴配对链接 / 从相册二维码截图识别（纯 JS 解码，零额外原生依赖）
- **机器管理**：多台桌面端凭据管理，自定义命名、收藏置顶、手动排序；同一台机器重复配对自动合并并轮换凭据
- **加密存储**：配对凭据（`sid` + `hash`）AES 加密落盘，密钥由 Android Keystore 托管，永不以明文存储
- **应用锁**：指纹 / 人脸（系统生物识别，可用性动态检测）、图案、密码；PBKDF2 本地验证；切入后台自动重新上锁
- **行为补丁层**：document-start 注入、带探针自退役——例如修复部分移动浏览器上"回车变发送"的问题
- **合规内建**：首次启动《用户协议》《隐私政策》同意门控；设置内法律文档中心；零数据收集
- **体验细节**：系统返回键优先网页历史返回；边到边（全面屏/容器）适配；键盘顶起输入框

## 架构

```
zcode-shell/                     # npm workspaces monorepo
├── packages/
│   ├── core-shell/              # 零框架依赖纯 TS 核心（严格 TS 子集，ArkTS 兼容）
│   │                            #   配对解析 / endpoint 选择 / 状态机 / 机器注册表 /
│   │                            #   应用锁模型 / SHA-256+HMAC+PBKDF2+Base64
│   └── patch-bundle/            # 注入官方页面的行为补丁（自防护纪律）
└── apps/mobile/                 # React Native 0.82 应用（新架构，Android 先行）
```

设计原则：**逻辑单源（core-shell 零框架依赖），平台能力经端口注入**——UI 壳可换（RN / ArkTS），逻辑改一处生效于所有平台。详见[架构设计](./docs/architecture.md)。

## 快速开始

环境：Node ≥ 22 + npm ≥ 12、JDK 17–21、Android SDK（API 36）。**已知坑（monorepo 路径 / npm 补丁 / Windows 260 限制 / 国内镜像）务必先读[构建指南](./docs/build.md)。**

```bash
npm install                          # 安装全部依赖（含 npm patch）
npx vitest run                       # core-shell 单元测试
cd apps/mobile/android
./gradlew assembleRelease            # 产出可独立运行的 release APK
```

下载已发布版本：[Releases](https://github.com/Amwidtf/zshell/releases)（tag 构建自动发布）。

## 多平台路线

| 平台 | 状态 | 说明 |
|---|---|---|
| Android | ✅ v0.0.1-alpha 可用 | RN 0.82 + 新架构（Fabric） |
| HarmonyOS NEXT | 📋 规划中 | 同一 RN 工程 + RNOH（华为维护），Windows 可构建 |
| iOS | 📋 规划中 | 工程已含 iOS 脚手架；构建需 macOS / 云 Mac |

## 安全与隐私

- **零收集**：无自建后端、无遥测、无第三方数据上报，全部数据仅存于设备本地加密存储
- 配对凭据属**长期凭据**（等同密码），建议在桌面端定期轮换；应用锁防止他人滥用
- **信任边界须知**：远程会话经官方中继传输，ZShell 不新增额外暴露面，也无法改变中继侧可见性——处理敏感代码库请自行评估

详见[隐私政策](./docs/PRIVACY.md)（零收集承诺与权限用途）、[安全说明](./docs/SECURITY.md)、[免责声明](./docs/DISCLAIMER.md)。

## 文档

| 文档 | 内容 |
|---|---|
| [CHANGELOG.md](./CHANGELOG.md) | 版本更新日志（Release 说明的数据源） |
| [AGENTS.md](./AGENTS.md) | AI 代理 / 贡献者工作指南（命令、硬约束、合规红线） |
| [docs/architecture.md](./docs/architecture.md) | 架构设计与核心决策 |
| [docs/build.md](./docs/build.md) | 构建开发指南与已知坑 |
| [docs/release.md](./docs/release.md) | 发版流程与 Release 说明规范 |
| [docs/compliance.md](./docs/compliance.md) | 合规实现与上架材料清单 |

## 版本

`v0.0.1-alpha.3` —— Alpha 阶段，API 与存储格式可能调整。变更记录见 [CHANGELOG.md](./CHANGELOG.md)。

## 许可

[MIT](./LICENSE) © 2026 ZShell Contributors

本项目基于 React Native 等开源软件构建（许可证清单见应用内「开源许可」）；所有第三方组件仅用于本地功能实现，不改变本项目的零收集承诺。
