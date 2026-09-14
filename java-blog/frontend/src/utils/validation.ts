// [输入校验] 前端校验 — 提交前即时反馈；规则与后端 DTO 保持一致

export interface ValidationResult {
    valid: boolean;
    error?: string;
}

// 对应后端 RegisterRequest.username：@NotBlank @Size(min=3, max=50)
export function validateUsername(username: string): ValidationResult {
    if (username.length < 3) return { valid: false, error: 'Username must be at least 3 characters' };
    if (username.length > 50) return { valid: false, error: 'Username must be at most 50 characters' };
    return { valid: true };
}

// 对应后端 @Email
export function validateEmail(email: string): ValidationResult {
    if (!/^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(email))
        return { valid: false, error: 'Invalid email format' };
    return { valid: true };
}

// 对应后端 RegisterRequest.password：@NotBlank @Size(min=8)
export function validatePassword(password: string): ValidationResult {
    if (password.length < 8) return { valid: false, error: 'Password must be at least 8 characters' };
    return { valid: true };
}