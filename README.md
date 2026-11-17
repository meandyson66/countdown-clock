# countdown-clock

个人小工具合集。作者：[meandyson66](https://github.com/meandyson66)

## 寻伴 FindMatch（附近交友演示）

| 方式 | 链接 |
|------|------|
| **网页预览** | [打开寻伴](https://meandyson66.github.io/countdown-clock/findmatch/) |
| 安卓 APK | [Actions 构建产物](https://github.com/meandyson66/countdown-clock/actions/workflows/findmatch-apk.yml) 或 [Release](https://github.com/meandyson66/countdown-clock/releases) |
| 文档 | [FINDMATCH.md](./FINDMATCH.md) |

源码目录：`src/` · 安卓模块：`android/findmatch/`（`com.meandyson.findmatch`）

---

# 澳门特码推荐 1.7（新澳门 21:32 · 老澳门 22:32）

开源的 **澳门六合彩特码** 缩水推荐工具：自动读取公开历史开奖，四层漏斗过滤，输出 6～8 个高性价比特码，含回测胜率、连错风控与实盘对账。支持 **网页直接使用** 与 **安卓 APK** 安装，无需自建 Python 后端。

## 一键使用（特码推荐）

| 方式 | 说明 | 链接 |
|------|------|------|
| 网页版 | 手机 / 电脑浏览器打开即用 | [打开澳门特码推荐网页](https://meandyson66.github.io/countdown-clock/recommend-web/) |
| 安卓版 | 安装后可离线看缓存，联网自动更新 | [下载 APK（最新 Release）](https://github.com/meandyson66/countdown-clock/releases/latest) |
| 源码 | `recommend-web` 与安卓 `assets` 同源 | [recommend-web/](https://github.com/meandyson66/countdown-clock/tree/main/recommend-web) |

网页版与安卓安装包使用同一套 `engine.js` 计算逻辑；安卓源码在 `android/recommend/`。

## 功能概览

- **新澳门**（`macaujc2`，约 21:32）与 **老澳门**（`macaujc`，约 22:32）双彩种
- 特码 **去冷热、旺肖、波色单双、资金风控** 四层过滤
- 近 30 / 200 期回测胜率，连错 5 期以上提示观望
- 单注金额、投入总额、命中纯利；`localStorage` 本地账本

## 与本仓库其他项目

| 目录 | 内容 |
|------|------|
| `recommend-web/` | GitHub Pages 网页版（**澳门特码**主入口） |
| `android/recommend/` | 安卓 WebView 工程（`com.meandyson.macaurecommend`） |
| `recommend/` | 可选 Python 定时推送（Telegram / 微信），非网页必需 |
| `macau.html` | 历史查询页（生肖 / 号码冷热统计，本地未上架时可自行部署） |

## 数据说明

开奖历史来自公开接口 `history.macaumarksix.com`，仅供学习与统计，**不构成任何投注建议**。

## 搜索关键词

若你在 GitHub 搜索：**澳门特码**、**新澳门特码**、**老澳门特码**、**六合彩特码推荐**、**macau mark six tema**，本仓库名称可能仍显示为 `countdown-clock`（历史原因），内容以 **特码推荐 1.7** 为主。欢迎 Star 便于他人发现。

---

樱花倒计时等其它页面：根目录 `index.html` · Pages 首页 [meandyson66.github.io/countdown-clock/](https://meandyson66.github.io/countdown-clock/)