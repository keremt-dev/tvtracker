import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    'Supabase yapılandırması eksik: VITE_SUPABASE_URL ve VITE_SUPABASE_ANON_KEY tanımlı değil. ' +
      'Yerelde .env dosyasını, canlıda Vercel > Settings > Environment Variables ayarlarını kontrol edin.'
  )
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
  },
})

// Auth işlemleri src/store/authStore.js üzerinden yürür.

// Database functions
export const addUserShow = async (userId, tmdbShowId, status = 'plan_to_watch') => {
  const { data, error } = await supabase
    .from('user_shows')
    .upsert({
      user_id: userId,
      tmdb_show_id: tmdbShowId,
      status,
      updated_at: new Date().toISOString(),
    }, {
      onConflict: 'user_id,tmdb_show_id'
    })

  if (error) throw error
  return data
}

export const updateUserShow = async (userId, tmdbShowId, updates) => {
  const { data, error } = await supabase
    .from('user_shows')
    .update({
      ...updates,
      updated_at: new Date().toISOString(),
    })
    .eq('user_id', userId)
    .eq('tmdb_show_id', tmdbShowId)

  if (error) throw error
  return data
}

export const getUserShows = async (userId) => {
  const { data, error } = await supabase
    .from('user_shows')
    .select('*')
    .eq('user_id', userId)

  if (error) throw error
  return data
}

export const deleteUserShow = async (userId, tmdbShowId) => {
  const { error } = await supabase
    .from('user_shows')
    .delete()
    .eq('user_id', userId)
    .eq('tmdb_show_id', parseInt(tmdbShowId))

  if (error) throw error
}

export const addWatchedEpisode = async (userId, tmdbShowId, seasonNumber, episodeNumber) => {
  // Ensure session is active before operation
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) {
    throw new Error('No active session. Please log in again.')
  }

  const { data, error } = await supabase
    .from('watched_episodes')
    .upsert({
      user_id: userId,
      tmdb_show_id: tmdbShowId,
      season_number: seasonNumber,
      episode_number: episodeNumber,
      watched_at: new Date().toISOString(),
    }, {
      onConflict: 'user_id,tmdb_show_id,season_number,episode_number'
    })

  if (error) throw error
  return data
}

export const removeWatchedEpisode = async (userId, tmdbShowId, seasonNumber, episodeNumber) => {
  const { error } = await supabase
    .from('watched_episodes')
    .delete()
    .eq('user_id', userId)
    .eq('tmdb_show_id', tmdbShowId)
    .eq('season_number', seasonNumber)
    .eq('episode_number', episodeNumber)

  if (error) throw error
}

export const getWatchedEpisodes = async (userId, tmdbShowId = null) => {
  const query = supabase
    .from('watched_episodes')
    .select('*')
    .eq('user_id', userId)

  if (tmdbShowId) {
    query.eq('tmdb_show_id', tmdbShowId)
  }

  const { data, error } = await query

  if (error) throw error
  return data
}

export const updateProfile = async (userId, updates) => {
  const { username, avatar_url, avatar_meta } = updates

  // 1. Update auth metadata (for session persistence and UI)
  const authUpdates = {
    username: username,
    avatar_url: avatar_url
  }

  if (avatar_meta) {
    authUpdates.avatarStyle = avatar_meta.style
    authUpdates.avatarSeed = avatar_meta.seed
  }

  const { error: authError } = await supabase.auth.updateUser({
    data: authUpdates
  })
  if (authError) throw authError

  // 2. Update public users table (only existing columns)
  const dbUpdates = {
    username,
    avatar_url,
    updated_at: new Date().toISOString(),
  }

  const { data, error } = await supabase
    .from('users')
    .update(dbUpdates)
    .eq('id', userId)
    .select()

  if (error) throw error
  return data
}

/**
 * Update custom watch link settings for a specific show
 * @param {string} userId - User ID
 * @param {number} tmdbShowId - TMDB Show ID
 * @param {Object} linkSettings - Link settings object
 * @param {string|null} linkSettings.custom_slug - Custom slug override
 * @param {string|null} linkSettings.custom_base_url - Custom base URL override
 * @param {string|null} linkSettings.custom_url_pattern - Custom pattern override
 * @param {string|null} linkSettings.link_note - Helper note for this show
 */
export const updateShowWatchLinkSettings = async (userId, tmdbShowId, linkSettings) => {
  const { custom_slug, custom_base_url, custom_url_pattern, link_note } = linkSettings

  const updates = {
    custom_slug: custom_slug || null,
    custom_base_url: custom_base_url || null,
    custom_url_pattern: custom_url_pattern || null,
    link_note: link_note || null,
    updated_at: new Date().toISOString(),
  }

  const { data, error } = await supabase
    .from('user_shows')
    .update(updates)
    .eq('user_id', userId)
    .eq('tmdb_show_id', tmdbShowId)
    .select()

  if (error) throw error
  return data
}

/**
 * Clear all custom watch link settings for a show (reset to global)
 */
export const clearShowWatchLinkSettings = async (userId, tmdbShowId) => {
  return updateShowWatchLinkSettings(userId, tmdbShowId, {
    custom_slug: null,
    custom_base_url: null,
    custom_url_pattern: null,
    link_note: null,
  })
}
