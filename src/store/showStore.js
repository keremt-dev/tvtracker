import { create } from 'zustand'

export const useShowStore = create((set, get) => ({
  userShows: [],
  watchedEpisodes: new Map(),
  loading: false,

  setUserShows: (shows) => set({ userShows: shows }),

  addShow: (show) => set((state) => ({
    userShows: [...state.userShows, show],
  })),

  updateShow: (tmdbShowId, updates) => set((state) => ({
    userShows: state.userShows.map((show) =>
      show.tmdb_show_id === tmdbShowId
        ? { ...show, ...updates }
        : show
    ),
  })),

  removeShow: (tmdbShowId) => set((state) => ({
    userShows: state.userShows.filter((show) => show.tmdb_show_id !== tmdbShowId),
  })),

  setWatchedEpisodes: (showId, episodes) => set((state) => {
    const newMap = new Map(state.watchedEpisodes)
    newMap.set(showId, episodes)
    return { watchedEpisodes: newMap }
  }),

  setAllWatchedEpisodes: (episodes) => set((state) => {
    const newMap = new Map()
    episodes.forEach(ep => {
      const showId = ep.tmdb_show_id
      const showEpisodes = newMap.get(showId) || []
      showEpisodes.push(ep)
      newMap.set(showId, showEpisodes)
    })
    return { watchedEpisodes: newMap }
  }),

  addWatchedEpisode: (showId, seasonNumber, episodeNumber) => set((state) => {
    const showEpisodes = state.watchedEpisodes.get(showId) || []

    // Zaten işaretliyse state'i değiştirme
    if (showEpisodes.some((ep) =>
      ep.season_number === seasonNumber && ep.episode_number === episodeNumber
    )) {
      return state
    }

    const newMap = new Map(state.watchedEpisodes)
    newMap.set(showId, [
      ...showEpisodes,
      {
        season_number: seasonNumber,
        episode_number: episodeNumber,
        watched_at: new Date().toISOString(),
      },
    ])

    return { watchedEpisodes: newMap }
  }),

  removeWatchedEpisode: (showId, seasonNumber, episodeNumber) => set((state) => {
    const newMap = new Map(state.watchedEpisodes)
    const showEpisodes = newMap.get(showId) || []

    const filtered = showEpisodes.filter(
      (ep) => !(ep.season_number === seasonNumber && ep.episode_number === episodeNumber)
    )

    newMap.set(showId, filtered)
    return { watchedEpisodes: newMap }
  }),

  isEpisodeWatched: (showId, seasonNumber, episodeNumber) => {
    const showEpisodes = get().watchedEpisodes.get(showId) || []
    return showEpisodes.some(
      (ep) => ep.season_number === seasonNumber && ep.episode_number === episodeNumber
    )
  },

  clear: () => set({
    userShows: [],
    watchedEpisodes: new Map(),
  }),
}))
