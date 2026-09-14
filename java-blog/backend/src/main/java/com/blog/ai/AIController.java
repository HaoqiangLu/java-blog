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
        String reply = provider.isEmpty() ?
                aiService.chat(body.get("message"), body.getOrDefault("context", "")) :
                aiService.chat(provider, body.get("message"), body.getOrDefault("context", ""));
        return ResponseEntity.ok(Map.of("reply", reply));
    }

    @PostMapping("/smart-search")
    public ResponseEntity<Map<String, String>> smartSearch(@RequestBody Map<String, String> body) {
        String enhanced = aiService.chat("Extract search keywords from: " + body.get("query"), "");
        return ResponseEntity.ok(Map.of("enhanced_query", enhanced));
    }
}
