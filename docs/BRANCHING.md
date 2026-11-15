# 分支与发布规范

严格流程：

```text
main（仅生产发布）
  └── dev（集成分支）
        └── feat/<short-name>
              └── PR + CI + review → dev
                    └── release/<version>
                          └── PR + CI + release review → main
```

## 规则

1. 从最新 `dev` 创建 `feat/*`。
2. 功能、测试、文档和迁移在同一功能分支完成。
3. 功能只通过 PR 进入 `dev`；不得直接 push 集成代码。
4. PR 必须通过 `pnpm check:all`， squash merge 保持 dev 历史清晰。
5. 发布时从 `dev` 创建 `release/vX.Y.Z`，只接受文档、版本号和明确 release fix。
6. Release 只通过 PR 合入 `main`，使用 merge commit 保留发布边界。
7. 若 release 有修复，发布后必须将 `main` 合回 `dev`，避免修复丢失。
8. 紧急修复走 `hotfix/* → PR → main`，随后立即同步 dev，不得绕过 CI。

## 提交信息

使用 Conventional Commits：`feat:`、`fix:`、`test:`、`docs:`、`chore:`、`refactor:`、`ci:`、`build:`。

功能提交保持“测试和对应实现同时可运行”的状态；开发过程中的 RED 证据保留在测试历史和 CI 日志，而不是提交无法运行的 main/dev。
