# Part 7：功能扩展 — Kafka + AI

> 在 Part 1-6 完成的博客核心功能基础上，以**纯增量方式**引入两大能力：
> - **Kafka**：Spring Kafka 事件驱动架构 → 新功能：异步搜索索引 + 用户通知系统
> - **AI**：大模型集成 → 新功能：文章自动摘要 + AI 聊天助手 + 智能搜索增强
>
> 所有新增代码位于独立目录/文件，不改动已有 Controller/Service/Repository。

---

## 7.1 扩展架构总览

```
新增组件（标注 [+]）：

                    ┌────────────────────────────────────┐
                    │      Ingress / LoadBalancer         │
                    └─────────────────┬──────────────────┘
                                      │
                    ┌─────────────────▼──────────────────┐
                    │   Frontend (React) + AI Chat UI [+] │
                    └─────────────────┬──────────────────┘
                                      │
                    ┌─────────────────▼──────────────────┐
                    │    Backend (Spring Boot)             │
                    │  原有 API + WebSocket (不变)          │
                    │  [+] AIController /api/ai/*          │
                    │  [+] KafkaProducer                   │
                    └──┬──────────────────┬───────────────┘
                       │                  │
          ┌────────────▼──┐   ┌───────────▼──────────┐
          │ PostgreSQL 17 │   │ Kafka [+]             │
          │ (不变)         │   │ ┌───────────────────┐ │
          └───────────────┘   │ │ Search Indexer [+]│ │
                    ┌────────┐│ ├───────────────────┤ │
                    │Redis 7 ││ │ Notify Worker [+] │ │
                    │(不变)  ││ └───────────────────┘ │
                    └────────┘└───────────────────────┘

新增目录结构：
backend/src/main/java/com/blog/
├── events/                 # [+] Kafka 事件
│   ├── KafkaEventProducer.java  # 事件生产者
│   ├── SearchIndexer.java  # 搜索索引消费者
│   └── NotifyWorker.java   # 通知消费者
├── ai/                     # [+] AI 能力（策略模式多 Provider 切换）
│   ├── AiProvider.java          # 策略接口
│   ├── AiProviderProperties.java # 多 Provider 配置属性
│   ├── OpenAiCompatibleProvider.java # 通用 Provider（OpenAI / DeepSeek / CCSwitch 等 OpenAI 兼容服务）
│   ├── OllamaProvider.java      # Ollama 原生 API Provider（nativeApi=true 时用，可关思考）
│   ├── AIService.java           # AI 服务（持有所有 Provider，支持运行时切换）
│   └── AIController.java        # AI API 控制器

frontend/src/
├── api/
│   ├── types.ts                 # [+] 新增 AI 类型（AiMessage, AiProvidersResponse 等）
│   └── queries.ts               # [+] 新增 AI Hooks（useAiProviders, useAiChat, useAiSummary）
├── pages/
│   ├── AiChatPage.tsx           # [+] AI 聊天助手页面（Provider 切换 + 多轮对话）
│   └── PostDetailPage.tsx       # [修改] 新增 AI 摘要按钮
├── components/
│   └── Navbar.tsx               # [修改] 新增 AI 助手入口图标
└── App.tsx                      # [修改] 新增 /ai-chat 路由
```

> **增量更新 Maven 依赖**：在 `backend/pom.xml` 的 `<dependencies>` 中按需追加：
>
> ```xml
> <!-- Part 7 新增依赖 -->
> <!-- [Spring Kafka] Kafka 消息生产与消费 -->
> <dependency>
>     <groupId>org.springframework.kafka</groupId>
>     <artifactId>spring-kafka</artifactId>
> </dependency>
> <!-- [Spring WebFlux] WebClient — AI 服务调用外部 HTTP API（仅用 WebClient，不替换 Web MVC） -->
> <dependency>
>     <groupId>org.springframework.boot</groupId>
>     <artifactId>spring-boot-starter-webflux</artifactId>
> </dependency>
> ```

---

## 7.2 Kafka — 事件驱动架构

### 7.2.1 启动 Kafka（Docker）

> **前置条件**：确保 Docker Desktop 已启动（系统托盘图标显示稳定状态）。未启动时执行 `docker` 命令会报 `npipe` 连接失败错误。

项目使用 Kafka 作为事件驱动中间件（Topic：`post-events`、`user-notifications`），开发环境用 Docker 启动单节点 Kafka（KRaft 模式，无需 ZooKeeper）：

```powershell
docker run -d --name kafka -p 9092:9092 `
  -e KAFKA_NODE_ID=1 `
  -e KAFKA_PROCESS_ROLES=broker,controller `
  -e KAFKA_LISTENERS=PLAINTEXT://:9092,CONTROLLER://:9093 `
  -e KAFKA_ADVERTISED_LISTENERS=PLAINTEXT://localhost:9092 `
  -e KAFKA_CONTROLLER_LISTENER_NAMES=CONTROLLER `
  -e KAFKA_LISTENER_SECURITY_PROTOCOL_MAP=CONTROLLER:PLAINTEXT,PLAINTEXT:PLAINTEXT `
  -e KAFKA_CONTROLLER_QUORUM_VOTERS=1@localhost:9093 `
  -e KAFKA_OFFSETS_TOPIC_REPLICATION_FACTOR=1 `
  -e KAFKA_TRANSACTION_STATE_LOG_REPLICATION_FACTOR=1 `
  -e KAFKA_TRANSACTION_STATE_LOG_MIN_ISR=1 `
  -e KAFKA_GROUP_INITIAL_REBALANCE_DELAY_MS=0 `
  -e KAFKA_NUM_PARTITIONS=3 `
  apache/kafka:latest
