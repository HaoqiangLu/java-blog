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
