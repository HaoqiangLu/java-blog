# Part 6：安全与防护

> **本章范围说明**：对照当前 `java-blog/` 代码核对后，大部分安全防护要么已在前面 Part 落地、要么属于部署阶段，本章只保留**开发阶段真正需要新增**的两项：**接口限流**与**前端输入校验**。
>
> 已不在本章展开的内容及其归属：
> - **CORS**（`SecurityConfig.corsConfigurationSource()`）、**后端参数校验**（DTO `@Valid` + `GlobalExceptionHandler` → 400）、**JWT 无状态防 CSRF**、**BCrypt 慢哈希**、**Token 黑名单** → 已在 **Part 2/3** 实现。
> - **XSS 清洗**（`marked` + `DOMPurify`）→ 已在 **Part 5** 的 `frontend/src/components/MarkdownRenderer.tsx` 实现。
> - **SQL 注入防护**（Spring Data JPA 参数化查询）→ 已在 **Part 2/3** 的 Repository 实现。
> - **HTTPS/SSL 证书**、**安全响应头**（HSTS / X-Frame-Options / CSP 等）、**Nginx 层 CORS** → 属于部署层，已移至 **Part 8 §8.4**。
> - **后端 HTML 转义**（`HtmlEscapeUtil`）→ 本项目后端只返 JSON、正文为 Markdown 且已在前端清洗，全量转义反而会破坏渲染，**不需要**，已删除。

---

## 6.1 Rate Limiting 实现

> 防暴力破解 / API 滥用。这是本章**唯一需要新增到后端**的类；Redis 基建已在 Part 2/4 就绪，`pom.xml` 已含 `spring-boot-starter-data-redis`。

### 6.1.1 Redis 滑动窗口限流过滤器

> 用 Redis Sorted Set 按时间戳滑动计数，避免固定窗口的「边界瞬时翻倍」问题（固定窗口在第 59 秒和第 61 秒各打满 60 次，2 秒内实际放行 120 次）。下面就是项目里 `RateLimitFilter.java` 的完整实现，直接照抄即可，同一个 `@Component`、不新增其他文件。

```java
// backend/src/main/java/com/blog/config/RateLimitFilter.java
// [限流] 基于 Redis Sorted Set 的滑动窗口限流过滤器
package com.blog.config;

import jakarta.servlet.Filter;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.ServletRequest;
import jakarta.servlet.ServletResponse;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.time.Duration;

@Component
public class RateLimitFilter implements Filter {

    private final StringRedisTemplate redisTemplate;

    // 限流配置：每 60 秒窗口内最多 60 次请求
    private static final int MAX_REQUESTS = 60;
    private static final int WINDOW_SECONDS = 60;

    public RateLimitFilter(StringRedisTemplate redisTemplate) {
        this.redisTemplate = redisTemplate;
    }

    @Override
    public void doFilter(ServletRequest request, ServletResponse response, FilterChain chain)
            throws IOException, ServletException {

        HttpServletRequest httpReq = (HttpServletRequest) request;
        // 生产走 Nginx 反代时应改读 X-Forwarded-For（见下方 ⚠️ 与 Part 8 §8.4）
        String key = "rate:" + httpReq.getRemoteAddr() + ":" + httpReq.getRequestURI();

        if (!slidingWindowAllow(key, MAX_REQUESTS, WINDOW_SECONDS)) {
            HttpServletResponse httpResp = (HttpServletResponse) response;
            httpResp.setStatus(429);
            httpResp.setHeader("Retry-After", String.valueOf(WINDOW_SECONDS));
            httpResp.getWriter().write("{\"error\":\"Too many requests\"}");
            return;
        }

        chain.doFilter(request, response);
    }

    // [Redis] 滑动窗口：Sorted Set 按时间戳计数，返回 true 表示放行
    private boolean slidingWindowAllow(String key, int maxRequests, int windowSeconds) {
        long now = System.currentTimeMillis();
        long windowStart = now - windowSeconds * 1000L;

        // 1. 移除窗口外的旧记录
        redisTemplate.opsForZSet().removeRangeByScore(key, 0, windowStart);

        // 2. 先统计再决定是否写入：超限直接拒，被拒请求不进 ZSET，避免污染计数
        Long count = redisTemplate.opsForZSet().zCard(key);
        if (count != null && count >= maxRequests) {
            return false;
        }

        // 3. 记录本次请求：member 用「时间戳:随机数」保证唯一，score 为当前时间戳
        redisTemplate.opsForZSet().add(key, now + ":" + Math.random(), now);

        // 4. 让 key 在窗口结束后自动过期，避免冷 key 长期堆积
        redisTemplate.expire(key, Duration.ofSeconds(windowSeconds));
        return true;
    }
}
```

