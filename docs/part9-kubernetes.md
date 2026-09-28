# Part 9：Kubernetes 部署方案

> 基于 Part 8 的 Docker Compose 配置，将六个服务（PostgreSQL / Redis / Kafka / Backend / Frontend / Nginx）迁移到 Kubernetes。
> 所有 YAML 文件位于 `k8s/` 目录，按资源类型组织。

---

## Part 8 vs Part 9：两种部署方案的关系

Part 8（Docker Compose）和 Part 9（Kubernetes）解决的是同一个问题——“怎么把博客跑在服务器上”，只是规模不同：

- **Part 8 适合个人博客 / 开发环境**：一台机器，`docker-compose up` 一条命令启动所有服务
- **Part 9 适合生产级 / 企业级**：多台机器集群，自动扩缩容、滚动更新、服务发现

两者**逻辑上二选一即可，但不能同时运行**：Docker Desktop 的 Kubernetes 与 Docker Compose 共享同一个 Docker 引擎，两边同时跑会端口 / 资源冲突（如 Ingress Controller 绑 80/443 与 nginx 容器抢占）。切换前先执行 `docker compose down` 停掉 Part 8 的容器。本教程两个都写，是为了让你了解从单机到集群的完整路径。
如果你的目标只是“博客能跑起来”，做完 Part 8 就够了，Part 9 可以跳过。

---

## 9.0 环境准备（Kubernetes 本地练习）

> Part 8 的 Docker Desktop 你已经装好了。Part 9 额外需要两样东西：**kubectl**（K8s 命令行工具）和**本地 K8s 集群**。

### 9.0.1 安装 kubectl

```powershell
winget install Kubernetes.kubectl
```

安装后**重启 PowerShell**，验证：

```powershell
kubectl version --client
```

输出含 `Client Version: v1.x.x` 即成功。

### 9.0.2 启用本地 Kubernetes 集群

你已有 Docker Desktop，它**内置了 K8s 集群**，只需开启：

1. 打开 **Docker Desktop** → 右上角 **齿轮（Settings）**
2. 左侧选 **Kubernetes**
3. 勾选 **Enable Kubernetes**
4. 点 **Apply & restart**，等待 Docker Desktop 重启（底部状态栏显示绿色 "Kubernetes running"）

验证集群可用：

```powershell
kubectl cluster-info
```

看到 `Kubernetes control plane is running at ...` 即表示本地 K8s 已就绪。

> **说明**：Docker Desktop 内置的 K8s 是单节点集群，足够本地练习。生产环境通常用 `kubeadm`（自建）或云厂商托管服务（EKS / GKE / AKS）。

### 9.0.3 安装 Ingress Controller（必须）

> Docker Desktop 的 K8s **不自带 Ingress Controller**。没有它，Ingress 资源只是空配置，
> 域名访问会报 `ERR_CONNECTION_CLOSED`，前端 `/api` 请求也无法路由到后端。
> 企业级 K8s 集群均预装此组件，本地需手动安装。

```powershell
kubectl apply -f https://raw.githubusercontent.com/kubernetes/ingress-nginx/controller-v1.12.0/deploy/static/provider/cloud/deploy.yaml
```

等待就绪：

```powershell
kubectl get pods -n ingress-nginx -w
# 看到 ingress-nginx-controller 变为 1/1 Running 即可
```

安装后的架构（与 Docker Compose 的 Nginx 容器角色相同）：

```
浏览器 https://myblog.local
    │
    ▼
Ingress Controller (ingress-nginx)
    ├── /api/*  →  backend-svc:8080
    ├── /ws/*   →  backend-svc:8080
    └── /*      →  frontend-svc:80
```

---

## 9.1 目录结构

```
k8s/
├── namespace.yaml              # 命名空间
├── configmap.yaml              # 非敏感配置
├── secret.yaml                 # 敏感凭据（base64）
├── postgres/
│   ├── pvc.yaml                # PostgreSQL 持久卷
│   ├── deployment.yaml         # PostgreSQL 工作负载
│   └── service.yaml            # PostgreSQL 集群内服务
├── redis/
│   ├── pvc.yaml                # Redis 持久卷
│   ├── deployment.yaml         # Redis 工作负载
│   └── service.yaml            # Redis 集群内服务
├── kafka/
│   ├── pvc.yaml                # Kafka 持久卷
│   ├── deployment.yaml         # Kafka 工作负载（KRaft 模式，无 ZooKeeper）
│   └── service.yaml            # Kafka 集群内服务
├── backend/
│   ├── deployment.yaml         # 后端工作负载（含滚动更新策略）
│   ├── service.yaml            # 后端集群内服务
│   └── hpa.yaml                # 后端水平自动扩缩容
├── frontend/
│   ├── deployment.yaml         # 前端工作负载
│   └── service.yaml            # 前端集群内服务
├── ingress.yaml                # Nginx Ingress（替代原 Nginx 反向代理）
└── kustomization.yaml          # Kustomize 叠加配置
```

---

## 9.2 Namespace — 命名空间隔离

```yaml
# k8s/namespace.yaml
# [K8s] Namespace — 将博客平台所有资源隔离在独立命名空间，便于权限控制和资源清理
apiVersion: v1
kind: Namespace
metadata:
  name: blog-platform
  labels:
    app.kubernetes.io/part-of: blog-platform
    # [K8s] 标签用于 kubectl 按标签筛选资源：kubectl -n blog-platform get all
    team: backend
```

---

## 9.3 ConfigMap — 非敏感配置

```yaml
# k8s/configmap.yaml
# [K8s] ConfigMap — 存储非敏感配置项，类似 Docker Compose 中的 environment 非密码字段
# 与 Docker Compose 对比：相当于 .env 中 PG_HOST/REDIS_HOST 等服务发现变量
apiVersion: v1
kind: ConfigMap
metadata:
  name: blog-config
  namespace: blog-platform
  labels:
    app.kubernetes.io/part-of: blog-platform
data:
  # ---- PostgreSQL 连接配置 ----
  # [K8s] Service 名称即为 DNS 名 — postgres-svc.blog-platform.svc.cluster.local
  PG_HOST: "postgres-svc"
  PG_PORT: "5432"
  PG_DATABASE: "blogdb_prod"

  # ---- Redis 连接配置 ----
  REDIS_HOST: "redis-svc"
  REDIS_PORT: "6379"

  # ---- JWT 配置 ----
  # 注意：Spring Boot 自定义属性 app.jwt.* 需要通过 APP_JWT_* 环境变量名注入
  APP_JWT_EXPIRATION: "3600"
  APP_JWT_REFRESH_EXPIRATION: "604800"

  # ---- Kafka 连接配置 ----
  KAFKA_HOST: "kafka-svc"
  KAFKA_PORT: "9092"

  # ---- Spring Boot 应用配置 ----
  SPRING_PROFILES_ACTIVE: "prod"
  LOG_LEVEL: "warn"
  BACKEND_PORT: "8080"
  CORS_ORIGIN: "https://myblog.local"
```

---

## 9.4 Secret — 敏感凭据

