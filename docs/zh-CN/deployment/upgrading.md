---
title: 升级 Sink
description: 通过同步 GitHub Fork 并重新部署来升级 Sink。
---

# 升级 Sink

## 升级前

1. 看一眼上游版本说明
2. 不要删除 Cloudflare 绑定、密钥和环境变量
3. 如果已配置 R2，可先手动[备份](/zh-CN/features/backups)

## 普通升级（当前 D1 部署）

1. 在 GitHub 打开你的 Fork → 点 **Sync fork** 同步最新 `master`。如果自己改过文件，先解决冲突
2. 在 Cloudflare（Workers Builds 或 Pages）重新部署更新后的 `master`
3. 等待部署完成（数据库更新会在部署过程中自动执行）

## 升级很旧的实例（链接只存在 KV 里）

此多租户分支不支持升级旧版 Sink。请按照[多租户部署](/multitenancy)使用全新资源。

## 升级后快速检查

- 能登录仪表盘
- 打开一次 **Dashboard → Links**（如需会完成存储初始化）
- 创建、打开、编辑、删除一个测试链接
- 若用了访问分析，确认能看到数据