```

**验证 Kafka 是否启动成功**：

```powershell
docker ps --filter name=kafka
```

看到 STATUS 为 `Up` 即表示 Kafka 已在 `localhost:9092` 运行，后端可正常连接。

> **说明**：使用 Apache Kafka 官方镜像（Docker Hub 10M+ 下载），KRaft 模式（无需 ZooKeeper），单条命令即可启动。端口 `9092` 与 `application.yml` 中的 `spring.kafka.bootstrap-servers` 配置一致。
>
> **国内网络拉取失败时**，可通过镜像站代理：`docker pull docker.1ms.run/apache/kafka:latest`，拉取成功后再执行上述 `docker run`。
>
> **停止 / 删除容器**：`docker stop kafka` 然后 `docker rm kafka`。

### 7.2.2 Kafka 配置

```yaml
# application.yml 追加 Kafka 配置
spring:
  kafka:
    bootstrap-servers: ${KAFKA_BOOTSTRAP_SERVERS:localhost:9092}
    producer:
      key-serializer: org.apache.kafka.common.serialization.StringSerializer
      value-serializer: org.apache.kafka.common.serialization.StringSerializer
      acks: all
    consumer:
      group-id: blog-platform
      key-deserializer: org.apache.kafka.common.serialization.StringDeserializer
      value-deserializer: org.apache.kafka.common.serialization.StringDeserializer
      auto-offset-reset: earliest
```

### 7.2.3 KafkaEventProducer

```java
// backend/src/main/java/com/blog/events/KafkaEventProducer.java
// [Spring Kafka] 事件生产者 — 将业务事件发送到 Kafka Topic
package com.blog.events;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.stereotype.Component;

@Component
public class KafkaEventProducer {

    private static final Logger log = LoggerFactory.getLogger(KafkaEventProducer.class);

    private final KafkaTemplate<String, String> kafkaTemplate;
    private final ObjectMapper objectMapper;

    public KafkaEventProducer(KafkaTemplate<String, String> kafkaTemplate,
                              ObjectMapper objectMapper) {
        this.kafkaTemplate = kafkaTemplate;
        this.objectMapper = objectMapper;
    }

    public void sendEvent(String topic, Object event) {
        try {
            String json = objectMapper.writeValueAsString(event);
            kafkaTemplate.send(topic, json);
            log.debug("Kafka event sent to {}: {}", topic, json);
        } catch (Exception e) {
            log.error("Failed to send Kafka event to {}: {}", topic, e.getMessage());
        }
    }
}
```

### 7.2.4 SearchIndexer — 搜索索引消费者

```java
// backend/src/main/java/com/blog/events/SearchIndexer.java
// [Spring Kafka] 搜索索引消费者 — 异步更新全文搜索索引
package com.blog.events;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.kafka.annotation.KafkaListener;
import org.springframework.stereotype.Component;

@Component
public class SearchIndexer {

    private static final Logger log = LoggerFactory.getLogger(SearchIndexer.class);

    @KafkaListener(topics = "post-events", groupId = "blog-platform")
    public void onPostEvent(String message) {
        log.info("SearchIndexer received post event: {}", message);
        // 异步更新搜索索引（如 Elasticsearch 或 PostgreSQL 全文搜索）
    }
}
```

### 7.2.5 NotifyWorker — 通知消费者

```java
// backend/src/main/java/com/blog/events/NotifyWorker.java
// [Spring Kafka] 通知消费者 — 异步处理用户通知
package com.blog.events;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.kafka.annotation.KafkaListener;
import org.springframework.stereotype.Component;

@Component
public class NotifyWorker {

    private static final Logger log = LoggerFactory.getLogger(NotifyWorker.class);

    @KafkaListener(topics = "user-notifications", groupId = "blog-platform")
    public void onNotification(String message) {
        log.info("NotifyWorker received notification: {}", message);
        // 处理用户通知（邮件、站内信等）
    }
}
```

---

## 7.3 AI — 大模型集成（策略模式 + Ollama 本地免费模型）

> **设计目标**：通过**策略模式**管理多个 AI Provider，支持云端付费模型和本地免费模型（Ollama）运行时自由切换。
>
> **Ollama 是什么**：一个本地大模型运行工具，下载后即可在本地运行开源模型（如 Qwen、Llama 等）。Ollama 自带 OpenAI 兼容的 `/v1/chat/completions` 端点，后端直接连 Ollama 即可**零成本**使用本地模型。

### 7.3.1 配置 — application.yml

```yaml
# application.yml 追加 AI 多 Provider 配置
app:
  ai:
    default-provider: ollama   # 默认使用 Ollama 本地免费模型
    providers:
      # ---- 本地免费：Ollama 直连 ----
      ollama:
        baseUrl: http://localhost:11434   # Ollama 本地服务地址
        apiKey: not-used                  # 本地模型不需要真实 Key
        model: qwen3.5                    # Ollama 中已拉取的模型名
        nativeApi: true                   # 思考模型（qwen3.5 等）必配：走原生 /api/chat 并关闭思考
      # ---- 云端付费：OpenAI ----
      openai:
        baseUrl: https://api.openai.com
        apiKey: ${OPENAI_API_KEY:}
        model: gpt-3.5-turbo
      # ---- 云端付费：DeepSeek ----
      deepseek:
        baseUrl: https://api.deepseek.com
        apiKey: ${DEEPSEEK_API_KEY:}
        model: deepseek-chat
