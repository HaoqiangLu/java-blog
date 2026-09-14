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

    public OllamaProvider(String providerName, String model, String apiKey, String baseUrl) {
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
