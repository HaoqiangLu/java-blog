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