```

> **Ollama 端口说明**：Ollama 默认运行在 `localhost:11434`，自带 OpenAI 兼容端点 `/v1/chat/completions`，后端直连即可，无需额外代理层。
>
> **思考模型陷阱（实测 Ollama 0.34.0 + qwen3.5）**：OpenAI 兼容层**无法关闭思考模式**（`think:false`、`/no_think`、Modelfile `PARAMETER think` 均无效），思考模型会把 `max_tokens` 预算全部耗在思考链上（`finish_reason=length`），`content` 恒为空字符串——接口返回 200 但摘要为空。原生 API `/api/chat` 支持 `think:false`，因此 Ollama 提供商必须配 `nativeApi: true` 走 `OllamaProvider`（见 7.3.4 第二个代码块）。
>
> **配置键名注意**：在 `Map<String, ProviderConfig>` 结构中，YAML 键名必须使用 **camelCase**（`baseUrl`、`apiKey`），不能用 kebab-case（`base-url`），否则 Spring Boot 绑定不稳定。

### 7.3.2 AiProvider — 策略接口

```java
// backend/src/main/java/com/blog/ai/AiProvider.java
// [AI] 策略接口 — 所有 AI Provider 的统一抽象
package com.blog.ai;

import java.util.List;
import java.util.Map;

public interface AiProvider {

    /** Provider 名称，用于配置和运行时选择 */
    String name();

    /** 发送聊天请求，返回模型回复文本 */
    String chat(List<Map<String, String>> messages, int maxTokens);
}
```

### 7.3.3 AiProviderProperties — 配置绑定

```java
// backend/src/main/java/com/blog/ai/AiProviderProperties.java
// [AI] 多 Provider 配置属性 — 从 application.yml 读取
package com.blog.ai;

import lombok.Getter;
import lombok.Setter;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;

import java.util.HashMap;
import java.util.Map;

@Component
@ConfigurationProperties(prefix = "app.ai")
@Setter @Getter
public class AiProviderProperties {

    private String defaultProvider = "ccswitch";
    private Map<String, ProviderConfig> providers = new HashMap<>();

    @Setter @Getter
    public static class ProviderConfig {
        private String baseUrl;
        private String apiKey;
        private String model;
        /** 是否走 Ollama 原生 API（/api/chat + think:false）；思考模型必须为 true，默认 false 走 OpenAI 兼容层 */
        private boolean nativeApi = false;
    }
}
```

### 7.3.4 OpenAiCompatibleProvider — 通用 Provider 实现

```java
// backend/src/main/java/com/blog/ai/OpenAiCompatibleProvider.java
// [AI] 通用 Provider — 兼容所有 OpenAI 协议的模型服务
// 适用于：OpenAI、DeepSeek、Ollama、CCSwitch 代理等
package com.blog.ai;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.web.reactive.function.client.WebClient;

import java.util.List;
import java.util.Map;

public class OpenAiCompatibleProvider implements AiProvider {

    private static final Logger log = LoggerFactory.getLogger(OpenAiCompatibleProvider.class);

    private final String providerName;
    private final String model;
    private final WebClient webClient;

    public OpenAiCompatibleProvider(String providerName, String model,
                                    String apiKey, String baseUrl) {
        this.providerName = providerName;
        this.model = model;
        this.webClient = WebClient.builder()
                .baseUrl(baseUrl)
                .defaultHeader("Authorization", "Bearer " + apiKey)
                .build();
    }

    @Override
    public String name() {
        return providerName;
    }

    @Override
    @SuppressWarnings("unchecked")
    public String chat(List<Map<String, String>> messages, int maxTokens) {
        try {
            var response = webClient.post()
                    .uri("/v1/chat/completions")
                    .bodyValue(Map.of(
                            "model", model,
                            "messages", messages,
                            "max_tokens", maxTokens
                    ))
                    .retrieve()
                    .bodyToMono(Map.class)
                    .block();

            if (response != null && response.containsKey("choices")) {
                var choices = (List<Map<String, Object>>) response.get("choices");
                if (choices != null && !choices.isEmpty()) {
                    var message = (Map<String, Object>) choices.get(0).get("message");
                    return (String) message.get("content");
                }
            }
            return "";
        } catch (Exception e) {
            log.error("[{}] AI request failed: {}", providerName, e.getMessage());
            return "";
        }
    }
}
```

> **为什么一个实现就够了**：OpenAI、DeepSeek、Ollama 全部兼容 `/v1/chat/completions` 协议，只是 `baseUrl`、`apiKey`、`model` 不同。所以一个 `OpenAiCompatibleProvider` 配合不同配置就能覆盖所有场景——这就是策略模式的精髓：**策略相同、参数不同，用配置区分即可**。

#### OllamaProvider — Ollama 原生 API 实现（思考模型必用）

实测结论（Ollama 0.34.0 + qwen3.5，curl 对照实验）：

| 请求方式 | max_tokens | 结果 |
| --- | --- | --- |
| 兼容层 `/v1/chat/completions` | 200 | `content:""`，`finish_reason:"length"`，200 token 全耗在 `reasoning` |
| 兼容层 + `think:false` / `/no_think` | 200 | 参数被忽略，同上 |
| 兼容层 | 1000 | `content:""`，1000 token 仍全耗在思考链（耗时 95s） |
| 原生 `/api/chat` + `think:false` | 200 | `content` 有内容，`done_reason:"stop"`，仅 50 token / 4s |

因此为 Ollama 提供商注册独立的原生 Provider，由 `nativeApi` 配置项选择：

```java
// backend/src/main/java/com/blog/ai/OllamaProvider.java
// [AI] Ollama 原生 API Provider — /api/chat + think:false 关闭思考模式
// 存在原因：OpenAI 兼容层无法关思考，思考模型会把 max_tokens 耗光导致 content 恒为空
package com.blog.ai;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.web.reactive.function.client.WebClient;

