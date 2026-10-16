# Historical review archive

These files record development checks, including failed attempts. They are excluded from the VSIX. Their recorded timings and outcomes are historical; they are not a fresh release certification.

Public copies replace the original machine's checkout path with `<workspace>` in logs and JSON. Archived helper scripts resolve repository imports relative to their location and accept `EAR_PLAYWRIGHT_MODULE` instead of a personal runtime path. `public-paths.json` records before/after hashes for those changes. Numerical measurements, failure records and test assertions are retained.

历史审查材料不进入安装包。日志和 JSON 的本机目录替换为 `<workspace>`；辅助脚本改用相对目录及可配置的 Playwright 模块。路径替换的前后哈希保存在 `public-paths.json`，实验数字和失败记录不变。旧 Git 提交仍保留原始内容，本次未重写历史。
