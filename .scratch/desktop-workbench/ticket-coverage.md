# 开发任务与需求覆盖表

来源：[正式需求规格](spec.md)，2026-10-18 确认版本；包含 82 条用户故事与 17 个测试场景。拆分总览见 [任务计划](ticket-plan.md)。

此表引用规格编号，避免重复复制需求正文。一个故事或场景可能跨多个任务；映射不表示任一单项能独自完成该故事的全部要求。规格变化后需重新核对映射。

拆分已确认，任务已发布并标记为 `ready-for-agent`。用户已明确授权实现，执行进度以各任务状态与验证记录为准。

## 用户故事

| 规格编号 | 对应任务 |
| --- | --- |
| US-01 | [01](issues/01-desktop-task-capture.md)、[21](issues/21-macos-personal-release.md)、[22](issues/22-windows-personal-release.md)、[23](issues/23-cross-platform-migration-acceptance.md) |
| US-02 | [01](issues/01-desktop-task-capture.md) |
| US-03 | [15](issues/15-workbench-home-quick-actions.md) |
| US-04 | [14](issues/14-global-search-actions.md) |
| US-05 | [14](issues/14-global-search-actions.md) |
| US-06 | [14](issues/14-global-search-actions.md)、[15](issues/15-workbench-home-quick-actions.md) |
| US-07 | [15](issues/15-workbench-home-quick-actions.md) |
| US-08 | [20](issues/20-theme-accessibility-preferences.md)、[21](issues/21-macos-personal-release.md)、[22](issues/22-windows-personal-release.md) |
| US-09 | [01](issues/01-desktop-task-capture.md)、[20](issues/20-theme-accessibility-preferences.md)、[21](issues/21-macos-personal-release.md)、[22](issues/22-windows-personal-release.md) |
| US-10 | [20](issues/20-theme-accessibility-preferences.md)、[21](issues/21-macos-personal-release.md)、[22](issues/22-windows-personal-release.md) |
| US-11 | [02](issues/02-project-task-lifecycle.md)、[03](issues/03-system-project-history.md) |
| US-12 | [03](issues/03-system-project-history.md) |
| US-13 | [03](issues/03-system-project-history.md) |
| US-14 | [03](issues/03-system-project-history.md)、[09](issues/09-documents-context-links.md) |
| US-15 | [04](issues/04-environment-service-deployment.md) |
| US-16 | [04](issues/04-environment-service-deployment.md) |
| US-17 | [04](issues/04-environment-service-deployment.md) |
| US-18 | [05](issues/05-resource-ledger-copy.md) |
| US-19 | [04](issues/04-environment-service-deployment.md)、[05](issues/05-resource-ledger-copy.md) |
| US-20 | [06](issues/06-multi-role-account-ledger.md) |
| US-21 | [06](issues/06-multi-role-account-ledger.md) |
| US-22 | [06](issues/06-multi-role-account-ledger.md) |
| US-23 | [04](issues/04-environment-service-deployment.md)、[06](issues/06-multi-role-account-ledger.md)、[15](issues/15-workbench-home-quick-actions.md) |
| US-24 | [05](issues/05-resource-ledger-copy.md)、[06](issues/06-multi-role-account-ledger.md) |
| US-25 | [05](issues/05-resource-ledger-copy.md)、[06](issues/06-multi-role-account-ledger.md) |
| US-26 | [13](issues/13-secret-copy-session-lock.md) |
| US-27 | [05](issues/05-resource-ledger-copy.md)、[06](issues/06-multi-role-account-ledger.md) |
| US-28 | [05](issues/05-resource-ledger-copy.md)、[06](issues/06-multi-role-account-ledger.md) |
| US-29 | [03](issues/03-system-project-history.md)、[05](issues/05-resource-ledger-copy.md)、[06](issues/06-multi-role-account-ledger.md) |
| US-30 | [01](issues/01-desktop-task-capture.md) |
| US-31 | [01](issues/01-desktop-task-capture.md) |
| US-32 | [02](issues/02-project-task-lifecycle.md) |
| US-33 | [02](issues/02-project-task-lifecycle.md) |
| US-34 | [07](issues/07-task-markdown-images-autosave.md) |
| US-35 | [01](issues/01-desktop-task-capture.md)、[02](issues/02-project-task-lifecycle.md) |
| US-36 | [01](issues/01-desktop-task-capture.md) |
| US-37 | [02](issues/02-project-task-lifecycle.md) |
| US-38 | [02](issues/02-project-task-lifecycle.md) |
| US-39 | [10](issues/10-project-archive-continuity.md) |
| US-40 | [10](issues/10-project-archive-continuity.md) |
| US-41 | [10](issues/10-project-archive-continuity.md) |
| US-42 | [02](issues/02-project-task-lifecycle.md)、[10](issues/10-project-archive-continuity.md) |
| US-43 | [11](issues/11-task-retrospective-timeline.md) |
| US-44 | [11](issues/11-task-retrospective-timeline.md) |
| US-45 | [11](issues/11-task-retrospective-timeline.md) |
| US-46 | [11](issues/11-task-retrospective-timeline.md) |
| US-47 | [11](issues/11-task-retrospective-timeline.md) |
| US-48 | [09](issues/09-documents-context-links.md) |
| US-49 | [09](issues/09-documents-context-links.md)、[15](issues/15-workbench-home-quick-actions.md) |
| US-50 | [08](issues/08-markdown-source-roundtrip.md) |
| US-51 | [07](issues/07-task-markdown-images-autosave.md)、[08](issues/08-markdown-source-roundtrip.md) |
| US-52 | [08](issues/08-markdown-source-roundtrip.md) |
| US-53 | [07](issues/07-task-markdown-images-autosave.md) |
| US-54 | [07](issues/07-task-markdown-images-autosave.md) |
| US-55 | [07](issues/07-task-markdown-images-autosave.md)、[09](issues/09-documents-context-links.md) |
| US-56 | [07](issues/07-task-markdown-images-autosave.md)、[09](issues/09-documents-context-links.md) |
| US-57 | [09](issues/09-documents-context-links.md)、[14](issues/14-global-search-actions.md) |
| US-58 | [09](issues/09-documents-context-links.md) |
| US-59 | [12](issues/12-vault-secret-roundtrip.md)、[16](issues/16-encrypted-backup-export-inspect.md) |
| US-60 | [12](issues/12-vault-secret-roundtrip.md)、[13](issues/13-secret-copy-session-lock.md) |
| US-61 | [13](issues/13-secret-copy-session-lock.md) |
| US-62 | [12](issues/12-vault-secret-roundtrip.md)、[13](issues/13-secret-copy-session-lock.md) |
| US-63 | [12](issues/12-vault-secret-roundtrip.md)、[13](issues/13-secret-copy-session-lock.md) |
| US-64 | [13](issues/13-secret-copy-session-lock.md) |
| US-65 | [12](issues/12-vault-secret-roundtrip.md)、[13](issues/13-secret-copy-session-lock.md) |
| US-66 | [12](issues/12-vault-secret-roundtrip.md) |
| US-67 | [19](issues/19-master-password-change.md) |
| US-68 | [12](issues/12-vault-secret-roundtrip.md) |
| US-69 | [16](issues/16-encrypted-backup-export-inspect.md)、[23](issues/23-cross-platform-migration-acceptance.md) |
| US-70 | [16](issues/16-encrypted-backup-export-inspect.md)、[17](issues/17-backup-restore-rollback.md)、[23](issues/23-cross-platform-migration-acceptance.md) |
| US-71 | [16](issues/16-encrypted-backup-export-inspect.md)、[18](issues/18-automatic-encrypted-backups.md) |
| US-72 | [18](issues/18-automatic-encrypted-backups.md) |
| US-73 | [16](issues/16-encrypted-backup-export-inspect.md)、[18](issues/18-automatic-encrypted-backups.md) |
| US-74 | [17](issues/17-backup-restore-rollback.md) |
| US-75 | [17](issues/17-backup-restore-rollback.md)、[23](issues/23-cross-platform-migration-acceptance.md) |
| US-76 | [17](issues/17-backup-restore-rollback.md)、[23](issues/23-cross-platform-migration-acceptance.md) |
| US-77 | [16](issues/16-encrypted-backup-export-inspect.md)、[17](issues/17-backup-restore-rollback.md)、[23](issues/23-cross-platform-migration-acceptance.md) |
| US-78 | [18](issues/18-automatic-encrypted-backups.md) |
| US-79 | [01](issues/01-desktop-task-capture.md) |
| US-80 | [01](issues/01-desktop-task-capture.md)、[15](issues/15-workbench-home-quick-actions.md) |
| US-81 | [07](issues/07-task-markdown-images-autosave.md)、[09](issues/09-documents-context-links.md) |
| US-82 | [01](issues/01-desktop-task-capture.md) |

