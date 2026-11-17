# 寻伴 FindMatch

陌陌式附近交友 **纯前端演示**（React + Vite），数据存于本机 `localStorage`。

## 在线预览

| 入口 | 链接 |
|------|------|
| **寻伴网页版** | https://meandyson66.github.io/countdown-clock/findmatch/ |
| 演示首页（聚合） | https://meandyson66.github.io/countdown-clock/ |

推送 `main` 后由 [findmatch-pages.yml](.github/workflows/findmatch-pages.yml) 自动部署。

## 安卓安装包

| 方式 | 说明 |
|------|------|
| **最新 APK** | 打开 [Actions → Build FindMatch APK](https://github.com/meandyson66/countdown-clock/actions/workflows/findmatch-apk.yml)，在最新一次运行底部 **Artifacts** 下载 `findmatch-apk` |
| Release | 发布 GitHub Release 时工作流会自动上传同名 APK |

应用 ID：`com.meandyson.findmatch`

### 本机构建

```bash
npm install
npm run sync:android
cd android
gradle :findmatch:assembleRelease
```

APK 路径：`android/findmatch/build/outputs/apk/release/findmatch-release.apk`  
（需 JDK 17 与 Android SDK，与现有 `android/` 工程共用。）

## 本地开发

```bash
npm install
npm run dev
```

- 网页发布构建：`npm run build:pages`
- 安卓资源构建：`npm run build:android`

## 功能摘要

- 首页附近 / 推荐、实名认证后聊天、会员充值等级
- 资料学历 / 工作 / 收入、城市三级联动
- 无后端；「重置演示数据」在「我的」页