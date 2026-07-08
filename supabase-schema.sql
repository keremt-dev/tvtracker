-- ================================================
-- TV Show Tracker - Supabase Schema
-- ================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ================================================
-- 1. USERS TABLE
-- ================================================
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email VARCHAR(255) UNIQUE NOT NULL,
    username VARCHAR(50) UNIQUE NOT NULL,
    avatar_url TEXT,
    watch_base_url TEXT,
    watch_url_pattern TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Mevcut kurulumlar için migration:
-- ALTER TABLE public.users
--   ADD COLUMN IF NOT EXISTS watch_base_url TEXT,
--   ADD COLUMN IF NOT EXISTS watch_url_pattern TEXT;

-- ================================================
-- 2. USER_SHOWS TABLE
-- ================================================
CREATE TABLE IF NOT EXISTS user_shows (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    tmdb_show_id INTEGER NOT NULL,
    status VARCHAR(20) DEFAULT 'plan_to_watch' CHECK (status IN ('watching', 'completed', 'dropped', 'plan_to_watch')),
    user_rating DECIMAL(3,1) CHECK (user_rating >= 0 AND user_rating <= 10),
    notes TEXT,
    is_favorite BOOLEAN DEFAULT FALSE,
    custom_slug TEXT,
    custom_base_url TEXT,
    custom_url_pattern TEXT,
    link_note TEXT,
    added_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(user_id, tmdb_show_id)
);

-- ================================================
-- 3. WATCHED_EPISODES TABLE
-- ================================================
CREATE TABLE IF NOT EXISTS watched_episodes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    tmdb_show_id INTEGER NOT NULL,
    season_number INTEGER NOT NULL,
    episode_number INTEGER NOT NULL,
    watched_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(user_id, tmdb_show_id, season_number, episode_number)
);

-- ================================================
-- 4. SHOW_CACHE TABLE (Optional - for caching TMDB data)
-- ================================================
CREATE TABLE IF NOT EXISTS show_cache (
    tmdb_show_id INTEGER PRIMARY KEY,
    data JSONB NOT NULL,
    last_updated TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ================================================
-- INDEXES for better performance
-- ================================================

-- user_shows indexes
CREATE INDEX IF NOT EXISTS idx_user_shows_user_id ON user_shows(user_id);
CREATE INDEX IF NOT EXISTS idx_user_shows_tmdb_show_id ON user_shows(tmdb_show_id);
CREATE INDEX IF NOT EXISTS idx_user_shows_status ON user_shows(status);

-- watched_episodes indexes
CREATE INDEX IF NOT EXISTS idx_watched_episodes_user_id ON watched_episodes(user_id);
CREATE INDEX IF NOT EXISTS idx_watched_episodes_show_id ON watched_episodes(tmdb_show_id);
CREATE INDEX IF NOT EXISTS idx_watched_episodes_season ON watched_episodes(season_number);

-- ================================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- ================================================

-- Enable RLS on all tables
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_shows ENABLE ROW LEVEL SECURITY;
ALTER TABLE watched_episodes ENABLE ROW LEVEL SECURITY;
ALTER TABLE show_cache ENABLE ROW LEVEL SECURITY;

-- USERS table policies
CREATE POLICY "Users can view own profile"
    ON users FOR SELECT
    USING (auth.uid() = id);

CREATE POLICY "Users can update own profile"
    ON users FOR UPDATE
    USING (auth.uid() = id);

-- USER_SHOWS table policies
CREATE POLICY "Users can view own shows"
    ON user_shows FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own shows"
    ON user_shows FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own shows"
    ON user_shows FOR UPDATE
    USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own shows"
    ON user_shows FOR DELETE
    USING (auth.uid() = user_id);

-- WATCHED_EPISODES table policies
CREATE POLICY "Users can view own watched episodes"
    ON watched_episodes FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own watched episodes"
    ON watched_episodes FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own watched episodes"
    ON watched_episodes FOR DELETE
    USING (auth.uid() = user_id);

-- SHOW_CACHE table policies (public read, authenticated write)
CREATE POLICY "Anyone can view cached shows"
    ON show_cache FOR SELECT
    USING (true);

CREATE POLICY "Authenticated users can insert cache"
    ON show_cache FOR INSERT
    WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can update cache"
    ON show_cache FOR UPDATE
    USING (auth.uid() IS NOT NULL);

-- ================================================
-- FUNCTIONS & TRIGGERS
-- ================================================

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggers for updated_at
CREATE TRIGGER update_users_updated_at
    BEFORE UPDATE ON users
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_user_shows_updated_at
    BEFORE UPDATE ON user_shows
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ================================================
-- AUTOMATIC USER CREATION ON SIGNUP
-- ================================================

-- Function to create user profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.users (id, email, username)
    VALUES (
        NEW.id,
        NEW.email,
        COALESCE(NEW.raw_user_meta_data->>'username', SPLIT_PART(NEW.email, '@', 1))
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to call the function on signup
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_new_user();

-- ================================================
-- SAMPLE DATA (Optional - for testing)
-- ================================================

-- Insert a test user (only if auth.uid() matches)
-- INSERT INTO users (id, email, username)
-- VALUES ('00000000-0000-0000-0000-000000000000', 'test@example.com', 'testuser')
-- ON CONFLICT (id) DO NOTHING;

-- ================================================
-- GRANTS
-- ================================================

-- Grant usage on sequences
GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO authenticated;
GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO anon;

-- Grant select on tables for anon (public) users
GRANT SELECT ON users TO anon;
GRANT SELECT ON show_cache TO anon;

-- Grant full access to authenticated users
GRANT ALL ON users TO authenticated;
GRANT ALL ON user_shows TO authenticated;
GRANT ALL ON watched_episodes TO authenticated;
GRANT ALL ON show_cache TO authenticated;
