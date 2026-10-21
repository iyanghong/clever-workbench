# 操作指引模板使用说明

这些是[已确认规范](../operation-guidance.md)的配套编写模板。功能内容已接入离线阅读，实际目录、字段和入口参见[实现契约](implementation-contract.md)。包含占位文字的模板不进入安装包；发布生成与校验命令由相应实施任务补充，不能把模板或计划描述当作已实现流程。

## 功能指引

复制 [feature.template.json](feature.template.json)，替换标识、标题、用途、入口、步骤与结果。只列实际适用的平台；当前模板的 `darwin` 是 macOS 示例，并不表示其他功能仅支持 macOS。

准备条件与常见问题的 `items` 有内容时，`notApplicableReason` 留空。确实不适用时清空 `items` 并填写具体原因；二者都空视为未编写。

图片按需放入受控仓库资源目录；在相应步骤增加以下对象，路径只是格式示例，不是已存在的截图：

```json
{
  "image": {
    "src": "assets/example-step.png",
    "alt": "说明图片中与本步操作有关的内容",
    "caption": "按需填写图片补充说明"
  }
}
```

`entry.target` 与 `placements` 必须使用实现中已经登记的标识。不要填写 URL、系统路径、脚本或页面源码表达式；复杂对象背景交由受控入口处理。

## 发布说明

有操作变化用 [release-changed.template.json](release-changed.template.json)，没有操作变化用 [release-none.template.json](release-none.template.json)。每次发布必须二选一编写实际内容；不能通过选择 `none` 绕过未编写的操作说明。

人工核对部分据实填写，不自动填写用户身份或通过结果。下面是字段形式示例，仍含占位文字：

```json
{
  "review": {
    "status": "completed-with-gaps",
    "reviewer": "实际核对人",
    "checkedAt": "实际核对时间（含时区）",
    "source": "实际核对的源码 SHA 或版本",
    "environment": "实际运行平台、安装版或开发版、隔离资料情况",
    "checks": [
      {
        "guideId": "实际指引标识",
        "stepIds": ["实际步骤标识"],
        "result": "not-verified",
        "evidence": "说明未验证原因；已验证时记录相应证据"
      }
    ],
    "knownGaps": ["实际缺项及后续处理方式"]
  }
}
```

建议状态词：核对整体使用 `pending`、`completed`、`completed-with-gaps`；单项结果使用 `passed`、`failed`、`not-verified`、`not-applicable`。`completed` 不能覆盖尚未检查或失败的项目，`not-applicable` 必须说明原因。状态词是机器字段，面向用户显示中文。

维护者不必预填正式版本号。发布准备从实际版本计划产生版本和源码绑定；已有版本重跑始终使用该 tag 的记录。`review.source` 是实际核对来源，与生成的发布绑定分开保留；两者有差异时重新核对，不能自动篡改核对证据。

## 发布前核对清单

- [ ] 对比本次实际发布源码，列出用户可见操作变化。
- [ ] 为每项变化关联有效功能指引；无变化则写明原因。
- [ ] 首批逐项覆盖全部现有功能，包含次要菜单和失败／取消路径。
- [ ] 使用隔离示例资料核对入口、步骤、结果、平台和截图。
- [ ] 检查密码、备份、导出、删除与更新术语，避免承诺不存在的恢复能力。
- [ ] 检查历史引用、当前入口、图片替代文字及离线资源。
- [ ] 记录核对来源、环境、结果、证据和所有已知缺项。
- [ ] 确认内容及图片已经随源码提交到计划发布的远端提交。
- [ ] 查看本地与 CI 指引警告，确认 GitHub 摘要和安装包内容来源一致。

本清单规定编写与核对责任，尚未勾选或存在问题也不新增发布阻断；仍应如实保留警告及未完成记录。
