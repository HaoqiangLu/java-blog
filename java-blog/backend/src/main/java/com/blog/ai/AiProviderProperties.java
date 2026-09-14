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
        private boolean nativeApi = false;
    }
}
