# Context
File name: 2026-10-16_1_unify-board-ui.md
Created at: 2026-10-16_16:45:00
Created by: lertoon
Main branch: feat/multi-audio-comparison
Task Branch: task/unify-board-ui_2026-10-16_1
Yolo Mode: Ask

# Task Description
让项目的多 item 看板（comparison 多音频对比视图）和单 item 看板（主音频预览界面）的 UI 统一、美化、简洁。参考 https://github.com/VoltAgent/awesome-design-md 中 Cursor 的设计语言（质感、贝塞尔圆角、轻度磨砂玻璃），只做小改动，让整体设计语言更统一。

# Project Overview
EAR Audio Preview：专业音频监听/分析 VSCode 扩展。双进程架构（Extension Host + Webview）。UI 为深色 machined 风格，设计 token 集中在 src/webview/styles/earEqTokens.css（surface-0..4、r-1/2/3、dur-1/2/3、ease-swift cubic-bezier(0.22,1,0.36,1)），共享原语在 earPrimitives.css（.panel/.well/.btn/.input/.canvasBox 在 figure.css）。多 item 看板 = src/webview/comparison/（本分支新功能），单 item 看板 = src/webview/components/ 主预览。

⚠️ WARNING: NEVER MODIFY THIS SECTION ⚠️
RIPER-5 核心协议：每响应以 [MODE: X] 开头；默认 RESEARCH；未经许可不得切模式；RESEARCH 只观察/提问，INNOVATE 只发散，PLAN 只出规格+编号清单，EXECUTE 100% 按计划逐条执行并在每条后追加 Task Progress，REVIEW 逐行比对计划与实现并标记任何偏差；用户未明示不得自作主张改代码；中文交互、格式化输出用英文。
⚠️ WARNING: NEVER MODIFY THIS SECTION ⚠️

# Analysis

## 设计语言文档考证
- awesome-design-md 仓库中 cursor 唯一条目 design-md/cursor，正文已迁移至 getdesign.md，经 `npx getdesign@latest add cursor` 取得 DESIGN.md（存于 /tmp/getdesign-cursor/DESIGN.md）。
- 该文档是 Cursor **官网营销页** 分析：暖奶油画布 #f7f7f4、暖墨 #26251e、唯一品牌色 Cursor Orange #f54e00、hairline-only 无阴影、editorial 排版（CursorGothic 400 负字距）、圆角 4/6/8/12/16/pill、无 backdrop 模糊。
- 用户描述的「质感、贝塞尔圆角、轻度磨砂玻璃」实为 Cursor **IDE 应用内** UI 气质（深色半透明浮层、连续曲率圆角、backdrop blur），营销页文档并不包含这些。方向需用户确认。

## 两块看板现状
### 多 item 看板（comparison 视图, src/webview/comparison/comparison.css）
- comparisonChrome：sticky 顶栏，浮动圆角卡片（r-3=10px、渐变 surface-2→1、0 8px 24px rgba(0,0,0,.28) 投影、border edge-line + 顶部 hairline）。
- comparisonTracks：轨道行，track-color 4% 底色、hover 9%、focused 11% + 底部 2px 轨道色。
- comparisonTabs：复用 .workspaceChrome 结构但覆盖样式；`.comparisonApp .workspacePane__tab` 与主视图 tab 样式近似重复，选中态用 aria-selected → surface-3 背景（无主视图的滑动焦点块）。
- comparisonFigure：r-3 渐变卡片 + 0 4px 14px rgba(0,0,0,.2)。
- comparisonWave__row：r-2 + 左 3px track-color 边 + inset 0 1px 3px 阴影。
- comparisonTransport：fixed 底部悬浮通栏，**硬编码 14px 圆角**、渐变 surface-2→1、0 12px 36px rgba(0,0,0,.5)，默认 translateY 隐藏仅露 18px 把手，hover/pin 浮现。
- comparisonMonitor__body：**硬编码 10px 圆角** + 0 8px 30px #0007。
- earExportDialog：**硬编码 14px 圆角** + 0 18px 70px #0008。
- `.comparisonApp button`：第三套按钮体系（pill-bg/pill-border/pill-shadow + hover translateY(-0.5px)），与 vscode.css 全局 button、earPrimitives .btn/.earEqPill 并存。
- `.comparisonApp select/input`：硬编码 5px 圆角（off-scale）。

