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

## 已修的坑：想法跟自己比對

第一次真實使用時，`cf-billing` 被 Jev 判成「重複」（p=0.94）。原因：`/research`（Step 1）和 Step 2 都會先把這一輪的想法寫成 `[IN_PROGRESS]` 進 ledger，Step 2b 的預篩再拿整份 ledger 問「跟 ledger 裡哪一條重複？」，結果找到的正是它自己。離線評估和 shadow 對照都沒抓到：評估重播時只給「之前的」ledger，少了這一行，跟真實一輪的順序不一樣。

修法（`scripts/jev/ledger.mjs`）：預篩一律不把 `[IN_PROGRESS]` 行給 Jev。Step 0 已經把崩潰留下的 `[IN_PROGRESS]` 處理掉（續做或標 FAILED），所以到 Step 2b 時剩下的 `[IN_PROGRESS]` 只會是這一輪自己的想法。其他狀態（REJECTED / COMPLETED / FAILED / LOW_IMPACT）照樣保留，因為那些才是真正的重複。評估也改成把該想法的 `[IN_PROGRESS]` 行放進重播用的 ledger，跟真實一輪一致。`npm test` 有回歸測試：mock 的答案是 state 的 hash，所以「加不加自己那一行，答案完全相同」就代表那一行沒送到 Jev。

第二次（`cf-cutover-runbook`，p=0.90）：專案自己在 ledger 加了 `[QUEUED]` 狀態，而且是「先問 Jev、再改成 IN_PROGRESS」的順序，第一版修法只排除 `[IN_PROGRESS]`，沒擋到。現在的規則改用「是不是這個點子自己」判斷：
- 所有 `[IN_PROGRESS]` 行一律排除。
- 狀態不是 COMPLETED / REJECTED / FAILED / LOW_IMPACT、而且提到這個點子標題的行，也排除，不管狀態名稱叫什麼（QUEUED、TODO、SPLIT…）。
- 已結案的同名行一律保留：以前拒絕過又被提出來，本來就是真的重複。

標題取 `--idea` 裡第一個 ` — ` 之前的文字，或用 `--title` 指定。標題比對以整個 token 為單位，所以 `cf-auth` 不會誤排除 `cf-auth-hardening`。

教訓：離線評估要重現的是**真實一輪當下的輸入**，不只是「當時的歷史資料」；而且各專案會自己加狀態，排除規則不能寫死某個狀態名稱。

## 常見誤用：把 PASS 當成放行

`JEV: PASS` 的意思是「沒有把握拒絕」，**不是**「可以做」。正確的分流：

| Jev 結果 | 下一步 |
|---|---|
| `REJECT` | 當作價值閘拒絕 |
| `PASS` / `ESCALATE` / `UNAVAILABLE` | **一律**交給 value-critic |

如果 PASS 就直接照辦，等於讓一個只會回答是非題、而且看不到 code 的模型替你放行：它漏看的東西（例如 v2 那三條捏造數字）會直接出貨，正好違反這一頁唯一的原則。

人已經拍板的 slice（遷移、既定 backlog）不必跑 Jev：它改變不了決定，只會增加誤殺的機會。Jev 要擋的是 loop 自己想出來的點子。

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
| `scripts/jev/ledger.mjs` | 預篩看得到的 ledger：去掉這個點子自己的條目（`[IN_PROGRESS]`，以及同名、還沒結案的任何狀態） |
| `scripts/jev/eval-backlog.mjs` | 離線評估，最後一行 `JEV_EVAL:` |
| `scripts/jev/test/jev.test.mjs` | `npm test`：用 `JEV_BACKEND=mock` + `JEV_MOCK_SCRIPT` 固定每題答案，驗證每一條分流規則 |
| `scripts/test-driver.sh` 劇本 8–10 | driver 端：prefilter 的 SAME 會提前跑 T；shadow 就算收到 SAME 也不動；off 完全不呼叫；UNAVAILABLE 不動 |
| `loop.config.env` | `JEV_MODE`、`JEV_REJECT_P` |

## 要驗證的假設（跑完再回來改這一段）

- 省下的量：prefilter 下，價值閘前的快速拒絕佔所有拒絕的比例，以及每輪省下的時間。
- 安全：真實 run 上誤殺是否為 0。只要出現一次誤殺，就退回 shadow 或調高 `JEV_REJECT_P`。
- 早期偵測：`SAME` 提前觸發的 trajectory check，回 REDIRECT/STOP 的比例（接近 0 = 雜訊，就關掉這條）。

下一頁：回到 [00-pipeline](00-pipeline.md)
