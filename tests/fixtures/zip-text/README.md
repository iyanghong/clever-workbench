# 旧工具兼容样例

`legacy-part.txt` 由原 `zip-to-txt-transfrom` 项目的 `encrypt_path` 于 2026-10-19 生成，分片上限为 1 MB。密码为公开测试值 `fixture-only-测试`，内容只有中文说明、16 字节二进制及空目录，不包含真实用户资料。

默认测试用此文件验证旧格式读取，无需安装 Python。真实双向互通测试通过 `ZIP_TOOL_REFERENCE` 和 `ZIP_TOOL_PYTHON` 指定原项目与 Python 环境，见 `docs/tools.md`。