### 单 item 看板（主预览）
- stickyHeaderChrome：平铺贴边，背景 var(--vscode-editor-background, #1e1e1e) 实色，无圆角无投影（webview.css）。
- workspaceChrome：通栏，border-bottom hairline + 渐变 surface-2→1（liveMeters.css:54）。
- workspacePane__tab：大写 0.75rem 透明 tab，选中靠 .workspaceChrome__focus 滑动焦点块（earEqTokens.css:183）。
- 图卡 .canvasBox：1px edge-line 边框、**无圆角、无背景/投影**（figure.css）。
- transportDock FAB：52px 圆形旋钮 + expandChip（左下），transportPopover__panel r-3 + shadow-popover（transportFabComponent.css）。
- settingsDock FAB：52px 圆形，用 --vscode-editorWidget-background + shadow-popover（webview.css）。
- analyzerComponent：1px edge-line 边框，无圆角。

### 不统一点清单（候选改动面）
1. 顶栏 chrome：单=平铺实色 / 多=浮动圆角卡片，两种语言。
2. Tab：样式重复定义且选中态机制不同（滑动焦点块 vs 静态背景）。
3. 按钮三体系并存；comparison 独有 hover 上浮动效。
4. 圆角 off-scale 硬编码：14px ×2、10px ×1、5px ×1（token 只有 3/6/10/9999）。
5. 阴影多套并存：chrome 24px/.28、figure 14px/.2、transport 36px/.5、token modal 32px/.45、popover 16px/.35。
6. **全项目无 backdrop-filter**：磨砂玻璃为零。天然落点：sticky chrome、悬浮 transport、popover、FAB、export dialog。
7. 图卡质感差距：单看板 .canvasBox 锐利无填充 vs comparisonFigure 渐变投影卡片。
8. Transport 形态结构差异（FAB vs 底部通栏）——属结构层，表面可统一质感。

### 技术约束
- VS Code webview 为 Chromium，支持 backdrop-filter 与 color-mix（项目已对 Chromium <111 做静态回退惯例）。
- 改 CSS 需同步注意 .test.ts（comparisonApp.test.ts / comparisonLiveView.test.ts 等可能断言类名/结构，纯 CSS 改动不受影响）。
- vscode.css 有 `button { width: 100% }` 全局规则，各处需 `width: auto` 覆盖（已有惯例）。

## 用户已确认的方向（2026-10-16）
1. 设计语言：按 **Cursor IDE 应用气质**（深色、质感、贝塞尔圆角、轻度磨砂玻璃），保留现有深色 + 绿 accent；不采用官网营销页的浅色奶油语言。
2. 范围：**整个插件页面**统一（不止两个看板 pane 内部）。
3. 磨砂玻璃：**仅浮层**（popover/dialog/菜单/悬浮 transport/FAB），sticky 顶栏保持实色。
4. 改动幅度：CSS 为主 + 允许微调类名/DOM 属性。

## 全插件扫描补充（浮层清单与离群值）
### 已合规（token 体系内）
- settingsOverlay__dialog / keyboardShortcutsOverlay / curveCorrectionOverlay：r-3 + shadow-modal + edge-line 边框 + --backdrop-dim 遮罩，三者一致。
- transportPopover__panel / metaPopover__panel：r-3 + shadow-popover，一致。
- earPrimitives .panel/.well/.btn/.input、panelSurface.css：全部 token 化。

### 离群（待统一）
- `.earExportDialog` + `.earExportDialogBackdrop`：**在 wavFormatControls.css 与 comparison.css 中重复定义**（14px 圆角、0 18px 70px #0008、#0008 遮罩），且按钮 margin 5px 硬编码。
- `.earContextMenu`：10px/6px 硬编码圆角、0 12px 36px #0008 + inset 高光自定义阴影。
- `.comparisonTransport`：14px 硬编码圆角、0 12px 36px .5 阴影。
- `.comparisonMonitor__body`：10px 硬编码圆角、0 8px 30px #0007。
- `.onboardingTour`：6px/8px/4px 硬编码圆角、0 8px 28px .45 阴影、9999px shroud .58（与 --selection-shroud .42 不同值）。
- `.comparisonApp select/input`：5px 圆角；`.wavFormatControls select`：5px 圆角 + hairline 边框（与 earPrimitives .input 的 edge-line + well-inset 不一致）。
- liveMeters.css:202 (4px)、liveMeters.css:409 与 loudnessComponent.css (2px)：小元素硬编码圆角（r-1=3 附近取值）。
- 悬浮小气泡：figureHoverReadout / spectralAnalyzer__hoverReadout / phaseCorrelationSpectrum__hoverReadout / loudnessComponent__hoverReadout（fixed 浮层，磨砂候选）。
- FAB：settingsDock__fab 用 --vscode-editorWidget-background（VS Code 主题变量体系），transportDock 旋钮用 token 体系——FAB 两套取色。

### 磨砂玻璃落点（用户指定 float-only）
transportPopover__panel、metaPopover__panel、earContextMenu、earExportDialog、comparisonTransport、comparisonMonitor__body、各 hoverReadout、settingsDock__fab（可选）。顶栏 chrome 保持实色。

# Proposed Solution

已由用户确认并锁定（2026-10-16）。PLAN 只许把这些决策落成逐条规格，不得另开方向。

## 锁定决策

1. **语言**：Cursor IDE 深色应用气质。保留现有深色 surface 阶梯与绿色 accent。不采用官网营销页的奶油底与橙色。连续曲率不引入 `corner-shape` / SVG mask；用半径阶梯 + 浮层 inset 顶部高光（`--edge-hi`）表达「贝塞尔圆角 + 质感」。
2. **范围**：整个插件页面。CSS 为主，允许微调类名与 DOM 属性。Transport 形态不动（单看板左下 FAB、多看板底部通栏）。
3. **顶栏（params-only）**：单看板保持贴边实色通栏，多看板保持内嵌圆角卡片。统一的是材质参数与 tab 行为：同一渐变、同一 hairline、同一高度节奏、同一套 tab 样式。对比视图 tab 挂上主视图的 `workspaceChrome__focus` 滑动焦点，从而删掉 `.comparisonApp .workspacePane__tab` 的重复定义。顶栏不加磨砂。
4. **圆角阶梯**：新增 `--r-4: 12px`，语义位是 modal 与大型悬浮条。归位规则：
   - 14px（`earExportDialog`、`comparisonTransport`）→ `--r-4`
   - 5px 输入/select → `--r-2`
   - 已等于 10px 的中型浮层（context menu、monitor 弹层）→ `--r-3`，只做 token 化
   - 4px 控件碎圆角 → `--r-1`
   - 2px 属于表针/电平条等可视化几何，保持不动
   - 卡片与 chrome 继续 `--r-3`；控件继续 `--r-2`
5. **图卡语义分层**：单看板 `.canvasBox` 走嵌入 well（圆角 + `surface-0` + `--well-inset`，像嵌进工作台）。多看板 `comparisonFigure` 保持浮起 card，但渐变与投影改为共享 token，不再写一次性 rgba。不把单看板图卡做成投影卡片，也不把多看板削平。
6. **按钮**：去掉 `.comparisonApp button` 的 hover `translateY(-0.5px)`。材质对齐 `.btn`（`surface-2` + `edge-line` + inset `--edge-hi`），保留对比视图更紧凑的尺寸。不批量改 class 名。
7. **磨砂（float-only）**：共享玻璃 token（半透明 `color-mix` 底 + `backdrop-filter: blur` 约 10px + `saturate` 约 1.15），`@supports` 回落到实色，并给 Chromium 旧版静态回退。落点：`transportPopover__panel`、`metaPopover__panel`、`earContextMenu`、`earExportDialog`、`comparisonTransport`、`comparisonMonitor__body`、各 hover readout、`settingsDock__fab`。模糊半径停在 8–14px，因为对比视图的悬浮条压在 WebGL 频谱上。顶栏、画布、图卡不加模糊。
8. **阴影语义**：真正浮层用现有 `--shadow-popover`（菜单/popover/monitor）与 `--shadow-modal`（对话框）。流内卡片（`comparisonChrome`、`comparisonFigure`）新增一档更轻的 `--shadow-card`，避免和真浮层抢重量。onboarding 的圆角与阴影归位到上述 token；其 spotlight shroud 是功能对比度，允许保持现有透明度。
9. **动效**：硬编码且与 token 同值的时长/曲线指回 `--dur-*` 与 `--ease-swift`（含 `comparisonWave__extra` 的 0.22s 贝塞尔、`metaPopover` 的 150ms ease）。
10. **重复定义**：`.earExportDialog` / backdrop 在 `wavFormatControls.css` 与 `comparison.css` 各写一份，合并到一处共享样式。具体落点文件由 PLAN 先核对两个入口是否打进同一 bundle。
11. **FAB**：`settingsDock__fab` 从 VS Code 主题变量收拢到项目 surface token，与 transport FAB 同一套材质。尺寸与位置不动。

## 明确不做

- 不改浅色、不换橙色 accent、不引入 CursorGothic。
- 不给 sticky 顶栏加磨砂。
- 不把 FAB 与底部通栏互相改造成对方。
- 不删除全部投影去追求营销页的 hairline-only。
- 不改可视化配色（meter / goniometer / spectrum 的信号色）。

# Implementation Plan

1. Add shared chrome/card/glass tokens and r-4; retain opaque fallback when blur or color-mix is unavailable.
2. Align chrome, controls, well/card surfaces, FAB, onboarding and floating surfaces with the locked decisions; consolidate export styles in wavFormatControls.css (imported by both entry points).
3. Reuse workspace tab styles and sliding-focus utility in comparison; update focus on pane changes and resize.
4. Run targeted interaction tests, type checking and bundle build; inspect browser rendering and document results.

# Current execution step: "REVIEW — implementation and browser checks complete"

# Task Progress
[2026-10-16_16:45:00]
- Modified: 无代码改动；新建任务文件 .tasks/2026-10-16_1_unify-board-ui.md；新建分支 task/unify-board-ui_2026-10-16_1（基于 feat/multi-audio-comparison）
- Changes: RESEARCH 完成：获取 getdesign.md 的 Cursor DESIGN.md（营销页语言）；梳理 comparison.css 与主预览 UI 的现状与 8 项不统一点
- Reason: 统一两块看板 UI 前的信息收集
- Blockers: 无（用户已确认四个方向性问题）
- Status: UNCONFIRMED

[2026-10-16_16:55:00]
- Modified: 任务文件 Analysis 追加「用户确认方向」与「全插件扫描补充」两节
- Changes: 完成全插件 CSS 扫描：确认合规层（3 个 overlay、2 个 popover、primitives）与离群层（earExportDialog 双文件重复、contextMenu、comparisonTransport、monitor 弹层、onboarding、5px 输入控件、FAB 双色体系）；圈定磨砂玻璃 float-only 落点
- Reason: 用户将范围扩大为整个插件页面
- Blockers: 无
- Status: UNCONFIRMED

[2026-10-16_16:50:00]
- Modified: 任务文件 Proposed Solution 从占位改为 11 条锁定决策 + 明确不做清单
- Changes: 固化用户确认的四条岔路：顶栏 params-only、新增 --r-4、图卡 well/card 分层、去掉按钮 hover 位移；并写明磨砂 token、阴影三档、动效回指 token、export dialog 去重、FAB 材质收拢
- Reason: 用户要求在进入 PLAN 前固化 INNOVATE 结论
- Blockers: export dialog 共享样式的落点文件待 PLAN 核对 bundle
- Status: UNCONFIRMED

# Final Review:
- Decisions 1–2: Preserved dark surfaces, green accent, visualization colors and both transport layouts. Changes are CSS plus comparison tab markup and focus updates.
- Decisions 3–6: Shared opaque chrome gradient, shared tabs with sliding focus, r-4 radius, recessed single-file canvas surfaces, elevated comparison cards, and stationary button hover states implemented.
- Decisions 7–8: Float-only glass uses 10px blur / 1.15 saturation / 88% surface-2, enabled only when blur and color-mix are supported. Popover/modal/card elevation remains separate. Onboarding spotlight opacity is preserved.
- Decisions 9–11: Motion values use shared tokens; export styles live only in wavFormatControls.css, imported by both entry points; settings FAB uses project surfaces.
- Small implementation correction: Added border-box to the shared sliding focus after browser measurements showed a 2px border-size mismatch. Final tab and focus both measure 55.921875 × 26px.
- Validation: TypeScript noEmit passed; ESLint on modified TypeScript passed; git diff --check passed; all three webpack targets built successfully; 4 targeted Jest suites / 42 tests passed.
- Browser inspection: Actual bundled single-file preview with a generated PCM WAV, and comparison with four existing benchmark WAVs; inspected STFT, shared Live Spec, pane switching, and file-info popover. Single-file viewport at 620px had no document horizontal overflow.
- Material checks: Computed chrome backdrop-filter is none; comparison transport and single-file metadata popover use blur(10px) saturate(1.15) with 0.88 alpha surface color.
- Evidence: /tmp/ear-ui-review/comparison.jpg and /tmp/ear-ui-review/single.jpg.
- Boundary: Browser harnesses exercise production webview bundles; VS Code host IPC and old Chromium fallback were not runtime-tested. No extension installation, commit or publish performed.
- Status: Implementation verified; user visual acceptance pending.

[2026-10-16 Implementation]
- Authorization: User explicitly requested implementation on the task branch; existing unrelated edits preserved.
- Step 1: Added shared material, elevation and radius tokens with feature-gated glass fallback.
- Step 2: Unified CSS surfaces and controls; removed duplicate export dialog styles; retained visualization colors and transport layouts.
- Step 3: Reused shared tab styling and sliding focus, including resize updates.
- Step 4: Complete. See Final Review for checks and evidence.

## Follow-up implementation — comparison interactions (2026-10-16)

User requested four additional changes after visual review.

1. Removed timeline wheel handlers and wheel-zoom help. Wheel events now retain normal page scrolling; pointer selection still zooms shared axes and double-click resets them. Updated README accordingly.
2. Track banners now reconcile nodes by track ID instead of rebuilding on every session event. Active/bypass is a labelled, keyboard-operable theme-color lamp; mute is a fixed 28×26px speaker icon. Hover action background reaches the right edge. STFT cards remain mounted in their grid slots while bypassed, with a 220ms opacity/desaturation transition and reduced-motion support.
3. Replaced the bottom transport's custom Monitor controls with the original LiveMonitoringBarComponent and EqMonitorStripComponent, triggered from the upper toolbar. The original CurveCorrectionOverlayComponent is lazily mounted. Added comparison IPC routing to existing AutoEq and preset host services for catalog, equalization, import, read, save and workspace profile operations. UI changes update the comparison transport's channel routing, band mask and EQ chain.
4. Loudness chart renders only short-term LUFS; removed momentary, integrated and peak reference lines from that plot. Integrated LUFS, LRA and true peak remain in an aligned per-track table. Completed analysis now refreshes the summary immediately. Filename cells use textContent.

### Follow-up validation
- Seven targeted suites / 58 tests passed, including wheel pass-through, shared drag zoom, stable control and canvas identity, monitor-to-transport updates, preset import response round trip, host routing and short-term-only drawing.
- TypeScript, ESLint on touched TypeScript, git diff --check and all webpack targets passed.
- Browser: mute button bounds remained identical before and after toggling (28×26px); active lamp changed state; bypass retained two grid columns and applied the 220ms transition. Shared band controls lit on click; original EQ dialog opened. Four short PCM fixtures produced four short-term curves and aligned summary rows.
- Screenshots: /tmp/ear-ui-review-2/monitor.jpg; /tmp/ear-ui-review-2/loudness.jpg.
- Boundary: Browser fixture harness excludes VS Code host IPC and F0/onset host analysis. Host operations were covered with mocked-service tests, not a live VS Code file-dialog / AutoEq network round trip. Original staged and unrelated edits were preserved; no commit or publication.


## Follow-up — banner geometry and floating transport (2026-10-16)

- Unified banner row/item sizing; only the outer chrome clips corner radii. Removed item corner rounding and action-layer vertical offset. Pointer interaction on the active lamp changes only the dot; keyboard focus stays visible around the dot.
- Both single and comparison goniometer panes now fill their unused area with the plot background.
- Volume double-click resets to 100%. Playback time accepts seconds, clamps to the track extent, commits on Enter/change and cancels on Escape; playback updates do not overwrite focused edits.
- Shortened the seek slider and moved the shared Monitor trigger to the floating transport's right side. Its panel opens above the dock and keeps the dock visible while open, including wrapped narrow layouts.
- Validation: 47 tests in comparisonApp, comparisonLiveView and webview passed; webpack passed. Browser verified 3.25-second seek, volume reset, active/bypass lamp, matching item/name/action bounds, single/comparison plot fill, and a 620px layout with an 8px panel-to-dock gap. Screenshots: /tmp/ear-ui-review-3/comparison.png and /tmp/ear-ui-review-3/single.png. Fixture browser excludes VS Code IPC.

## Follow-up — settings scrolling and comparison onboarding (2026-10-16)

- Fixed comparison settings clipping: its direct-content `#settingTab` now owns vertical scrolling, with non-shrinking children and contained overscroll. Single-file tab scrolling is unchanged.
- Reused `OnboardingTourComponent` for a 15-step comparison guide, including shared spotlight/cards, Back/Next/Skip, interactive auto-advance, overlay Escape guards and reduced-motion styling. Covers track participation/mute, all four views, drag zoom, transport, Monitor, settings and keyboard help. The transport remains visible during the guide.
- Added a dedicated toolbar guide button, keeping keyboard help separately accessible. Initial host metadata controls first-open display; skip/finish persists an independent comparison-seen flag in VS Code global state and webview state. Disposal cancels the pending animation frame and tour polling.
- Validation: 35 tests passed across onboarding, comparison app and scroll-state suites; TypeScript, touched-file ESLint, diff whitespace checks and webpack passed. Browser verified settings scrolling to its bottom (328px overflow), first display, skip/reload persistence, manual reopening, pane auto-advance, Monitor/settings open-close progression and Escape from shortcut help to the final guide step. Screenshots: /tmp/ear-onboarding-review/tour.png and settings.png. Global host persistence is implemented/type-checked; the fixture browser uses webview-state persistence and excludes live VS Code IPC.

## Review handoff — 2026-10-16

**Status: implementation/design frozen; awaiting review before merge to main.**

- User accepted the current design. Further feature work is paused; merge remains a separate, post-review action.
- Preserve the complete comparison implementation already staged on this branch together with its UI follow-ups in a local review checkpoint. This includes the comparison host/analysis/export foundation that preceded the UI work.
- Updated the unreleased changelog, synchronized lockfile root versions to 0.6.0, and excluded `.tasks/**` from VSIX packaging. No release or publication performed.
- Final verification: TypeScript, full ESLint, full TypeScript formatting check, diff whitespace checks and all webpack targets passed. Full Jest run: 71 suites passed; 567 tests passed, 1 skipped. The initial in-band run exhausted Node's heap; the successful full run used `NODE_OPTIONS=--max-old-space-size=4096 npx jest --maxWorkers=2 --workerIdleMemoryLimit=512MB`.
- Review focus: shared styling regressions in single-file mode; comparison active/mute and export behavior; real VS Code Monitor/AutoEq/preset dialogs and global onboarding persistence. Browser fixture checks cover rendering and interaction, not live extension-host IPC.
- Temporary preview servers on ports 9340–9342 were stopped. Screenshots referenced above are temporary local evidence; no generated build output is tracked.
- Branch remains `task/unify-board-ui_2026-10-16_1`. Do not merge into main until review is complete.