import java.util.List;
import java.util.Map;

public class OllamaProvider implements AiProvider {

    private static final Logger log = LoggerFactory.getLogger(OllamaProvider.class);

    private final String providerName;
    private final String model;
    private final WebClient webClient;

    public OllamaProvider(String providerName, String model,
                          String apiKey, String baseUrl) {
        this.providerName = providerName;
        this.model = model;
        this.webClient = WebClient.builder()
                .baseUrl(baseUrl)
                .defaultHeader("Authorization", "Bearer" + apiKey)
                .build();
    }

    @Override
    public String name() {
        return providerName;
    }

    @Override
    @SuppressWarnings("unchecked")
    public String chat(List<Map<String, String>> messages, int maxTokens) {
        try {
            var response = webClient.post()
                    .uri("/api/chat")
                    .bodyValue(Map.of(
                            "model", model,
                            "messages", messages,
                            "stream", false,
                            "think", false,
                            "options", Map.of("num_predict", maxTokens)
                    ))
                    .retrieve()
                    .bodyToMono(Map.class)
                    .block();

            // 原生 API 响应结构：{ "message": { "role": ..., "content": ... }, "done": true }
            if (response != null && response.get("message") instanceof Map<?, ?> message) {
                Object content = message.get("content");
                return content == null ? "" : (String) content;
            }
            return "";
        } catch (Exception e) {
            log.error("[{}] AI request failed: {}", providerName, e.getMessage());
            return "";
        }
    }
}
```

#### 关于 OllamaProvider 的两个设计问答

**Q1：`max_tokens`（原生 API 的 `num_predict`）一定要传吗？本地模型又不要钱。**
不是必须。它与费用无关，本义是**长度上限与失控保护**：本项目 Provider 用 `.block()` 同步占用 Tomcat 线程，
若不设上限，遇到病态输入（模型循环复读不收敛）时单次请求可能跑满几分钟。Ollama 的 `num_predict` 默认 -1
（生成到自然结束），去掉完全可以；若想去掉，建议改成 `maxTokens <= 0` 时不传 `options`：

```java
var body = new HashMap<String, Object>();   // 需 import java.util.HashMap
body.put("model", model);
body.put("messages", messages);
body.put("stream", false);
body.put("think", false);
if (maxTokens > 0) {
    body.put("options", Map.of("num_predict", maxTokens));
}
// 然后 .bodyValue(body)
```
推荐保留宽松上限（摘要 500、聊天 2000）：正常回复远碰不到上限，只有异常情况才熔断。

**Q2：可以不关思考（`think: true`）吗？**
可以，但必须同时接受两个代价：

1. **token 预算要给足**：思考链也计入 `num_predict`，预算不足则 `content` 再次恒为空（即 7.3.10 第 5 条的原 bug）。
   开思考建议 4096 起步（实测一句话输入的思考链 1000 token 还未思考完）。
2. **延迟成倍放大**：关思考 4s 完成的请求，开思考 95s 还未出正文；真实文章摘要分钟级，
   会顶穿前端 120s 超时（见 7.3.9.2），重新变成"点了没反应"。

本项目的三个 AI 场景（摘要、聊天助手、搜索关键词提取）均为轻任务，思考链质量提升有限而延迟放大 10~50 倍，
故默认 `think: false`。若确需为聊天保留思考：把 `think` 改为从 AIService 下传的参数（摘要/提取传 false、聊天传 true），
并同时调大聊天的 token 上限与前端超时。

### 7.3.5 AIService — 策略注册与调度

```java
// backend/src/main/java/com/blog/ai/AIService.java
// [AI] AI 服务 — 持有所有 Provider，支持运行时按名称切换
package com.blog.ai;

import jakarta.annotation.PostConstruct;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

@Service
public class AIService {

    private static final Logger log = LoggerFactory.getLogger(AIService.class);

    private final AiProviderProperties properties;
    private final Map<String, AiProvider> providerMap = new HashMap<>();
    private AiProvider defaultProvider;

    public AIService(AiProviderProperties properties) {
        this.properties = properties;
    }

    @PostConstruct
    public void init() {
        // 根据 application.yml 中的 providers 配置，创建对应的 Provider 实例
        properties.getProviders().forEach((name, config) -> {
            // nativeApi=true 走 Ollama 原生 /api/chat（可关思考）；否则走 OpenAI 兼容层
            AiProvider provider = config.isNativeApi()
                    ? new OllamaProvider(name, config.getModel(), config.getApiKey(), config.getBaseUrl())
                    : new OpenAiCompatibleProvider(name, config.getModel(), config.getApiKey(), config.getBaseUrl());
            providerMap.put(name, provider);
            log.info("AI provider registered: {} -> {} ({}, native={})",
                    name, config.getModel(), config.getBaseUrl(), config.isNativeApi());
        });

        // 设置默认 Provider
        defaultProvider = providerMap.get(properties.getDefaultProvider());
        if (defaultProvider == null && !providerMap.isEmpty()) {
            defaultProvider = providerMap.values().iterator().next();
            log.warn("Default provider '{}' not found, falling back to '{}'",
                    properties.getDefaultProvider(), defaultProvider.name());
        }
    }

