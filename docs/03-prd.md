# 節點 S：每輪都有 PRD

PRD 在這個 repo 叫 PRP（Product Requirement Prompt）——寫給 agent 一次做對的規格，附可執行的驗證。每輪必有一份，size 只決定深度。

## 為什麼不能跳過

驗證節點 V 驗的是「產物兌現了 PRD 的承諾」。沒有 PRD，validator 只能退化成「跑起來了」——那正是 v2 放行「按鈕 label 說抽籤、實際只捲動」的原因。PRD 裡那一句可觀察的 `Validator CLAIM` 是 V 節點的輸入；S 節點存在的第一理由就是產出那一句。

## 深度隨 size

| Size | 形狀 | PRP 內容 |
|---|---|---|
| S | 單一修改（一個屬性、一行文案、一顆 CTA） | 一頁：Source、Goal/Why/What、Success Criteria、Validator CLAIM、Validation Loop（Level 1 + 4） |
| M | 小功能（一個 view + 它的 model） | 上述 + Implementation Blueprint 任務清單 + gotchas |
| L | 完整模組（model + service + view + tests） | 全模板：desired tree、逐任務 pseudocode、integration points、四個 level |

## `/generate-prp <brief>`

輸入是 brief（它已經帶候選 slice、假設、value-critic 分數）。流程：

1. Codebase analysis — 相似功能與 pattern、要引用的檔、要沿用的慣例、驗證要 mirror 的測試 pattern
2. External research — 只補 brief 沒有的；文件給到具體 URL 與段落
3. 寫 PRP（`PRPs/templates/prp_base.md`）：Source（size、positioning 版本與階段、brief 路徑、CLAIM）、Goal/Why/What、All Needed Context（URL、真實 code 片段、gotchas）、Implementation Blueprint（pseudocode、有序任務、錯誤處理）、Validation Loop（Level 1 lint → 2 unit → 3 integration → 4 產品閘 `BUILD_CMD` + 獨立 validator）

存 `PRPs/<YYYY-MM-DD>-<feature>.md`。自評 1–10 的一次做對信心：

- `PRP_SCORE ≥ 7` → 進 D
- `< 7` → 回 R 補 context 一次；仍 `< 7` → 本輪 `REJECTED`。低分 PRP 不該變成弱實作。

## 一句 CLAIM 的寫法

可觀察、單一、可被否證。

- 好：「命書 modal 第五章末尾出現『直達第六章深批 →』按鈕，點擊後捲動到 `.paywall-sec` 且送出 `pay(entry=ch5_bridge)` 事件」
- 壞：「提升付費轉換」「使用者體驗更好」

validator 拿 CLAIM 當假設去否證；CLAIM 本身不可觀察，它會回 `BLOCKERS: PRD: …`，迴圈路由回 S 而不是回 D。

## PRP 的四個核心原則（沿用自原始模板）

1. Context is King — 把所有需要的文件、範例、坑都放進去
2. Validation Loops — 給 agent 可以自己跑、自己修的可執行檢查
3. Information Dense — 用這個 codebase 的關鍵字與 pattern
4. Progressive Success — 先簡單、驗證、再加

`PRPs/EXAMPLE_multi_agent_prp.md` 是一份 Size L 的完整範例（Pydantic AI 多 agent 系統），看格式用。

下一頁：[04-dev-and-validate](04-dev-and-validate.md)
