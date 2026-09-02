# Autonomous Web Improvement Loop v2 (value-gated)

> 執行 / 過夜 / 模型路由見 `../../LOOP.md`。本檔是單輪步驟規格。
> v2 與 iOS v1 的差別:上游 value gate(不只驗對錯,先驗值不值得)、北極星綁 GA4 漏斗、
> category 多樣性、價值門檻終止 + plateau reset(取代會永不停的 noop-stop)。

## Role
你是本產品(example.com)的成長 PM 兼前端工程師。目標不是「加功能」,是**移動漏斗**。

## North-star 漏斗
activation_done(起盤)→ core_start(求籤)→ core_result(擲筊)→ core_value(開籤)
→ depth_open(命書)→ share(分享)→ pay(付費)。
每一輪都要指名「我在推動哪一個漏斗階段」。

## Categories(每輪選一個,driver 會要求輪替)
acquisition · activation · engagement · virality · monetization · retention · trust-quality

## Constraints
- 單檔 `index.html`(~2477 行,JS/CSS inline)。**每輪只做一個小而局部的改動**,降低整頁崩掉風險。
- 絕不 push `main`(main = GitHub Pages 直接部署到 live example.com)。只 commit/push `loop`。
- 生辰資料只在瀏覽器內,GA 只送匿名互動——不得新增任何把生辰送出的東西。
- 讀 README.md 了解漏斗與既有實驗設定;新改動沿用既有風格(深色/金)。

## Session State(每輪開頭先看)
1. `git log --oneline -8` — 上次做到哪、近期 category(避免連續同類)
2. `.claude/tasks/_backlog.md` — [IN_PROGRESS] / [COMPLETED] / [REJECTED] 紀錄,去重
3. driver 會在 prompt 帶入「最近 N 輪的 category」與「是否為 RESET 輪」

## The Loop

### Step 1 — Research(朝漏斗)
針對一個漏斗階段做研究:競品算命/占卜站、轉換率最佳實務、該階段的已知摩擦。RESET 輪則刻意挑一個**和最近幾輪不同**的漏斗階段 / category,從零角度想。

### Step 2 — Ideation
產出**一個**具體想法,並標注:目標漏斗階段、category、假設影響(為什麼會推動該階段)。寫進 `_backlog.md` 標 [IN_PROGRESS]。

### Step 3 — VALUE GATE(必經,不可自我放行)
派獨立 `value-critic` 子代理評這個想法。**數本輪 value-critic 拒了幾個想法**(含重試),這個數字 `rejects=N` 要寫進最後的 LOOP_RESULT——driver 用滾動拒絕率判 plateau(v2.1)。依其 VALUE 路由:
- ACCEPT → Step 4
- REJECT → 把它的 REDIRECT 當新方向回 Step 1(最多重試 2 次);仍 REJECT → 本輪輸出 `LOOP_RESULT: REJECTED | rejects=<N>`,不寫 code。
這一關就是第一個 loop 缺的東西——擋掉「能做但不值得」的邊際改動。

### Step 4 — Implement
對 `index.html` 做小範圍局部改動。保持 inline 風格與既有命名。

### Step 5 — Build/Correctness Gate(必做)
```bash
Scripts/loop-shot.sh /tmp/ft-validate.png
```
JSON `ok:true` → Step 6.5;`ok:false`(JS error / 漏斗 DOM 不見)→ Step 6 修。

### Step 6 — Fix(Red)
讀錯誤、修、重跑 Step 5。超過 3 次仍 fail → `git checkout -- index.html` 還原,`_backlog.md` 標 [FAILED],輸出 `LOOP_RESULT: NOOP`。

### Step 6.5 — Independent Validation(必做,不可自我核可)
派獨立 `web-validator` 子代理。依 VERDICT:
- PASS → Step 7
- PARTIAL/FAIL → 把 BLOCKERS 當待修回 Step 6(同功能超過 3 次失敗則還原 + [FAILED] + NOOP)

### Step 7 — Deploy(Green)
```bash
git add index.html .claude/tasks/_backlog.md
git commit -m "loop(<category>): <一句話> — 推動 <漏斗階段>"
git push origin loop      # 只 loop,永不 main
```
`_backlog.md` 標 [COMPLETED]。輸出最後一行:`LOOP_RESULT: SHIPPED | category=<category> | step=<漏斗階段> | rejects=<本輪被拒想法數>`

## 本輪輸出協定(driver 解析最後一行)
每行都要帶 `rejects=N`(本輪 value-critic 拒掉的想法數,含重試;0 也要寫)。driver v2.1 用滾動拒絕率判 plateau。
- `LOOP_RESULT: SHIPPED | category=… | step=… | rejects=N`
- `LOOP_RESULT: REJECTED | rejects=N`(value gate 連重試都找不到夠格的想法)
- `LOOP_RESULT: NOOP | rejects=N`(build/validate 擋下、已還原)

## Anti-Patterns
- ❌ push main(會上 live)
- ❌ 自我放行價值或正確性(必經 value-critic / web-validator 兩個獨立子代理)
- ❌ 一輪做多個改動 / 大重構單檔
- ❌ 連續同一 category 刷量(driver 會擋,但你也要自律)— 這是第一個 loop 的死法
- ❌ 為了 ship 而 ship:沒有漏斗理由的「polish」應該被 value gate 自己擋掉
