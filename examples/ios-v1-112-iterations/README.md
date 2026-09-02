# 對照範例：iOS 資產追蹤 app，112 輪（framework v1）

這是 v2 之前的 loop：同一個 PRP 骨架（`/generate-prp` → `/execute-prp`）、每 3 輪一次維護模式、builder 自己標 COMPLETED、`git push origin main`。App 名稱已匿名為 `________`。放在這裡是為了讓人看見「沒有價值閘的 loop 長什麼樣」，不是範本。

## 有什麼

- `innovation_loop_v1_as_run.md` — 最早的 loop（標題寫 8 Steps，實列 research → ideation → PRP → execute → test → fix → deploy → restart）
- `innovation_loop_v2_as_run.md` — 同一條 loop 為這個 app 客製的版本：Morandi 設計系統、SnapshotTesting、`Iteration_Count % 3 == 0` 進維護模式、Rule of Pairs（每個 ViewModel 配一個測試檔）
- `iteration_log.md` — 逐輪紀錄（日期、模式、任務、摘要、改動檔）：111 輪完成、第 112 輪 PENDING；第 76 輪有重複條目，原樣保留
- `product_backlog.md` — 分階段的功能 backlog

## 看什麼

1. **產量很高，方向由 backlog 決定**：Feature Mode 從 backlog 取 `[TODO]`，backlog 空了才研究。沒有任何一步問「這個值不值得做」——正確性（`./scripts/test.sh` exit 0）是唯一的 gate。
2. **維護模式是唯一的多樣性機制**：每 3 輪強制補測試／refactor／修 bug。它擋住了品質崩壞，但擋不住功能方向的同質化。
3. **自我核可**：同一個 agent 在 Step 6 跑測試、判定通過，Step 9 自己標 `[DONE]`。沒有獨立 validator。
4. **直接 push main**：沒有分支隔離。

這三個缺口在另一個 iOS 健康 app 的 35 輪過夜實跑上變成可量化的失敗——31 輪是同一種指標追加。v2 的四個修補（價值閘、北極星、category 多樣性、plateau）由此而來，見 `docs/06-lessons.md`。

## 值得保留的

- `Iteration_Count` 寫進 log 的做法（狀態外部化）
- Rule of Pairs 與 Snapshot First（v3 的 PRP Validation Loop Level 2 沿用）
- 每 3 輪維護模式（v3 的 Step 1b 是它的條件版：只在研究枯竭或 state BROKEN 時進）
