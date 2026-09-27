# 09 Jev 預篩（選用）：在 LLM gate 前面快速拒絕

> 狀態：N=0。這一層接好了、測過了（stub + mock），還沒在真實 run 上證明值得。預設 `JEV_MODE="off"`，關著時整套行為跟沒有這一頁完全一樣。

## 為什麼

這張圖的判斷都落在 gate 上，而 gate 的輸出本來就是一行 typed 結果（`VALUE:` / `VERDICT:` / `TRAJ:`）。其中有一部分判斷不需要讀 code，也不需要寫字，只要回答「是／否」或「選哪個」：

- 這個想法是不是靠捏造的數字？（教訓 5）
- 它是不是 ledger 裡已經有的同一招？
- 這次出貨是不是跟前幾次同一招、只換了 category？（教訓 4）
- 按鈕做的事有沒有兌現它的 label？（教訓 9）

[Jev](https://github.com/shitianfang/jev-use)（TypeSafe 的判斷模型）只做這種事：回傳帶機率的 yes/no、pick、score，p50 約 230 ms，每千次約 $0.02；沒把握時回 `escalate`，連不上也回 `escalate`，不會丟錯。web-v2 那 20 輪裡價值閘拒了 17 個想法，每一次都花了一整個 sonnet 子代理。

## 一條不可妥協的規則：Jev 只能拒絕，不能放行

| 位置 | Jev 問什麼 | prefilter 模式下 Jev 能做的事 | Jev 不能做的事 |
|---|---|---|---|
| F 前（spec Step 2b） | `prefilter`：捏造訊號？ledger 重複？撞非目標／信任規則？ | `JEV: REJECT` → 當作價值閘 REJECT，記進 ledger、算進 `rejects=N`、回 R | 放行。`PASS` 之後 value-critic 照跑，而且看不到 Jev 的結果（保持獨立，教訓 3） |
| V 內（validator 3b） | `label-promise`：觀察到的行為有沒有兌現 label？ | `JEV: MISMATCH` → 第 4 軸 Fail、列為 blocker | 讓第 4 軸 Pass。第 4 軸仍然要 validator 自己的證據 |
| R 選題（`/research`） | `pick`：2–4 個候選裡哪個最可能推動「下一段」？ | `JEV: PICK <key>` → 先寫那一個 | 讓它跳過 value-critic |
| driver 每次出貨後 | `same-tactic`：最新 commit 跟前 N 個是不是同一招？ | `JEV: SAME` → 這一輪**提前**跑 trajectory-monitor | 自己 STOP 或 REDIRECT。決定仍是 trajectory-monitor 的 `TRAJ:` |

不讓 Jev 碰的地方：driver 的停機邏輯（要能被 `test-driver.sh` 固定地測，教訓 10）、最終的 ACCEPT / PASS、定位節點 P。

不對稱的理由：錯誤放行會出貨一個壞東西，這正是 v2 的三個漏網（「今日已有 N 人…」兩條、「今日熱門」一條）。錯誤拒絕只是少做一個想法，而且 ledger 裡會留下 `Jev fast-reject: <原因>`，人和 state-auditor 都看得到。所以 Jev 只放在「拒絕」這一側。

## 三個模式

```
off        → 不呼叫（預設）
shadow     → 呼叫、寫 .loop/jev.jsonl，印出 `JEV: SHADOW — would=…`；任何人都不能依這行分流
prefilter  → 快速拒絕生效（REJECT / SAME / MISMATCH / PICK）；其他結果一律「照常走 LLM gate」
```

`JEV_REJECT_P`（預設 0.85）：只有 P(yes) ≥ 這個值、而且 Jev 自己沒有 escalate，才算快速拒絕。`MISMATCH` 對稱地要求 P(delivers) ≤ 1 − 這個值。

## 上線順序（照做，別跳）

1. **安裝**：`cd scripts/jev && npm ci`，然後把 `TYPESAFE_API_KEY`（或 `OPENROUTER_API_KEY` / `AI_GATEWAY_API_KEY`）放進跑 loop 的環境變數，不要寫進 `loop.config.env`。沒有 key 時每次呼叫都回 `JEV: UNAVAILABLE`，loop 照常跑。
2. **離線評估**：`JEV_MODE=prefilter node scripts/jev/eval-backlog.mjs [你過去 run 的 backlog]`。它按時間順序重播每個想法，每次只給 Jev「當時」的 ledger，然後對照實際結果：
   - value-critic 拒掉的 → 快速拒絕算對（省下一次 value-critic）
   - 出貨但帶捏造訊號的 → 快速拒絕算抓到漏網
   - 其他出貨的 → 快速拒絕算**誤殺**
   最後一行：`JEV_EVAL: SAFE`（0 誤殺）、`UNSAFE`、`INCOMPLETE`（沒 key），或 `MOCK`（mock backend 只驗管線，答案是 hash 出來的，不算數）。預設資料是 `examples/web-v2-20-rounds/as-run/`：45 條 COMPLETED（其中 3 條是捏造訊號）、18 條 REJECTED。
3. **shadow 跑一晚**：`JEV_MODE=shadow`。隔天看 `.loop/jev.jsonl` 裡的 `would=REJECT`，逐一對照同一個想法 value-critic 怎麼判。
4. **prefilter**：2 和 3 都沒有誤殺才切。每跑一晚都要看 ledger 裡的 `Jev fast-reject` 行。

mock backend 上 `eval-backlog.mjs` 會印出 20 條誤殺（最後一行是 `MOCK`，不會認證為 SAFE）。這是預期的：它證明這個評估真的擋得住一個亂答的判斷器。

## 檔案

| 檔案 | 作用 |
|---|---|
| `scripts/jev/jev.mjs` | 四個任務（`prefilter` / `same-tactic` / `label-promise` / `pick`），一律 exit 0，只印一行 `JEV:`；每次呼叫寫進 `.loop/jev.jsonl` |
| `scripts/jev/eval-backlog.mjs` | 離線評估，最後一行 `JEV_EVAL:` |
| `scripts/jev/test/jev.test.mjs` | `npm test`：用 `JEV_BACKEND=mock` + `JEV_MOCK_SCRIPT` 固定每題答案，驗證每一條分流規則 |
| `scripts/test-driver.sh` 劇本 8–10 | driver 端：prefilter 的 SAME 會提前跑 T；shadow 就算收到 SAME 也不動；off 完全不呼叫；UNAVAILABLE 不動 |
| `loop.config.env` | `JEV_MODE`、`JEV_REJECT_P` |

## 要驗證的假設（跑完再回來改這一段）

- 省下的量：prefilter 下，價值閘前的快速拒絕佔所有拒絕的比例，以及每輪省下的時間。
- 安全：真實 run 上誤殺是否為 0。只要出現一次誤殺，就退回 shadow 或調高 `JEV_REJECT_P`。
- 早期偵測：`SAME` 提前觸發的 trajectory check，回 REDIRECT/STOP 的比例（接近 0 = 雜訊，就關掉這條）。

下一頁：回到 [00-pipeline](00-pipeline.md)
