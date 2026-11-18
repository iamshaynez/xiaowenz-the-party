# 分支与发布规范

严格流程：

```text
main（仅生产发布）
  └── dev（集成分支）
        ├── feat/<short-name>
        │     └── PR + CI → dev
        ├── fix/<short-name>
        │     └── PR + CI → dev
        └── release/<version>
              └── PR + CI → main
```

## 规则

1. 所有功能和修复开发都必须从最新 `dev` 创建 `feat/*` 或 `fix/*`；不得从 `main`、旧功能分支或其他集成分支拉开发分支。
2. 功能、测试、文档和迁移在同一功能分支完成，一个分支只承载一项独立工作。
3. `main` 和 `dev` 都是受保护分支，包括管理员在内都不得直接 push、强推或删除；代码只能通过 PR 合入。
4. 两个受保护分支的必需审批人数均为 **0**，不强制其他审批人，但仍必须创建 PR 并等待 CI 完成。CI 只在 `pull_request` 触发（`check` 与按 spec 分片的 `e2e` 并行）；合入后的 push 不再重复验证，main 的部署由 `deploy-main.yml` 独立触发。
5. 功能 PR 目标必须是 `dev`，合并前必须通过 `pnpm check:all`，使用 squash merge 保持 dev 历史清晰。
6. 发布时从 `dev` 创建 `release/vX.Y.Z`，只接受文档、版本号和明确 release fix。
7. Release 只通过 PR 合入 `main`，使用 merge commit 保留发布边界。
8. 若 release 有修复，发布后必须将 `main` 合回 `dev`，避免修复丢失。
9. 紧急修复走 `hotfix/* → PR → main`，随后立即同步 dev，不得绕过 CI。
10. 远端已开启“合并后删除源分支”，PR 合并后不再保留对应的远程 feat、fix 或 release 分支。

## 本地标准流程

每次开发都从最新 `dev` 开始：

```bash
git switch dev
git pull --ff-only origin dev
git switch -c feat/<short-name>  # 修复则使用 fix/<short-name>
```

完成实现、测试和提交后，只推送功能分支并创建目标为 `dev` 的 PR：

```bash
git push -u origin feat/<short-name>
gh pr create --base dev
```

PR 合并后，同步远端并回到 `dev`；远端源分支由 GitHub 自动删除，本地分支确认已合并后删除：

```bash
git switch dev
git pull --ff-only origin dev
git fetch --prune origin
git branch -D feat/<short-name>  # squash merge 后，确认 PR 已合并再删除
```

每次任务完成提交、PR 合并和远端同步后，**本地当前分支必须停留在 `dev`**。下一次开发重新从 `dev` 创建新的 `feat/*` 或 `fix/*`，不复用旧分支。

## 提交信息

使用 Conventional Commits：`feat:`、`fix:`、`test:`、`docs:`、`chore:`、`refactor:`、`ci:`、`build:`。

功能提交保持“测试和对应实现同时可运行”的状态；开发过程中的 RED 证据保留在测试历史和 CI 日志，而不是提交无法运行的 main/dev。
