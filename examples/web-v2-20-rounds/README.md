# Real run: the web-v2 test site, 20 rounds overnight (framework v2, 2026-06-15)

> De-identified: the domain (→ example.com), product name, paid prices, and GA4 event names (→ activation_done / core_start / core_result / core_value / depth_open / share / pay). Rounds, categories, rejects, commit SHAs, and feature descriptions are unchanged, so the numbers can still be recomputed from `loop.log`.
>
> **Language:** the product is a Traditional Chinese website, so its raw artifacts — `loop.log` and everything under `as-run/` — are in Chinese and are kept verbatim as the record. Commit subjects and quotes on this page are English translations.

One real run, with the raw log and the files it ran on kept as they were. The product is a single-file static fortune-telling web page (de-identified here as example.com) with a GA4 funnel and a paywall. This was the framework's second setting (the first was iOS) and the source of the v2 → v2.1 fixes.

## Numbers

- All 20 rounds SHIPPED, 01:15 → 05:25, 4h10m, 12.5 min/round on average, model sonnet-4-6
- The value gate rejected 17 ideas inside rounds (the sum of `rejects=` in loop.log; `as-run/_backlog.md` has 18 `[REJECTED]` lines because one line can hold several ideas; the "8" in the comments of `as-run/run-loop.sh` was written mid-run), but no round was ever fully REJECTED → v2's plateau detection never fired. Even under v2.1's rejection-rate rule (rejects/ships ≥ 1.5), no 5-round window in this data exceeds 1.0 — the plateau rule still has no real positive case
- Category distribution: monetization ×5, engagement ×4, virality ×3, trust-quality ×3, activation ×2, retention ×2, acquisition ×1
- The trajectory monitor ran every 5 rounds: 4 checks, all CONTINUE
- The driver's branch protection held: everything was pushed to `loop`; main (GitHub Pages → live) was never touched

## Round by round

| Round | Category | Funnel edge | Rejects | Commit (subject translated) |
|---|---|---|---|---|
| 1 | monetization | depth_open→pay | 1 | `b1ebf6c` loop(monetization): six-chapter progress dots on the paywall (Zeigarnik near-completion effect) — moves depth_open→pay |
| 2 | monetization | share→pay | 1 | `f4f888a` loop(monetization): bridge to the in-depth reading after sharing — moves share→pay |
| 3 | engagement | core_value→depth_open | 1 | `2391a11` loop(engagement): fReportBridge cross-session comparison bridge — moves core_value→depth_open |
| 4 | virality | core_value→share→(audience)activation_done | 1 | `de4ab66` loop(virality): share text embeds the first line of the fortune poem — moves core_value→share→activation_done |
| 5 | activation | activation_done→core_start | 1 | `b23ed18` loop(activation): yearly-fortune question bridge — moves activation_done→core_start |
| 6 | retention | return_visit→activation_done | 0 | `48c40cb` loop(retention): restoreNote remembers the last question — moves return_visit→activation_done |
| 7 | monetization | depth_open→pay | 1 | `abeeb07` chore: mark monetization CTA paywall [COMPLETED] in backlog |
| 8 | engagement | core_value→depth_open | 2 | `c6285d0` loop(engagement): highlight the poem line that answers the question — moves core_value→depth_open |
| 9 | trust-quality | core_result→core_value | 0 | `c5ae9e2` chore: mark trust-quality jiao personalization [COMPLETED] in backlog |
| 10 | acquisition | landing→activation_done | 1 | `ecf39fb` loop(acquisition): today's sample fortune poem previewed in the hero — moves landing→activation_done |
| 11 | virality | core_value→share→(audience)activation_done | 0 | `8adc858` loop(virality): two-person fortune comparison — moves core_value→share→(audience)activation_done |
| 12 | monetization | depth_open→pay | 0 | `cc5945b` chore: mark monetization paywall blur preview [COMPLETED] in backlog |
| 13 | engagement | core_start→core_result | 2 | `5ff5562` loop(engagement): explain the "three throws" rule after the first bad divination-block throw — moves core_start→core_result |
| 14 | activation | landing→activation_done | 0 | `1e0bee4` loop(activation): instant feedback on the birthplace field — moves landing→activation_done |
| 15 | trust-quality | landing→activation_done | 1 | `cdbcc59` loop(trust-quality): privacy note on first focus of the birth-date field — moves landing→activation_done |
| 16 | retention | return_visit→core_start | 2 | `213e566` chore: mark retention "resume an interrupted question" [COMPLETED] in backlog |
| 17 | virality | activation_done→share→(audience)activation_done | 0 | `267288a` chore: mark virality "destiny-identity share" [COMPLETED] in backlog |
| 18 | monetization | depth_open→pay | 0 | `113bc40` loop(monetization): in-depth reading bridge CTA at the end of chapter five — moves depth_open→pay |
| 19 | engagement | core_value→share | 1 | `10d6c62` loop(engagement): personal "[name]'s fortune" title at the top of the fortune card — moves core_value→share |
| 20 | trust-quality | core_value→depth_open | 2 | `e1004bb` chore: mark trust-quality "same-type fortune trend across sessions" section [COMPLETED] in backlog |

