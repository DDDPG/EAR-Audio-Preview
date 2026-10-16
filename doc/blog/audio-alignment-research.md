# Alignment research sources / 对齐研究源码

[English article](audio-alignment-dsp.en.md) · [中文文章](audio-alignment-dsp.md) · [Product usage / 产品用法](../audio-alignment.md)

The articles preserve experiments from `research/alignment-dsp-lab-20261016`, frozen at commit `e1d8526736c04f1932c62edeaa8a85a7ef7ba41e`. Their `dsp-lab/…` references identify paths in that snapshot, not files shipped on main. The research branch has not been published as part of this documentation update. Historical comparisons use audioscope 1.1.8; the separate extension capability survey uses 1.1.7.

文章保留研究阶段的实验，文中的 `dsp-lab/…` 路径对应上述固定提交，不是 main 的产品目录。本次整理没有推送研究分支。文章中的算子实验以 audioscope 1.1.8 为基线，插件能力对比文档则固定为 1.1.7，两者口径不同。

From a local repository containing that commit, inspect or extract the snapshot without changing main. 若本地仓库包含该提交，可查看或导出快照，不必切换 main：

```sh
git show e1d8526736c04f1932c62edeaa8a85a7ef7ba41e:dsp-lab/README.md
mkdir -p /tmp/ear-alignment-research
git archive e1d8526736c04f1932c62edeaa8a85a7ef7ba41e dsp-lab | tar -x -C /tmp/ear-alignment-research
```

A clone without that research commit cannot reproduce the archived experiments. Original local audio is also required for the frozen real-content timing checks and is not committed. See the extracted README and protocol before running the article's commands.

未取得该研究提交的克隆无法直接复现实验；冻结的真实素材计时还需要未入库的原始音频。执行文章命令前，请先阅读导出目录中的 README 与实验协议。

Current integration evidence / 当前集成验证：[318-case parity](../metrics/alignment/parity.json) · [Browser](../metrics/alignment/browser.json) · [Native VS Code](../metrics/alignment/native.json).
