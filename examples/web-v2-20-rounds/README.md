# 實跑範例：web-v2 測試場，20 輪過夜（framework v2，2026-06-15）

> 去識別化範圍：網域（→ example.com）、產品名、付費價格、GA4 事件名（→ activation_done / core_start / core_result / core_value / depth_open / share / pay）。輪次、category、rejects、commit sha 與功能描述原文未改，所以數字仍可從 `loop.log` 重算。

一個真實的 run，原始 log 與當時跑的檔案原封不動放在這裡。產品是一個單檔靜態算命網頁（此處去識別化為 example.com；有 GA4 漏斗與一個付費假門）。這是框架第二個場景（第一個是 iOS），也是 v2 → v2.1 修正的來源。

## 數字

- 20 輪全部 SHIPPED，01:15 → 05:25，4h10m，平均 12.5 分／輪，模型 sonnet-4-6
- 價值閘在輪內拒了 17 個想法（Σ loop.log 的 `rejects=`；`as-run/_backlog.md` 有 18 行 `[REJECTED]`，因為一行可含多個想法；`as-run/run-loop.sh` 註解裡的「8」是 run 中途寫的），但沒有任何一輪整輪 REJECTED → v2 的 plateau 偵測一次都沒觸發。即使套用 v2.1 的拒絕率規則（rejects/ships ≥ 1.5），這筆資料任何 5 輪窗最高也只有 1.0——plateau 規則至今沒有真實正例
- category 分佈：monetization ×5, engagement ×4, virality ×3, trust-quality ×3, activation ×2, retention ×2, acquisition ×1
- trajectory monitor 每 5 輪一次，4 次全部 CONTINUE
- driver 的分支保護生效：全部 push `loop`，main（GitHub Pages → live）未被碰

## 逐輪

| 輪 | category | 漏斗邊 | rejects | commit |
|---|---|---|---|---|
| 1 | monetization | depth_open→pay | 1 | `b1ebf6c` loop(monetization): paywall 六章進度圓點 Zeigarnik 近完成效應——推動 depth_open→pay |
| 2 | monetization | share→pay | 1 | `f4f888a` loop(monetization): 分享後深批引橋——推動 share→pay |
| 3 | engagement | core_value→depth_open | 1 | `2391a11` loop(engagement): fReportBridge 跨會話比對橋——推動 core_value→depth_open |
| 4 | virality | core_value→share→(受眾)activation_done | 1 | `de4ab66` loop(virality): 分享文案內嵌籤詩首句——推動 core_value→share→activation_done |
| 5 | activation | activation_done→core_start | 1 | `b23ed18` loop(activation): 流年十神問事引橋——推動 activation_done→core_start |
| 6 | retention | return_visit→activation_done | 0 | `48c40cb` loop(retention): restoreNote 問事記憶增強——推動 return_visit→activation_done |
| 7 | monetization | depth_open→pay | 1 | `abeeb07` chore: mark monetization CTA paywall [COMPLETED] in backlog |
| 8 | engagement | core_value→depth_open | 2 | `c6285d0` loop(engagement): 籤詩金句應問高亮——推動 core_value→depth_open |
| 9 | trust-quality | core_result→core_value | 0 | `c5ae9e2` chore: mark trust-quality jiao personalization [COMPLETED] in backlog |
| 10 | acquisition | landing→activation_done | 1 | `ecf39fb` loop(acquisition): hero 今日示範籤詩前瞻——推動 landing→activation_done |
| 11 | virality | core_value→share→(受眾)activation_done | 0 | `8adc858` loop(virality): 比籤運雙人對比——推動 core_value→share→(受眾)activation_done |
| 12 | monetization | depth_open→pay | 0 | `cc5945b` chore: mark monetization paywall blur preview [COMPLETED] in backlog |
| 13 | engagement | core_start→core_result | 2 | `5ff5562` loop(engagement): 首次壞筊「命館三擲制」說明——推動 core_start→core_result |
| 14 | activation | landing→activation_done | 0 | `1e0bee4` loop(activation): 出生地地氣即時感知——推動 landing→activation_done |
| 15 | trust-quality | landing→activation_done | 1 | `cdbcc59` loop(trust-quality): 出生日首次 focus 隱私保證提示——推動 landing→activation_done |
| 16 | retention | return_visit→core_start | 2 | `213e566` chore: mark retention 斷點續問 [COMPLETED] in backlog |
| 17 | virality | activation_done→share→(受眾)activation_done | 0 | `267288a` chore: mark virality 命格身份分享 [COMPLETED] in backlog |
| 18 | monetization | depth_open→pay | 0 | `113bc40` loop(monetization): 第五章尾部深批引橋 CTA——推動 depth_open→pay |
| 19 | engagement | core_value→share | 1 | `10d6c62` loop(engagement): fortune card 頂部「[name]・所求之籤」個人銘題——推動 core_value→share |
| 20 | trust-quality | core_value→depth_open | 2 | `e1004bb` chore: mark trust-quality 跨場次同類籤走勢段落 [COMPLETED] in backlog |

