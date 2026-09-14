CREATE TABLE IF NOT EXISTS user_rooms (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    room_id UUID NOT NULL REFERENCES chat_rooms(id) ON DELETE CASCADE,
    joined_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
    last_read_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    role VARCHAR(20) DEFAULT 'member'
    CHECK (role IN ('owner', 'admin', 'member')),
    CONSTRAINT uq_user_room UNIQUE(user_id, room_id)
);

CREATE INDEX idx_user_rooms_user ON user_rooms(user_id);
CREATE INDEX idx_user_rooms_room ON user_rooms(room_id);