    /** 获取所有已注册的 Provider 名称（供前端展示切换）；
     *  默认 Provider 钉在列表首位——前端 AiChatPage 取列表首项作为下拉框初始值，
     *  这样 yml 的 default-provider 才能真正体现在 UI 上。
     *  注意：原实现 .sorted() 是字典序（deepseek < ollama < openai），
     *  会导致下拉框默认选中 deepseek 而非 default-provider */
    public List<String> listProviders() {
        List<String> names = new ArrayList<>(providerMap.keySet());
        Collections.sort(names);
        String defaultName = defaultProvider == null ? "" : defaultProvider.name();
        if (names.remove(defaultName)) {
            names.add(0, defaultName);
        }
        return names;
    }

    /** 使用默认 Provider 生成摘要 */
    public String generateSummary(String content) {
        List<Map<String, String>> messages = List.of(
                Map.of("role", "system", "content", "Summarize the following article in 2-3 sentences."),
                Map.of("role", "user", "content", content)
        );
        return defaultProvider.chat(messages, 200);
    }

    /** 使用默认 Provider 聊天 */
    public String chat(String userMessage, String context) {
        List<Map<String, String>> messages = List.of(
                Map.of("role", "system", "content",
                        "You are a helpful assistant for this blog platform. Context: " + context),
                Map.of("role", "user", "content", userMessage)
        );
        String reply = defaultProvider.chat(messages, 1000);
        return reply.isEmpty() ? "AI service is currently unavailable." : reply;
    }

    /** 使用指定 Provider 聊天（运行时切换） */
    public String chat(String providerName, String userMessage, String context) {
        AiProvider provider = providerMap.getOrDefault(providerName, defaultProvider);
        List<Map<String, String>> messages = List.of(
                Map.of("role", "system", "content",
                        "You are a helpful assistant for this blog platform. Context: " + context),
                Map.of("role", "user", "content", userMessage)
        );
        String reply = provider.chat(messages, 1000);
        return reply.isEmpty() ? "AI service is currently unavailable." : reply;
    }
}
```

### 7.3.6 AIController

```java
// backend/src/main/java/com/blog/ai/AIController.java
// [AI] AI API 控制器 — 提供摘要生成、聊天、Provider 列表接口
package com.blog.ai;

import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

@RestController
@RequestMapping("/api/ai")
public class AIController {

    private final AIService aiService;

    public AIController(AIService aiService) {
        this.aiService = aiService;
    }

    /** 获取所有可用的 AI Provider 列表（前端用于渲染切换下拉框） */
    @GetMapping("/providers")
    public ResponseEntity<Map<String, Object>> providers() {
        return ResponseEntity.ok(Map.of("providers", aiService.listProviders()));
    }

    @PostMapping("/summarize")
    public ResponseEntity<Map<String, String>> summarize(@RequestBody Map<String, String> body) {
        String summary = aiService.generateSummary(body.get("content"));
        return ResponseEntity.ok(Map.of("summary", summary));
    }

    @PostMapping("/chat")
    public ResponseEntity<Map<String, String>> chat(@RequestBody Map<String, String> body) {
        // body 可选传入 "provider" 字段来指定使用哪个模型
        String provider = body.getOrDefault("provider", "");
        String reply = provider.isEmpty()
                ? aiService.chat(body.get("message"), body.getOrDefault("context", ""))
                : aiService.chat(provider, body.get("message"), body.getOrDefault("context", ""));
        return ResponseEntity.ok(Map.of("reply", reply));
    }

    @PostMapping("/smart-search")
    public ResponseEntity<Map<String, String>> smartSearch(@RequestBody Map<String, String> body) {
        String enhanced = aiService.chat("Extract search keywords from: " + body.get("query"), "");
        return ResponseEntity.ok(Map.of("enhanced_query", enhanced));
    }
}
```

### 7.3.7 Ollama 本地免费使用指南

> Ollama 是一个开源的本地大模型运行工具，支持在本地运行 Qwen、Llama 等开源模型，零成本使用 AI 能力。

**操作步骤**：

1. **安装 Ollama**：从 [https://ollama.com](https://ollama.com) 下载并安装
2. **拉取模型**：
   ```powershell
   ollama pull qwen3.5
   ```
3. **确认 Ollama 运行中**：Ollama 安装后默认后台运行，监听 `localhost:11434`
4. **博客后端配置**中，`app.ai.providers.ollama` 指向 Ollama：
   ```yaml
   app:
     ai:
       default-provider: ollama   # 默认走 Ollama
       providers:
         ollama:
           baseUrl: http://localhost:11434
           apiKey: not-used
           model: qwen3.5         # 与 ollama pull 的模型名一致
   ```
5. **启动后端**，调用 `/api/ai/chat` 即可，请求链路：

```
后端 AIService
    → Ollama (localhost:11434 /v1/chat/completions)
        → 本地模型推理（qwen3.5）
            → 返回结果
```

> **验证 Ollama 是否正常运行**：
> ```powershell
> # 查看已拉取的模型
> curl.exe http://localhost:11434/api/tags
>
> # 直接测试聊天
> curl.exe http://localhost:11434/api/chat -d '{"model":"qwen3.5","messages":[{"role":"user","content":"hello"}],"stream":false}'
> ```

> **切换模型不花钱**：`ollama pull <模型名>` 拉取新模型后，只需改 `application.yml` 中的 `model` 字段并重启后端。

### 7.3.8 调用示例

> **前置条件**：AI 接口（`/api/ai/chat`、`/api/ai/summarize`）需要登录后才能调用。先用 Part 1 注册的账号登录获取 Token，后续请求带上 `Authorization` 头。

```powershell
# 0. 登录获取 Token（使用 Part 1 注册的账号）
$loginBody = @{ email = 'alice@example.com'; password = 'password123' } | ConvertTo-Json
$loginResp = Invoke-RestMethod -Uri "http://localhost:8080/api/auth/login" -Method Post -ContentType "application/json" -Body $loginBody
$token = $loginResp.access_token
Write-Host "Token: $token"

