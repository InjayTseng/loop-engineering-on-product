# 五步裝進你的 repo

前提：一個能 build 的產品、一個 `origin` remote（每輪要 push）、`claude` CLI 在 PATH、Node ≥ 18（adapter 用 top-level await）；web adapter 另需 `npm i -D playwright` 與本機 Google Chrome，iOS adapter 需 Xcode 與已 boot 的模擬器。整套加起來一個下午。

## 1. 複製骨架

```bash
cp -R .claude loop.config.env scripts product research PRPs <your-repo>/
cd <your-repo> && git checkout -b loop
scripts/install-hooks.sh          # pre-push hook：git 層拒推 DEPLOY_BRANCH
```

`.claude/settings.local.json.example` 是 headless 用的最小權限白名單：複製成 `.claude/settings.local.json`（gitignored）。它只准 `git push origin loop`、deny `push origin main` 與 `reset --hard`。注意：它只管互動模式（`/loop-once`）；headless driver 用 `--dangerously-skip-permissions` 不讀它，所以 headless 的安全靠每輪分支檢查 + `pre-push` hook。

## 2. 寫 adapter（B 節點）

挑 `scripts/adapters/web-check.mjs` 或 `ios-shot.sh`，或按 [07-adapters](07-adapters.md) 的四問寫一個。目標：一行 `BUILD_CMD`，exit 0 = ok，產出 validator 看得到的東西（截圖／輸出）。先手動跑一次確認 exit 0——`loop.config.env` 的 `WEB_MUST_INCLUDE` 等佔位不填，第一次 audit 就會 BROKEN。

## 3. 填 `loop.config.env`

北極星與漏斗、category（7±2 個）、`TRUST_PRODUCT`、門檻、`DEPLOY_BRANCH` ≠ `LOOP_BRANCH`、`BUILD_CMD`。沒有現成漏斗就先定一個粗的——沒有北極星，價值閘會退化成「順眼就好」。

## 4. 定位與現況（P、C）

```
/audit          # state-auditor 重寫 product/state.md
/position       # 多輪提問收斂 product/positioning.md（硬欄位只有這裡能改）
```

兩份檔是每一輪的輸入。跳過這步，迴圈會優化「agent 覺得像目標的東西」。

## 5. 先手動跑一輪，再放過夜

```
/loop-once                 # 看 value-critic 與 validator 的行為對不對
scripts/run-loop.sh 5      # 短跑 5 輪，看 loop.log
scripts/run-loop.sh 20     # 過夜
```

早上看 `.loop/loop.log`：出貨了什麼、拒了什麼、trajectory 說什麼、有沒有 park 在 P。把 loop 分支的 commit 一個一個 review 再 merge——這是 Andrew Ng 的 developer feedback loop，也是 v2 抓到 label-promise bug 的地方。

## 驗收：一條 loop 算裝好的判準

- [ ] driver 在 `main` 上 REFUSE
- [ ] `/loop-once` 一輪內看到 `VALUE:`、`PRP_SCORE:`、`BUILD:`、`VERDICT:`、`LOOP_RESULT:` 五行
- [ ] validator 是不同 agent（看 transcript：builder 沒有自己宣布 PASS）
- [ ] 故意給一個 off-funnel 想法，value-critic 會 REJECT 並給 REDIRECT
- [ ] `TRUST_PRODUCT=true` 時，故意提一個 hash 種子的「今日 N 人」，會被拒
- [ ] `.loop/loop.log` 每輪一行有 `rejects=`
- [ ] `product/state.md` 在 run 開始後被重寫
- [ ] `BUILD_CMD` 手動跑 exit 0；`bash scripts/test-driver.sh` 全過

## 不要做的事

- 不要讓 loop 跑在 live 分支
- 不要為了省時間跳過 PRD（V 節點會瞎）
- 不要從這一個場景就開始改通用層——先跑滿一晚，記下第 11 條教訓
