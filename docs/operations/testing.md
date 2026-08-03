# 测试

EvoPilot 有三层验证。

## 单元测试

```bash
npm run test:unit
```

覆盖：

- 证据包汇总。
- 保护路径策略。
- 加权机会点评分。
- 影响面映射。
- 本地演进周期生成。

## 冒烟测试

```bash
npm run test:smoke
```

覆盖：

- 控制台静态资源存在。
- HTTP 服务可以启动。
- `/health` 返回 `UP`。
- 服务端根路径可以提供控制台。

## 功能闭环测试

```bash
npm run test:functional
```

覆盖：

```text
证据导入
-> 机会挖掘
-> 影响面映射
-> 计划生成
-> 评审门禁阻断交付
-> 用户确认
-> 执行交付
-> 发布报告
-> 学习记录
```

额外功能覆盖：

```text
API Token 校验
-> 项目注册
-> 汇总查询
-> 审计查询
```

## 完整检查

```bash
npm run check
```

该命令会执行构建、单元测试、冒烟测试和功能闭环测试。

## 故障恢复矩阵

```bash
npm run test:failure-recovery
```

该命令会构建项目，运行控制平面故障恢复测试和 loop-worker retry/fallback 测试，并写入：

```text
dist/test-matrix/failure-recovery-matrix.json
```

覆盖范围：

- 受保护 API 未授权请求返回 `401`、`UNAUTHORIZED` 和 `x-request-id`。
- source credential preflight 返回 `READ_ONLY`、`connect-github-account` 和 blockers。
- DevOps preflight 返回 `BLOCKED`、`configure-devops` 和 readiness evidence。
- 显式绑定缺失 Project LLM profile 时返回 `LLM_PROFILE_NOT_READY`、`BLOCKED`、`configure-llm-profile`。
- source closure preflight 返回 `FAIL`、`repair-credentials` 并记录 evidence。
- loop-worker 对瞬时 API 失败执行 retry。
- loop-worker 在 primary API base URL 不可用时使用 fallback base URL。

## Release Readiness

```bash
npm run release:ready
```

该命令只读检查当前仓库是否具备发布前置条件，并写入：

```text
dist/test-matrix/release-ready.json
```

它会检查版本、`CHANGELOG.md`、`docs/releases/<version>.md`、测试矩阵文档、CI workflows、PR artifacts workflow、release artifact scripts 和 `git diff --check`。它不会创建 tag、push、GitHub Release 或部署生产。

完整矩阵见 [Test Matrix](test-matrix.md)。

## GA 有负载稳定性证明

```bash
npm run release:soak:ga:active
```

该命令用于 GA release target 的稳定性证明。它不是空跑健康检查，会周期性执行真实 workload，默认 workload 是：

```bash
node scripts/release-matrix-project-loop.mjs
```

成功条件：

- EvoPilot `/health` 和 `/ready` 持续通过。
- code-upgrader `/health` 持续通过。
- 接入项目数、成功进化批次数、发布阻断和治理策略满足门禁。
- `runCount`、`codeUpgradeCount`、`pipelineCount` 相比基线达到配置的增长阈值。

默认 GA 窗口为 5400 秒，三类活动增量默认各不少于 5。如果没有真实活动增量，即使服务全程存活，也会以 `NO_ACTIVE_WORKLOAD` 失败退出，不会写入成功 soak report。可以通过环境变量调整窗口和阈值：

```bash
EVOPILOT_GA_SOAK_SECONDS=5400 \
EVOPILOT_GA_SOAK_WORKLOAD_INTERVAL_SECONDS=900 \
EVOPILOT_GA_SOAK_MIN_RUN_DELTA=3 \
EVOPILOT_GA_SOAK_MIN_CODE_UPGRADE_DELTA=3 \
EVOPILOT_GA_SOAK_MIN_PIPELINE_DELTA=3 \
npm run release:soak:ga:active
```