# 1. 使用默认 Provider（Ollama 本地免费）聊天
$headers = @{ Authorization = "Bearer $token" }
$body = @{ message = "What is Spring Boot?"; context = "blog about Java" } | ConvertTo-Json
Invoke-RestMethod -Uri "http://localhost:8080/api/ai/chat" -Method Post -Body $body -ContentType "application/json" -Headers $headers

# 2. 指定使用 DeepSeek 云端 Provider 聊天
$body = @{ message = "What is Spring Boot?"; context = "blog about Java"; provider = "deepseek" } | ConvertTo-Json
Invoke-RestMethod -Uri "http://localhost:8080/api/ai/chat" -Method Post -Body $body -ContentType "application/json" -Headers $headers

# 3. 获取所有可用 Provider（公开接口，无需 Token）
Invoke-RestMethod -Uri "http://localhost:8080/api/ai/providers" -Method Get

# 4. 生成文章摘要（需要 Token）
$body = @{ content = "Spring Boot makes it easy to create stand-alone Spring-based applications..." } | ConvertTo-Json
Invoke-RestMethod -Uri "http://localhost:8080/api/ai/summarize" -Method Post -Body $body -ContentType "application/json" -Headers $headers
```

### 7.3.9 前端集成

> 后端 AI 接口就绪后，前端需要：类型定义 → Query Hooks → AI 聊天页面 → 文章详情摘要按钮 → 路由/导航。

#### 7.3.9.1 types.ts — 新增 AI 类型

```typescript
// src/api/types.ts 末尾追加

// [AI] AI Provider 列表响应
export interface AiProvidersResponse {
    providers: string[];
}

// [AI] AI 聊天响应
export interface AiChatResponse {
    reply: string;
}

// [AI] AI 摘要响应
export interface AiSummaryResponse {
    summary: string;
}

// [AI] AI 聊天消息（前端本地状态）
export interface AiMessage {
    role: 'user' | 'assistant';
    content: string;
}
```

#### 7.3.9.2 queries.ts — 新增 AI Hooks

```typescript
// src/api/queries.ts 末尾追加
import type { AiProvidersResponse, AiChatResponse, AiSummaryResponse } from './types';

// ---- AI Queries ----

// [TanStack Query] 获取可用 AI Provider 列表
export function useAiProviders() {
    return useQuery({
        queryKey: ['ai-providers'],
        queryFn: async () => {
            const resp = await api.get<AiProvidersResponse>('/ai/providers');
            return resp.data;
        },
    });
}

// [TanStack Query] AI 聊天 mutation — 每次发送都是一次新请求
// 注意：axios 全局 timeout 为 15s（见 axios.ts），而本地模型（如 Ollama qwen3.5）
// 生成一次回复/摘要可能耗时 20~60s，超时会导致前端静默失败（mutation 进入 error，
// 页面无任何提示）。因此 AI 相关请求必须单独放宽 timeout 到 120s。
export function useAiChat() {
    return useMutation({
        mutationFn: async (data: { message: string; context?: string; provider?: string }) => {
            const resp = await api.post<AiChatResponse>('/ai/chat', data, { timeout: 120000 });
            return resp.data;
        },
    });
}

// [TanStack Query] AI 摘要 mutation — 同上，单独放宽 timeout 到 120s
export function useAiSummary() {
    return useMutation({
        mutationFn: async (content: string) => {
            const resp = await api.post<AiSummaryResponse>('/ai/summarize', { content }, { timeout: 120000 });
            return resp.data;
        },
    });
}
```

#### 7.3.9.3 AiChatPage.tsx — AI 聊天页面

```tsx
// src/pages/AiChatPage.tsx
// [AI] AI 聊天助手 — 支持 Provider 切换 + 多轮对话
import { useState, useRef, useEffect } from 'react';
import { useAiProviders, useAiChat } from '../api/queries';
import { MarkdownRenderer } from '../components/MarkdownRenderer';
import type { AiMessage } from '../api/types';

