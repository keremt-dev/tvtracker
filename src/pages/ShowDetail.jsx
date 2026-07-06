import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { useShowStore } from '../store/showStore'
import { useShowDetails, useSimilarShows } from '../hooks/useQueries'
import { addUserShow, getUserShow, updateUserShow, getWatchedEpisodes, updateShowWatchLinkSettings, clearShowWatchLinkSettings } from '../services/supabase'
import { getImageUrl, getBackdropUrl, WATCH_STATUS, STATUS_LABELS } from '../utils/constants'
import { ShowCardSkeleton } from '../components/common/Skeleton'
import { useToast } from '../components/common/Toast'
import { sanitizeNote, validateNote } from '../utils/sanitize'
import { getCustomWatchSlug, setCustomWatchSlug, slugify, getWatchUrlSettings } from '../utils/watchUrl'

export default function ShowDetail() {
  const { id } = useParams()
  const { user } = useAuth()
  const { userShows, setUserShows, isEpisodeWatched } = useShowStore()
  const toast = useToast()

  // React Query hooks for cached data
  const { data: show, isLoading: showLoading } = useShowDetails(id)
  const { data: similarData } = useSimilarShows(id)
  const similarShows = similarData?.results || []

  const [userShow, setUserShow] = useState(null)
  const [addingToList, setAddingToList] = useState(false)
  const [isNoteOpen, setIsNoteOpen] = useState(false)
  const [noteText, setNoteText] = useState('')
  const [savingNote, setSavingNote] = useState(false)
  const [noteError, setNoteError] = useState('')

  // Custom watch link settings state
  const [isSlugModalOpen, setIsSlugModalOpen] = useState(false)
  const [customSlugText, setCustomSlugText] = useState('')
  const [customBaseUrlText, setCustomBaseUrlText] = useState('')
  const [customPatternText, setCustomPatternText] = useState('')
  const [linkNoteText, setLinkNoteText] = useState('')
  const [watchUrlConfig, setWatchUrlConfig] = useState({ baseUrl: '', pattern: '' })
  const [savingLinkSettings, setSavingLinkSettings] = useState(false)

  // Fetch user-specific data (not cached by React Query since it's user-specific)
  useEffect(() => {
    const fetchUserData = async () => {
      if (!user || !id) return

      try {
        const [found, watched] = await Promise.all([
          getUserShow(user.id, parseInt(id)),
          getWatchedEpisodes(user.id, parseInt(id)),
        ])

        setUserShow(found || null)
        useShowStore.getState().setWatchedEpisodes(parseInt(id), watched)

        if (found) {
          setNoteText(found.notes || '')
        }
      } catch (error) {
        console.error('Error fetching user data:', error)
      }
    }

    fetchUserData()
  }, [id, user])

  // Load custom link settings and watch URL config
  useEffect(() => {
    if (id && userShow) {
      // Load global settings
      setWatchUrlConfig(getWatchUrlSettings())

      // Load per-show settings from Supabase userShow object
      setCustomSlugText(userShow.custom_slug || '')
      setCustomBaseUrlText(userShow.custom_base_url || '')
      setCustomPatternText(userShow.custom_url_pattern || '')
      setLinkNoteText(userShow.link_note || '')
    } else if (id && !userShow) {
      // Fallback: Try to migrate from localStorage if no userShow yet
      const legacySlug = getCustomWatchSlug(id)
      if (legacySlug) {
        setCustomSlugText(legacySlug)
      }
      setWatchUrlConfig(getWatchUrlSettings())
    }
  }, [id, userShow])

  const handleSaveCustomLinkSettings = async () => {
    if (!user || !userShow) {
      toast.error('Kaydetmek için giriş yapmalısınız')
      return
    }

    setSavingLinkSettings(true)
    try {
      const linkSettings = {
        custom_slug: customSlugText.trim() || null,
        custom_base_url: customBaseUrlText.trim() || null,
        custom_url_pattern: customPatternText.trim() || null,
        link_note: linkNoteText.trim() || null,
      }

      await updateShowWatchLinkSettings(user.id, parseInt(id), linkSettings)

      // Update local userShow state
      setUserShow({
        ...userShow,
        ...linkSettings,
      })

      // Remove legacy localStorage slug if exists
      if (getCustomWatchSlug(id)) {
        setCustomWatchSlug(id, '')
      }

      setIsSlugModalOpen(false)
      toast.success('Link ayarları kaydedildi!')
    } catch (error) {
      console.error('Error saving link settings:', error)
      toast.error('Ayarlar kaydedilemedi. Lütfen tekrar deneyin.')
    } finally {
      setSavingLinkSettings(false)
    }
  }

  const handleResetToGlobal = async () => {
    if (!user || !userShow) return

    if (!confirm('Tüm özel ayarları silip global ayarlara dönmek istediğinizden emin misiniz?')) {
      return
    }

    setSavingLinkSettings(true)
    try {
      await clearShowWatchLinkSettings(user.id, parseInt(id))

      // Clear local state
      setCustomSlugText('')
      setCustomBaseUrlText('')
      setCustomPatternText('')
      setLinkNoteText('')

      // Update userShow
      setUserShow({
        ...userShow,
        custom_slug: null,
        custom_base_url: null,
        custom_url_pattern: null,
        link_note: null,
      })

      toast.success('Global ayarlara dönüldü!')
    } catch (error) {
      console.error('Error resetting settings:', error)
      toast.error('Sıfırlama başarısız oldu.')
    } finally {
      setSavingLinkSettings(false)
    }
  }

  const handleUpdateUserShow = async (updates) => {
    if (!user || !userShow) return

    try {
      await updateUserShow(user.id, parseInt(id), updates)
      const updatedUserShow = { ...userShow, ...updates }
      setUserShow(updatedUserShow)
      useShowStore.getState().updateShow(parseInt(id), updates)
    } catch (error) {
      console.error('Error updating show:', error)
    }
  }

  const handleSaveNote = async () => {
    setNoteError('')

    // Validate note length
    const validation = validateNote(noteText)
    if (!validation.valid) {
      setNoteError(validation.error)
      return
    }

    // Sanitize note (remove HTML)
    const sanitized = sanitizeNote(noteText)

    setSavingNote(true)
    try {
      await handleUpdateUserShow({ notes: sanitized })
      setNoteText(sanitized)
      setIsNoteOpen(false)
    } catch (error) {
      setNoteError('Not kaydedilemedi. Lütfen tekrar deneyin.')
    } finally {
      setSavingNote(false)
    }
  }

  const handleAddToList = async (status) => {
    if (!user) {
      toast.warning('Listeye eklemek için giriş yapmalısınız')
      return
    }

    setAddingToList(true)
    try {
      await addUserShow(user.id, parseInt(id), status)

      const newShow = {
        user_id: user.id,
        tmdb_show_id: parseInt(id),
        status,
        user_rating: 0,
        is_favorite: false,
        notes: '',
      }
      setUserShow(newShow)
      useShowStore.getState().addShow(newShow)
    } catch (error) {
      console.error('Error adding show to list:', error)
    } finally {
      setAddingToList(false)
    }
  }

  if (showLoading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-500"></div>
      </div>
    )
  }

  if (!show) {
    return (
      <div className="card text-center py-12 animate-fade-in">
        <p className="text-slate-400">Dizi bulunamadı</p>
      </div>
    )
  }

  const backdropUrl = getBackdropUrl(show.backdrop_path)
  const posterUrl = getImageUrl(show.poster_path, 'w342')

  return (
    <div className="space-y-12 animate-fade-in">
      {/* Hero Background */}
      {backdropUrl && (
        <div className="absolute top-0 left-0 w-full h-[60vh] -z-10 overflow-hidden">
          <img
            src={backdropUrl}
            alt="backdrop"
            className="w-full h-full object-cover opacity-30 blur-sm scale-105"
          />
          <div className="absolute inset-0 bg-gradient-to-b from-slate-900/0 via-slate-900/60 to-slate-900" />
        </div>
      )}

      <div className="flex flex-col lg:flex-row gap-10 lg:items-start pt-10">
        {/* Poster */}
        <div className="flex-shrink-0 mx-auto lg:mx-0">
          <div className="relative group">
            <img
              src={posterUrl}
              alt={show.name}
              className="w-72 rounded-2xl shadow-2xl border border-slate-700/50 shadow-indigo-500/10 transition-transform duration-500 group-hover:scale-105"
            />
            {userShow?.is_favorite && (
              <div className="absolute -top-3 -right-3 bg-red-500 text-white p-2.5 rounded-full shadow-lg glow-red animate-pulse">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
                </svg>
              </div>
            )}
          </div>
        </div>

        {/* Info Content */}
        <div className="flex-1 space-y-6 animate-slide-up">
          <div className="space-y-3">
            <div className="flex items-start justify-between gap-4">
              <h1 className="text-4xl md:text-5xl font-extrabold leading-tight">
                <span className="gradient-text">{show.name}</span>
              </h1>
              {userShow && (
                <button
                  onClick={() => handleUpdateUserShow({ is_favorite: !userShow.is_favorite })}
                  className={`p-3.5 rounded-xl transition-all duration-300 ${userShow.is_favorite
                    ? 'bg-red-500/20 text-red-500 shadow-lg shadow-red-500/20 active:scale-95'
                    : 'bg-slate-800/50 backdrop-blur border border-slate-700 text-slate-400 hover:text-red-400 hover:border-red-500/50'
                    }`}
                  title={userShow.is_favorite ? 'Favorilerden Çıkar' : 'Favorilere Ekle'}
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className={`h-6 w-6 ${userShow.is_favorite ? 'animate-pulse-once' : ''}`} fill={userShow.is_favorite ? "currentColor" : "none"} viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
                  </svg>
                </button>
              )}
            </div>
            {show.tagline && (
              <p className="text-xl text-slate-400 italic font-medium">"{show.tagline}"</p>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-slate-400 text-sm font-medium">
            <span className="bg-slate-800/50 backdrop-blur px-3 py-1 rounded-full border border-slate-700/50">{show.first_air_date?.split('-')[0]}</span>
            <span className="flex items-center gap-1.5"><span className="text-indigo-400">#</span> {show.number_of_seasons} Sezon</span>
            <span className="flex items-center gap-1.5"><span className="text-indigo-400">#</span> {show.number_of_episodes} Bölüm</span>
            {show.vote_average > 0 && (
              <span className="flex items-center gap-1.5 bg-yellow-500/10 text-yellow-500 px-3 py-1 rounded-full border border-yellow-500/20">
                ⭐ <span className="font-bold">{show.vote_average.toFixed(1)}</span>
              </span>
            )}
          </div>

          <div className="flex flex-wrap gap-2">
            {show.genres?.map((genre) => (
              <span
                key={genre.id}
                className="px-4 py-1.5 bg-indigo-500/10 text-indigo-300 rounded-full text-xs font-bold border border-indigo-500/20 hover:bg-indigo-500/20 transition-colors"
              >
                {genre.name}
              </span>
            ))}
          </div>

          <p className="text-slate-300 leading-relaxed text-lg max-w-3xl">
            {show.overview || 'Özet bilgisi bulunmuyor.'}
          </p>

          {/* Add to list */}
          {user && !userShow && (
            <div className="flex flex-wrap gap-4 pt-4">
              <button
                onClick={() => handleAddToList(WATCH_STATUS.PLAN_TO_WATCH)}
                disabled={addingToList}
                className="btn-glow btn-primary px-8 py-3.5 rounded-2xl font-black text-lg shadow-indigo-500/20 active:scale-95 disabled:opacity-50"
              >
                {addingToList ? (
                  <div className="flex items-center gap-3">
                    <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    <span>Ekleniyor...</span>
                  </div>
                ) : (
                  'Listeme Ekle'
                )}
              </button>
              <button
                onClick={() => handleAddToList(WATCH_STATUS.WATCHING)}
                disabled={addingToList}
                className="btn-glass px-8 py-3.5 rounded-2xl font-bold text-slate-200 hover:text-white transition-all active:scale-95 disabled:opacity-50"
              >
                İzliyorum
              </button>
            </div>
          )}

          {userShow && (
            <div className="grid sm:flex flex-wrap items-center gap-6 pt-6">
              {/* Rating Section */}
              <div className="space-y-3 bg-slate-800/40 backdrop-blur-md p-5 rounded-2xl border border-slate-700/50">
                <label className="text-xs uppercase tracking-[0.2em] text-slate-500 font-black">Senin Puanın</label>
                <div className="flex gap-1.5">
                  {[...Array(10)].map((_, i) => (
                    <button
                      key={i}
                      onClick={() => handleUpdateUserShow({ user_rating: i + 1 })}
                      className={`w-9 h-9 rounded-xl flex items-center justify-center transition-all duration-300 hover:scale-110 active:scale-90 ${(userShow.user_rating || 0) > i
                        ? 'bg-gradient-to-br from-indigo-500 to-purple-600 text-white font-black shadow-lg shadow-indigo-500/25'
                        : 'bg-slate-900 border border-slate-700 text-slate-500 hover:border-indigo-500/50 hover:text-indigo-400'
                        }`}
                    >
                      {i + 1}
                    </button>
                  ))}
                </div>
              </div>

              {/* Notes Card */}
              <button
                onClick={() => setIsNoteOpen(true)}
                className="flex flex-col items-center justify-center gap-3 w-40 h-[92px] bg-indigo-500/5 backdrop-blur-md rounded-2xl border border-indigo-500/20 hover:bg-indigo-500/10 hover:border-indigo-500/40 transition-all duration-300 group"
              >
                <span className="text-[10px] uppercase tracking-[0.2em] text-slate-500 font-black group-hover:text-indigo-400 transition-colors">Dizi Notu</span>
                <div className="flex items-center gap-2 text-indigo-400 font-bold">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                  </svg>
                  <span className="text-sm">{userShow.notes ? 'Düzenle' : 'Ekle'}</span>
                </div>
              </button>

              {/* Custom Watch Link Card */}
              {watchUrlConfig.baseUrl && (
                <button
                  onClick={() => setIsSlugModalOpen(true)}
                  className="flex flex-col items-center justify-center gap-3 w-40 h-[92px] bg-purple-500/5 backdrop-blur-md rounded-2xl border border-purple-500/20 hover:bg-purple-500/10 hover:border-purple-500/40 transition-all duration-300 group"
                >
                  <span className="text-[10px] uppercase tracking-[0.2em] text-slate-500 font-black group-hover:text-purple-400 transition-colors">Link Ayarı</span>
                  <div className="flex items-center gap-2 text-purple-400 font-bold">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                    </svg>
                    <span className="text-sm">{customSlugText ? 'Düzenle' : 'Ayarla'}</span>
                  </div>
                </button>
              )}
            </div>
          )}

          {userShow && (
            <div className="inline-flex items-center gap-3 px-5 py-2.5 bg-slate-800/80 backdrop-blur rounded-2xl border border-slate-700/50">
              <span className="text-slate-500 text-sm font-bold uppercase tracking-widest">Durum:</span>
              <span className="font-extrabold text-indigo-400">{STATUS_LABELS[userShow.status]}</span>
            </div>
          )}
        </div>
      </div>

      {/* Seasons Section */}
      <section className="animate-slide-up" style={{ animationDelay: '200ms' }}>
        <h2 className="text-3xl font-extrabold mb-6 flex items-center gap-3">
          <span className="w-1.5 h-8 bg-indigo-500 rounded-full" />
          Sezonlar
        </h2>
        <div className="grid md:grid-cols-2 gap-6">
          {show.seasons?.filter(s => s.season_number > 0).map((season) => (
            <Link
              key={season.id}
              to={`/show/${id}/season/${season.season_number}`}
              className="group relative flex gap-5 p-4 bg-slate-800/40 backdrop-blur-md rounded-2xl border border-slate-700/50 hover:bg-slate-800/70 hover:border-indigo-500/30 transition-all duration-300 overflow-hidden"
            >
              {/* Shimmer effect on hover */}
              <div className="absolute inset-0 opacity-0 group-hover:opacity-10 pointer-events-none animate-shimmer" />

              <div className="flex-shrink-0">
                <img
                  src={getImageUrl(season.poster_path, 'w154')}
                  alt={season.name}
                  className="w-24 h-36 object-cover rounded-xl shadow-lg border border-slate-700 group-hover:scale-105 transition-transform duration-500"
                />
              </div>
              <div className="flex-1 py-1">
                <div className="flex justify-between items-start mb-2">
                  <h3 className="font-bold text-xl group-hover:text-indigo-400 transition-colors">{season.name}</h3>
                  {season.air_date && (
                    <span className="text-xs text-slate-500 font-bold">{season.air_date.split('-')[0]}</span>
                  )}
                </div>
                <div className="flex items-center gap-4 text-sm text-slate-400 mb-3">
                  <span className="flex items-center gap-1"><span className="text-indigo-500 font-bold">●</span> {season.episode_count} Bölüm</span>
                </div>
                {season.overview && (
                  <p className="text-slate-400 text-sm line-clamp-2 leading-relaxed italic">
                    {season.overview}
                  </p>
                )}
              </div>
            </Link>
          ))}
        </div>
      </section>

      {/* Similar Shows */}
      {similarShows.length > 0 && (
        <section className="animate-slide-up" style={{ animationDelay: '400ms' }}>
          <h2 className="text-3xl font-extrabold mb-6 flex items-center gap-3">
            <span className="w-1.5 h-8 bg-purple-500 rounded-full" />
            Benzer Diziler
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-6">
            {similarShows.slice(0, 6).map((similarShow) => (
              <div key={similarShow.id} className="group cursor-pointer">
                <Link to={`/show/${similarShow.id}`}>
                  <div className="relative aspect-[2/3] overflow-hidden rounded-2xl border border-slate-700/50 mb-3 shadow-lg group-hover:shadow-indigo-500/20 transition-all">
                    <img
                      src={getImageUrl(similarShow.poster_path, 'w342')}
                      alt={similarShow.name}
                      className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-slate-900 via-transparent to-transparent opacity-60" />
                  </div>
                  <h4 className="font-bold text-sm line-clamp-1 text-slate-200 group-hover:text-indigo-400 transition-colors">
                    {similarShow.name}
                  </h4>
                </Link>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Notes Modal */}
      {isNoteOpen && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-md z-50 flex items-center justify-center p-4 animate-fade-in">
          <div className="bg-slate-900 border border-slate-700/50 rounded-3xl w-full max-w-lg overflow-hidden shadow-[0_0_50px_rgba(0,0,0,0.5)] animate-slide-up">
            <div className="px-8 py-6 border-b border-slate-700/50 flex justify-between items-center bg-slate-800/20">
              <h3 className="font-black text-xl gradient-text">Dizi Notları</h3>
              <button
                onClick={() => setIsNoteOpen(false)}
                className="w-10 h-10 rounded-full flex items-center justify-center text-slate-400 hover:bg-white/10 hover:text-white transition-all text-2xl font-light"
              >
                ×
              </button>
            </div>
            <div className="p-8 space-y-6">
              <div className="relative">
                <textarea
                  value={noteText}
                  onChange={(e) => {
                    setNoteText(e.target.value)
                    setNoteError('')
                  }}
                  placeholder="Bu dizi hakkında ne düşünüyorsun?"
                  maxLength={1000}
                  className={`w-full h-48 bg-slate-950/50 border rounded-2xl p-5 text-slate-200 focus:ring-2 outline-none resize-none transition-all placeholder:text-slate-600 ${noteError
                    ? 'border-red-500 focus:border-red-500 focus:ring-red-500/20'
                    : 'border-slate-700/50 focus:border-indigo-500 focus:ring-indigo-500/20'
                    }`}
                />
                <div className="flex justify-between items-center mt-2 text-xs">
                  {noteError ? (
                    <p className="text-red-400">{noteError}</p>
                  ) : (
                    <p className="text-slate-500">Notunuzu buraya yazın (max 1000 karakter)</p>
                  )}
                  <p className="text-slate-500">{noteText.length}/1000</p>
                </div>
              </div>
              <div className="flex gap-4">
                <button
                  onClick={handleSaveNote}
                  disabled={savingNote}
                  className="btn-primary flex-1 h-14 rounded-2xl font-black text-lg shadow-indigo-500/20"
                >
                  {savingNote ? 'Kaydediliyor...' : 'Kaydet'}
                </button>
                <button
                  onClick={() => setIsNoteOpen(false)}
                  className="btn-secondary flex-1 h-14 rounded-2xl font-bold"
                >
                  İptal
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Custom Watch Link Modal */}
      {isSlugModalOpen && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-md z-50 flex items-center justify-center p-4 animate-fade-in">
          <div className="bg-slate-900 border border-slate-700/50 rounded-3xl w-full max-w-2xl overflow-hidden shadow-[0_0_50px_rgba(0,0,0,0.5)] animate-slide-up max-h-[90vh] flex flex-col">
            <div className="px-8 py-6 border-b border-slate-700/50 flex justify-between items-center bg-slate-800/20">
              <div>
                <h3 className="font-black text-xl gradient-text">Link Ayarları</h3>
                <p className="text-slate-500 text-xs mt-1">Bu dizi için özel izleme linki yapılandır</p>
              </div>
              <button
                onClick={() => setIsSlugModalOpen(false)}
                className="w-10 h-10 rounded-full flex items-center justify-center text-slate-400 hover:bg-white/10 hover:text-white transition-all text-2xl font-light"
              >
                ×
              </button>
            </div>

            <div className="p-8 space-y-6 overflow-y-auto">
              {/* Info Box */}
              <div className="p-4 bg-purple-500/10 rounded-xl border border-purple-500/20">
                <p className="text-slate-300 text-sm leading-relaxed">
                  Bu ayarlar <strong className="text-purple-400">sadece bu dizi</strong> için geçerlidir.
                  Boş bıraktığınız alanlar için global ayarlar kullanılır.
                </p>
              </div>

              {/* Custom Slug */}
              <div>
                <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">
                  Özel Slug (Dizi Adı)
                </label>
                <input
                  type="text"
                  value={customSlugText}
                  onChange={(e) => setCustomSlugText(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
                  className="w-full bg-slate-950/50 border border-slate-700/50 rounded-xl px-4 py-3 text-slate-200 focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 outline-none transition-all font-mono"
                  placeholder={slugify(show?.name || '')}
                />
                <p className="text-slate-500 text-xs mt-2">
                  URL'de kullanılacak dizi adı. Örnek: <code className="text-purple-400">breaking-bad</code>
                </p>
              </div>

              {/* Custom Base URL */}
              <div>
                <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">
                  Özel Base URL
                </label>
                <input
                  type="text"
                  value={customBaseUrlText}
                  onChange={(e) => setCustomBaseUrlText(e.target.value)}
                  className="w-full bg-slate-950/50 border border-slate-700/50 rounded-xl px-4 py-3 text-slate-200 focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 outline-none transition-all font-mono"
                  placeholder={watchUrlConfig.baseUrl || 'https://dizipal1984.com/dizi'}
                />
                <p className="text-slate-500 text-xs mt-2">
                  Sadece bu dizi için farklı bir site kullanmak istiyorsanız doldurun.
                </p>
              </div>

              {/* Custom URL Pattern */}
              <div>
                <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">
                  Özel URL Şablonu
                </label>
                <input
                  type="text"
                  value={customPatternText}
                  onChange={(e) => setCustomPatternText(e.target.value)}
                  className="w-full bg-slate-950/50 border border-slate-700/50 rounded-xl px-4 py-3 text-slate-200 focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 outline-none transition-all font-mono"
                  placeholder={watchUrlConfig.pattern || '%dizi_adi%/%sezon%-sezon/%bolum%-bolum'}
                />
                <p className="text-slate-500 text-xs mt-2">
                  Değişkenler: <code className="text-purple-400">%dizi_adi%</code>, <code className="text-purple-400">%sezon%</code>, <code className="text-purple-400">%bolum%</code>
                </p>
              </div>

              {/* Link Note */}
              <div>
                <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">
                  Not (Hatırlatma)
                </label>
                <textarea
                  value={linkNoteText}
                  onChange={(e) => setLinkNoteText(e.target.value)}
                  maxLength={500}
                  className="w-full h-24 bg-slate-950/50 border border-slate-700/50 rounded-xl px-4 py-3 text-slate-200 focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 outline-none transition-all resize-none"
                  placeholder="Bu dizinin linkiyle ilgili hatırlamak istediğiniz bir şey var mı?"
                />
                <div className="flex justify-between items-center mt-2 text-xs">
                  <p className="text-slate-500">Kendine not bırak (opsiyonel)</p>
                  <p className="text-slate-500">{linkNoteText.length}/500</p>
                </div>
              </div>

              {/* Preview */}
              <div className="p-4 bg-slate-950/50 rounded-xl border border-slate-800">
                <div className="flex items-start justify-between mb-2">
                  <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Önizleme</p>
                  {(customSlugText || customBaseUrlText || customPatternText) && (
                    <span className="text-xs bg-purple-500/20 text-purple-400 px-2 py-0.5 rounded-full border border-purple-500/30">
                      Özel Ayar Aktif
                    </span>
                  )}
                </div>
                <p className="text-purple-400 font-mono text-sm break-all">
                  {(customBaseUrlText || watchUrlConfig.baseUrl)}/
                  {(customPatternText || watchUrlConfig.pattern)
                    .replace(/%dizi_adi%/g, customSlugText || slugify(show?.name || 'dizi-adi'))
                    .replace(/%sezon%/g, '1')
                    .replace(/%bolum%/g, '1')}
                </p>

                {/* Show note preview if exists */}
                {linkNoteText && (
                  <div className="mt-3 pt-3 border-t border-slate-800">
                    <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Notun:</p>
                    <p className="text-slate-400 text-sm italic">{linkNoteText}</p>
                  </div>
                )}
              </div>
            </div>

            {/* Footer with actions */}
            <div className="px-8 py-6 border-t border-slate-700/50 bg-slate-800/20 flex flex-col sm:flex-row gap-3">
              <button
                onClick={handleResetToGlobal}
                disabled={savingLinkSettings}
                className="px-6 py-3 bg-slate-800/50 hover:bg-slate-700/50 text-slate-300 font-bold rounded-xl border border-slate-700 transition-all disabled:opacity-50"
              >
                Global Ayarlara Dön
              </button>
              <div className="flex gap-3 flex-1">
                <button
                  onClick={() => setIsSlugModalOpen(false)}
                  className="flex-1 h-12 rounded-xl font-bold bg-slate-800/50 hover:bg-slate-700/50 text-slate-300 border border-slate-700 transition-all"
                >
                  İptal
                </button>
                <button
                  onClick={handleSaveCustomLinkSettings}
                  disabled={savingLinkSettings}
                  className="flex-1 h-12 rounded-xl font-black text-lg bg-gradient-to-r from-purple-500 to-pink-600 hover:from-purple-400 hover:to-pink-500 text-white shadow-lg shadow-purple-500/20 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {savingLinkSettings ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      Kaydediliyor...
                    </>
                  ) : (
                    'Kaydet'
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
