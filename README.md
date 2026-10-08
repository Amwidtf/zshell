# ZShell

**ZCode 远程控制的手机壳客户端（非官方第三方工具）** · 当前版本 `v0.0.1-alpha`（Android）

ZShell 把 ZCode 桌面端的「Web 远程控制」装进手机：扫码（或粘贴链接 / 相册识别二维码截图）配对，安全保存配对凭据，然后在一个加固的 WebView 中使用官方远程控制台——并附上官方网页版做不到的能力：**本地加密存储、应用锁（指纹 / 人脸 / 图案 / 密码）、收藏多机管理、针对移动端浏览器缺陷的行为补丁**。

> ⚠️ **非官方声明**：本项目与 ZCode / 智谱 AI 无任何关联，亦未获其授权或认可。使用需自备已启用「Web 远程控制」的 ZCode 桌面端。详见 [DISCLAIMER.md](./DISCLAIMER.md)。

## 功能

- **双入口配对**：相机扫码 / 手动粘贴配对链接 / 从相册二维码截图识别（纯 JS 解码，零额外原生依赖）
- **机器管理**：多台桌面端凭据管理，自定义命名、收藏置顶、手动排序；同一台机器重复配对自动合并并轮换凭据
- **加密存储**：配对凭据（`sid` + `hash`）使用 AES 加密落盘，加密密钥由 Android Keystore 托管，永不以明文存储
- **应用锁**：指纹 / 人脸（系统生物识别）、图案、密码三种方式；PBKDF2-HMAC-SHA256 本地验证；切入后台自动重新上锁
- **行为补丁层**：document-start 注入、带探针自退役——例如修复部分移动浏览器上"回车变发送"的问题
- **零数据收集**：无自建后端、无遥测、无第三方数据上报，全部数据仅存于设备本地

## 架构

```
zcode-shell/                     # npm workspaces monorepo
├── packages/
│   ├── core-shell/              # 零框架依赖的纯 TS 核心（严格 TS 子集，ArkTS 兼容）
│   │   ├── pairing-url.ts       #   配对 URL 解析/构造（v3/v4 分界）
│   │   ├── endpoint.ts          #   endpoint 双线选择 + 故障隔离
│   │   ├── shell-state.ts       #   壳级连接状态机
│   │   ├── machine.ts           #   机器注册表（命名/收藏/排序/去重/持久化）
│   │   ├── applock.ts           #   应用锁模型（PBKDF2 验证器）
│   │   └── crypto.ts            #   纯 TS SHA-256/HMAC/PBKDF2/Base64
│   └── patch-bundle/            # 注入官方页面的行为补丁（JS 字符串，自防护）
└── apps/
    └── mobile/                  # React Native 0.82 应用（Android 优先）
        ├── App.tsx              #   导航栈 + 锁门控 + 注册表编排
        └── src/
            ├── storage.ts       #   MMKV 加密存储适配器（端口实现）
            ├── biometric.ts     #   生物识别适配器（端口实现）
            ├── PngDecoder.ts    #   纯 TS PNG 解码（相册识别二维码用）
            ├── qrFromFile.ts    #   相册选图 → PNG/JPEG → jsQR
            ├── PatternPad.tsx   #   3×3 图案锁组件
            └── screens/         #   锁屏/机器列表/扫码/手动输入/控制台/设置
```

设计原则：**核心逻辑（`core-shell`）零框架依赖**——UI 壳可以换（RN / ArkTS 原生 / 其他），逻辑单源复用，改一处生效于所有平台。

## 快速开始

环境要求：Node ≥ 20、JDK 17–21、Android SDK（API 36 + Build-Tools 36.0.0）。

```bash
npm install                          # 安装全部 workspace 依赖（含 npm patch）
npx vitest run                       # 运行 core-shell 单元测试
cd apps/mobile/android
./gradlew assembleDebug              # 产出 app/build/outputs/apk/debug/app-debug.apk
```

日常开发（需模拟器或真机）：

```bash
cd apps/mobile && npm start          # 启动 Metro
# 另开终端
adb reverse tcp:8081 tcp:8081        # 设备端口反代（真机/模拟器）
adb install -r apps/mobile/android/app/build/outputs/apk/debug/app-debug.apk
adb shell am start -n com.zshell/.MainActivity
```

> Windows 用户注意：本仓库处于较深目录时，含重量级 C++ codegen 的 RN 库可能触发 260 字符路径限制（`Filename longer than 260 characters`）。选型新原生依赖时请评估其 codegen 体积。

## 多平台路线

| 平台 | 状态 | 说明 |
|---|---|---|
| Android | ✅ v0.0.1-alpha 可用 | RN 0.82 + 新架构（Fabric） |
| HarmonyOS NEXT | 📋 规划中 | 同一 RN 工程 + RNOH（华为维护），Windows 可构建 |
| iOS | 📋 规划中 | 工程已含 iOS 脚手架；构建需 macOS / 云 Mac |

## 安全与隐私

- 配对凭据属于**长期凭据**（等同密码）。ZShell 仅将其 AES 加密存储于设备（密钥在 Android Keystore），提供应用锁防止他人打开；但凭据本质由官方 URL 设计决定，建议在桌面端定期「轮换」。
- **信任边界须知**：远程会话经官方中继服务传输，ZShell 不新增任何额外暴露面，也无法改变中继侧的可见性。处理敏感代码库的用户请自行评估（详见 [DISCLAIMER.md](./DISCLAIMER.md)）。
- 完整政策：[PRIVACY.md](./PRIVACY.md)（零收集承诺与权限用途）、[SECURITY.md](./SECURITY.md)（安全模型与报告渠道）。

## 文档

- [AGENTS.md](./AGENTS.md) — AI 代理 / 贡献者工作指南（命令、硬约束、合规红线）
- [DISCLAIMER.md](./DISCLAIMER.md) — 免责声明（非官方、商标、互操作边界、责任范围）
- [PRIVACY.md](./PRIVACY.md) — 隐私政策
- [SECURITY.md](./SECURITY.md) — 安全说明
- [LICENSE](./LICENSE) — MIT 许可证

## 版本

当前 `v0.0.1-alpha.1`：功能完整可用，API 与存储格式可能随开发调整。发布节奏遵循 [语义化版本](https://semver.org/lang/zh-CN/)。

## 许可

[MIT](./LICENSE) © 2026 ZShell Contributors

本项目基于 React Native 等开源软件构建，第三方依赖清单及其许可见各包 `package.json`；所有第三方组件仅用于本地功能实现，不改变本项目的零收集承诺。
