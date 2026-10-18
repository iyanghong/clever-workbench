# 后续实施

用户持续授权至完成，goal 保持 active。功能任务 01–20 已提交，21–23 未验收。

接下来完善打包与验证脚本、README 使用说明、编辑器按模块加载和应用图标；完成完整套件、实际 Mac 打包流程、Windows 可用环境运行和双向迁移。最终按 implement 要求运行 code-review 两轴审查、修复并提交。固定审查起点 d5167e4bde1881c39ee12ef7390fb12cc9cd7ed4。

Windows 11 x64 真实环境尚未取得。GitHub Actions windows-latest 是其他 Windows 版本时必须如实区分，不能把交叉打包或 Server runner 等同 Windows 11。

Playwright 命令保持顺序运行，避免共享 test-results 相互覆盖。多次真实密码派生／RSA 测试可需要 15–20 秒；最终套件应限制并行度，避免同时分配多份 128 MiB scrypt 工作内存造成非功能超时。
