package com.blog.model;

import jakarta.persistence.*;
import lombok.*;
import java.time.Instant;
import java.util.UUID;

/*
 * @Entity / @Table : [JPA（规范），Hibernate（实现）] 声明<这个类 = 一张表>，Hibernate 负责真正干活
 * @Getter/@Setter/@Builder : [Lombok] 生成读写方法和 Builder，省手写样板
 */
@Entity                 // 告诉 JPA：这个类对应数据库里的一张表
@Table(name="users")    // 对应哪张表
@Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder // Lombok：生成读写方法/构造器/Builder
public class User {
    /*
     * @Id / @GeneratedValue : [JPA] 标主键，并让主键自动生成（这里是 UUID）
     * @Column : [JPA] 声明字段的列名、是否可空、是否唯一、长度
     */
    @Id // 主键
    @GeneratedValue(strategy = GenerationType.UUID) // 主键由 Hibernate 自动生成 UUID
    @Column(columnDefinition = "uuid")              // 数据库列类型是 uuid（必须写，见深挖）
    private UUID id;

    @Column(nullable = false, unique = true, length = 255)
    private String username;

    @Column(nullable = false, unique = true, length = 255)
    private String email;

    @Column(name = "password_hash", nullable = false)   // Java 叫 passwordHash，数据库列叫 password_hash
    private String passwordHash;

    @Column(name = "display_name", length = 100)
    private String displayName;

    @Column(name = "avatar_url", columnDefinition = "TEXT")
    private String avatarUrl;

    @Column(columnDefinition = "TEXT")
    @Builder.Default
    private String bio = "";

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    @Column(length = 20)
    @Builder.Default    // 不写这行，Builder 会忽略下面的 "active" 默认值
    private String status = "active";

    /*
     * @PrePersist : [JPA 生命周期回调] 存库前自动填时间戳，不用每次手写
     */
    @PrePersist // 存库前自动调用：填创建/更新时间
    protected void onCreate() {
        createdAt = Instant.now();
        updatedAt = Instant.now();
    }

    @PreUpdate
    protected void onUpdate() {
        updatedAt = Instant.now();
    }
}