(In some rounds the last commit is `chore: mark … [COMPLETED]`; the feature commit is the one before it.)

## What rejected ideas look like (translated; originals in `as-run/_backlog.md`)

- `[REJECTED] retention-calendar | core_value→activation_done (next day) | "Remind me tomorrow" Google Calendar chip: value-critic judged the conversion chain too long (click→confirm→return→activation_done) and user motivation too weak; rejected.`
- `[REJECTED] acquisition | landing→activation_done | Hero "hour of birth" atmosphere hook: value-critic found the hour-of-birth concept already used in two shipped commits, so a third use is a repeated lever, and it does not remove the friction of filling in the form; impact=2 novelty=2; rejected. REDIRECT → social-proof counter.`
- `[REJECTED] retention | core_value→activation_done (next day) | Midnight countdown / add-to-home-screen / fortune-saved toast, all three rejected: (1) the countdown has impact=2 and no external re-engagement mechanism; (2) add-to-home-screen on Android needs a service worker or it fails silently; (3) the save toast is awareness polish, not a new pull mechanism. All REJECTED; no code written.`

Every rejection names the funnel stage, the scores, and a REDIRECT — evidence that the value gate was doing real work, and a signal the driver should have been reading but was not (lesson 2).

## What was fixed after this run (v2 → v2.1 → v3)

1. The plateau never fired → the driver switched to the rolling rejection rate from `rejects=N` (v2.1, `scripts/run-loop.sh`).
2. The second REDIRECT above pushed the loop toward a "social-proof counter", and it went on to ship hash-seeded "N people started a reading today" and "N people unlocked the in-depth reading today" — fabricated signals on a trust product, which the value gate let through → a trust gate was added (v2.1, `value-critic.md` step 2.5). For the record: those two commits were merged to main at the time and later removed by hand; the live index.html no longer contains either counter string (checked 2026-08-25).
3. The human review the next day: round 5's "yearly-fortune question" CTA was labeled as drawing a fortune, but its handler only preselected and scrolled; the build was green and the validator said PASS → a human added two fix commits; the validator gained the label-promise axis, and a PRD with a CLAIM became mandatory every round (v3, lesson 9).

Point 3 is what Andrew Ng calls the developer feedback loop: the agent's own tests passed, and only a human looking at the finished product found that the requirement was not met.

## Files

- `loop.log` — the driver's raw output (paths made relative)
- `as-run/run-loop.sh` — the driver as it ran (v2.1, including the rejection-rate fix — which could never fire under macOS bash 3.2: `${arr[@]: -$WINDOW}` returns an empty array when the array is shorter than WINDOW. Kept unchanged as the evidence for lesson 10; the fixed version is `scripts/run-loop.sh` in this repo)
- `as-run/improvement_loop.md` — the single-round spec as it ran (v2: Size S/M skipped the PRP)
- `as-run/value-critic.md`, `as-run/web-validator.md` — the two independent subagents as they ran (trust gate included)
- `as-run/web-check.mjs` — the web adapter
- `as-run/_backlog.md` — the full ledger, with the original text of every COMPLETED and REJECTED entry
- Not included: `LOOP.md` (the run guide) and `Scripts/loop-shot.sh` (a thin wrapper around `web-check.mjs`), both referenced from `improvement_loop.md`

How this differs from the generic version in this repo: the generic version moves product details into `loop.config.env` / `product/positioning.md`, and adds the C / P nodes and a PRD every round; the gates, roles, and result-line protocol are the same.
