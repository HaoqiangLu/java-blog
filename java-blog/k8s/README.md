# Kubernetes 部署

## 前置条件

- [Docker Desktop](https://www.docker.com/products/docker-desktop/) 已安装，Kubernetes 已启用
- `kubectl` 已安装（`winget install Kubernetes.kubectl`）
- kubeconfig 已指向 Docker Desktop：`kubectl config use-context docker-desktop`
- **Ingress Controller 已安装**（Docker Desktop 不自带，必须手动装）：
  ```powershell
  kubectl apply -f https://raw.githubusercontent.com/kubernetes/ingress-nginx/controller-v1.12.0/deploy/static/provider/cloud/deploy.yaml
  ```
- hosts 文件已添加：`127.0.0.1 myblog.local`（`C:\Windows\System32\drivers\etc\hosts`）

## 一键部署

```powershell
kubectl apply -k k8s/
```

## 访问

**方式 1：域名访问（推荐，与生产一致）**

```powershell
# 先导入 TLS 证书（见下方 TLS 证书章节），然后部署
kubectl apply -k k8s/
```

浏览器打开 `https://myblog.local`（Ingress Controller 统一路由 /api → 后端，/ → 前端）。

**方式 2：端口转发（无需 Ingress Controller）**

```powershell
# 需两个终端分别运行
kubectl port-forward svc/frontend-svc -n blog-platform 5000:80
kubectl port-forward svc/backend-svc -n blog-platform 8080:8080
```

浏览器打开 http://localhost:5000

> ⚠️ 只转发前端端口时，`/api` 请求会打到前端 Nginx 返回 HTML 而非 JSON，页面空白。
> 必须两个端口都转发，或直接用方式 1。

## 常用命令

```powershell
# 查看所有资源
kubectl get all -n blog-platform

# 查看 Pod 状态
kubectl get pods -n blog-platform -w

# 查看日志
kubectl logs -f deployment/backend -n blog-platform

# 停止（保留数据）
kubectl delete namespace blog-platform

# 停止并删除数据（清空数据库）
kubectl delete namespace blog-platform
kubectl delete pvc --all -n blog-platform
```

## TLS 证书（可选）

```powershell
# 导入 Part 8 的 mkcert 证书
kubectl create secret tls blog-tls-secret `
  --cert="nginx/ssl/myblog.local+2.pem" `
  --key="nginx/ssl/myblog.local+2-key.pem" `
  -n blog-platform
```