> **依赖说明**：`StringRedisTemplate` 由 Spring Boot `RedisAutoConfiguration` 自动装配（`pom.xml` 已含 `spring-boot-starter-data-redis`），**无需**在 `RedisConfig` 里再声明 Bean，可直接构造器注入。当前 `RedisConfig` 只显式定义了 `RedisTemplate<String,Object>` 与监听容器，二者互不影响。
>
> **注册机制**：`@Component` + `implements Filter` 会让 Spring Boot 自动把它注册为 Servlet 过滤器，对所有 HTTP 请求生效，**无需** `FilterRegistrationBean`。⚠️ **两者缺一不可**：只写 `@Component` 而漏掉 `implements Filter`，Spring Boot 就不把它当过滤器，`doFilter` 永不被调用，限流静默失效且**不报任何错**。
>
> ⚠️ **反向代理下的取 IP 陷阱**：上面用 `httpReq.getRemoteAddr()` 作为限流 key。生产环境走 Nginx 反代（见 **Part 8 §8.4**）时，`getRemoteAddr()` 拿到的是 **Nginx 的 IP**，会导致所有用户共用一个限流桶。届时应改读 `X-Forwarded-For` 头（取第一个 IP）——Part 8 的 `nginx.conf` 已配置 `proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;`。开发环境直连时 `getRemoteAddr()` 才准确。
>
> ⚠️ **原子性**：`removeRangeByScore → zCard → add → expire` 是 4 条独立命令，高并发下存在竞态（两请求同时读到 count=59 后都写入）。教学 / 中小流量足够；若要严格原子，应把这几步合并成一段 **Lua 脚本**用 `redisTemplate.execute(RedisScript…)` 执行，本项目不强制。
>
> ⚠️ **key 必须是 ZSET（`WRONGTYPE` 陷阱）**：本实现全程用 `opsForZSet`。若该 key 曾被写成 **String**（例如早期固定窗口版用 `opsForValue` 的 `setIfAbsent`/`increment` 遗留下来），再对它跑 ZSET 命令，Redis 会抛 `WRONGTYPE Operation against a key holding the wrong kind of value`；因过滤器在每个请求链路上，会导致**所有请求都 500**（前端像“加载失败”，易被误判成需要登录）。恢复：确保 `doFilter` 里只有 ZSET 逻辑，再清掉遗留 key（`redis-cli -a <密码> FLUSHDB`，密码见 `application.yml`）并重启后端。

---

## 6.2 前端输入校验（可选增强）

> **现状**：`frontend/src/utils/validation.ts` **已存在，但还没被任何页面 import**——`RegisterPage.tsx` / `LoginPage.tsx` 仍只用 HTML `required` + `type="email"`，真正兜底靠后端 `@Valid`。所以它现在是「死代码」，要生效必须按 §6.2.2 接进页面。
>
> ✅ **已与后端对齐**：以下规则严格对应后端 DTO `backend/src/main/java/com/blog/dto/request/RegisterRequest.java`——`username` 3–50（`@NotBlank @Size(min=3,max=50)`）、`email`（`@NotBlank @Email`）、`password` ≥ 8（`@NotBlank @Size(min=8)`）。将来若要更强的密码策略，请**同时**改前端 `validation.ts` 与后端这个 `RegisterRequest.java`，避免「前端拦下、后端却接受」的不一致。

### 6.2.1 校验工具 `validation.ts`

