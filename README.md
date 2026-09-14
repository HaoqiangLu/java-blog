# Java 全栈博客项目（学习教程）

一个**边学边做**的全栈博客平台完整教程。从零搭骨架开始，按功能逐步叠加，最终做出一个包含用户认证、文章评论、实时聊天、AI 助手，并支持 Docker / Kubernetes 部署的现代 Web 应用。

本仓库由两部分组成：

| 目录 | 内容 |
|---|---|
| [`docs/`](docs/) | 分步教程文档（Part 1–9 + 技术原理深挖），**主线学习内容** |
| [`java-blog/`](java-blog/) | 与教程对应的完整代码实现（后端 + 前端 + 部署配置） |

> 教程采用「**功能驱动、依赖即用即加**」的组织方式：不是先把地基铺满，而是每做一个功能，缺什么依赖 / 数据库 / 配置才引入什么，让每一步都看得见动机。

---

## 技术栈

| 层 | 技术 |
|---|---|
| 后端 | Java 25、Spring Boot 3.5、Spring Security 6（JWT 无状态认证）、Spring Data JPA、Spring WebSocket |
| 前端 | React 19、TypeScript 5、Vite、React Router v7、TanStack Query、Zustand、TailwindCSS 4 |
| 数据库 | PostgreSQL 17（Flyway 迁移）、Redis 7（Token 黑名单 / Pub/Sub） |
| 消息队列 | Kafka（KRaft 模式） |
| 扩展 | AI 助手（Ollama / 本地代理）、Actuator + Micrometer 可观测性 |
| 部署 | Docker Compose、Kubernetes（Kustomize + Nginx Ingress + HPA）、GitHub Actions CI/CD |
| 开发工具 | IntelliJ IDEA、Maven 3.9、pnpm、Node.js 24、Git |

---

## 功能模块

- **用户认证**：注册 / 登录 / JWT 签发与刷新、Redis Token 黑名单、BCrypt 密码加密
- **文章与评论**：文章 CRUD、分页、全文搜索、Markdown 渲染、评论
- **实时聊天**：Spring WebSocket + Redis Pub/Sub 多实例广播、聊天室管理
- **前端应用**：React SPA、服务端状态管理、受保护路由、深色模式
- **安全加固**：CORS、XSS 防护、接口限流、安全响应头、方法级权限（`@PreAuthorize`）
- **功能扩展**：AI 聊天助手、Kafka 事件流、Actuator 监控指标
- **部署上线**：Docker 多阶段构建、docker-compose 一键启动、Kubernetes 集群部署、GitHub Actions 自动化流水线

---

## 文档阅读顺序

教程必须**按顺序阅读**，每个 Part 都在前一个基础上增量构建（依赖、配置、数据库迁移、安全白名单都随功能逐步引入）。

| 顺序 | 文档 | 内容 |
|---|---|---|
| 0 | [idea-configuration.md](docs/idea-configuration.md) | IDE 环境配置（前置准备） |
| 1 | [part1-environment-and-skeleton.md](docs/part1-environment-and-skeleton.md) | 工具安装 + 最小 Spring Boot 骨架（可直接启动） |
| 2 | [part2-user-auth.md](docs/part2-user-auth.md) | 用户认证：Postgres + JPA + Flyway + Security + JWT + Redis |
| 3 | [part3-posts-and-comments.md](docs/part3-posts-and-comments.md) | 文章与评论：建表 + Service/Controller + 放行接口 |
| 4 | [part4-websocket-chat.md](docs/part4-websocket-chat.md) | WebSocket 实时聊天 + Redis Pub/Sub |
| 5 | [part5-frontend.md](docs/part5-frontend.md) | 前端初始化（Vite/pnpm）+ React 完整实现 |
| 6 | [part6-security.md](docs/part6-security.md) | 限流 / XSS / 前端校验等安全加固 |
| 7 | [part7-extensions.md](docs/part7-extensions.md) | 可观测性 + Kafka + AI 功能扩展 |
| 8 | [part8-deployment-cicd.md](docs/part8-deployment-cicd.md) | Docker 构建 + docker-compose + Nginx + GitHub Actions |
| 9 | [part9-kubernetes.md](docs/part9-kubernetes.md) | Kubernetes 部署方案（Part 8 的集群升级替代方案，可选） |

**辅助文档**

- [technical-deep-dive.md](docs/technical-deep-dive.md)：每项技术的原理详解，遇到不理解的技术时随时查阅。
- [docs/summary/](docs/summary/)：阶段性复盘总结。

> Part 8（Docker Compose）与 Part 9（Kubernetes）是同一部署目标的两种方案，**二选一即可**。

---

## 快速启动

代码位于 [`java-blog/`](java-blog/)，两种本地运行方式：

### Docker Compose（推荐本地开发）

```powershell
cd java-blog
docker compose -f docker/docker-compose.yml up -d --build
```

访问：<https://myblog.local>

### Kubernetes

```powershell
cd java-blog
kubectl apply -k k8s/
# 需两个终端分别运行
kubectl port-forward svc/frontend-svc -n blog-platform 5000:80
kubectl port-forward svc/backend-svc  -n blog-platform 8080:8080
```

访问：<http://localhost:5000>

更多部署细节见 [`java-blog/docker/README.md`](java-blog/docker/README.md) 与 [`java-blog/k8s/README.md`](java-blog/k8s/README.md)。

---

## 目录结构

```
blog-project/
├── README.md              # 本文件
├── docs/                  # 教程文档（Part 1–9 + 技术深挖 + 复盘总结）
└── java-blog/             # 代码实现（Git 仓库根）
    ├── backend/           # Spring Boot 后端（Maven）
    ├── frontend/          # React 前端（pnpm）
    ├── docker/            # Docker Compose 部署配置
    ├── k8s/               # Kubernetes 部署配置
    ├── nginx/             # Nginx 反向代理 + 本地 HTTPS 证书
    └── deploy/            # Kafka topic 等部署资源
```

---

## 学习建议

1. 先按 **Part 1** 装好环境、跑通最小骨架，确认工具链正常。
2. 严格按顺序推进，**每个 Part 结束后自己动手复现**，而不是只复制代码。
3. 遇到不理解的技术名词，去 [technical-deep-dive.md](docs/technical-deep-dive.md) 查原理。
4. 阶段完成后阅读 [docs/summary/](docs/summary/) 里的复盘，把一条链路从头讲一遍以巩固记忆。
