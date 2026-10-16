# VS Code / Cursor 音频插件对比

[English](comparison.md) · [中文 README](../README.zh-CN.md) · [English README](../README.md)

核对日期：**2026-10-16**。只比较编辑器内的音频插件，不纳入独立 App。表内竞品均为 VS Code 插件；本轮没有逐个安装到 Cursor 验证兼容性。下列 EAR 实测数据来自当日记录的 **0.6.0 测试构建**，其他插件使用表中的已发布版本。

EAR 的自动对齐需用户确认应用，仅支持同采样率整数固定延迟，可重置，不处理时钟漂移。应用后分析与导出使用会话副本；监听设置仍独立。[范围与验证](audio-alignment.md)。

## 工作流对比

| 插件 / 版本 | 比较方式 | 分析与监听 | 主要场景 |
| --- | --- | --- | --- |
| **EAR 0.6.0（历史测试构建）** | 最多八文件并行播放；STFT 时间 / 频率联动缩放 | Live FFT/CQT 叠加、立体声场与相位相关度；LUFS/F0/起音；AutoEq 监听 | 比较渲染结果，定位频谱、声像与响度差异 |
| [audio-preview 2.6.0](https://marketplace.visualstudio.com/items?itemName=sukumo28.wav-preview) | 单文件波形、频谱与拖选缩放 | 编辑器内播放、文件信息 | 基础试听与查看 |
| [Audio Player 0.1.4](https://marketplace.visualstudio.com/items?itemName=huachao.audio-player) | 多文件波形，共用播放时钟 | Raw PCM 参数；中英文界面 | 试听与波形比较 |
| [WaveExplorer 0.1.4](https://marketplace.visualstudio.com/items?itemName=jojonki.wave-explorer) | 单文件内波形与频谱联动 | Worker 计算线性 / Mel STFT；选区循环 | 波形与 Mel 频谱检查 |
| [SpecView 0.2.2](https://marketplace.visualstudio.com/items?itemName=sunxingwei.specview) | 自动分组、A/B 切轨、组内联动缩放 | Tar 音频、JSON 元数据；可选 527 类音频分类 | 模型输出的批量检查 |
| [audioscope 1.1.7](https://marketplace.visualstudio.com/items?itemName=YongsooIm.audioscope) | 双文件 A/B 对齐、增益匹配、残差与频谱差值 | LUFS/LRA/真峰值；MFCC/尺度图/色度图；四种格式导出 | 精细的成对差异分析 |
| [AudioLens 1.10.0](https://marketplace.visualstudio.com/items?itemName=simzhou.audiolens) | 单文件多声道分轨，静音 / 独奏与增益 / 声像 | Raw PCM、Kaldi Ark、文件头、选区指标与 Remote SSH | 语音数据集与原始信号排查 |

表格只概括对应版本的发布者 README；没列出的能力记为“未核实”，不等于不存在。[来源快照](metrics/plugin-catalog.json)保存插件 ID、版本、带版本的官方 README 地址、正文 SHA-256 和包体积响应；[结构化对比](metrics/plugin-comparison.json)保存本表口径。

## 能力对比

README 从六款插件中选取原版 audio-preview、以波形比较为主的 Audio Player，以及以双文件 A/B 分析为主的 audioscope。表格比较固定版本正式包中可使用的功能；✓ 表示支持，— 表示该版本没有提供这项功能的操作入口与实现。

| 能力 | **EAR 0.6.0** | audio-preview 2.6.0 | Audio Player 0.1.4 | audioscope 1.1.7 |
| --- | :---: | :---: | :---: | :---: |
| 波形与 STFT 频谱图 | ✓ | ✓ | 仅波形 | ✓ |
| 同屏文件比较 | **8 份并行** | 单文件 | 多文件 | 双文件 A/B |
| 跨文件 STFT 联动缩放 | ✓ | — | — | ✓ |
| 多轨实时频谱叠加 | ✓ | — | — | — |
| 实时 FFT / CQT 与峰值保持 | ✓ | — | — | — |
| 立体声场图 | ✓ · 3 种模式 | — | — | — |
| 逐频段立体声相关度 | ✓ | — | — | — |
| LUFS / LRA / 真峰值 | ✓ | — | — | ✓ |
| 基频与起音时间线 | ✓ | — | — | — |
| L/R 与 M/S 实时 RMS／峰值电平表 | ✓ | — | — | — |
| L/R/M/S 声道监听 | ✓ | — | — | — |
| 五频段独听 | ✓ | — | — | — |
| AutoEq 耳机频响校正 | ✓ | — | — | — |
| 选区 WAV 导出 | ✓ | ✓ | — | ✓ |
| 共用选区 RMS 电平匹配 | ✓ | — | — | ✓ |
| 同采样率残差 RMS／峰值 | ✓ | — | — | ✓ |
| 耳机 EQ 写入 WAV 导出 | ✓ | — | — | — |
| 自动时间对齐 | ✓ | — | — | ✓ |

这里的逐频段相关度指同一文件 L/R 声道间的立体声相关度，区别于 audioscope 用于 A/B 对齐的跨文件相关计算；其选区频谱也不等同于实时 FFT/CQT 分析。Audio Player 的多文件波形比较照实列出，本表不据发布者的同步播放描述推导共用时钟。audioscope 将 A/B/差值放入共用分析会话，使用统一的频谱设置，按支持 STFT 联动查看计；原版 audio-preview 也支持选区 WAV 导出。

“—”结合正式包的界面、分析模式和播放路由核对，未将 README 中没有提及直接视为不支持。证据文件保存包哈希、入口文件哈希、代码位置与逐行依据；EAR 的监听和特征分析能力以当前源码核对。[矩阵与核对记录](metrics/capability-matrix.json)。

## 本项目可以明确表达的优势

- **八份音频，共用一套诊断视图。** 八文件并行播放，STFT 同步缩放时间和频率，Live Spec 叠加每份音频的频谱、声场和频率相关度。相对 audioscope 文档中的双文件比较，EAR 可以同时观察八个来源；EAR 也支持 RMS 电平匹配与同采样率残差测量；EAR 现支持可重置的同采样率整数固定延迟对齐；audioscope 另有残差试听与导出。
- **听到什么和分析什么分别控制。** 静音的参与轨道仍可参与分析（应用 Align 后使用对齐副本）；L/R/M/S、五频段独听和 AutoEq / 导入式耳机校正用于监听。主音量不写入导出文件，耳机校正可在导出时单独勾选，适合在不同渲染版本之间稳定地检查差异。
- **频谱、声像、动态集中查看。** 一套界面内提供 Live FFT/CQT、相位相关度、LUFS/LRA/真峰值和 F0 / 起音时间线。audioscope 同样有响度分析，SpecView 和 Audio Player 同样有文件比较；不能把这些单项能力说成独占。

EAR 的比较上限是八份单声道 / 立体声音频，解码后的 PCM 会保留在内存。SpecView 的批量文件和压缩包流程、AudioLens 的 Raw / Kaldi / 多声道检查、audioscope 的残差分析和多格式导出，都有实际价值。本表不据此给出“唯一”“最快”“最小”或音质排名。

## 仓库原有 benchmark 全套结果

这轮按现有 **bench/** 流程执行，保留 **15 个原有用例**的输入、预热次数、采样次数和门禁阈值。[测试源码](../bench/benchmark.ts) · [测试流程与复现说明](../bench/plugins/README.md)。

| 原有用例 | mean (ms) | p95 (ms) | ops/s | 相对 16.67 ms | 净堆变化 KiB/op |
| --- | ---: | ---: | ---: | ---: | ---: |
| goertzelCqt.pazFrame4096 | 0.0925 | 0.0952 | 10,806 | 0.56% | 0.6 |
| quinticBSplineSmooth.300 | 0.0013 | 0.0025 | 796,533 | 0.01% | 0.8 |
| akimaResample.128to300 | 0.0060 | 0.0078 | 167,943 | 0.04% | 10.9 |
| liveBallistics.emaFrame300 | 0.0005 | 0.0006 | 1,822,257 | 0% | 0.7 |
| spectralPeakDisplay.frame300 | 0.0026 | 0.0032 | 378,128 | 0.02% | 10 |
| stereoPolarField.instant4096x64 | 0.0215 | 0.0363 | 46,414 | 0.13% | 46.2 |
| eqCanvasMath.curve300plus10band | 0.0768 | 0.0828 | 13,019 | 0.46% | 69.9 |
| phaseCorrelation.fft2048 | 0.0624 | 0.0984 | 16,013 | 0.37% | 69 |
| anim.fftFramePrep.1024to300 | 0.0628 | 0.0981 | 15,924 | 0.38% | 1.3 |
| pipeline.stftFrames.3s.w4096h1024 | 3.1938 | 5.7870 | 313 | 19.16% | 74.1 |
| pipeline.sequenceFeatures.3s.hop20ms | 0.8239 | 1.7069 | 1,214 | 4.94% | 96.3 |
| io.wavEncode.stereo5s48k | 2.6462 | 2.9569 | 378 | 15.88% | 88.1 |
| io.stftWireToSpectrogram.500x1024 | 0.5994 | 1.2740 | 1,668 | 3.6% | 843.6 |
| render.oouraSpectrogram.3s.w1024h80 | 24.5753 | 25.7648 | 41 | 147.45% | 4799.6 |
| render.spectrogramTexFlatten.1755x2048 | 2.5114 | 3.4190 | 398 | 15.07% | 19.1 |

表格取修复后三轮串行测试的第 2 轮，环境为 Apple M5 Pro / macOS arm64 / Node 24.9.0，开启 GC。微秒级结果包含测试框架开销。“相对 16.67 ms”只是数值参考，不能要求整段离线分析每个动画帧都完成。净堆变化受 GC 影响，不是精确分配量或峰值内存。两个 pipeline 用例使用 **stub Essentia**，只隔离分帧与控制开销；纹理展开测的是 CPU 上传缓冲准备，不是完整 GPU 绘制，不能据此宣传完整 FFT / F0 / GPU 性能。

仓库锁定基线使用 **Node 26.0.0**。本次跟进前，首次运行有四项门禁失败，串行复测仍有 B-spline 和 polar bins 两项失败；审查前的不可变提交 06705d4 在同一 Node 24.9.0 下也复现了这两项较慢的实现。此前结果原样保留：[首次运行](metrics/repository-bench.json)、[复测](metrics/repository-bench-repeat.json)、[同环境旧提交](metrics/repository-bench-06705d4.json)、[原门禁日志](metrics/repository-bench-context.json)。

**两项失败现已修复。** B-spline 只在首尾两个输出处理边界，内部循环保持原有算术顺序。极坐标 RMS 直接累加平方模长，省去先做 hypot 归一化、开方再平方的往返；Float32 采样的平方不会使 JS double 中间值上下溢出。角度分箱、Float32 累加和邻域扩散保持原逻辑。

| 原有用例 | 同环境修复前 | 修复后三轮 mean | 历史门禁上限 |
| --- | ---: | ---: | ---: |
| quinticBSplineSmooth.300 | 0.0042 ms | 0.0011 / 0.0013 / 0.0013 ms | 0.00193 ms |
| stereoPolarField.instant4096x64 | 0.0298 ms | 0.0217 / 0.0215 / 0.0235 ms | 0.02591 ms |

每轮均完整执行 **15 个原有用例**，三轮均通过未修改的历史速度及包体门禁；输入、预热次数、采样次数、阈值和锁定基线均未改动。这是实际优化内核，不能据此说此前失败单纯由 Node 版本造成。数值语料中，**132 组 B-spline 输入（66,384 个输出）**和 **4,096 帧极坐标输入（158,887 个输出）**均与不可变旧源码逐字节一致，覆盖短数组、静音、门限附近、反相与极端 Float32 尺度。保留了既有 Float32 累加器的溢出行为，不代表任意信号下的精度认证。[修复前](metrics/repository-bench-before-fix.json) · [第 1 轮](metrics/repository-bench-postfix-1.json) · [第 2 轮](metrics/repository-bench-postfix-2.json) · [第 3 轮](metrics/repository-bench-postfix-3.json) · [原因与完整门禁日志](metrics/benchmark-fixes.json) · [数值校验](metrics/live-kernel-validation.json)。

**发版前正确性修复：** 上述耗时和旧源码逐字节对照，是修复极坐标几何之前的历史记录。本版进一步统一分箱、投影与查询的方向，折叠负 Mid 半周期，并限制端点插值。这会有意改变原先错误的显示，因此冻结的 `liveKernelValidation.mjs` 极坐标旧值检查预期会拒绝新几何；原断言与基线保持不变。当前另行通过 **373 组几何检查**、**132 组 B-spline 逐字节检查**，以及**在正确几何下与 hypot 参考比较的 4,096 组能量逐字节检查**，不再声称与旧错误几何的输出一致。[当前契约与严格数值检查](metrics/polar-geometry-validation.json)。

修正几何后的发版前最终运行，也通过 **15 项原有用例及速度／包体门禁**；其中极坐标用例为 0.0192 ms。这是回归检查，不是整体界面耗时或竞品性能结论。[最终完整结果](metrics/prerelease-benchmark.json)。

另外重跑了原生采样率比较引擎的 DSP 检查：相对 06705d4，**4,096 帧逐字节一致**；本次无计权 STFT、A 计权 STFT、短窗 STFT 和 Live 的吞吐比分别为 1.01×、1.15×、1.54× 和 1.10×。这是 EAR 改造前后对照，不是竞品排名。[本次原始结果](metrics/comparison-dsp-current.json)。

## 用原有 STFT 用例对比 audio-preview

直接运行现有 **render.oouraSpectrogram.3s.w1024h80**：**seed 19、3 秒单声道、48 kHz、周期 Hann、FFT 1024、hop 80、预热 2 次、采样 10 次**。适配器只导出原来的 buildCases / runCase，并把 AnalyzeService 换成固定到 [3edd1bc](https://github.com/sukumo28/vscode-audio-preview/blob/3edd1bc0761d026a2f24d96055ee7430365ba2aa/src/webview/services/analyzeService.ts) 的原版 **2.6.0** 实现；没有重写测试负载，也没有把 EAR 独有的 DSP 用例冒充竞品结果。

| 原有用例的两轮测量 | 原版 mean / p95 | EAR mean / p95 | 吞吐比 |
| --- | ---: | ---: | ---: |
| 1 | 31.49 / 46.26 ms | 24.55 / 27.52 ms | 1.28× |
| 2 | 30.05 / 36.43 ms | 24.92 / 29.65 ms | 1.21× |

本次包含完整端点。输出共 **921,600 个数值**（1,800 帧 × 512 bins），其中 **918,528 对有限值逐字节一致**；原版末尾六帧共 **3,072 个值非有限**，原因是尾端判断允许读取缓冲区之后的一个采样。EAR 没有非有限值。因此不能说“完整输出逐字节一致”。此前约 1.15× 的内部区间测试避开了这些端点，只保留为补充证据。[原用例完整结果](metrics/repository-upstream-stft.json) · [适配器](../bench/plugins/repositoryUpstream.mjs) · [此前内部区间测试](metrics/upstream-stft.json)。

## 下载并运行正式插件包

已将 **6 个竞品的固定版本 VSIX 完整下载、校验并安装运行**，与 EAR 本地包一起使用 **VS Code 1.111.0** 测试。每个插件用独立用户配置，禁用其他竞品插件；直接使用原始 Custom Editor、文件通信、解码器、Worker、播放图与渲染代码。测试控制器只调用真正的编辑器命令和界面按钮，不替换音频或分析结果，也不修改用户平时使用的编辑器配置。

真实 WAV 文件沿用仓库 3 秒单声道 / 5 秒立体声的种子与尺度，并增加 60 秒立体声，统一为 48 kHz PCM16。七个插件的 Webview 均为 **1392 × 886 CSS 像素、DPR 2**。首次打开单列保存；表格为 **三次关闭重开后的中位数**，终点是原生图表就绪再经过两个动画帧。播放沿用原集成测试的 **15 秒**窗口，要求播放位置前进且保持前台。

| 插件 | 3 s 单声道就绪 | 5 s 立体声就绪 | 60 s 立体声就绪 | 播放 RAF p95 |
| --- | ---: | ---: | ---: | ---: |
| EAR 0.6.0 | 143 ms | 196 ms | 246 ms | 9.2 ms |
| audio-preview 2.6.0 | 596 ms | 1088 ms | 1603 ms | 9.2 ms |
| Audio Player 0.1.4 | 70 ms | 71 ms | 129 ms | 10.1 ms |
| WaveExplorer 0.1.4 | 128 ms | 132 ms | 870 ms | 16.4 ms |
| SpecView 0.2.2 | 111 ms | 162 ms | 227 ms | 9.2 ms |
| audioscope 1.1.7 | 138 ms | 129 ms | 181 ms | 9.2 ms |
| AudioLens 1.10.0 | 72 ms | 87 ms | 255 ms | 9.2 ms |

本轮 60 秒文件，EAR 的预览约 **246 ms** 就绪，原版 audio-preview 约 **1,603 ms**。这是原生工作流数据，**不是等 FFT 参数的速度排名**：默认窗长、hop、混声、按需计算和画布尺寸不同。Audio Player 只显示波形；WaveExplorer 默认 Mel；EAR 与原版通过各自的原生按钮进入 STFT / analyze。上面的原有 STFT 用例才用于固定负载的计算对照。其他插件更快的预览结果同样保留在表里。

RAF p95 只衡量呈现帧间隔，不证明无音频卡顿、引擎精度或仪表刷新率。原始记录还包括长任务、renderer TaskDuration，以及 GC 后的 V8 堆和 backing storage；它们不含 Worker / 宿主 CPU，也不是整个编辑器的峰值 RAM。SpecView 第一次播放中切到了后台，该次不用于前台帧间隔比较，复测有效；audioscope 第一次就绪等待超时，原条件复测后完成，两次异常都保留。EAR 的快速关闭重开压力操作还出现过 **Webview is disposed** 通知，不能把本轮描述成无错误的生命周期测试。[完整试次、首次打开、界面状态与异常记录](metrics/editor-plugins.json)。

## 快速重开的生命周期修复

上面保留了早期截图／通知失败。用旧包重复同一流程，复现 **Webview is disposed**；修复后的正式 VSIX 在相同压力下记录到的**工作台通知为零**。流程为：**预览就绪后关闭 10 次，打开 25 ms 后关闭 20 次，最后重新打开并等待 25 秒**，超过 AutoEq 宿主 20 秒的超时窗口。最终预览仍就绪，最终 webview 未捕获到异常。普通预览的三组中位数为 **145 / 188 / 246 ms**，15 秒前台播放的 **RAF p95 为 9.2 ms**，播放位置正常前进。

原因是异步处理返回后访问了已销毁面板的 webview getter，错误回复又重复该访问，最终触发全局通知。现在回复和错误都检查原 webview 的生命周期，CONFIG 不再在关闭后转换 URI，发送 Promise 的拒绝会被处理，文档 watcher 和消息监听也会释放；旧面板的回复不会进入新面板。**13 项宿主回归测试全部通过**，覆盖延迟成功／失败、CONFIG、取消、STFT／特征／预设返回，以及有效面板的传输错误；最初的 8 项测试在修复前有 7 项失败。单测与真实宿主实测互为补充，这次有限压力测试不能证明所有时序都无竞争问题。[旧包／修复包哈希、完整状态、通知记录与测试日志](metrics/editor-lifecycle-fix.json)。

## 完整下载后的包体积

| 插件 | 实际 VSIX | 解包条目总量 | 文件数 |
| --- | ---: | ---: | ---: |
| EAR 0.6.0 | 3.44 MiB | 9.86 MiB | 21 |
| audio-preview 2.6.0 | 0.75 MiB | 1.78 MiB | 15 |
| Audio Player 0.1.4 | 0.81 MiB | 3.17 MiB | 24 |
| WaveExplorer 0.1.4 | 3.21 MiB | 3.41 MiB | 15 |
| SpecView 0.2.2 | 0.11 MiB | 0.25 MiB | 10 |
| audioscope 1.1.7 | 4.56 MiB | 10.74 MiB | 65 |
| AudioLens 1.10.0 | 0.24 MiB | 0.71 MiB | 28 |

现在使用完整 VSIX 的实际字节数，**逐文件 CRC 校验并保留 SHA-256**，不再只看 HEAD 响应。EAR 体积对应记录中的历史 0.6.0 测试包，不代表重新测量了最终发布包；其余是固定版本的已发布包；1 MiB = 1,048,576 字节。解包总量包含包内所有条目，不等于编辑器运行内存或额外按需下载。SpecView 的首次分类模型另行下载。多个插件小于 EAR，因此不写“同类最小”。[实际包哈希与 JS/WASM gzip 结果](metrics/downloaded-packages-postfix.json) · [发布者版本快照](metrics/plugin-catalog.json)。

## 复现

```sh
npm run bench -- --save /tmp/repository-bench.json
npm run bench:size -- --save /tmp/repository-bench.json
node bench/compare.mjs bench/baseline.json /tmp/repository-bench.json
node --expose-gc bench/plugins/repositoryUpstream.mjs --save /tmp/repository-upstream.json
node bench/plugins/prepare.mjs /tmp/ear-plugin-benchmark
node bench/plugins/editorBenchmark.mjs /tmp/ear-plugin-benchmark
node bench/plugins/packageAudit.mjs /tmp/ear-plugin-benchmark --save /tmp/packages.json
```

[完整准备方式、上游缓存准备和指标范围](../bench/plugins/README.md)。原始截图与日志留在外部测试目录，文档保存截图哈希和所有数值试次。原测试文件与锁定基线未修改。旧 tmp_files 里的模拟绘图或外推结果不参与这轮结论；Cursor 没有单独实测，数据来自上述 VS Code 版本。

## 八文件与新增比较工具

八份完整录音并行播放，浏览器发布构建的画面帧间隔 P95 为 **16.8 ms**，Live 分析更新间隔 P95 为 **18.5 ms**；CQT 与连续交互另行复测。原生 VS Code 同时播放八轨、快速关闭／重开六次均通过，没有 dispose 通知。语料由四份 107–206 秒真实 MP3 各加载两份组成。

新增的共用选区 RMS 匹配只做衰减，应用于监听和导出；同采样率残差测量报告 RMS、峰值及相对能量。耳机 EQ 导出经过真实 OfflineAudioContext 验证。自动对齐已接入比较页：同采样率、整数固定延迟、前 60 秒内 ±2 秒搜索，手动确认应用，可重置并可选补偿极性。[使用限制](audio-alignment.md) · [技术文章](blog/audio-alignment-dsp.md)。

[完整验证记录](metrics/v060-capacity-and-tools.json)
