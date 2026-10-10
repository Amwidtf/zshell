/**
 * In-app legal documents for the settings "法律与关于" section and the
 * first-launch consent gate.
 *
 * KEEP IN SYNC: docs/DISCLAIMER.md and docs/PRIVACY.md in the repository are
 * source of truth — when they change, bump LEGAL_DOC_VERSION and mirror
 * the substance here (see AGENTS.md release checklist).
 */

export interface LegalDoc {
  title: string;
  body: string;
}

/** Bump to re-prompt consent after material legal changes. */
export const LEGAL_DOC_VERSION = 4;

export const USER_AGREEMENT: LegalDoc = {
  title: '用户协议与免责声明',
  body: `最后更新：2026-10-08 · 适用版本：v0.0.1-alpha 及之后版本

一、非官方声明
ZShell 是一个非官方、未经授权的开源第三方客户端，与 ZCode、智谱 AI 及其关联公司（下称"官方"）不存在任何隶属、代理、合作、赞助或认可关系。"ZCode" 及相关商标归属其权利人，本应用中出现上述名称仅用于如实描述互操作对象。

二、使用前提
1. 本应用不提供、不代理、不转售任何模型服务或计算资源；
2. 使用本应用需你本人合法持有 ZCode 桌面客户端，并由你本人开启「Web 远程控制」生成配对凭据；
3. 你应遵守 ZCode 官方服务条款及所在辖区法律法规。未经授权连接或控制他人计算机属违法行为，本应用仅用于连接使用者本人的设备。

三、互操作性质
本应用为实现互操作，对配对链接格式与网页控制台行为进行了观察与描述：不包含、不分发任何官方受版权保护的源代码；不实施任何绕过鉴权或破解行为；所有连接均使用你本人的合法配对凭据，经官方正常服务链路完成。

四、服务依赖与可用性
本应用依赖官方中继服务与网页控制台。官方可能随时变更协议、收紧校验或停止服务，届时本应用部分或全部功能可能失效，本应用不承担因此产生的责任。

五、安全须知
1. 配对链接（含 sid 与 hash）等同于长期访问凭据，请勿转发他人，建议在桌面端定期轮换；本应用使用系统级加密存储并可选应用锁保护，但无法改变凭据本身的安全属性；
2. 远程会话内容经官方中继传输，其可见性由官方服务的安全设计决定，本应用不新增额外暴露面，也无法提供端到端加密。处理高度敏感代码库请谨慎评估。

六、免责与担保
本应用按"现状"与"现有"基础提供，不附带任何明示或默示担保。因使用本应用造成的任何直接或间接损失（包括数据丢失、业务中断等），作者不承担责任。

七、法律适用
本协议的解释与争议解决适用中华人民共和国法律。若官方服务条款限制第三方客户端接入，你应停止使用或仅作个人学习研究之用。本项目以 MIT 许可证开源分发。`,
};

export const PRIVACY_POLICY: LegalDoc = {
  title: '隐私政策',
  body: `最后更新：2026-10-08 · 适用版本：v0.0.1-alpha 及之后版本

ZShell 的隐私设计只有一条原则：零收集。本应用没有自建服务器、没有账号体系、没有崩溃收集 SDK、没有广告和分析组件。所有功能均在你本人的设备上完成。

一、我们收集哪些个人信息
无。本应用不向开发者或任何第三方传输、上报任何个人信息或使用数据。

二、本地存储的数据（永不离开你的设备）
1. 机器列表：已配对桌面端的名称、地址、凭据（sid/hash）、收藏与排序 —— AES 加密存储（MMKV），加密密钥由 Android Keystore 托管；
2. 应用锁设置：锁定方式与 PBKDF2 验证器（盐 + 哈希，不存明文密码或图案）；
3. 以上数据卸载应用或清除应用数据即彻底删除。

三、权限用途
1. 相机：仅用于扫描配对二维码，不拍照、不录像、不保存图像；
2. 生物识别：仅调用系统本机验证完成应用锁解锁，不接触、不存储生物特征数据；
3. 照片：仅在你主动选择「从相册识别二维码」时读取所选单张图片，识别完成即丢弃；
4. 网络：连接你自己的桌面端配对地址与官方远程控制台；本应用无自建服务器。
   此外，应用启动时会自动访问 GitHub（api.github.com）检查新版本
   （默认开启，可在设置中关闭），手动检查与下载更新时也会访问 GitHub
   及其下载服务；控制台页面内你主动触发的文件下载经系统下载组件
   完成并保存到系统公共下载目录——除此之外没有任何网络行为；
5. 安装应用：下载完成后交由系统安装器安装更新，需要你在系统里授予
   「来自此来源的应用安装」权限，安装与否始终由你确认。

四、第三方组件
以下开源组件均为本地功能实现，不进行任何数据上报：react-native / react-native-webview（应用框架与控制台容器）、react-native-camera-kit（扫码）、react-native-image-picker（相册选图）、react-native-mmkv-storage（加密存储）、react-native-biometrics（系统生物识别）、jsQR / jpeg-js / pako（本地二维码图片识别）。

五、数据安全
配对凭据 AES 加密存储、密钥托管于 Android Keystore；应用锁（生物识别/图案/密码）防止他人查看或使用；凭据校验采用 PBKDF2-HMAC-SHA256（随机盐 + 20000 次迭代 + 常数时间比较）。请知悉：远程会话内容经官方中继服务传输，该环节不在本应用控制范围内（见《用户协议与免责声明》第五条）。

六、未成年人
本应用面向开发者群体，不建议未成年人使用。

七、政策变更
政策如有重大变更将随版本发布更新；继续使用即表示接受更新后的政策。行使个人信息权利或对本政策有疑问，请通过仓库 Issue 或安全渠道联系。`,
};

export const OSS_LICENSES: LegalDoc = {
  title: '开源许可',
  body: `ZShell 本体以 MIT 许可证开源分发（© 2026 ZShell Contributors），完整文本见仓库 LICENSE 文件。

本应用使用的主要开源组件及其许可证：
· react-native / react —— MIT License
· react-native-webview —— MIT License
· react-native-camera-kit —— MIT License
· react-native-image-picker —— MIT License
· react-native-mmkv-storage（内含 Tencent MMKV）—— MIT License
· react-native-biometrics —— MIT License
· jsQR —— Apache License 2.0
· jpeg-js —— BSD 3-Clause License
· pako —— MIT AND Zlib License

以上组件的完整许可证文本可在其各自仓库获取。所有组件仅用于本地功能实现，不改变本应用的零数据收集承诺。`,
};
