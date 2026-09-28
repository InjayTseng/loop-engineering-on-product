# 外圈：driver、停機、節奏、成本

`scripts/run-loop.sh` 是整張圖唯一的 deterministic 控制流。它不推理，只 parse 每個節點吐出的一行結果，然後決定下一輪的旗標、要不要停、停了交給誰。

## 一次 run 的形狀

```
gate 0   在 LOOP_BRANCH 上？不是就 REFUSE
C deep   state-auditor 重寫 product/state.md（BROKEN → 下輪 MAINTENANCE）
for round in 1..N:
  fresh `claude -p` 跑一輪 innovation_loop.md（prompt 帶：最近 4 個 category、RESET、MAINTENANCE）
  parse LOOP_RESULT → SHIPPED / REJECTED / NOOP，取 rejects=N
  更新：category 序列、連續 REJECTED、連續 NOOP、滾動視窗
  plateau？（見下）
  每 AUDIT_EVERY 輪 → C deep；每 TRAJ_EVERY 輪 → T（REDIRECT → 下輪 RESET；STOP → 停）
  value STOP → P：AUTONOMOUS_POSITIONING 且未超額 → strategist+critic；AGREED → 重置計數、C deep、繼續
                                                     否則 → park（.loop/state = WAITING_FOR_P），退出等人
```

每輪 fresh context：一輪壞掉不污染下一輪，context 不隨輪膨脹，crash 了從 ledger 的 `[IN_PROGRESS]` 續。

## 停機條件（全部是數字，agent 無權決定）

| 條件 | 訊號 | 意義 | 去哪 |
|---|---|---|---|
| plateau（拒絕率） | 滾動 `WINDOW` 輪內 `PLATEAU_REJ×rejects ≥ PLATEAU_SHIP×ships`（預設 2/3 ≈ 0.6） | 價值閘每出貨一個要拒掉一個半以上——這個方向枯竭 | P |
| 硬枯竭 | RESET 輪也整輪 REJECTED（`MAX_CONSEC_REJECTED`） | 換角度也找不到 | P |
| 研究枯竭 | 連續 `MAX_CONSEC_MAINT` 輪只出 `category=maintenance` | 沒有新東西可做 | P |
| 軌跡 STOP | trajectory-monitor 回 STOP | 在優化北極星以外的東西 | P |
| 結構性失敗 | 連續 `MAX_NOOP` 輪 build/validate 失敗 | adapter 或產品壞了，不是價值問題 | 退出，修工具 |
| 上限 | `ROUNDS` 或預算 | 一晚的量 | 退出 |

**v2 → v2.1 的修正**：v2 的 plateau 只看「連續 2 整輪 REJECTED」。web-v2 20 輪實跑，價值閘在輪內拒了 17 個想法（每輪 0–2 個，retry 後總能找到一個過關的），整輪 REJECTED 一次都沒出現——plateau 永遠不觸發。v2.1 改讀 `rejects=N` 的滾動拒絕率。這就是為什麼 `LOOP_RESULT` 每行必帶 `rejects=`，0 也要寫。

**driver 要用 stub 測**。`scripts/run-loop.sh` 只吃 `CLAUDE_BIN` 吐出的結果行，所以可以用一個每次呼叫印一行預設結果的假 `claude` 跑完整劇本（plateau 觸發、RESET 後再拒、自主定位 AGREED 後續跑、BROKEN 強制維護、main 分支拒跑）。v2.1 的 plateau 就是這樣才被發現從未能觸發（教訓 10）。

**停機 = 交回 P，不是結束**。拒絕率高代表「這個定位下的低垂果實摘完了」，不代表沒事做。自主模式讓兩個高階 agent 換一個軟欄位角度再跑；不成就等人。

## 節奏

| 迴圈 | 尺度 | 實測 |
|---|---|---|
| D ⇄ B ⇄ V | 分鐘 | — |
| 一輪 | 10–20 分 | web-v2 測試場 20 輪 4h10m，平均 12.5 分／輪（sonnet） |
| T | 每 5 輪 | 4 次全 CONTINUE |
| P | STOP 時 | — |
| 人 | 小時–週 | 實跑隔天人工 review 抓到 label-promise bug |

## 模型與成本路由

