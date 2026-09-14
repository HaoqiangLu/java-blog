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
