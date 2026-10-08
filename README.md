# Birthday Quest — THE FINAL TRIAL

一个暗黑奇幻风格的生日小游戏网站。

> 表面上是三项神秘试炼，实际上……是一个生日祝福。
> 请先完成全部试炼，再抵达终点。

## Features

- **Reaction Test** — 疾速之眼：七轮反应测试，判定 false start，按平均反应时间授予中二称号。
- **Fate Draw** — 命运抽卡：16 张命运卡牌，第一次抽卡结果会被记录。
- **Boss Battle** — 终焉之战：ATK / DEFEND / SPECIAL 三行动回合制 Boss 战。
- **Final Birthday Ending** — 集齐三枚碎片后解锁最终之门，揭示真正的祝福。

## Technology

- HTML
- CSS
- 原生 JavaScript
- GitHub Pages 兼容（纯静态，无后端、无数据库、无 API）

## 运行方式

直接打开 `index.html` 即可，无需任何服务器。

## 部署方式

可以直接部署到 GitHub Pages：

1. 将本目录推送到 GitHub 仓库。
2. 在仓库 **Settings → Pages** 中选择分支（例如 `main`）与根目录 `/ (root)`。
3. 保存后等待发布完成即可。

## 项目结构

```
├── index.html   # 页面结构（六个 screen）
├── style.css    # 暗黑奇幻 RPG 视觉 + 响应式
├── script.js    # 游戏逻辑、状态、音效、结局
└── README.md
```

## 说明

- 进度通过 `localStorage` 保存，刷新页面不会丢失。
- 页面底部的 `RESET PROGRESS` 可清除全部进度（供测试）。
- 声音默认关闭，点击右上角 `SOUND OFF/ON` 开关。
- 无任何外部图片、字体或音频资源；所有图形由 CSS / SVG / Canvas 绘制，音效由 Web Audio API 合成。