## 测试场景

| 规格编号 | 对应任务 |
| --- | --- |
| T01 | [01](issues/01-desktop-task-capture.md)、[02](issues/02-project-task-lifecycle.md)、[07](issues/07-task-markdown-images-autosave.md)、[09](issues/09-documents-context-links.md)、[15](issues/15-workbench-home-quick-actions.md)、[21](issues/21-macos-personal-release.md)、[22](issues/22-windows-personal-release.md) |
| T02 | [03](issues/03-system-project-history.md)、[09](issues/09-documents-context-links.md)、[10](issues/10-project-archive-continuity.md) |
| T03 | [04](issues/04-environment-service-deployment.md)、[05](issues/05-resource-ledger-copy.md)、[06](issues/06-multi-role-account-ledger.md) |
| T04 | [03](issues/03-system-project-history.md)、[05](issues/05-resource-ledger-copy.md)、[06](issues/06-multi-role-account-ledger.md)、[09](issues/09-documents-context-links.md)、[15](issues/15-workbench-home-quick-actions.md) |
| T05 | [01](issues/01-desktop-task-capture.md)、[02](issues/02-project-task-lifecycle.md) |
| T06 | [02](issues/02-project-task-lifecycle.md)、[10](issues/10-project-archive-continuity.md) |
| T07 | [11](issues/11-task-retrospective-timeline.md) |
| T08 | [08](issues/08-markdown-source-roundtrip.md) |
| T09 | [07](issues/07-task-markdown-images-autosave.md)、[09](issues/09-documents-context-links.md)、[21](issues/21-macos-personal-release.md)、[22](issues/22-windows-personal-release.md) |
| T10 | [14](issues/14-global-search-actions.md) |
| T11 | [12](issues/12-vault-secret-roundtrip.md)、[13](issues/13-secret-copy-session-lock.md)、[19](issues/19-master-password-change.md)、[21](issues/21-macos-personal-release.md)、[22](issues/22-windows-personal-release.md) |
| T12 | [06](issues/06-multi-role-account-ledger.md)、[12](issues/12-vault-secret-roundtrip.md)、[13](issues/13-secret-copy-session-lock.md) |
| T13 | [16](issues/16-encrypted-backup-export-inspect.md)、[17](issues/17-backup-restore-rollback.md)、[18](issues/18-automatic-encrypted-backups.md)、[23](issues/23-cross-platform-migration-acceptance.md) |
| T14 | [16](issues/16-encrypted-backup-export-inspect.md)、[17](issues/17-backup-restore-rollback.md)、[19](issues/19-master-password-change.md)、[23](issues/23-cross-platform-migration-acceptance.md) |
| T15 | [18](issues/18-automatic-encrypted-backups.md) |
| T16 | [20](issues/20-theme-accessibility-preferences.md)、[21](issues/21-macos-personal-release.md)、[22](issues/22-windows-personal-release.md)、[23](issues/23-cross-platform-migration-acceptance.md) |
| T17 | [01](issues/01-desktop-task-capture.md)、[14](issues/14-global-search-actions.md)、[15](issues/15-workbench-home-quick-actions.md)、[21](issues/21-macos-personal-release.md)、[22](issues/22-windows-personal-release.md) |

