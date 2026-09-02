# 十條硬教訓：v1 → v2 → v2.1 → v3

這套不是設計出來的，是跑壞了三次修出來的。每一條都有對應的實跑數字與實作；web-v2 的數字可從 `examples/` 的 log 重算，iOS 健康 app 的是外部 run、本 repo 未附。

## 演化

| 版本 | 場景 | 跑了 | 結果 | 缺的東西 |
|---|---|---|---|---|
| v1 | iOS 資產追蹤 app（`examples/ios-v1-112-iterations/`） | 112 輪 | 每 3 輪一次維護模式，功能一直加 | 沒有價值閘；builder 自己標 COMPLETED；push main |
| v1 | iOS 健康 app（外部 run，本 repo 未附 log） | 35 輪／11.5h 過夜 | 31 輪是同一種 HealthKit 指標追加；3 個真功能 | 同上；獨立 validator 是後補的 |
| v2 | web 算命站（v2 測試場）（`examples/web-v2-20-rounds/`） | 20 輪／4h10m | 20 出貨、17 個想法被價值閘拒、7 類 category、trajectory 4 次 CONTINUE | plateau 永遠不觸發；放行了假社交實證；放行了 label 不符的 CTA |
| v2.1 | 同上 | — | 拒絕率 plateau；信任閘 | plateau 因 bash 3.2 陣列切片 bug 其實從未能觸發（教訓 10） |
| v3 | 本 repo | — | 現況節點 C；定位節點 P 兩種模式；每輪 PRD；label-promise 軸 | 待 N=3 |

## 教訓

1. **Loop 最大化它量得到的。** 只量正確性 → 刷邊際物（31/35）。先加價值閘，放在建之前。
2. **終止讀拒絕率，不讀「連續整輪全拒」。** 後者太粗：輪內 retry 讓整輪 REJECTED 幾乎不出現，17 個拒絕一個訊號都接不到。`rejects=N` 每行必帶。
3. **獨立驗證 > 自我核可，結構性的。** builder 有一切動機宣布成功；第二雙眼睛的優勢來自獨立 context、無作者身分、無沉沒成本。
4. **分層防禦各抓一層。** 價值閘抓單點 off-funnel、category 多樣性抓表面重複、trajectory 抓「不同 category 但同一招」的 meta 同質。缺一層就回到 v1。
5. **信任型產品，捏造數據即使「有效」也拒。** v2 出貨了 hash 種子的「今日已有 N 人起盤」與「今日已有 N 人解鎖深批」——它們大概真的會推漏斗，也真的會在被抓到時毀掉核心資產。信任閘蓋過 impact 分數。
6. **部署隔離不可妥協。** web-v2 測試場的 main 是 GitHub Pages，push main = 上線。driver 第一行就擋。
7. **別從 N=1 抽框架。** iOS 與 web 兩個 adapter 都跑過，才敢把 gate／角色／driver 抽成通用層；第三個場景之前別再加抽象。
8. **內容面大的產品可能 N 輪內不會 plateau。** plateau 偵測是 calibration；想親眼看到它觸發，要用可枯竭的小目標。
9. **功能正確 ≠ 體驗符合承諾。** 「問一支籤？」按鈕只預選並捲動、沒抽籤：build 綠、validator PASS、用戶體感沒反應。validator 加第 4 軸 label-promise；每輪必有 PRD 的 CLAIM 讓它有東西對。

10. **停機邏輯要用 stub 測過才算存在。** 整理本 repo 時給 driver 寫了一個假的 `claude`（每次呼叫吐一行預設結果）跑五個劇本，發現 v2.1 的拒絕率 plateau 從來不可能觸發：macOS 預設 bash 3.2 對 `${arr[@]: -$WINDOW}` 在陣列短於 WINDOW 時回傳空陣列，滾動視窗每輪被清空、永遠湊不滿。web-v2 的 v2.1 driver（`examples/web-v2-20-rounds/as-run/run-loop.sh`）就帶著這個 bug 出貨，「plateau 待確認會觸發」那句其實是「永遠不會」。修正在 `scripts/run-loop.sh`（改成超過 WINDOW 才丟掉最舊的一筆），`scripts/test-driver.sh` 七個劇本現在都過。誠實補一句：即使規則正確，web-v2 那 20 輪也不會觸發（任何 5 輪窗最多 5 拒／5 出貨，拒絕率 1.0，門檻 1.5）——plateau 規則到今天還沒有真實正例，它只是被測試證明「會在該停的時候停」，不是被實跑證明「真的停過」。教訓的通式：driver 是 deterministic 的，所以它可以、也必須被 deterministic 地測——不要等一整晚的實跑來告訴你停機條件有沒有寫對。

## v3 新加的三條，還沒被實跑證明

- **先 discover 再 build**（節點 C）：v1 後期 backlog 膨脹到 140K、agent 相信筆記多過相信 code。C 把真相固定在 repo 與跑起來的產物。待驗證：深度 audit 每 5 輪一次的成本是否值得。
- **定位是慢節點、兩種解法**（節點 P）：人在用多輪提問收斂；人不在用兩個高階 agent 對抗。待驗證：strategist + critic 在真實 plateau 上 AGREED 的比例，以及 AGREED 之後的下一段是否真的比人選的差。
- **每輪都有 PRD**：v2 是 Size S/M 跳過。待驗證：一頁 PRP 增加的每輪時間（估 2–3 分）是否換到更少的 label-promise 漏網。

這三條寫在這裡是提醒：v3 目前是 N=0 的設計，不是 N=2 的證據。

## 來源

框架來自一場 2026-01 的分享（6-phase 多 agent 產品迴圈）落地到 Claude Code 的 loops / subagents / headless 原語；方法論上與 Andrew Ng 的三個 loop（agentic coding / developer feedback / external feedback）、Boris Cherny 的「寫 loops 不寫 prompts」、以及 harness engineering 的「驗證要獨立、狀態要外部化、停止條件要先定」一致。

下一頁：[07-adapters](07-adapters.md)