```tsx
// frontend/src/utils/validation.ts
// [输入校验] 前端校验 — 提交前即时反馈；规则与后端 DTO 保持一致

export interface ValidationResult {
    valid: boolean;
    error?: string;
}

// 对应后端 RegisterRequest.username：@NotBlank @Size(min=3, max=50)
export function validateUsername(username: string): ValidationResult {
    if (username.length < 3) return { valid: false, error: 'Username must be at least 3 characters' };
    if (username.length > 50) return { valid: false, error: 'Username must be at most 50 characters' };
    return { valid: true };
}

// 对应后端 @Email
export function validateEmail(email: string): ValidationResult {
    if (!/^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(email))
        return { valid: false, error: 'Invalid email format' };
    return { valid: true };
}

// 对应后端 RegisterRequest.password：@NotBlank @Size(min=8)
export function validatePassword(password: string): ValidationResult {
    if (password.length < 8) return { valid: false, error: 'Password must be at least 8 characters' };
    return { valid: true };
}
```

### 6.2.2 在哪里使用：接进注册 / 登录页

> 在**现有**页面里改，不新建文件。改完后不合法输入在提交前就被拦下并显示错误，不再白跑一趟后端。

**注册页** `frontend/src/pages/RegisterPage.tsx`——改两处：

```tsx
// ① 顶部 import 区加一行
import { validateUsername, validateEmail, validatePassword } from '../utils/validation';

// ② handleSubmit 里，在 registerMutation.mutateAsync 之前插入即时校验
const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    // [输入校验] 任一字段不通过就拦下、显示错误，不发请求
    for (const result of [validateUsername(username), validateEmail(email), validatePassword(password)]) {
        if (!result.valid) {
            setError(result.error ?? 'Invalid input');
            return;
        }
    }

    try {
        await registerMutation.mutateAsync({ username, email, password });
        navigate('/login');
    } catch (err: any) {
        setError(err.response?.data?.error || 'Registration failed');
    }
};
```

**登录页** `frontend/src/pages/LoginPage.tsx`——同理，但**登录只校验 email 格式**：密码对错交给后端认证，不在前端拦密码长度，否则会把「密码错误」误报成「至少 8 位」。

```tsx
import { validateEmail } from '../utils/validation';

const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    const emailCheck = validateEmail(email);
    if (!emailCheck.valid) { setError(emailCheck.error ?? 'Invalid input'); return; }

    try {
        const data = await loginMutation.mutateAsync({ email, password });
        setAuth(data.user, data.access_token, data.refresh_token);
        navigate('/');
    } catch (err: any) {
        setError(err.response?.data?.error || 'Login failed');
    }
};
```

---

## 6.3 如何验证（简单自测）

**① 限流（§6.1）**：后端启动后，在 PowerShell 里对同一个接口连打 65 次，前 60 次返回 `200`、从第 61 次起变成 `429`，就说明生效：

```powershell
1..65 | ForEach-Object { try { (Invoke-WebRequest "http://localhost:8080/api/health" -UseBasicParsing).StatusCode } catch { $_.Exception.Response.StatusCode.value__ } }
```

> 嫌 60 次太久：临时把 `MAX_REQUESTS` 改成 `3`、重启后端，打 4 次就触发 `429`，测完改回 `60` 即可。窗口满 60 秒后计数自动清零，不用手动清 Redis。

**② 前端校验（§6.2）**：先明白一点——表单的 `type="email"` / `required` 会触发**浏览器原生校验**，它比 `onSubmit` 里的自定义校验**先跑**。所以邮箱填 `abc` 这种明显不合法的，弹的是浏览器自带的橙色气泡（不是自定义红字），属正常现象。要看**自定义**校验（页面顶部红框），测原生不拦的情况：

- 用户名填 `ab`（< 3 位）或密码填 `123`（< 8 位）：原生只查“非空”会放行，自定义校验拦下 → 顶部红框报对应错误；
- 邮箱填 `a@b`：原生认为合法，但自定义正则要求“点号 + 两位后缀”，会拦下 → 顶部红框报 `Invalid email format`；
- 按 `F12` → Network 面板，会发现**根本没发出注册请求**，说明在前端就拦下了、没白跑后端。
