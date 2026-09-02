# 節點 R 與 F：研究只為了餵價值閘

研究的產物不是「有趣的發現」，是「一個可以被 value-critic 打分的候選 slice」。沒有候選的 brief 是失敗的 brief——記一行 LOW_IMPACT 然後停，不要硬擠。

## R — `/research <階段或角度>`

先讀三樣：`product/positioning.md`（研究哪一段）、`product/state.md`（那一段今天服務得了嗎——壞掉的階段不研究）、`_idea_ledger.md`（看過的一切都不重提）。

四個角度輪替（看 `research/briefs/` 最近用過哪個）：

| 角度 | 問題 | 來源 |
|---|---|---|
| A 競品 | 最接近的 2–3 個產品在這一段做了什麼我們沒做的 | 產品頁、changelog、App Store 截圖 |
| B 用戶痛 | 用戶說這一段少了什麼、哪裡困惑 | 評論、論壇、客服串 |
| C 趨勢 | 這個品類過去 12 個月變了什麼（平台功能、常態） | 平台 release notes、產業文 |
| D 技術差異化 | 我們在這一段能做、競品結構上做不到的事 | 自家 code 與資料 |

上限 2 次 WebSearch。第二次還沒新東西就停：`- [LOW_IMPACT] <角度> — <原因>` 進 ledger，最後一行 `RESEARCH: NONE`。

brief 用 `research/TEMPLATE.md`，存 `research/briefs/YYYY-MM-DD-<slug>.md`，必填：問題與角度、3–6 條有 URL 或檔案路徑的發現、「已涵蓋」（哪些 ledger／commit 相鄰、這次哪裡不同）、候選 slice（標題／category／階段／假設「如果做 X，階段 Y 會更好因為 Z」／size／一個局部改動／誠實資料檢查）、給 validator 的一句 CLAIM。最後一行 `RESEARCH: CANDIDATE`。

RESET 輪（driver 帶旗標）：刻意挑跟最近幾輪不同的階段與 category，從零想。

## F — `value-critic`（獨立子代理）

它只回答一件事：這個想法這一輪值不值得建。預設 REJECT，門檻是「會推動北極星」不是「是個好主意」。

三軸 1–5：

- FUNNEL IMPACT — 有沒有推動定位指名的某一段；是定位的「下一段要推」加分；非目標直接 REJECT
- NOVELTY — 機制上跟已出貨的不同嗎？同一招換標籤不算
- EFFORT-FIT — 能不能一個小局部改動出貨

信任閘（硬，蓋過 impact）：`TRUST_PRODUCT=true` 時，靠捏造訊號的想法一律 REJECT——hash 出來的「今日已有 N 人」、假熱門、假見證、假稀缺。真實資料（server 或 localStorage 來的）可以。這條是 v2 實跑後補的：loop 出貨了兩個 hash 種子的社交實證，value gate 當時放行。

`ACCEPT` 條件在 `loop.config.env` 的 `ACCEPT_IF`（預設 impact≥4 AND novelty≥3 AND effort_fit≥3）。REJECT 一定附 REDIRECT：一個更銳、誠實、會動漏斗的角度，本輪 agent 拿它回 R 重試（≤2 次）。

輸出協定：

```
VALUE: ACCEPT | REJECT
CATEGORY / FUNNEL_STEP / SCORES: impact=? novelty=? effort_fit=?
WHY / REDIRECT
```

## Ledger 與 backlog：兩份檔、兩個用途

| 檔 | 內容 | 讀法 |
|---|---|---|
| `_idea_ledger.md` | 每個想法一行，五種狀態：COMPLETED / IN_PROGRESS / FAILED / REJECTED / LOW_IMPACT | 去重用；每輪整份讀（小） |
| `_product_backlog.md` | 通過價值閘的想法的完整規格 + validator 判定 | 只讀 `[IN_PROGRESS]` 那段；永遠不整份讀 |

去重集合是「看過的一切」。v2 之前被拒的想法沒留痕，每輪都復活重評；加了 REJECTED／LOW_IMPACT 狀態後，iOS 健康 app 的查重從整讀 140K backlog 變成讀 12K ledger。

真實的拒絕長什麼樣（web-v2 實跑，原文）：

> `[REJECTED] retention | core_value→(次日)activation_done | 明日天時預告：value-critic 判定無實際觸達機制（用戶離開頁面後資訊消失），impact=2，拒絕。REDIRECT→virality/acquisition 方向。`

下一頁：[03-prd](03-prd.md)