（部分輪的最後一個 commit 是 `chore: mark … [COMPLETED]`，功能 commit 在它前一個。）

## 被拒的想法長什麼樣（原文，`as-run/_backlog.md`）

- `[REJECTED] retention-calendar | core_value→activation_done(next day) | 「明日提醒」Google Calendar chip：value-critic 判定轉換鏈太長（click→confirm→return→activation_done），用戶激勵不足，拒絕。`
- `[REJECTED] acquisition | landing→activation_done | 英雄區時辰氛圍鈎：value-critic 判定時辰概念已在兩個已出貨 commit 中使用，第三次出現屬重複槓桿，且不能移除表單填寫摩擦，impact=2 novelty=2，拒絕。REDIRECT→社交實證計數。`
- `[REJECTED] retention | core_value→activation_done(次日) | 子時倒計時/A2HS/靈籤存檔toast三連否：(1)倒計時 impact=2 無外部觸達機制；(2)A2HS Android 需 service worker 否則靜默失效；(3)存檔 toast 屬 awareness polish 非新 pull 機制。全部 REJECTED，未寫 code。`

拒絕理由都指名了漏斗階段、分數與 REDIRECT——這是價值閘「有在做事」的證據，也是 driver 應該讀卻沒讀的訊號（教訓 2）。

## 這個 run 之後修了什麼（v2 → v2.1 → v3）

1. plateau 永遠不觸發 → driver 改讀 `rejects=N` 的滾動拒絕率（v2.1，`scripts/run-loop.sh`）
2. 第二條 REDIRECT 把 loop 推向「社交實證計數」，它接著出貨了 hash 種子的「今日已有 N 人起盤」與「今日已有 N 人解鎖深批」——信任產品上的捏造訊號，價值閘當時放行 → 加信任閘（v2.1，`value-critic.md` 2.5）。事實補充：這兩個 commit 當時有 merge 到 main，之後被人工移除；現行 live 的 index.html 已無任何「今日已有」字串（2026-08-25 核對）。
3. 隔天人工 review：第 5 輪的「流年十神問事引橋」CTA label 說抽籤、handler 只預選並捲動；build 綠、validator PASS → 人補了兩個 fix commit；validator 加 label-promise 軸，每輪必有 PRD 的 CLAIM（v3，教訓 9）

第 3 點就是 Andrew Ng 說的 developer feedback loop：agent 自測過了，人回頭看成品才發現需求沒被兌現。

## 檔案

- `loop.log` — driver 的原始輸出（路徑已相對化）
- `as-run/run-loop.sh` — 當時的 driver（v2.1，含拒絕率修正——但那段修正在 macOS bash 3.2 下永遠不會觸發：`${arr[@]: -$WINDOW}` 在陣列短於 WINDOW 時回傳空陣列。原封保留作為教訓 10 的證據；修正版在本 repo 的 `scripts/run-loop.sh`）
- `as-run/improvement_loop.md` — 當時的單輪規格（v2：Size S/M 跳過 PRP）
- `as-run/value-critic.md`、`as-run/web-validator.md` — 當時的兩個獨立子代理（已含信任閘）
- `as-run/web-check.mjs` — web adapter
- `as-run/_backlog.md` — 完整 ledger：COMPLETED 與 REJECTED 各自的原文
- 未附：`LOOP.md`（run 指南）與 `Scripts/loop-shot.sh`（`web-check.mjs` 的 thin wrapper），`improvement_loop.md` 內有引用

跟本 repo 通用版的差別：通用版把產品資訊搬進 `loop.config.env` / `product/positioning.md`，加了 C／P 節點與每輪 PRD；gate、角色、結果行協定相同。
