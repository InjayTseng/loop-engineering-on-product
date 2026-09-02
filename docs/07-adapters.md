# Adapters：換產品只換四格

整張圖裡只有 B 節點（怎麼 build、怎麼觀察、什麼算壞、哪個分支是 live）隨產品變。其餘節點、gate、回邊、結果行協定、driver 全部照用。

adapter 要提供三件事：

1. 正確性指令 — `BUILD_CMD`，exit 0 = ok，印 JSON 或 log
2. 觀察手段 — validator 看得到產物：截圖／測試輸出／指標
3. 部署隔離 — 哪個分支是 live，loop 在哪

## A — web（實例：web-v2 測試場，example.com）

| 項 | 值 |
|---|---|
| build + correctness | 無 compile → 真 Chrome 渲染：`node scripts/adapters/web-check.mjs /tmp/loop-shot.png` |
| 觀察 | Playwright `page.screenshot`；互動後狀態由 validator 寫短腳本驅動 |
| broken 訊號 | pageerror／console error（過濾資源載入噪音）／`WEB_MUST_INCLUDE` 的漏斗關鍵字串消失 |
| 部署隔離 | `main` = GitHub Pages 直上 live；loop 在 `loop` |
| 坑 | analytics 要 stub 成 204 不能 abort（abort 會產生假 console error）；單檔 app 一個壞 edit 整頁掛，正確性閘是命脈；互動後才渲染的元素要驅動到才看得到 |

安裝：`npm i -D playwright`（用 `channel:'chrome'`，不下載瀏覽器）。

## B — iOS（實例：iOS 健康 app）

| 項 | 值 |
|---|---|
| build + correctness | `scripts/adapters/ios-shot.sh /tmp/loop-shot.png`：`xcodebuild … -sdk iphonesimulator build`，先 `-resolvePackageDependencies` |
| 觀察 | `xcrun simctl install/launch/io screenshot`（模擬器要先 boot） |
| broken 訊號 | BUILD FAILED／編譯 error／啟動 crash |
| 部署隔離 | git worktree 或 `loop` 分支；live = App Store 人工送審，loop 不自動上架 |
| 坑 | clean build 先 resolve SPM；新 .swift 檔要用腳本加進 `project.pbxproj`（別手動編）；worktree 共用 remote，只 push loop |

`loop.config.env` 設 `IOS_PROJECT` / `IOS_SCHEME` / `IOS_BUNDLE_ID` / `IOS_SIM`。

## 新場景配方

回答四問就能接：

1. 怎麼 build／跑起來？沒有 build（靜態、腳本）→ correctness = 跑起來不報錯
2. 怎麼觀察產物？截圖（UI）／測試輸出（lib）／指標（資料管線）／產物本身（內容）
3. 什麼算壞？exit≠0／例外／關鍵輸出消失 → 寫成一個 exit-code + JSON 的腳本
4. 哪個分支 live？→ loop 在別的分支，driver 硬擋

| 候選場景 | build | 觀察 | 壞 |
|---|---|---|---|
| 前端 component lib | `vite build`／storybook | component 截圖 | build fail／視覺 regression |
| CLI／後端 lib | `cargo build`／`pytest` | 測試輸出 | 編譯／測試失敗 |
| 內容／research loop | 產文 | 產物本身 | 缺引用／事實錯；validator = 對抗式查核 |
| 資料管線 | 跑 pipeline | 輸出指標／schema | schema 漂移／指標退化 |

寫好 adapter 後，`validator` 與 `state-auditor` 不用改——它們讀 `loop.config.env` 的 `BUILD_CMD` / `OBSERVE` / `BROKEN_SIGNAL`。

下一頁：[08-adopt](08-adopt.md)
