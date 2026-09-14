package com.blog.repository;

import com.blog.model.User;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Transactional;

import java.util.Optional;
import java.util.UUID;

/*
 * extends JpaRepository<User, UUID> : [Spring Data JPA] 白送 save / findById / findAll / delete 等一整套 CRUD，一行不用写
 * @Repository : [Spring 容器] 标记这是数据访问层（在接口上其实可省，Spring Data 会自动注册）
 */
@Repository
public interface UserRepository extends JpaRepository<User, UUID> { // 注意：是 interface，不用写实现！

    /*
     * findByEmailAndStatusNot(...) : [Spring Data 方法名派生查询]
     *              方法名就是查询语句：Spring 解析{findBy + Email + And + StatusNot}自动生成 WHERE email=? AND status<>?
     * Optional<User> : [Java 标准库] 查询结果{可能有也可能没有}，用 Optional 包起来，避免 null 判断出错
     */
    // 只写方法名，Spring Data 自动帮你生成查询
    Optional<User> findByIdAndStatusNot(UUID id, String status);

    Optional<User> findByEmailAndStatusNot(String email, String status);

    Optional<User> findByUsernameAndStatusNot(String username, String status);

    Page<User> findByStatusNot(String status, Pageable pageable);

    @Modifying
    @Transactional
    @Query("UPDATE User u SET u.status = 'deleted' WHERE u.id = :id")
    int softDelete(UUID id);

    @Modifying
    @Transactional
    @Query("UPDATE User u SET u.passwordHash = :newHash WHERE u.id = :id")
    int updatePassword(UUID id, String newHash);
}
