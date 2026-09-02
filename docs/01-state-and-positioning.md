# 節點 C 與 P：先看現況，再決定方向

迴圈每一輪都從「產品今天長什麼樣」出發，而不是從上一輪的記憶出發；方向（定位）則是唯一一個人必須在場、或由兩個高階 agent 對抗才能改的慢節點。這兩個節點是整張圖的錨。

## C — Current state（`product/state.md`）

兩種深度：

| 深度 | 何時 | 誰 | 做什麼 | 產物 |
|---|---|---|---|---|
| 輕量 | 每輪 Step 0 | 本輪 agent | 讀 config／positioning／state；`git log -8`；查 ledger 的 `[IN_PROGRESS]`；跑一次 `BUILD_CMD` 當 baseline | baseline 截圖／輸出（給 validator 對照） |
| 深度 | 每次 run 開始、每 `AUDIT_EVERY` 輪、自主換定位之後 | `state-auditor`（獨立子代理） | 從零檢視 repo 與跑起來的產物：有什麼、哪裡壞、離定位的差距、技術債、量得到的數字 | 重寫 `product/state.md`，最後一行 `AUDIT: HEALTHY \| GAPS \| BROKEN` |

規則：

- `state.md` 重寫不追加。它是 L0 現況頁，任何人打開只看一頁就知道產品在哪。
- 數字量不到就寫 none，不估。
- `BROKEN` 由 driver 接住：下一輪的 prompt 帶 MAINTENANCE 旗標，該輪只修不加（Step 1b），但仍要有一份 Size S 的 PRP 和 CLAIM 讓 validator 有東西驗。
- ledger 裡懸空的 `[IN_PROGRESS]` 是上一輪當掉的 checkpoint：working tree 還有它就從 Step 5 續做，沒有就標 `[FAILED] — round crashed`。這是「可 resume」的實作。

為什麼要有 C：v1 的 loop 每輪從自己的 backlog 出發；iOS 健康 app 那條跑到後期 backlog 已經 140K、和 repo 的實況脫節，agent 相信自己的筆記多過相信 code。C 把真相來源固定在 repo 與跑起來的產物。

## P — Positioning（`product/positioning.md`）

一份檔、兩類欄位：

| 欄位 | 內容 | 誰能改 |
|---|---|---|
| 硬欄位 | 目標用戶、問題、替代方案、為何是我們、非目標、信任規則 | 只有人（`/position` 互動模式） |
| 軟欄位 | 北極星、漏斗、category 權重、下一段要推的階段 | 人；或 `strategist` + `positioning-critic` 兩個高階 agent 一致同意（標 `pending_human_review: true`） |

下游所有判斷都對著它：`/research` 只研究定位指名的階段、`value-critic` 用它的漏斗與非目標打分、`trajectory-monitor` 用它判漂移。改了它，等於換了整條迴圈的目標函數——所以它是慢節點。

### 互動模式：多輪提問收斂

`/position` 先讀 `state.md`、最近 5 份 brief、ledger 最近 20 條 `[REJECTED]`，然後一輪一個問題、每題 2–4 個從證據推出的選項（AskUserQuestion）：對象 → 問題與替代 → 北極星與漏斗 → category 權重 → 非目標與信任規則 → 摘要確認。現值明顯還對的題直接跳過。APPROVE 後寫檔、`version+1`、`approved_by: human`，並把漏斗／category 鏡射進 `loop.config.env` 給腳本用。最後一行 `POSITION: APPROVED`。

選項必須從證據來——「拒絕紀錄裡 retention 連拒 5 次，因為產品沒有任何外部再入觸發；要不要把 retention 先退休、改推 share？」是好選項；「A. 專注留存 B. 專注成長」不是。

### 自主模式：兩個夠聰明的 agent 對抗到一致

driver 在 value plateau 或 trajectory STOP 時，若 `AUTONOMOUS_POSITIONING=true`：

1. `strategist`（高階模型）讀 state、ledger 的拒絕模式、近 20 個 commit，診斷為什麼枯竭，提「一個」軟欄位 delta。
2. `positioning-critic`（同級、獨立 context）自己重讀證據，只找反證：證據撐不撐得住、有沒有偷改硬欄位、產品今天服務得了那個階段嗎、是不是同一招換標籤、有沒有說出什麼會證明它錯。
3. `POSITION: AGREED` 才寫入；`DISAGREE` 什麼都不改，兩份輸出留在 `.loop/position-NNN.log` 給人看，driver 停下等人。

每次 run 最多做 `MAX_AUTO_POSITIONING` 次。兩個 agent 都不夠聰明時的保險是「不動」：錯的定位會浪費 20 輪，等人只浪費一晚。

## 這兩個節點怎麼接進迴圈

```
run start ─▶ C(deep) ─▶ [rounds: C(light) → R → F → S → D → V → Y] ─every K─▶ C(deep)
                                          ▲                                    │
                                          │                          value STOP / TRAJ STOP
                                          │                                    ▼
                                          └──── AGREED ◀── P(autonomous) ── or ── park, wait for /position
```

下一頁：[02-research](02-research.md)
