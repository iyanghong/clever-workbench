# 凭据与备份保护的实施边界

普通快照只返回账号元数据和已保存的秘密类型，不返回密文、解锁材料或明文。秘密操作通过独立的主进程接口；界面遮蔽不是权限检查。

本机秘密使用随机 256 位资料密钥和 AES-256-GCM，每次保存生成 96 位随机 nonce，认证标签为 128 位。关联数据绑定应用、格式版本、账号和秘密类型，防止密文挪到其他条目后被当作有效内容。资料密钥由主密码经 scrypt 派生的密钥加密保管；版本 1 参数固定为 N=131072、r=8、p=1，随机盐 16 字节，解密前限制长度与参数。实测耗时另记验证结果。

备份使用独立 RSA-3072 公钥封装每次随机生成的 AES 备份密钥，OAEP 显式选择 SHA-256。备份私钥由主密码派生密钥加密保存，导出时只需公钥；秘密锁定不会阻止导出，也不会让导出过程取得秘密资料密钥。恢复包携带备份生成时的密码保护材料，不能依赖原设备 Keychain 或 DPAPI。

主密码变更时生成新资料密钥和新备份密钥对，重新加密当前秘密，事务提交全部新材料。既有备份保留自己的旧保护材料。这个选择避免旧密码恢复得到的资料密钥继续读取变更后的秘密，也避免旧备份私钥解密新备份。

会话只保留秘密资料密钥，锁定清除 Buffer 并撤销访问。异步初始化／解锁使用操作代次；操作期间发生锁定时，不允许迟到结果重新解锁。UI 在锁定事件中清除已显示的秘密。剪贴板由可信主进程中的顺序队列管理，不通过普通复制接口读出秘密。

采用 Node 24.22 自带密码原语，不实现密码算法。参考：[Node scrypt](https://nodejs.org/docs/latest-v24.x/api/crypto.html#cryptoscryptpassword-salt-keylen-options-callback)、[AES-GCM API](https://nodejs.org/docs/latest-v24.x/api/crypto.html#cryptocreatecipherivalgorithm-key-iv-options)、[RSA OAEP API](https://nodejs.org/docs/latest-v24.x/api/crypto.html#cryptopublicencryptkey-buffer)。系统锁屏事件参考 [Electron powerMonitor](https://www.electronjs.org/docs/latest/api/power-monitor)。

参数选择参考 [OWASP 的 scrypt 建议](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html#scrypt)，使用约 128 MiB 工作内存，运行时上限为 256 MiB。

## macOS 参数校准

2026-10-18，Apple Silicon、应用所用 Electron 44.9.0 / Node 24.22.0，N=131072、r=8、p=1 连续三次耗时为 280、284、287 ms。由 `scripts/calibrate-crypto.mjs` 在 Electron 的 Node 模式实测，采用虚构固定输入。Windows 的对应数值在目标平台验收时补充。

## 会话与异步剪贴板

闲置按应用内真实交互更新时间；锁屏与休眠事件直接锁定。访问秘密本身再次检查过期，避免定时器尚未执行时绕过 15 分钟边界。锁定会撤销正在等待的解锁结果。

Electron 44 的剪贴板读写返回 Promise。秘密复制、普通复制和到期清理共用顺序队列；锁定递增操作代次，复制写入迟到时再次检查代次并清除仍属于该次复制的值。普通复制会撤销秘密清理计时。默认 30 秒只清理仍等于本次秘密的内容，不清理后来复制的其他文字。

带秘密的账号或资源副本通过独立接口创建，要求有效解锁。复制元数据、解密源秘密、按目标身份重新加密及保存均在同一数据库事务中；任一步失败回滚全部新身份。普通复制路径仍只复制明确列出的非秘密字段。

## 已验证的主密码轮换

变更时先验证当前主密码，生成全新资料密钥和备份 RSA 密钥对。密文与保护配置在一个 SQLite 事务中替换，成功后撤销会话；发生写入失败时保留全部旧材料。测试实际解包旧／新资料密钥并验证它们不同，旧资料密钥不能解当前秘密；旧包继续由旧密码恢复，新包拒绝旧密码。旧包恢复后可再次轮换。桌面入口在开始前协调保存，变更期间禁止其他写操作、备份或恢复；系统锁定取消尚未提交的变更。