| 角色 | 預設 | 為什麼 |
|---|---|---|
| 每輪 orchestrator + builder | sonnet | 大宗 codegen，便宜 |
| value-critic / validator / trajectory / state-auditor | sonnet（agent frontmatter 釘） | 判斷 + 看截圖，sonnet 夠 |
| strategist / positioning-critic | opus（agent frontmatter 釘） | 一次決定影響 20 輪 |

過夜 loop 加上子代理一晚可能 $50–200。省錢的槓桿依序：effort（medium 為主）、把 builder 留在 sonnet、`ROUNDS` 上限。要更強的 ideation 才把每輪 orchestrator 升 opus（約 2×）。

## 跑

```bash
git checkout loop                       # 永不在 main 跑
# 填 loop.config.env：北極星、漏斗、category、DEPLOY_BRANCH、BUILD_CMD
scripts/install-hooks.sh                # pre-push hook：git 層拒推 live 分支
/audit                                  # 先看現況（可選，driver 也會做）
/position                               # 人在的話先收斂定位
/loop-once                              # 互動跑一輪，看兩個 gate 的行為
scripts/run-loop.sh 20                  # 過夜
tail -f .loop/loop.log
kill $(cat .loop/run.pid)               # 停
```

`--dangerously-skip-permissions` 是 headless 的必要條件（headless 模式不讀 `settings.local.json` 的白名單）；它能被接受的唯一原因是分支隔離——每輪重查分支、`pre-push` hook、只 push loop——loop 分支上壞掉的東西不會到 live。

## gate 紀錄：`.loop/gates.jsonl`

driver 只 parse 每個節點的一行（`VALUE:`、`VERDICT:`、`TRAJ:`…）。以前 gate 的分數、理由、它自己查了什麼，跑完就丟了，連 `examples/` 兩次真實 run 都只剩 6 行判決。

有 jq 的機器上，每次 `claude -p` 都用 `--output-format stream-json` 跑，完整 transcript 存成 `.loop/round-NNN.jsonl`（driver 照舊從最後的 `result` 還原 `round-NNN.log` 來 parse）。`scripts/gate-log.sh` 把裡面**每一次子 agent 交回的判決**追加一筆到 `.loop/gates.jsonl`：

| 欄位 | 內容 |
|---|---|
| `agent` · `kind` · `round` · `run` | 誰判的、在哪個節點（round / audit / traj / position）、第幾輪、哪次 run |
| `prompt` | orchestrator 交給 gate 的內容（被判的點子、CLAIM） |
| `report` · `verdict` | gate 的完整回覆，以及跟 driver 同一規則 parse 出的判決；格式壞掉時是 `null`，不是整筆丟掉 |
| `evidence` | gate 自己的每個 tool call 與輸出（每筆截到 `GATE_EVIDENCE_CHARS`，預設 4000 字） |
| `outcome` · `commit` | 這一輪最後怎麼了；HEAD 有前進才有 commit |

這是**跨 run 累積**的檔案：`round-NNN.*` 下一次 run 會被覆蓋，`gates.jsonl` 不會，所以每筆紀錄都自帶證據，不靠外部檔案。它是之後校準 gate 的資料集，例如把某個 gate 的最後裁決換成 typed-decision 模型之前，先拿它的門檻跟這裡 LLM gate 的實際判決比對。它在 `.loop/` 底下，所以不會 commit：裡面有尚未出貨的產品點子，要公開前自己篩。

沒有 jq 時這整段自動關閉，driver 退回純文字模式照跑。

## 安全

- driver 每輪開頭都檢查分支：不在 `LOOP_BRANCH` 就 REFUSE；`scripts/install-hooks.sh` 裝 `pre-push` hook 在 git 層拒推 live 分支；SHIPPED 只在 HEAD 真的前進時才算數
- 每輪有 `ROUND_TIMEOUT`（預設 1800s），卡住的一輪被殺掉、算 NOOP；`kill $(cat .loop/run.pid)` 連正在跑的 `claude -p` 一起停
- spec 只 `git add <具體檔>`；失敗用 `git checkout -- <files>` 或 `git stash push -m`，不用 `reset --hard`
- 不自動 merge；不碰任何憑證檔；trust 產品的捏造訊號在 F 就擋

下一頁：[06-lessons](06-lessons.md)
