# 奶龙图片替换（Nailoong Image Swap）

一个 Chrome Manifest V3 扩展程序，会把网站上的图片换成奶龙图片。

![YouTube 搜索结果，每个缩略图都换成了奶龙角色](assets/demo/readme-demo.png)

图片是运行时用 Bing 图片搜索实时抓取的，没有打包图库，也没有写死的网址清单，所以每次加载页面看到的图片都不一样。

- **默认关闭**：要在工具栏的 popup 打开开关才会生效。
- **不打包图片**：整个扩展程序解压后约 40 KB，压缩后约 7.5 KB。
- **不需要账号、没有遥测、没有分析**：唯一的网络请求就是图片搜索和下载图片。
- **许可：GPL-3.0-or-later。**

其他语言：[English](README.md) · [繁體中文](README.zh-Hant.md)

---

## 安装方式

使用者不需要安装 Node、npm 或任何开发依赖。你需要的是这个项目构建好的 `dist/nailoong-image-swap` 文件夹。

1. 取得这个项目（`git clone`，或从 Releases 下载并解压 ZIP）。

2. 打开 Chrome、Brave、Edge 或其他 Chromium 浏览器的扩展程序页面：

```text
chrome://extensions
```

Brave 请用 `brave://extensions`，Edge 请用 `edge://extensions`。

3. 打开右上角的「开发者模式」。

4. 按「加载已解压的扩展程序」。

5. 选择 `dist/nailoong-image-swap` 文件夹。

6. 点工具栏上的「Nailoong Image Swap」图标，打开「Nailoong images」开关。

7. 刷新要测试的网站。

> 如果你拿到的是源码而不是构建好的 `dist/`，先在项目根目录执行 `npm install && npm run build`，再加载 `dist/nailoong-image-swap`。

## 使用方式

点工具栏图标会看到一个开关：

![扩展程序 popup，开关已打开](assets/demo/popup.png)

打开后，当前和之后加载的页面都会开始换图。关掉开关，页面上的原图会还原。设置会存在浏览器里，重开浏览器仍然有效。

## 运行方式

内容脚本会扫描页面，替换 `<img>` 元素和 CSS 背景图片。它自己不做任何网络请求：它向后台 service worker 要一个带编号的槽位，由 worker 决定要返回哪张图。

worker 会维护一份从 Bing 图片搜索来的网址池。池子快用完时，它会随机挑一个关键词和一个结果页重新填充。所以每次加载页面都是从不同的结果切片取图。

图片会先转换成 `data:` URL 才发送到页面，所以页面永远看不到远程的图片主机。

## 开发者

```bash
npm install
npm run build
```

构建会把 `src/` 编译到 `dist/nailoong-image-swap/`，并生成 `dist/nailoong-image-swap.zip`。`dist/` 里的全部内容都是构建产生的，不要手动修改。改完源码后，回到扩展程序页面按重新加载。

其他命令：

```bash
npm run typecheck   # TypeScript 类型检查
npm run build:dev   # 保留 localhost 测试开关的开发版构建
```

## 项目结构

```text
src/
  background.ts      service worker：图片搜索、抓图、缓存、发放图片
  content.ts         内容脚本：扫描页面、换图、还原
  search-images.ts   Bing 图片搜索与结果解析
  messages.ts        内容脚本与 service worker 之间的消息格式与验证
  popup.ts           工具栏 popup 的开关逻辑
  popup.html/css     popup 界面
  types/chrome.d.ts  用到的 Chrome API 类型声明
scripts/build.mjs    唯一的构建脚本
manifest.json        扩展程序配置，构建时复制进 dist/
assets/demo/         README 用的截图
README.md            英文版
README.zh-Hant.md    繁体中文版
README.zh-Hans.md    简体中文版
```

## 注意

- 图片来源是 Bing 图片搜索的缩略图，分辨率不高。放大到满版时会看得出来。
- service worker 只会抓 Bing 自家 CDN（`ts1`–`ts4.mm.bing.net`）的缩略图，搜索结果指向其他域名的一律丢弃。
- 每次加载页面会随机挑一个搜索关键词和一个结果页，所以不同网站、不同时间看到的图片都不一样。
- 如果某张图抓不到，worker 会往后找下一张，不会出现破图。
- 解析 Bing 搜索端点，不是官方 API。Bing 改版就停止换图。

## 安全性

内容脚本会在每个页面上运行，所以它把页面当成敌对环境。

- 它只会把 `data:image/...` 的值写回 DOM，而且只限位图格式。SVG 被排除，因为它可以携带脚本。
- 它会拒绝不是来自这个扩展程序的消息。
- 它从不指定网址。它只要求一个带编号的槽位，由 worker 决定要抓什么，所以敌对页面无法把请求导向自己指定的主机。
- worker 只会抓 Bing 自家 CDN 的缩略图，任何指向其他地方的搜索结果都会被丢弃。
- localhost 测试开关在正式构建中会被编译掉，只有 `npm run build:dev` 会保留。

## 权限

| 权限 | 用途 |
| --- | --- |
| `storage` | 记住开关是否打开。 |
| `www.bing.com/images/async` 的 `host_permissions` | 执行图片搜索。 |
| `ts1`–`ts4.mm.bing.net` 的 `host_permissions` | 下载缩略图。 |
| `<all_urls>` 上的内容脚本 | 必须看到页面才能换图。 |

## 致谢

奶龙（Nailoong）是各自权利人创作的角色。本项目是粉丝自制的玩笑扩展程序，与他们没有隶属关系，也未经他们背书。GPL 许可涵盖这份源码，不涵盖它抓取的图像。

## 授权

Copyright (C) 2026 taco

This program is free software: you can redistribute it and/or modify it under
the terms of the GNU General Public License as published by the Free Software
Foundation, either version 3 of the License, or (at your option) any later
version.

This program is distributed in the hope that it will be useful, but WITHOUT ANY
WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A
PARTICULAR PURPOSE. See the GNU General Public License for more details.

You should have received a copy of the GNU General Public License along with
this program. If not, see <https://www.gnu.org/licenses/>.
