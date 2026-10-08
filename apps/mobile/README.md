# ZShell Mobile（apps/mobile）

ZCode 远程控制手机壳的 React Native 应用。项目总览、架构与合规文档见[仓库根 README](../../README.md)。

## 常用命令

```bash
npm start                 # 启动 Metro（在本目录）
npm run android           # 构建并安装到已连接的 Android 设备/模拟器
npm test                  # 应用层 jest 测试

# 手动构建 APK
cd android && ./gradlew assembleDebug
# 产物：android/app/build/outputs/apk/debug/app-debug.apk
```

## 结构

- `App.tsx` — 导航栈、锁门控、机器注册表编排
- `src/screens/` — 六个界面（锁屏 / 机器列表 / 扫码 / 手动输入 / 控制台 / 设置）
- `src/storage.ts` — MMKV 加密存储适配器（实现 core-shell 的 `SecureKvStore` 端口）
- `src/biometric.ts` — 生物识别适配器（实现 `BiometricAuth` 端口）
- `src/qrFromFile.ts` + `src/PngDecoder.ts` — 相册二维码截图识别（纯 JS）
- `src/PatternPad.tsx` — 图案锁组件

开发约束与构建环境备忘见根目录 [AGENTS.md](../../AGENTS.md)。
