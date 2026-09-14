package com.blog.dto.request;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import lombok.Data;

/**
 * 为什么不直接用 User 实体来接请求，非要单独建一个 DTO？
 * 因为注册请求里只有 username/email/password，而 User 有 id、status、createdAt 等一堆字段。
 * 如果直接用 User 接收，前端就可能偷偷传一个 "status":"banned" 进来把自己设成管理员——这叫过度绑定漏洞。
 * DTO 就是「只暴露该暴露的字段」。
 */

@Data   // Lombok：自动生成 getter/setter/toString 等，省去手写
public class RegisterRequest {
    /*
     * @NotBlank : [Bean Validation] 字符串不能为 null、空串、纯空格
     * @Size(min,max) : [Bean Validation] 长度限制
     */
    @NotBlank @Size(min = 3, max = 50, message = "Username must be 3-50 chars")
    private String username;

    @NotBlank @Email    // @Email : [Bean Validation] 必须是邮箱格式
    private String email;

    @NotBlank @Size(min = 8)    // 密码至少 8 位
    private String password;
}