export function AiChatPage() {
    const { data: providersData } = useAiProviders();
    const aiChat = useAiChat();
    const [messages, setMessages] = useState<AiMessage[]>([]);
    const [input, setInput] = useState('');
    const [selectedProvider, setSelectedProvider] = useState('');
    const messagesEndRef = useRef<HTMLDivElement>(null);

    // 加载 Provider 列表后，默认选中第一个
    useEffect(() => {
        if (providersData?.providers.length && !selectedProvider) {
            setSelectedProvider(providersData.providers[0]);
        }
    }, [providersData, selectedProvider]);

    // 自动滚动到最新消息
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    const handleSend = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!input.trim()) return;

        const userMessage = input.trim();
        setInput('');
        setMessages(prev => [...prev, { role: 'user', content: userMessage }]);

        // 把之前的对话拼成 context 供模型参考
        const context = messages.map(m => `${m.role}: ${m.content}`).join('\n');

        aiChat.mutate(
            { message: userMessage, context, provider: selectedProvider },
            {
                onSuccess: (data) => {
                    setMessages(prev => [...prev, { role: 'assistant', content: data.reply }]);
                },
                onError: () => {
                    setMessages(prev => [...prev, { role: 'assistant', content: 'AI service is currently unavailable.' }]);
                },
            }
        );
    };

    return (
        <div className="max-w-3xl mx-auto">
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow flex flex-col h-[calc(100vh-8rem)]">
                {/* 顶栏：标题 + Provider 切换 */}
                <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
                    <h2 className="text-lg font-bold">AI Assistant</h2>
                    <select
                        value={selectedProvider}
                        onChange={(e) => setSelectedProvider(e.target.value)}
                        className="px-3 py-1.5 text-sm rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700"
                    >
                        {providersData?.providers.map((p) => (
                            <option key={p} value={p}>{p}</option>
                        ))}
                    </select>
                </div>

                {/* 消息列表 */}
                <div className="flex-1 overflow-y-auto p-4 space-y-4">
                    {messages.length === 0 && (
                        <div className="text-center text-gray-400 mt-20">
                            Ask me anything about the blog...
                        </div>
                    )}
                    {messages.map((msg, i) => (
                        <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                            {/* 注意：whitespace-pre-wrap 只给用户消息保留；助手消息走 Markdown 渲染，
                                若保留它会把渲染后 HTML 源码里的换行再显示成空行 */}
                            <div className={`max-w-[75%] px-4 py-2 rounded-2xl text-sm ${
                                msg.role === 'user'
                                    ? 'bg-primary-600 text-white rounded-br-sm whitespace-pre-wrap'
                                    : 'bg-gray-100 dark:bg-gray-700 rounded-bl-sm'
                            }`}>
                                {/* 助手回复复用文章详情页的 Markdown 渲染组件（marked + DOMPurify）；
                                    用户消息保持纯文本 */}
                                {msg.role === 'user' ? (
                                    msg.content
                                ) : (
                                    <MarkdownRenderer
                                        content={msg.content}
                                        className="prose prose-sm dark:prose-invert max-w-none"
                                    />
                                )}
                            </div>
                        </div>
                    ))}
                    {aiChat.isPending && (
                        <div className="flex justify-start">
                            <div className="bg-gray-100 dark:bg-gray-700 px-4 py-2 rounded-2xl rounded-bl-sm text-sm text-gray-400">
                                Thinking...
                            </div>
                        </div>
                    )}
                    <div ref={messagesEndRef} />
                </div>

                {/* 输入框 */}
                <form onSubmit={handleSend} className="p-4 border-t border-gray-200 dark:border-gray-700">
                    <div className="flex gap-2">
                        <input
                            type="text"
                            value={input}
                            onChange={(e) => setInput(e.target.value)}
                            placeholder="Ask AI..."
                            disabled={aiChat.isPending}
                            className="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 focus:ring-2 focus:ring-primary-500 disabled:opacity-50"
                        />
                        <button
                            type="submit"
                            disabled={!input.trim() || aiChat.isPending}
                            className="px-6 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50"
                        >
                            Send
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
```

#### 7.3.9.3b MarkdownRenderer — 支持自定义排版尺寸

聊天气泡里用默认的 `prose-lg` 字号偏大，因此给 `MarkdownRenderer` 加一个可选 `className`
（默认值保持原样，文章详情页不受影响）：

```tsx
// src/components/MarkdownRenderer.tsx — 仅改 Props 与最外层 div 的 className
interface Props {
    content: string;
    /** 可选：覆盖排版类（如聊天气泡传 prose prose-sm dark:prose-invert max-w-none） */
    className?: string;
}

export function MarkdownRenderer({ content, className = 'prose prose-lg dark:prose-invert max-w-none' }: Props) {
    // ... existing code ...
    return (
        <div
            className={className}
            dangerouslySetInnerHTML={{ __html: html }}
        />
    );
}
```

> **前提**：`prose` 类依赖 `@tailwindcss/typography` 插件，需在 `index.css` 中 `@plugin "@tailwindcss/typography";`（末尾分号不能省）。文章详情页的 Markdown 已有样式则说明插件已生效。

#### 7.3.9.4 PostDetailPage.tsx — 新增 AI 摘要按钮

```tsx
// src/pages/PostDetailPage.tsx — 在 header 区域（Edit 按钮旁）添加 AI 摘要按钮
// 新增导入：
import { useAiSummary } from '../api/queries';
import { useState } from 'react';  // 如果尚未导入

// 在组件内部（const { id } = useParams... 之后）添加：
const aiSummary = useAiSummary();
const [showSummary, setShowSummary] = useState(false);

// 在元信息行右侧按钮组（ml-auto 的 div 内、Edit 按钮旁）添加，header 结构见 Part 5 5.8.10：
<button
    onClick={() => {
        aiSummary.mutate(post.content || '');
        setShowSummary(true);
    }}
    disabled={aiSummary.isPending}
    className="px-4 py-2 text-sm bg-purple-100 dark:bg-purple-900 text-purple-700 dark:text-purple-300 rounded-lg hover:bg-purple-200 dark:hover:bg-purple-800 disabled:opacity-50"
>
    {aiSummary.isPending ? 'Generating...' : '✨ AI Summary'}
</button>

// 在 <MarkdownRenderer> 之前添加失败提示区（必须加，否则超时/报错时页面"毫无反应"）：
{showSummary && aiSummary.isError && (
    <div className="mb-6 p-4 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-700 rounded-lg text-sm text-red-600 dark:text-red-300">
        AI 摘要生成失败：{aiSummary.error?.message}
    </div>
)}

// 后端 Provider 静默失败时会返回 200 + 空字符串（见 OpenAiCompatibleProvider.chat 的 catch），
// 此时 data.summary 为 falsy，上面的卡片不会渲染 —— 补一个兜底提示，避免再次"静默无响应"：
{showSummary && aiSummary.isSuccess && !aiSummary.data?.summary && (
    <div className="mb-6 p-4 bg-yellow-50 dark:bg-yellow-900/30 border border-yellow-200 dark:border-yellow-700 rounded-lg text-sm text-yellow-700 dark:text-yellow-300">
        AI 返回了空内容，请检查后端日志中是否有 [provider] AI request failed
    </div>
)}

// 在 <MarkdownRenderer> 之前添加摘要展示区：
{showSummary && aiSummary.data?.summary && (
    <div className="mb-6 p-4 bg-purple-50 dark:bg-purple-900/30 border border-purple-200 dark:border-purple-700 rounded-lg">
        <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-semibold text-purple-700 dark:text-purple-300">AI Summary</span>
            <button onClick={() => setShowSummary(false)} className="text-sm text-gray-400 hover:text-gray-600">✕</button>
        </div>
        <p className="text-sm text-gray-700 dark:text-gray-300">{aiSummary.data.summary}</p>
    </div>
)}
```

#### 7.3.9.5 App.tsx — 新增 AI 聊天路由

```tsx
// src/App.tsx — 新增导入和路由

// 顶部新增导入：
import { AiChatPage } from './pages/AiChatPage';

// 在 <Route element={<ProtectedRoute />}> 内部追加：
<Route path="/ai-chat" element={<AiChatPage />} />
```

#### 7.3.9.6 Navbar.tsx — 新增 AI 聊天入口

```tsx
// src/components/Navbar.tsx — 在 Chat 图标链接旁添加 AI 助手入口

// 在 Chat 图标的 <Link> 之后添加：
<Link to="/ai-chat" className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700" title="AI Assistant">
    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
    </svg>
</Link>
```

#### 7.3.9.7 SecurityConfig — 放行 AI 公开接口

```java
// SecurityConfig.java — 在 permitAll() 白名单中追加：
// GET /api/ai/providers — 前端加载页面时获取可用模型列表（无需登录）
.requestMatchers(HttpMethod.GET, "/api/ai/providers").permitAll()
// 注意：/api/ai/chat 和 /api/ai/summarize 保持 authenticated，需要登录才能使用
```

#### 7.3.10 常见问题：点了 AI Summary 页面没反应

按以下顺序排查（均为实际踩过的坑）：

1. **前端 axios 全局超时 15s，而本地模型生成需 20~60s**：超时后 mutation 进入 error，
   页面若没渲染 `isError` 就是完全静默。解决：AI 请求单独 `{ timeout: 120000 }`（见 7.3.9.2），
   并渲染错误/空内容兜底提示（见 7.3.9.4）。
2. **改了前端代码但页面行为完全不变 = 浏览器还在跑旧 bundle**：SPA 的页内跳转（Home/Posts/Chat
   切换）不会重新请求 JS；若 Vite 重启过或 HMR WebSocket 断过，旧标签页会一直用内存里的旧模块。
   解决：F5 / Ctrl+F5 整页刷新后再试。
3. **验证新 bundle 是否生效**：点击后按钮应变为 `Generating...`；DevTools → Network 中
   `/api/ai/summarize` 应 pending 30s 左右后返回 200。若 15s 就 canceled/failed，说明还是旧 bundle。
4. **后端 200 但 summary 为空字符串**：`OpenAiCompatibleProvider.chat` 捕获异常后返回 `""`，
   状态码仍是 200，前端 `data?.summary` 为 falsy 不渲染。看后端日志有无 `[provider] AI request failed`，
   前端用 7.3.9.4 的黄色兜底提示暴露这种情况。
5. **思考模型把 max_tokens 耗在思考链上，content 恒为空**（qwen3.5 实测）：响应 `finish_reason=length`、
   `completion_tokens` 恰等于 max_tokens、答案全在 `reasoning` 字段——后端不报错（日志无 `AI request failed`），
   前端只看到黄色兜底框。Ollama OpenAI 兼容层关不掉思考（`think:false`/`/no_think`/Modelfile 均无效），
   只有原生 `/api/chat` 支持 `think:false`。解决：ollama 提供商配 `nativeApi: true` 走 `OllamaProvider`（见 7.3.4）。
6. **切到云端 Provider 后回复 "AI service is currently unavailable."，日志报 401 Unauthorized**：
   云端 Provider 的 `apiKey: ${DEEPSEEK_API_KEY:}` 默认值为空串，环境变量未设置时请求带着空 Key 发出，
   被对方拒绝（401）。注意两点：① `/api/ai/providers` 会把**所有配置了的** Provider 都列进下拉框，
   不会校验 Key 是否有效，所以下拉框里能选 ≠ 能用；② Provider 捕获异常返回 `""` 后，
   `AIService.chat` 会兜底返回这句提示且状态码仍 200，因此前端把它当正常回复显示在气泡里。
   解决：没有 Key 就切回 ollama；有 Key 则设置环境变量 `DEEPSEEK_API_KEY`（IDEA Run Configuration 的
   Environment variables 或系统环境变量）后重启后端。另外日志里 `zstd-jni` 的
   `WARNING: A restricted method in java.lang.System has been called` 是 Kafka 依赖加载本地库的
   JDK 原生访问警告，无害，与 AI 故障无关（想消除可加 JVM 参数 `--enable-native-access=ALL-UNNAMED`）。

---

## 7.4 部署配置

### 7.4.1 Kafka Topic 定义

> **说明**：创建文件 `deploy/kafka/topics.json`。

```json
[
  {
    "name": "post-events",
    "partitions": 3,
    "replication_factor": 1,
    "config": { "retention.ms": "604800000" }
  },
  {
    "name": "user-notifications",
    "partitions": 3,
    "replication_factor": 1,
    "config": { "retention.ms": "86400000" }
  }
]
```
