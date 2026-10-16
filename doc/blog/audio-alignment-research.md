# Alignment research sources / 对齐研究源码

[English article](audio-alignment-dsp.en.md) · [中文文章](audio-alignment-dsp.md) · [Product usage / 产品用法](../audio-alignment.md)

The complete research project is included in [doc/research/audio-alignment](../research/audio-alignment/). It comes from commit `e1d8526736c04f1932c62edeaa8a85a7ef7ba41e`; the [source manifest](../research/audio-alignment/source.json) records original and public-copy hashes. The algorithm, pinned baseline, tests, ablation variants and recorded results are retained. Only the archive README and the input-preparation helper were adjusted to clarify scope and remove personal paths. These research files are excluded from the extension package.

完整研究项目已放入 [doc/research/audio-alignment](../research/audio-alignment/)，普通克隆不需要另取未公开分支。[源码清单](../research/audio-alignment/source.json)保存原始与公开副本哈希。算法、固定基线、测试、消融变体和结果保持原样；仅调整归档 README 与素材准备脚本，说明范围并移除本机路径。研究文件不进入插件安装包。

## Run synthetic tests / 运行合成测试

Requires Node.js 24 or later. From the repository root / 从仓库根目录执行：

```sh
cd doc/research/audio-alignment
npm test
```

## Reproduce audio experiments / 复现音频实验

The preparation helper uses macOS `afconvert`. Supply your own directory containing `A.mp3`–`D.mp3` explicitly. Real-audio evaluation and timing require these files; they are not included in Git. The frozen ablation manifest checks the original PCM hashes, so replacement recordings cannot verify the historical figures. Use a separate copy of the snapshot to run new experiments, because the commands can overwrite result files. Do not regenerate the frozen manifest to make old results validate new inputs.

素材准备脚本使用 macOS `afconvert`，必须显式传入含 `A.mp3`–`D.mp3` 的目录。真实音频评估与计时需要未入库的素材；冻结的消融清单校验原始 PCM 哈希，替换录音不能验证历史数字。命令会写入结果，重新实验请使用快照的独立副本，不要通过重建冻结清单让旧结果匹配新输入。

[Research README / 研究说明](../research/audio-alignment/README.md) · [Ablation protocol / 消融说明](../research/audio-alignment/ablation/README.md) · [Pinned baseline / 基线来源](../research/audio-alignment/vendor/source.json)

Historical algorithm comparisons use audioscope 1.1.8; the separate extension capability survey uses 1.1.7. / 算子实验以 audioscope 1.1.8 为基线，插件能力对比使用 1.1.7，两者口径不同。

Current integration evidence / 当前集成验证：[318-case parity](../metrics/alignment/parity.json) · [Browser](../metrics/alignment/browser.json) · [Native VS Code](../metrics/alignment/native.json).
