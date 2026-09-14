package com.blog.ai;

import java.util.List;
import java.util.Map;

public interface AiProvider {

    String name();

    String chat(List<Map<String, String>> messages, int maxTokens);
}
