package com.blog.ai;

import jakarta.annotation.PostConstruct;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.util.*;

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
            AiProvider provider = config.isNativeApi() ?
                    new OllamaProvider(name, config.getModel(), config.getApiKey(), config.getBaseUrl()) :
                    new OpenAiCompatibleProvider(name, config.getModel(), config.getApiKey(), config.getBaseUrl()
            );
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

    /** 获取所有已注册的 Provider 名称（供前端展示切换） */
    public List<String> listProviders() {
        List<String> names = new ArrayList<>(providerMap.keySet());
        Collections.sort(names);
        String defaultName = defaultProvider == null ? "" : defaultProvider.name();
        if (names.remove(defaultName)) {
            names.addFirst(defaultName);
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
