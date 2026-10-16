# EAR Audio Preview · Development notes / 开发手记

Technical notes from building EAR Audio Preview: audio analysis, visualization and the decisions behind the product.

这里记录 EAR Audio Preview 开发中的技术总结与实践分享，涵盖音频分析、可视化及其设计取舍。

- **Audio alignment / 音频对齐** — Integer-delay estimation, polarity, rejection and ablation; now integrated in v0.6.0. 整数延迟估计、极性处理、拒绝条件与消融，已接入 v0.6.0。[English](audio-alignment-dsp.en.md) · [中文](audio-alignment-dsp.md) · [Usage / 用法](../audio-alignment.md)
- **CQT spectrum analyzer / CQT 频谱分析器** — PAZ-inspired frequency bands, curve rendering and calibration. 受 PAZ 启发的频带设计、曲线绘制与校准。[English](cqt-spectrum-analyzer.en.md) · [中文](cqt-spectrum-analyzer.md)
- **Anisotropic spectrogram rendering / 频谱图的各向异性渲染** — Keep transients sharp and harmonic lines smooth with WebGL2. 用 WebGL2 分别处理时间与频率方向的插值，保留瞬态边缘与谐波线条。[English](anisotropic-spectrogram-rendering.en.md) · [中文](anisotropic-spectrogram-rendering.md)

[EAR Audio Preview](../../README.md) · [中文介绍](../../README.zh-CN.md)
