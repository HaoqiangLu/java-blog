/*
V001__xxx.sql 文件名 : [Flyway 约定] V = 版本化迁移，001 = 版本号，双下划线后是描述。Flyway 按版本号顺序执行，且只执行一次
CHECK (status IN (...)) : [PostgreSQL] 数据库层面的最后防线：status 只能是这三个值之一，写错直接拒绝
CREATE INDEX : [PostgreSQL] 给常查的列建索引，查询更快
ddl-auto: validate（在 yml 里） : [Hibernate] 启动时只校验「实体和表结构对不对得上」，不自动改表——改表这件事交给 Flyway
*/
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    username VARCHAR(255) NOT NULL UNIQUE,
    email VARCHAR(255) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    display_name VARCHAR(100),
    avatar_url TEXT,
    bio TEXT DEFAULT '',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
    status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'banned', 'deleted'))
);

CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_username ON users(username);
CREATE INDEX idx_users_created_at ON users(created_at DESC);

-- [PostgreSQL] 自动更新 updated_at 触发器（后续 V002/V003 的表会复用此函数）
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_users_updated_at
    BEFORE UPDATE ON users
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
