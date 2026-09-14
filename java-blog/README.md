# Blog Platform

全栈博客平台：Spring Boot + React + PostgreSQL + Redis + Kafka

## 项目结构

```
java-blog/
├── backend/          # Spring Boot 后端
├── frontend/         # React 前端
├── docker/           # Docker Compose 部署配置
└── k8s/              # Kubernetes 部署配置
```

## 快速启动

### Docker Compose（推荐本地开发）

```powershell
docker compose -f docker/docker-compose.yml up -d --build
```

访问：https://myblog.local

### Kubernetes

```powershell
kubectl apply -k k8s/
kubectl port-forward svc/frontend-svc -n blog-platform 5000:80
kubectl port-forward svc/backend-svc -n blog-platform 8080:8080
```

访问：http://localhost:5000

## 技术栈

| 层 | 技术 |
|---|---|
| 后端 | Java 25, Spring Boot 3.5, Spring Security, JPA |
| 前端 | React 19, TypeScript, Vite, Zustand |
| 数据库 | PostgreSQL 17 |
| 缓存 | Redis 7 |
| 消息队列 | Kafka (KRaft) |
| 部署 | Docker Compose / Kubernetes |