```yaml
# k8s/secret.yaml
# [K8s] Secret — 存储敏感信息，base64 编码（非加密！生产环境应启用 etcd 加密）
# 与 Docker Compose 对比：相当于 .env 中的密码字段，但通过 K8s RBAC 控制访问
#
# ⚠️ 以下 base64 值仅为示例，生产环境必须替换为真实值
# 生成命令：echo -n 'your-password' | base64
apiVersion: v1
kind: Secret
metadata:
  name: blog-secret
  namespace: blog-platform
  labels:
    app.kubernetes.io/part-of: blog-platform
type: Opaque
data:
  # echo -n 'blog_prod_user' | base64
  pg-user: YmxvZ19wcm9kX3VzZXI=
  # echo -n 'Str0ng!P@ssw0rd' | base64
  pg-password: U3RyMG5nIVBAc3N3MHJk
  # echo -n 'R3d!sP@ss2024' | base64
  redis-password: UjN3IXNQQHNzMjAyNA==
  # ⚠️ JWT 密钥必须 ≥ 32 字符（256 bits），否则启动报 WeakKeyException
  # 生成命令（PowerShell）：
  #   $key = -join ((48..57)+(65..90)+(97..122) | Get-Random -Count 64 | ForEach-Object {[char]$_})
  #   [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($key))
  # 下面是一个 64 字符示例的 base64（生产环境必须替换）：
  # 原文: abcdefghijklmnopqrstuvwxyz0123456789ABCDEFGHIJKLMNOPQRSTUVwxyz
  jwt-secret: YWJjZGVmZ2hpamtsbW5vcHFyc3R1dnd4eXowMTIzNDU2Nzg5QUJDREVGR0hJSktMTU5PUFFSU1RVVnd4eXo=
```

