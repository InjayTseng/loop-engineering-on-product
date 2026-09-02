# 節點 D、B、V、Y：建、測、驗、出貨

「test or validate PRD」拆成兩層：B 是 deterministic 的正確性閘（產物沒壞），V 是 latent、獨立的驗證（產物兌現 PRD）。缺一層都會漏。

## D — `/execute-prp <PRP>`

讀 PRP、跟著連結、只在 PRP 沒講的地方補研究；先想再動（拆成小步）；照 PRP 的有序任務做、mirror 既有 pattern、只碰 PRP 列的檔；跑 PRP 的每個 validation level，修到過，絕不放寬測試讓它過；最後派 `validator`——你不宣布成功。

Constraints（每輪都成立）：一輪一個小改動、`git add <具體檔>`、不 refactor、不動 `DEPLOY_BRANCH`。

## B — `BUILD_CMD`（adapter）

`loop.config.env` 裡一行指令，exit 0 = ok，印 JSON 或 log。這是唯一隨產品變的東西（見 [07-adapters](07-adapters.md)）。

- web：`node scripts/adapters/web-check.mjs /tmp/loop-shot.png` — 真 Chrome 渲染、抓 console/page error、截圖、檢查 `WEB_MUST_INCLUDE` 的漏斗關鍵字串還在
- iOS：`scripts/adapters/ios-shot.sh /tmp/loop-shot.png` — xcodebuild + simctl 安裝啟動 + 截圖

`BUILD: fail` → 修 ≤3 次 → 還原、`[FAILED]`、`LOOP_RESULT: NOOP`。連續 3 輪 NOOP 是結構性問題（adapter 或產品壞了），driver 直接停，不當價值訊號。

## V — `validator`（獨立子代理，對著 PRD 驗）

它沒寫這段 code、目標是否證 builder 的宣稱。輸入是 PRP 路徑（讀 CLAIM、Success Criteria、Validation Loop）、改動檔、Step 0 的 baseline 截圖。

協定：跑 `BUILD_CMD` → 讀截圖／輸出（在互動後面的功能就驅動到那個狀態再看，2–3 個狀態）→ 逐條驗 CLAIM 與成功準則、跑 PRP 自己的驗證指令 → 9 軸計分：

1. build/render 無 error
2. 宣稱的改動真的看得到
3. 行為如描述
4. LABEL-PROMISE：每個碰到的 CTA 做的事跟 label 承諾的一致
5. 相鄰 UI／漏斗關鍵流程無 regression
6. 空狀態／首次／錯誤狀態不難看
7. 視覺層次、可讀性、與既有設計一致
8. 無障礙基本（label 在、目標 viewport 不裁字）
9. 真有價值 vs 噪音

`PASS` 只在 1–4 全 Pass 且 0 BLOCKERS。輸出 VERDICT / CLAIM / EVIDENCE / SCORECARD / BLOCKERS / NICE_TO_HAVE，貼回 backlog。

路由：

- 實作問題 → 回 D，≤3 次
- `BLOCKERS: PRD: …`（CLAIM 不可觀察或自相矛盾）→ 回 S 一次
- 同 slice 超過 3 次 → 還原、`NOOP`

第 4 軸是 v2 實跑後加的。原本的 9 軸驗「元素在、會動、無 error」，放行了一顆「問一支籤？」按鈕——它只預選類別並捲動，沒抽籤，用戶體感「沒反應」。build 全綠、validator PASS，是人回頭看才抓到。功能正確 ≠ 體驗符合承諾。

## Y — 出貨到隔離分支

```bash
git add <files> PRPs/<file>.md research/briefs/<brief>.md .claude/tasks/_idea_ledger.md .claude/tasks/_product_backlog.md
git commit -m "loop(<category>): <一句話> — moves <階段>"
git push origin <LOOP_BRANCH>      # 永不 DEPLOY_BRANCH
```

ledger／backlog 標 `[COMPLETED]`，最後一行 `LOOP_RESULT: SHIPPED | category=… | step=… | rejects=N`。

live 由人 merge。web-v2 測試場的 `main` 是 GitHub Pages 直接部署到 live，push main 等於上線——所以 driver 開頭硬擋非 loop 分支，這條沒有例外。

## 為什麼 builder 不能自驗

builder 有一切動機宣布成功：它寫的、它相信對、它想結束這一輪。第二雙眼睛的優勢是結構性的（獨立 context、無作者身分、無沉沒成本），不是 prompt 寫得多用力的問題。這套裡 value-critic、validator、trajectory-monitor、positioning-critic、state-auditor 全部是獨立子代理，同一個原因。

下一頁：[05-loop](05-loop.md)
