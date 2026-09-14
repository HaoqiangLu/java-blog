# Docker Compose 部署

## 前置条件

- [Docker Desktop](https://www.docker.com/products/docker-desktop/) 已安装并运行
- 域名 `myblog.local` 已写入 hosts 文件（`127.0.0.1 myblog.local`）
- SSL 证书已生成（见 Part 8 文档）

## 一键启动

```powershell
cd java-blog
docker compose -f docker/docker-compose.yml up -d --build
```

## 访问

- HTTPS: https://myblog.local
- HTTP:  http://myblog.local

## 常用命令

```powershell
# 查看日志
docker compose -f docker/docker-compose.yml logs -f

# 停止（保留数据卷）
docker compose -f docker/docker-compose.yml down

# 停止并删除数据卷（清空数据库）
docker compose -f docker/docker-compose.yml down -v

# 重建某个服务
docker compose -f docker/docker-compose.yml up -d --build backend
```