> **生产环境安全建议**：
> - 启用 [etcd 加密](https://kubernetes.io/docs/tasks/administer-cluster/encrypt-data/) 保护 Secret 静态存储
> - 或使用外部密钥管理：HashiCorp Vault / AWS Secrets Manager / Sealed Secrets
> - 通过 CI/CD Pipeline 自动注入真实值，禁止手动编辑

---

## 9.5 PostgreSQL — 有状态服务

### 9.5.1 PersistentVolumeClaim

```yaml
# k8s/postgres/pvc.yaml
# [K8s] PVC — 持久化存储，Pod 删除后数据不丢失（类似 Docker Volume）
# 与 Docker Compose 对比：相当于 volumes: pg-data:/var/lib/postgresql/data
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: postgres-pvc
  namespace: blog-platform
  labels:
    app.kubernetes.io/name: postgres
spec:
  # [K8s] StorageClass — 本地 kind 集群用 standard（rancher.io/local-path）
  # 云环境改为对应类型（AWS: gp3, GCP: pd-ssd, 阿里云: alicloud-disk-ssd）
  storageClassName: standard
  accessModes:
    # [K8s] ReadWriteOnce — 只允许单个节点挂载（数据库场景标准）
    - ReadWriteOnce
  resources:
    requests:
      storage: 20Gi
```

### 9.5.2 Deployment

```yaml
# k8s/postgres/deployment.yaml
# [K8s] PostgreSQL Deployment — 单副本有状态服务
# 与 Docker Compose 对比：相当于 postgres service + healthcheck + resources
apiVersion: apps/v1
kind: Deployment
metadata:
  name: postgres
  namespace: blog-platform
  labels:
    app.kubernetes.io/name: postgres
    app.kubernetes.io/part-of: blog-platform
spec:
  replicas: 1  # [K8s] 数据库单副本 — 生产环境建议使用 StatefulSet + 主从复制
  selector:
    matchLabels:
      app.kubernetes.io/name: postgres
  template:
    metadata:
      labels:
        app.kubernetes.io/name: postgres
    spec:
      # [K8s] 优雅终止宽限期 — 给数据库 30 秒完成连接排空
      terminationGracePeriodSeconds: 30
      containers:
        - name: postgres
          image: postgres:17-alpine
          ports:
            - containerPort: 5432
              name: postgres

          # [K8s] 环境变量 — 从 ConfigMap 和 Secret 注入，类似 Docker Compose environment
          env:
            - name: POSTGRES_USER
              valueFrom:
                secretKeyRef:
                  name: blog-secret
                  key: pg-user
            - name: POSTGRES_PASSWORD
              valueFrom:
                secretKeyRef:
                  name: blog-secret
                  key: pg-password
            - name: POSTGRES_DB
              valueFrom:
                configMapKeyRef:
                  name: blog-config
                  key: PG_DATABASE
            - name: PGDATA
              value: "/var/lib/postgresql/data/pgdata"

          # [K8s] 资源限制 — 对应 Docker Compose deploy.resources.limits
          resources:
            requests:
              memory: "256Mi"
              cpu: "250m"
            limits:
              memory: "1Gi"
              cpu: "1000m"

          # [K8s] 存活探针 — 检测容器是否存活，失败则重启容器
          # 对应 Docker Compose healthcheck: pg_isready
          livenessProbe:
            exec:
              command:
                - pg_isready
                - -U
                - $(POSTGRES_USER)
            initialDelaySeconds: 30
            periodSeconds: 10
            timeoutSeconds: 5
            failureThreshold: 3

          # [K8s] 就绪探针 — 检测 Pod 是否可以接收流量，失败则从 Service 端点移除
          readinessProbe:
            exec:
              command:
                - pg_isready
                - -U
                - $(POSTGRES_USER)
            initialDelaySeconds: 10
            periodSeconds: 5
            timeoutSeconds: 3
            failureThreshold: 5

          # [K8s] 挂载持久卷 — 对应 Docker Compose volumes: pg-data
          volumeMounts:
            - name: postgres-storage
              mountPath: /var/lib/postgresql/data
            - name: init-scripts
              mountPath: /docker-entrypoint-initdb.d

      volumes:
        - name: postgres-storage
          persistentVolumeClaim:
            claimName: postgres-pvc
        - name: init-scripts
          configMap:
            name: postgres-init
            optional: true
```

### 9.5.3 Service

```yaml
# k8s/postgres/service.yaml
# [K8s] ClusterIP Service — 为 PostgreSQL 提供集群内 DNS 和负载均衡
# 与 Docker Compose 对比：相当于 networks: blog-network 中的服务发现
# 其他 Pod 通过 postgres-svc.blog-platform.svc.cluster.local:5432 访问
apiVersion: v1
kind: Service
metadata:
  name: postgres-svc
  namespace: blog-platform
  labels:
    app.kubernetes.io/name: postgres
spec:
  type: ClusterIP  # [K8s] 仅集群内可访问 — 数据库不暴露到外部
  ports:
    - port: 5432
      targetPort: 5432
      protocol: TCP
  selector:
    app.kubernetes.io/name: postgres
```

---

## 9.6 Redis — 缓存服务

### 9.6.1 PersistentVolumeClaim

```yaml
# k8s/redis/pvc.yaml
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: redis-pvc
  namespace: blog-platform
  labels:
    app.kubernetes.io/name: redis
spec:
  storageClassName: standard
  accessModes:
    - ReadWriteOnce
  resources:
    requests:
      storage: 5Gi
```

### 9.6.2 Deployment

```yaml
# k8s/redis/deployment.yaml
# [K8s] Redis Deployment — 单副本缓存服务
# 与 Docker Compose 对比：相当于 redis service + command + resources
apiVersion: apps/v1
kind: Deployment
metadata:
  name: redis
  namespace: blog-platform
  labels:
    app.kubernetes.io/name: redis
    app.kubernetes.io/part-of: blog-platform
spec:
  replicas: 1
  selector:
    matchLabels:
      app.kubernetes.io/name: redis
  template:
    metadata:
      labels:
        app.kubernetes.io/name: redis
    spec:
      terminationGracePeriodSeconds: 15
      containers:
        - name: redis
          image: redis:7-alpine
          # [K8s] 启动命令 — 对应 Docker Compose command 字段
          # 配置密码、AOF 持久化、内存上限和淘汰策略
          command:
            - redis-server
            - --requirepass
            - $(REDIS_PASSWORD)
            - --appendonly
            - "yes"
            - --maxmemory
            - "256mb"
            - --maxmemory-policy
            - allkeys-lru
          ports:
            - containerPort: 6379
              name: redis
          env:
            - name: REDIS_PASSWORD
              valueFrom:
                secretKeyRef:
                  name: blog-secret
                  key: redis-password

          resources:
            requests:
              memory: "128Mi"
              cpu: "100m"
            limits:
              memory: "512Mi"
              cpu: "500m"

          # [K8s] 存活探针 — redis-cli ping 返回 PONG 表示存活
          livenessProbe:
            exec:
              command:
                - redis-cli
                - -a
                - $(REDIS_PASSWORD)
                - ping
            initialDelaySeconds: 15
            periodSeconds: 10
            timeoutSeconds: 5

          # [K8s] 就绪探针
          readinessProbe:
            exec:
              command:
                - redis-cli
                - -a
                - $(REDIS_PASSWORD)
                - ping
            initialDelaySeconds: 5
            periodSeconds: 5

          volumeMounts:
            - name: redis-storage
              mountPath: /data

      volumes:
        - name: redis-storage
          persistentVolumeClaim:
            claimName: redis-pvc
```

### 9.6.3 Service

```yaml
# k8s/redis/service.yaml
apiVersion: v1
kind: Service
metadata:
  name: redis-svc
  namespace: blog-platform
  labels:
    app.kubernetes.io/name: redis
spec:
  type: ClusterIP
  ports:
    - port: 6379
      targetPort: 6379
      protocol: TCP
  selector:
    app.kubernetes.io/name: redis
```

---

## 9.7 Kafka — 消息队列（KRaft 模式）

### 9.7.1 PersistentVolumeClaim

```yaml
# k8s/kafka/pvc.yaml
# [K8s] PVC — Kafka 日志持久化存储
# 与 Docker Compose 对比：相当于 volumes: kafka-data:/tmp/kraft-combined-logs
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: kafka-pvc
  namespace: blog-platform
  labels:
    app.kubernetes.io/name: kafka
spec:
  storageClassName: standard
  accessModes:
    - ReadWriteOnce
  resources:
    requests:
      storage: 10Gi
```

### 9.7.2 Deployment

```yaml
# k8s/kafka/deployment.yaml
# [K8s] Kafka Deployment — KRaft 模式（无需 ZooKeeper），单副本
# 与 Docker Compose 对比：相当于 kafka service + 12 个环境变量 + healthcheck
apiVersion: apps/v1
kind: Deployment
metadata:
  name: kafka
  namespace: blog-platform
  labels:
    app.kubernetes.io/name: kafka
    app.kubernetes.io/part-of: blog-platform
spec:
  replicas: 1
  selector:
    matchLabels:
      app.kubernetes.io/name: kafka
  template:
    metadata:
      labels:
        app.kubernetes.io/name: kafka
    spec:
      terminationGracePeriodSeconds: 30
      containers:
        - name: kafka
          image: apache/kafka:latest
          ports:
            - containerPort: 9092
              name: kafka
            - containerPort: 9093
              name: controller

          # [K8s] KRaft 模式环境变量 — 对应 Docker Compose 中的 12 个 KAFKA_* 变量
          env:
            - name: KAFKA_NODE_ID
              value: "1"
            - name: KAFKA_PROCESS_ROLES
              value: "broker,controller"
            - name: KAFKA_LISTENERS
              value: "PLAINTEXT://:9092,CONTROLLER://:9093"
            - name: KAFKA_ADVERTISED_LISTENERS
              value: "PLAINTEXT://kafka-svc:9092"
            - name: KAFKA_CONTROLLER_LISTENER_NAMES
              value: "CONTROLLER"
            - name: KAFKA_LISTENER_SECURITY_PROTOCOL_MAP
              value: "CONTROLLER:PLAINTEXT,PLAINTEXT:PLAINTEXT"
            - name: KAFKA_CONTROLLER_QUORUM_VOTERS
              # [K8s] 单节点 KRaft 用 localhost（controller 和 broker 在同一容器）
              # 多节点集群才用 Service DNS 或 Pod IP
              value: "1@localhost:9093"
            - name: KAFKA_OFFSETS_TOPIC_REPLICATION_FACTOR
              value: "1"
            - name: KAFKA_TRANSACTION_STATE_LOG_REPLICATION_FACTOR
              value: "1"
            - name: KAFKA_TRANSACTION_STATE_LOG_MIN_ISR
              value: "1"
            - name: KAFKA_GROUP_INITIAL_REBALANCE_DELAY_MS
              value: "0"
            - name: KAFKA_NUM_PARTITIONS
              value: "3"

          resources:
            requests:
              memory: "256Mi"
              cpu: "250m"
            limits:
              memory: "1Gi"
              cpu: "1000m"

          # [K8s] 启动探针 — Kafka KRaft 模式初始化慢（格式化存储+选举），给足时间
          # 用 TCP 端口检查而非 kafka-broker-api-versions.sh（Java 命令每次启动 JVM 太慢）
          startupProbe:
            tcpSocket:
              port: 9092
            periodSeconds: 5
            timeoutSeconds: 5
            failureThreshold: 30  # 最多等 30×5=150 秒

          # [K8s] 存活探针 — 对应 Docker Compose healthcheck
          livenessProbe:
            tcpSocket:
              port: 9092
            initialDelaySeconds: 60  # startupProbe 通过后才开始，给额外缓冲
            periodSeconds: 15
            timeoutSeconds: 5
            failureThreshold: 5

          readinessProbe:
            tcpSocket:
              port: 9092
            initialDelaySeconds: 30
            periodSeconds: 10
            timeoutSeconds: 5

          volumeMounts:
            - name: kafka-storage
              mountPath: /tmp/kraft-combined-logs

      volumes:
        - name: kafka-storage
          persistentVolumeClaim:
            claimName: kafka-pvc
```

### 9.7.3 Service

```yaml
# k8s/kafka/service.yaml
# [K8s] Kafka ClusterIP Service — 集群内服务发现
# 与 Docker Compose 对比：相当于 networks: blog-network 中的 kafka 服务
apiVersion: v1
kind: Service
metadata:
  name: kafka-svc
  namespace: blog-platform
  labels:
    app.kubernetes.io/name: kafka
spec:
  type: ClusterIP
  ports:
    - port: 9092
      targetPort: 9092
      protocol: TCP
      name: kafka
    - port: 9093
      targetPort: 9093
      protocol: TCP
      name: controller
  selector:
    app.kubernetes.io/name: kafka
```

---

## 9.8 后端 — Spring Boot 服务

### 9.8.1 Deployment（含滚动更新策略）

```yaml
# k8s/backend/deployment.yaml
# [K8s] Backend Deployment — 双副本 + 滚动更新 + 资源限制
# 与 Docker Compose 对比：相当于 backend service × replicas:2 + depends_on
apiVersion: apps/v1
kind: Deployment
metadata:
  name: backend
  namespace: blog-platform
  labels:
    app.kubernetes.io/name: backend
    app.kubernetes.io/part-of: blog-platform
    app.kubernetes.io/version: "1.0.0"  # [K8s] 版本标签 — 用于滚动更新追踪
spec:
  replicas: 2  # [K8s] 双副本 — 对应 Docker Compose replicas: 2

  # [K8s] 滚动更新策略 — 核心！零停机部署
  # 与 Docker Compose 对比：Docker Compose 无内建滚动更新，需手动操作
  strategy:
    type: RollingUpdate
    rollingUpdate:
      # [K8s] 滚动更新时最多超出期望副本数的 Pod 数
      # maxSurge=1 表示更新期间最多 3 个 Pod（2 正常 + 1 新）
      maxSurge: 1
      # [K8s] 滚动更新时最多不可用的 Pod 数
      # maxUnavailable=0 表示更新期间始终保持 2 个 Pod 可用 → 零停机
      maxUnavailable: 0

  selector:
    matchLabels:
      app.kubernetes.io/name: backend
  template:
    metadata:
      labels:
        app.kubernetes.io/name: backend
        app.kubernetes.io/version: "1.0.0"
    spec:
      # [K8s] 优雅终止宽限期 — SIGTERM 后等待请求处理完成
      terminationGracePeriodSeconds: 30

      containers:
        - name: backend
          # [K8s] 镜像 — 本地练习使用 Docker Compose 构建的镜像
          # 生产环境改为 CI/CD 推送的 registry 地址（如 ghcr.io/your-org/blog-backend:v1.0.0）
          image: docker-backend:latest
          imagePullPolicy: IfNotPresent
          ports:
            - containerPort: 8080
              name: http

          # [K8s] 环境变量 — 从 ConfigMap + Secret 注入
          # 对应 Docker Compose environment 列表
          env:
            - name: SPRING_DATASOURCE_URL
              # [K8s] 直接用 Service DNS 名，不用 $(PG_HOST) 变量引用（那些变量未定义为容器 env）
              value: "jdbc:postgresql://postgres-svc:5432/blogdb_prod"
            - name: SPRING_DATASOURCE_USERNAME
              valueFrom:
                secretKeyRef:
                  name: blog-secret
                  key: pg-user
            - name: SPRING_DATASOURCE_PASSWORD
              valueFrom:
                secretKeyRef:
                  name: blog-secret
                  key: pg-password
            - name: SPRING_DATA_REDIS_HOST
              valueFrom:
                configMapKeyRef:
                  name: blog-config
                  key: REDIS_HOST
            - name: SPRING_DATA_REDIS_PORT
              valueFrom:
                configMapKeyRef:
                  name: blog-config
                  key: REDIS_PORT
            - name: SPRING_DATA_REDIS_PASSWORD
              valueFrom:
                secretKeyRef:
                  name: blog-secret
                  key: redis-password
            - name: SPRING_KAFKA_BOOTSTRAP_SERVERS
              value: "kafka-svc:9092"
            # [K8s] AI 服务地址 — Pod 内 localhost 是 Pod 自己，宿主机用 host.docker.internal
            - name: APP_AI_PROVIDERS_OLLAMA_BASEURL
              value: "http://host.docker.internal:11434"
            - name: JWT_SECRET
              valueFrom:
                secretKeyRef:
                  name: blog-secret
                  key: jwt-secret
            - name: APP_JWT_EXPIRATION
              valueFrom:
                configMapKeyRef:
                  name: blog-config
                  key: APP_JWT_EXPIRATION
            - name: APP_JWT_REFRESH_EXPIRATION
              valueFrom:
                configMapKeyRef:
                  name: blog-config
                  key: APP_JWT_REFRESH_EXPIRATION
            - name: SPRING_PROFILES_ACTIVE
              valueFrom:
                configMapKeyRef:
                  name: blog-config
                  key: SPRING_PROFILES_ACTIVE
            - name: CORS_ORIGIN
              valueFrom:
                configMapKeyRef:
                  name: blog-config
                  key: CORS_ORIGIN

          # [K8s] 资源限制 — 对应 Docker Compose deploy.resources.limits
          resources:
            requests:
              memory: "128Mi"
              cpu: "250m"
            limits:
              memory: "512Mi"
              cpu: "1000m"

          # [K8s] 存活探针 — 对应 Dockerfile HEALTHCHECK
          # 失败则重启容器（Pod 级别重启，非进程级别）
          livenessProbe:
            httpGet:
              path: /api/health
              port: 8080
            initialDelaySeconds: 45  # [K8s] 启动等待 — Spring Boot JVM 预热需要较长时间
            periodSeconds: 10
            timeoutSeconds: 5
            failureThreshold: 3

          # [K8s] 就绪探针 — 确保 Pod 可以接收流量后才加入 Service 端点
          # 与 Docker Compose 对比：Compose 无就绪探针概念
          readinessProbe:
            httpGet:
              path: /api/health
              port: 8080
            initialDelaySeconds: 10
            periodSeconds: 5
            timeoutSeconds: 3
            failureThreshold: 3

          # [K8s] 启动探针 — 区分「启动慢」和「运行中卡死」
          # 启动期间只做存活检查，启动完成后切换为 readiness + liveness
          startupProbe:
            httpGet:
              path: /api/health
              port: 8080
            failureThreshold: 30
            periodSeconds: 2
```

### 9.8.2 Service

```yaml
# k8s/backend/service.yaml
# [K8s] Backend ClusterIP Service — 为后端 Pod 提供集群内负载均衡
# 与 Docker Compose 对比：相当于 Nginx upstream backend { server backend:8080; }
# K8s Service 自动在所有匹配 Pod 之间轮询（kube-proxy iptables/IPVS）
apiVersion: v1
kind: Service
metadata:
  name: backend-svc
  namespace: blog-platform
  labels:
    app.kubernetes.io/name: backend
spec:
  type: ClusterIP
  ports:
    - port: 8080
      targetPort: 8080
      protocol: TCP
      name: http
  selector:
    app.kubernetes.io/name: backend
```

### 9.8.3 HPA — 水平自动扩缩容

```yaml
# k8s/backend/hpa.yaml
# [K8s] HPA — Horizontal Pod Autoscaler 根据指标自动增减 Pod 副本数
# 与 Docker Compose 对比：Compose 无自动扩缩容能力，需手动调整 replicas
#
# 工作原理：
#   1. metrics-server 每 15 秒采集 Pod 的 CPU/内存使用率
#   2. HPA Controller 每 15 秒查询 metrics-server
#   3. 当平均 CPU 使用率 > 70% 时，增加 Pod 副本数
#   4. 当平均 CPU 使用率 < 30% 时，减少 Pod 副本数
#   5. 副本数范围限制在 [minReplicas, maxReplicas] 之间
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: backend-hpa
  namespace: blog-platform
  labels:
    app.kubernetes.io/name: backend
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: backend
  # [K8s] 副本数范围 — 最少 2 个保证高可用，最多 10 个防止资源耗尽
  minReplicas: 2
  maxReplicas: 10
  metrics:
    # [K8s] CPU 指标 — 当平均 CPU 使用率超过 70% 时触发扩容
    - type: Resource
      resource:
        name: cpu
        target:
          type: Utilization
          averageUtilization: 70
    # [K8s] 内存指标 — 当平均内存使用率超过 80% 时触发扩容
    - type: Resource
      resource:
        name: memory
        target:
          type: Utilization
          averageUtilization: 80

  # [K8s] 扩缩容行为策略 — 精细控制扩缩速度
  behavior:
    scaleUp:
      # [K8s] 扩容策略 — 激进扩容，60 秒内持续扩容
      stabilizationWindowSeconds: 60
      policies:
        # 每 60 秒最多增加 2 个 Pod
        - type: Pods
          value: 2
          periodSeconds: 60
        # 每 60 秒最多增加当前副本数的 50%
        - type: Percent
          value: 50
          periodSeconds: 60
      selectPolicy: Max  # 选择两个策略中扩容数更大的

    scaleDown:
      # [K8s] 缩容策略 — 保守缩容，300 秒稳定窗口防止频繁抖动
      stabilizationWindowSeconds: 300
      policies:
        # 每 120 秒最多减少 1 个 Pod — 防止缩容过快导致服务中断
        - type: Pods
          value: 1
          periodSeconds: 120
      selectPolicy: Min  # 选择缩容数更小的策略
```

---

## 9.9 前端 — React SPA 静态服务

### 9.9.1 Deployment

```yaml
# k8s/frontend/deployment.yaml
# [K8s] Frontend Deployment — Nginx 托管 React 静态文件
# 与 Docker Compose 对比：相当于 frontend service
apiVersion: apps/v1
kind: Deployment
metadata:
  name: frontend
  namespace: blog-platform
  labels:
    app.kubernetes.io/name: frontend
    app.kubernetes.io/part-of: blog-platform
spec:
  replicas: 2

  # [K8s] 前端也使用滚动更新 — 静态文件更新时零停机
  strategy:
    type: RollingUpdate
    rollingUpdate:
      maxSurge: 1
      maxUnavailable: 0

  selector:
    matchLabels:
      app.kubernetes.io/name: frontend
  template:
    metadata:
      labels:
        app.kubernetes.io/name: frontend
    spec:
      terminationGracePeriodSeconds: 10
      containers:
        - name: frontend
          image: docker-frontend:latest
          imagePullPolicy: IfNotPresent
          ports:
            - containerPort: 80
              name: http

          resources:
            requests:
              memory: "64Mi"
              cpu: "50m"
            limits:
              memory: "128Mi"
              cpu: "200m"

          # [K8s] 存活探针 — Nginx 进程是否存活
          livenessProbe:
            httpGet:
              path: /
              port: 80
            initialDelaySeconds: 5
            periodSeconds: 10

          # [K8s] 就绪探针 — 静态文件是否可以访问
          readinessProbe:
            httpGet:
              path: /
              port: 80
            initialDelaySeconds: 3
            periodSeconds: 5
```

### 9.9.2 Service

```yaml
# k8s/frontend/service.yaml
apiVersion: v1
kind: Service
metadata:
  name: frontend-svc
  namespace: blog-platform
  labels:
    app.kubernetes.io/name: frontend
spec:
  type: ClusterIP
  ports:
    - port: 80
      targetPort: 80
      protocol: TCP
      name: http
  selector:
    app.kubernetes.io/name: frontend
```

---

## 9.10 Ingress — 统一入口（替代 Nginx 反向代理）

```yaml
# k8s/ingress.yaml
# [K8s] Ingress — 集群入口网关，替代 Docker Compose 中的 Nginx 反向代理容器
#
# 与 Docker Compose 对比：
#   Docker Compose: Nginx 容器 → upstream backend/frontend → 手动配置 proxy_pass
#   Kubernetes:     Ingress Controller → Ingress 规则 → 自动路由到 Service
#
# 前置条件：集群已安装 Nginx Ingress Controller
#   helm install ingress-nginx ingress-nginx/ingress-nginx \
#     --namespace ingress-nginx --create-namespace
#
# Ingress Controller 本身是一个 Deployment + LoadBalancer Service
# 它监听 Ingress 资源变化，自动生成 Nginx 配置并热加载
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: blog-ingress
  namespace: blog-platform
  labels:
    app.kubernetes.io/part-of: blog-platform
  annotations:
    # [Nginx Ingress] 使用 Nginx Ingress Controller
    kubernetes.io/ingress.class: nginx

    # [Nginx Ingress] SSL 重定向 — 对应 Docker Compose Nginx 的 HTTP→HTTPS 301
    nginx.ingress.kubernetes.io/ssl-redirect: "true"

    # [Nginx Ingress] WebSocket 支持 — 对应原 Nginx 配置中的 Upgrade/Connection 头
    # 这是 K8s Ingress 处理 WebSocket 的关键注解
    nginx.ingress.kubernetes.io/proxy-read-timeout: "3600"
    nginx.ingress.kubernetes.io/proxy-send-timeout: "3600"
    nginx.ingress.kubernetes.io/server-snippets: |
      location /ws/ {
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
      }

    # [Nginx Ingress] 安全头 — ⚠️ configuration-snippet 在 v1.12 被视为 risky annotation，
    # 会导致整个 Ingress 路由被拒绝（表现为 404）。安全头改由后端 SecurityConfig 处理。
    # nginx.ingress.kubernetes.io/configuration-snippet: |
    #   add_header X-Frame-Options "SAMEORIGIN" always;
    #   add_header X-Content-Type-Options "nosniff" always;
    #   add_header X-XSS-Protection "1; mode=block" always;
    #   add_header Referrer-Policy "strict-origin-when-cross-origin" always;

    # [Nginx Ingress] 请求体大小限制 — 对应 client_max_body_size 10M
    nginx.ingress.kubernetes.io/proxy-body-size: "10m"

    # [Nginx Ingress] gzip 压缩 — 对应原 Nginx gzip on
    nginx.ingress.kubernetes.io/proxy-connect-timeout: "30"

    # [Nginx Ingress] 限流 — 对应原 RateLimitFilter 令牌桶
    nginx.ingress.kubernetes.io/limit-rps: "10"
    nginx.ingress.kubernetes.io/limit-burst-multiplier: "5"

    # [cert-manager] 自动 SSL 证书 — 替代 Docker Compose 中的 certbot 容器
    # 前置条件：安装 cert-manager（helm install cert-manager jetstack/cert-manager）
    cert-manager.io/cluster-issuer: "letsencrypt-prod"

spec:
  # [K8s] TLS 终止 — Ingress Controller 处理 HTTPS，后端只需 HTTP
  # 对应 Docker Compose Nginx 的 ssl_certificate / ssl_certificate_key
  tls:
    - hosts:
        - myblog.local
      secretName: blog-tls-secret  # 手动创建（见 YAML 块后的 TLS Secret 命令）

  rules:
    - host: myblog.local
      http:
        paths:
          # [K8s] /api 路径 → 后端 Service
          # 对应原 Nginx: location /api/ { proxy_pass http://backend; }
          - path: /api
            pathType: Prefix
            backend:
              service:
                name: backend-svc
                port:
                  number: 8080

          # [K8s] /ws 路径 → 后端 Service（WebSocket）
          # 对应原 Nginx: location /ws/ { proxy_pass http://backend; Upgrade... }
          - path: /ws
            pathType: Prefix
            backend:
              service:
                name: backend-svc
                port:
                  number: 8080

          # [K8s] / 路径 → 前端 Service（React SPA）
          # 对应原 Nginx: location / { proxy_pass http://frontend; }
          - path: /
            pathType: Prefix
            backend:
              service:
                name: frontend-svc
                port:
                  number: 80
```

**TLS Secret — 导入 Part 8 的 mkcert 证书**

Ingress 的 `tls.secretName` 只是引用，K8s 不会自动生成证书。本地开发复用 Part 8 的 mkcert 证书：

```powershell
# 在 java-blog/ 目录下执行（相对路径）
kubectl create secret tls blog-tls-secret `
  --cert="nginx\ssl\myblog.local+2.pem" `
  --key="nginx\ssl\myblog.local+2-key.pem" `
  -n blog-platform
```

> mkcert 的 CA 已安装在 Windows 系统信任库，浏览器不会报证书警告。
> 生产环境应使用 cert-manager + Let's Encrypt 自动签发（见上方注解中的 cluster-issuer）。

---

## 9.11 Kustomize — 环境叠加配置

```yaml
# k8s/kustomization.yaml
# [K8s] Kustomize — 声明式配置管理，无需模板引擎（Helm 的轻量替代）
# 功能：批量修改 namespace、镜像 tag、标签，叠加环境差异配置
#
# 与 Docker Compose 对比：
#   Docker Compose: .env 文件 + ${VAR} 变量替换
#   Kustomize:      images 覆盖 + patches 叠加 + 多环境目录
apiVersion: kustomize.config.k8s.io/v1beta1
kind: Kustomization

namespace: blog-platform

# [K8s] 公共标签 — 所有资源自动添加
commonLabels:
  app.kubernetes.io/part-of: blog-platform
  managed-by: kustomize

# [K8s] 资源清单 — 按依赖顺序列出
resources:
  - namespace.yaml
  - configmap.yaml
  - secret.yaml
  - postgres/pvc.yaml
  - postgres/deployment.yaml
  - postgres/service.yaml
  - redis/pvc.yaml
  - redis/deployment.yaml
  - redis/service.yaml
  - kafka/pvc.yaml
  - kafka/deployment.yaml
  - kafka/service.yaml
  - backend/deployment.yaml
  - backend/service.yaml
  - backend/hpa.yaml
  - frontend/deployment.yaml
  - frontend/service.yaml
  - ingress.yaml

# [K8s] 镜像覆盖 — CI/CD 部署时通过 kustomize edit 更新 tag
# 对应 Docker Compose 中 image 字段的 tag 管理
images:
  - name: ghcr.io/your-org/blog-backend
    newTag: "v1.0.0"
  - name: ghcr.io/your-org/blog-frontend
    newTag: "v1.0.0"
```

---

## 9.12 部署与运维命令

> 本节按使用频率分三层：**启动**（必须）→ **运维**（按需）→ **清理**（结束时）。第一遍只需看「启动」部分。

### 9.12.1 启动（必须）

> 以下命令均在 `java-blog/` 目录下执行（`k8s/` 目录位于此），先切换目录：
> ```powershell
> cd D:\Program\Java\blog-project\java-blog
> ```

> ⚠️ **部署前置检查**：确认 Part 8 的 compose 容器已全部停止（两者共享同一个 Docker 引擎，同时运行会端口 / 资源冲突）：
> ```powershell
> docker compose --env-file .env -f docker/docker-compose.yml down
> docker ps   # 确认无 blog- 前缀的 compose 容器在运行
> ```

**方式 A：一条命令全部署**（推荐）

```powershell
kubectl apply -k k8s/ --namespace=blog-platform
```

**方式 B：分步部署**（仅用于理解依赖顺序，实际执行请用方式 A）

> ⚠️ **重要**：本项目的 `part-of` / `managed-by` 标签由 kustomize 的 `commonLabels` 注入，
> 单个 YAML 文件里并没有这些标签。用 `kubectl apply -f` 直接部署会导致 Pod 缺标签，
> Service selector 匹配不到 Pod（endpoints 为空 → 503）。
> 因此下面的分步命令**仅供阅读理解依赖顺序**，实际部署一律用方式 A 的 `apply -k`。

```powershell
# 步骤 1：命名空间
kubectl apply -f k8s/namespace.yaml

# 步骤 2：配置 + 密钥
kubectl apply -f k8s/configmap.yaml
kubectl apply -f k8s/secret.yaml

# 步骤 3-5：基础设施（按依赖顺序，每步等就绪再下一步）
kubectl apply -f k8s/postgres/
kubectl wait --for=condition=ready pod -l app.kubernetes.io/name=postgres -n blog-platform --timeout=120s

kubectl apply -f k8s/redis/
kubectl wait --for=condition=ready pod -l app.kubernetes.io/name=redis -n blog-platform --timeout=60s

kubectl apply -f k8s/kafka/
kubectl wait --for=condition=ready pod -l app.kubernetes.io/name=kafka -n blog-platform --timeout=120s

# 步骤 6-7：应用层
kubectl apply -f k8s/backend/
kubectl apply -f k8s/frontend/
kubectl apply -f k8s/ingress.yaml
```

**验证部署**

```powershell
kubectl get all -n blog-platform            # 看所有资源状态
kubectl get pods -n blog-platform -o wide   # 看 Pod 分布节点
kubectl get pods -n blog-platform -w        # 
```

### 9.12.2 运维（按需）

| 场景 | 命令 |
|---|---|
| 查看后端日志 | `kubectl logs -l app.kubernetes.io/name=backend -n blog-platform -f` |
| 查看崩溃 Pod 的上次日志 | `kubectl logs -l app.kubernetes.io/name=backend -n blog-platform --previous` |
| 查看事件（排查问题） | `kubectl get events -n blog-platform --sort-by='.lastTimestamp'` |
| 查看 HPA 状态 | `kubectl get hpa -n blog-platform` |
| 查看 Ingress 地址 | `kubectl get ingress -n blog-platform` |

### 9.12.3 清理（结束时）

```powershell
# 删除整个命名空间（级联删除其中所有资源）
kubectl delete namespace blog-platform
```

### 9.12.4 常见问题排查（实战踩坑记录）

> 以下均为本地 Docker Desktop K8s 实战中真实遇到的问题，按现象 → 根因 → 修复整理。

| # | 现象 | 根因 | 修复 |
|---|---|---|---|
| 1 | 域名访问 `ERR_CONNECTION_CLOSED` | Docker Desktop K8s 无 Ingress Controller | 安装 ingress-nginx（§9.0.3） |
| 2 | 只转发前端端口时 Posts 页空白，API 返回 HTML | 前端 Nginx 不代理 `/api`，返回 index.html | 安装 Ingress Controller 统一入口；或双端口转发 |
| 3 | `NET::ERR_CERT_AUTHORITY_INVALID` | TLS Secret 未创建或浏览器 HSTS 缓存 | 创建 Secret（§9.10）；清 `chrome://net-internals/#hsts` |
| 4 | Ingress 返回 404（default backend） | `configuration-snippet` 注解在 v1.12 被视为 risky，路由被拒绝 | 注释掉该注解（§9.10） |
| 5 | API 返回 503，endpoints 为 `<none>` | 用 `kubectl apply -f` 绕过 kustomize，Pod 缺少 `commonLabels` 标签，Service selector 匹配不上 | 用 `kubectl apply -k k8s/` 部署；或 delete 后重建 |
| 6 | `spec.selector: field is immutable` | Deployment 的 selector 不可修改 | `kubectl delete deployment <name>` 后重新 apply |
| 7 | AI 聊天报 500，日志无异常 | Pod 内 `localhost` 是 Pod 自己，连不到宿主机 Ollama | 环境变量覆盖为 `host.docker.internal:11434`（§9.7） |
| 8 | Kafka Pod 反复 CrashLoopBackOff | KRaft `QUORUM_VOTERS` 误用 Service DNS 名 | 改为 `1@localhost:9093`（§9.6） |
| 9 | Backend CrashLoopBackOff + `WeakKeyException` | JWT 密钥不足 256 bits | 生成 64 字符密钥更新 Secret |
| 10 | JDBC URL 中 `$(PG_HOST)` 未解析 | `$(VAR)` 只引用同容器 env，不读 ConfigMap | 硬编码 Service 名或显式 envFrom |

**排查思路口诀**：

```
Pod 起不来 → kubectl logs / describe pod 看 Events
Pod 起来但 503 → kubectl get endpoints 看 Service 有没有匹配到 Pod
域名 404 → kubectl logs ingress-nginx-controller 看路由是否加载
证书报错 → kubectl get secret 确认 TLS Secret 存在 + 清浏览器 HSTS
```

---

## 9.13 Docker Compose → Kubernetes 对照表

| Docker Compose 概念 | Kubernetes 等价 | 说明 |
|---|---|---|
| `docker-compose.yml` | `kustomization.yaml` + 多个 YAML | K8s 按资源类型拆分文件 |
| `services.backend` | `Deployment` + `Service` | Deployment 管理 Pod，Service 提供网络 |
| `environment` | `ConfigMap` + `Secret` | 非敏感 → ConfigMap，敏感 → Secret |
| `volumes: pg-data` | `PersistentVolumeClaim` | K8s 通过 PVC 申请存储 |
| `healthcheck` | `livenessProbe` + `readinessProbe` | K8s 拆分为存活 + 就绪两个探针 |
| `depends_on` | `initContainer` + 就绪探针 | K8s 无直接依赖，通过探针间接保证顺序 |
| `deploy.resources.limits` | `resources.limits` | 完全对应 |
| `deploy.replicas` | `replicas` + `HPA` | K8s 额外支持自动扩缩容 |
| Kafka `docker run`（12 个参数） | `Deployment` + `Service` | K8s 声明式管理，无需手动输入参数 |
| `networks` | `Service` + `NetworkPolicy` | K8s 扁平网络 + Service DNS |
| `ports: "80:8080"` | `Ingress` + `Service` | Ingress 是集群入口 |
| 无（手动 `docker compose up`） | `RollingUpdate` 策略 | K8s 内建零停机滚动更新 |
| 无 | `HPA` | K8s 独有 — 根据指标自动扩缩容 |
| Nginx 反向代理容器 | `Ingress Controller` + `Ingress` | Ingress 声明式路由规则 |
| certbot 容器 | `cert-manager` | K8s 原生证书管理 Operator |

---

> **以下三节为可选内容**：首次阅读可跳过，等实际用到时再回来看。

---

## 9.14 滚动更新（可选）— 发新版本时的零停机部署

### 9.14.1 滚动更新原理

```
                    滚动更新流程（replicas=2, maxSurge=1, maxUnavailable=0）
                    ═══════════════════════════════════════════════════════

  初始状态              步骤 1                步骤 2                步骤 3
  ┌─────┐ ┌─────┐     ┌─────┐ ┌─────┐       ┌─────┐ ┌─────┐       ┌─────┐ ┌─────┐
  │ B-1 │ │ B-2 │     │ B-1 │ │ B-2 │       │ B-1'│ │ B-2 │       │ B-1'│ │ B-2'│
  │ v1  │ │ v1  │     │ v1  │ │ v1  │       │ v2  │ │ v1  │       │ v2  │ │ v2  │
  │ ✅ │  │ ✅ │     │ ✅ │  │ ✅ │       │ ✅ │  │ ✅ │       │ ✅ │  │ ✅ │
  └──┬──┘ └──┬──┘     └──┬──┘ └──┬──┘       └──┬──┘ └──┬──┘       └──┬──┘ └──┬──┘
     │       │            │       │    ┌─────┐    │       │              │       │
     └───────┘            └───────┘    │ B-3 │    └───────┘              └───────┘
     Service                           │ v2  │
     端点: B-1, B-2                    │ 🔄  │
                                       └─────┘
                                        创建新 Pod B-3(v2)
                                        等待 readinessProbe 通过
                                        然后加入 Service 端点

  步骤 4                最终状态
  ┌─────┐ ┌─────┐      ┌─────┐ ┌─────┐
  │ B-1'│ │ B-2'│      │ B-1'│ │ B-2'│
  │ v2  │ │ v2  │      │ v2  │ │ v2  │
  │ ✅ │  │ ✅ │      │ ✅ │  │ ✅ │
  └──┬──┘ └──┬──┘      └──┬──┘ └──┬──┘
     │       │             │       │
     └───────┘             └───────┘
  删除旧 Pod B-1(v1)      Service 端点: B-1', B-2'
  缩回 2 个副本             全部运行 v2 ✅

  关键保证：
  • 任何时刻至少有 2 个 Pod 在提供服务（maxUnavailable=0）
  • 新 Pod 必须通过 readinessProbe 后才接收流量
  • 旧 Pod 在优雅终止期间继续处理已有连接
```

### 9.14.2 执行滚动更新命令

```bash
# ---- 方式 1：直接修改镜像 tag ----
# [K8s] kubectl set image — 触发 Deployment 滚动更新
kubectl set image deployment/backend \
  backend=ghcr.io/your-org/blog-backend:v2.0.0 \
  -n blog-platform

# ---- 方式 2：通过 Kustomize 更新 ----
# [K8s] kustomize edit — 修改 kustomization.yaml 中的镜像 tag
cd k8s/
kustomize edit set image ghcr.io/your-org/blog-backend:v2.0.0
kubectl apply -k . --namespace=blog-platform

# ---- 方式 3：修改 YAML 后 apply ----
# [K8s] kubectl apply — 声明式更新，K8s 自动计算差异并滚动
kubectl apply -f k8s/backend/deployment.yaml -n blog-platform

# ---- 监控滚动更新进度 ----
# [K8s] rollout status — 实时查看更新进度，等待所有 Pod 就绪
kubectl rollout status deployment/backend -n blog-platform --timeout=300s

# [K8s] 查看 ReplicaSet 列表 — 每个版本对应一个 ReplicaSet
kubectl get replicaset -l app.kubernetes.io/name=backend -n blog-platform

# [K8s] 查看 Pod 状态变化 — 观察新 Pod 创建、旧 Pod 终止
kubectl get pods -l app.kubernetes.io/name=backend -n blog-platform -w

# ---- 回滚 ----
# [K8s] rollout undo — 回滚到上一个版本（ReplicaSet 自动保留历史）
kubectl rollout undo deployment/backend -n blog-platform

# [K8s] 回滚到指定版本
kubectl rollout undo deployment/backend \
  --to-revision=3 -n blog-platform

# [K8s] 查看滚动历史
kubectl rollout history deployment/backend -n blog-platform
```

---

## 9.15 HPA 扩缩容实战（可选）— 压测观察自动扩容

### 9.15.1 前置条件

```bash
# [K8s] 安装 metrics-server — HPA 依赖它采集 CPU/内存指标
# 大多数云 K8s 服务（EKS/GKE/AKS）已预装
# 自建集群需要手动安装：
kubectl apply -f https://github.com/kubernetes-sigs/metrics-server/releases/latest/download/components.yaml

# 验证 metrics-server 是否运行
kubectl get deployment metrics-server -n kube-system

# 验证指标采集是否正常（等待 1-2 分钟）
kubectl top pods -n blog-platform
```

### 9.15.2 查看 HPA 状态

```bash
# [K8s] 查看 HPA 当前状态
kubectl get hpa backend-hpa -n blog-platform -o wide

# 输出示例：
# NAME         REFERENCE            TARGETS          MINPODS   MAXPODS   REPLICAS
# backend-hpa  Deployment/backend   45%/70%, 62%/80%  2         10        2
#                                  ^CPU   ^MEM                ^当前副本数

# [K8s] 查看 HPA 详细事件 — 了解扩缩容决策原因
kubectl describe hpa backend-hpa -n blog-platform

# [K8s] 实时观察 Pod 数量变化
kubectl get pods -l app.kubernetes.io/name=backend -n blog-platform -w
```

### 9.15.3 压力测试触发扩容

```bash
# [K8s] 使用 hey（HTTP 压测工具）触发 CPU 升高
# 安装：go install github.com/rakyll/hey@latest

# 发送 10000 个并发请求，触发 HPA 扩容
hey -n 10000 -c 100 https://myblog.local/api/posts

# 在另一个终端观察 HPA 自动扩容
watch kubectl get hpa backend-hpa -n blog-platform

# 观察 Pod 数量从 2 逐步增加到 3 → 4 → ...
kubectl get pods -l app.kubernetes.io/name=backend -n blog-platform
```

---

## 9.16 CI/CD 集成（可选）— GitHub Actions 部署到 K8s

```yaml
# .github/workflows/ci-k8s.yml
# [GitHub Actions] CI/CD — 构建镜像 → 推送 GHCR → 部署到 Kubernetes
# 与 Part 8 的 CI/CD 对比：deploy job 从 docker compose up 改为 kubectl apply -k

name: Blog Platform CI/CD (Kubernetes)

on:
  push:
    branches: [main]

env:
  REGISTRY: ghcr.io
  BACKEND_IMAGE: ${{ github.repository }}/backend
  FRONTEND_IMAGE: ${{ github.repository }}/frontend

jobs:
  # ---- 测试（同 Part 8，省略重复内容）----
  backend-test:
    name: Backend Test
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Build and Test
        run: |
          # ... 同 Part 8 backend-test ...
          echo "Run backend tests"

  frontend-test:
    name: Frontend Test
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Build and Test
        run: |
          # ... 同 Part 8 frontend-test ...
          echo "Run frontend tests"

  # ---- Docker 构建 + 推送（同 Part 8）----
  docker-build:
    name: Docker Build & Push
    needs: [backend-test, frontend-test]
    runs-on: ubuntu-latest
    permissions:
      contents: read
      packages: write
    steps:
      - uses: actions/checkout@v4

      - name: Log in to GHCR
        uses: docker/login-action@v3
        with:
          registry: ${{ env.REGISTRY }}
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}

      - name: Build and push Backend
        uses: docker/build-push-action@v6
        with:
          context: .
          file: docker/Dockerfile.backend
          push: true
          tags: |
            ${{ env.REGISTRY }}/${{ env.BACKEND_IMAGE }}:${{ github.sha }}
            ${{ env.REGISTRY }}/${{ env.BACKEND_IMAGE }}:latest

      - name: Build and push Frontend
        uses: docker/build-push-action@v6
        with:
          context: .
          file: docker/Dockerfile.frontend
          push: true
          tags: |
            ${{ env.REGISTRY }}/${{ env.FRONTEND_IMAGE }}:${{ github.sha }}
            ${{ env.REGISTRY }}/${{ env.FRONTEND_IMAGE }}:latest

  # ---- K8s 部署（核心差异部分）----
  deploy:
    name: Deploy to Kubernetes
    needs: [docker-build]
    runs-on: ubuntu-latest
    environment: production
    steps:
      # [K8s] 配置 kubectl — 从 GitHub Secrets 获取 kubeconfig
      - name: Configure kubeconfig
        uses: azure/k8s-set-context@v4
        with:
          method: kubeconfig
          kubeconfig: ${{ secrets.KUBE_CONFIG }}
          # kubeconfig 包含集群地址、证书、认证信息
          # 生成方式取决于 K8s 提供商（EKS/GKE/AKS/自建）

      # [K8s] 更新 Kustomize 镜像 tag — 将 kustomization.yaml 中的 tag 改为当前 commit SHA
      - name: Update Kustomize image tags
        run: |
          cd k8s/
          # [Kustomize] 替换镜像 tag 为当前 Git commit SHA — 确保不可变性
          kustomize edit set image \
            ghcr.io/${{ github.repository }}/backend:${{ github.sha }} \
            ghcr.io/${{ github.repository }}/frontend:${{ github.sha }}

      # [K8s] 部署到集群 — kubectl apply -k 自动计算差异并滚动更新
      - name: Deploy to Kubernetes
        run: |
          # [K8s] apply -k — Kustomize 声明式部署
          # 自动执行：创建/更新 ConfigMap → 更新 Deployment 镜像 → 触发滚动更新
          kubectl apply -k k8s/

          # [K8s] 等待滚动更新完成 — 如果超时说明新版本有问题
          kubectl rollout status deployment/backend -n blog-platform --timeout=300s
          kubectl rollout status deployment/frontend -n blog-platform --timeout=180s

      # [K8s] 部署失败自动回滚
      - name: Rollback on failure
        if: failure()
        run: |
          echo "Deployment failed! Rolling back..."
          kubectl rollout undo deployment/backend -n blog-platform
          kubectl rollout undo deployment/frontend -n blog-platform
```

