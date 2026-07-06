import { useEffect, useState } from 'react'
import { useAuth } from '../hooks/useAuth'
import { useShowStore } from '../store/showStore'
import { getUserShows, updateUserShow, deleteUserShow } from '../services/supabase'
import { getShowDetails } from '../services/tmdb'
import { WATCH_STATUS, STATUS_LABELS } from '../utils/constants'
import ShowCard from '../components/common/ShowCard'
import Skeleton, { ShowCardSkeleton } from '../components/common/Skeleton'
import { useToast } from '../components/common/Toast'

const STATUS_ICONS = {
  all: '📱',
  favorites: '❤️',
  [WATCH_STATUS.WATCHING]: '▶️',
  [WATCH_STATUS.COMPLETED]: '✅',
  [WATCH_STATUS.DROPPED]: '🛑',
  [WATCH_STATUS.PLAN_TO_WATCH]: '📋',
}

export default function MyShows() {
  const { user } = useAuth()
  const { userShows, setUserShows, updateShow, removeShow } = useShowStore()
  const [showsData, setShowsData] = useState({})
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('all')
  const [sortBy, setSortBy] = useState('last_updated')
  const [searchTerm, setSearchTerm] = useState('')
  const [removingId, setRemovingId] = useState(null)
  const [confirmDeleteId, setConfirmDeleteId] = useState(null)
  const toast = useToast()

  useEffect(() => {
    const fetchShows = async () => {
      if (!user) return

      try {
        const shows = await getUserShows(user.id)
        setUserShows(shows)

        // Fetch details for each show
        const details = {}
        for (const userShow of shows) {
          try {
            const detailsData = await getShowDetails(userShow.tmdb_show_id)
            details[userShow.tmdb_show_id] = detailsData
          } catch (error) {
            console.error(`Error fetching show ${userShow.tmdb_show_id}:`, error)
          }
        }
        setShowsData(details)
      } catch (error) {
        console.error('Error fetching user shows:', error)
      } finally {
        setLoading(false)
      }
    }

    fetchShows()
  }, [user, setUserShows])

  const handleStatusChange = async (tmdbShowId, newStatus) => {
    try {
      updateShow(tmdbShowId, { status: newStatus })
      await updateUserShow(user.id, tmdbShowId, { status: newStatus })
    } catch (error) {
      console.error('Error updating status:', error)
      const shows = await getUserShows(user.id)
      setUserShows(shows)
    }
  }

  const handleRemove = async (e, tmdbShowId) => {
    e.preventDefault()
    e.stopPropagation()

    // If not in confirm state, switch to it
    if (confirmDeleteId !== tmdbShowId) {
      setConfirmDeleteId(tmdbShowId)
      // Reset confirm state after 3 seconds if not clicked again
      setTimeout(() => setConfirmDeleteId(null), 3000)
      return
    }

    try {
      setRemovingId(tmdbShowId)
      setConfirmDeleteId(null)

      // First delete from database
      await deleteUserShow(user.id, tmdbShowId)

      // If successful, remove from store
      removeShow(tmdbShowId)

      // Also remove from local showsData state
      setShowsData(prev => {
        const newData = { ...prev }
        delete newData[tmdbShowId]
        return newData
      })

      toast.success('Dizi listenden başarıyla kaldırıldı')
    } catch (error) {
      console.error('Error removing show:', error)
      toast.error(`Dizi kaldırılırken hata: ${error.message || error}`)

      // Refresh list on error to ensure sync
      const shows = await getUserShows(user.id)
      setUserShows(shows)
    } finally {
      setRemovingId(null)
    }
  }

  const filteredAndSortedShows = userShows
    .filter((show) => {
      const showData = showsData[show.tmdb_show_id]
      if (searchTerm && showData && !showData.name.toLowerCase().includes(searchTerm.toLowerCase())) {
        return false
      }
      if (filter === 'all') return true
      if (filter === 'favorites') return show.is_favorite
      return show.status === filter
    })
    .sort((a, b) => {
      if (sortBy === 'rating') return (b.user_rating || 0) - (a.user_rating || 0)
      if (sortBy === 'name') {
        const nameA = showsData[a.tmdb_show_id]?.name || ''
        const nameB = showsData[b.tmdb_show_id]?.name || ''
        return nameA.localeCompare(nameB)
      }
      if (sortBy === 'last_updated') return new Date(b.updated_at) - new Date(a.updated_at)
      return 0
    })

  if (loading) {
    return (
      <div className="space-y-8 animate-fade-in">
        <div className="flex flex-col gap-4">
          <Skeleton className="h-10 w-64" />
          <Skeleton className="h-4 w-40" />
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-6">
          {[...Array(12)].map((_, i) => (
            <ShowCardSkeleton key={i} />
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-10 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-6">
        <div>
          <h1 className="text-4xl font-black mb-3">
            <span className="gradient-text">Kütüphanem</span>
          </h1>
          <p className="text-slate-400 font-medium flex items-center gap-2">
            <span className="w-1.5 h-1.5 bg-indigo-500 rounded-full" />
            Toplam <span className="text-slate-200">{userShows.length}</span> dizi takip ediliyor
          </p>
        </div>

        {/* Search & Sort Row */}
        <div className="flex flex-col sm:flex-row gap-4 w-full lg:w-auto">
          <div className="relative group flex-1 sm:w-64">
            <input
              type="text"
              placeholder="Listende ara..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-slate-800/50 backdrop-blur border border-slate-700/50 rounded-xl pl-11 pr-4 py-3 text-slate-200 focus:border-indigo-500/50 focus:ring-4 focus:ring-indigo-500/10 outline-none transition-all group-hover:border-slate-600/50"
            />
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 absolute left-4 top-3.5 text-slate-500 group-hover:text-indigo-400 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </div>

          <div className="flex items-center gap-3 bg-slate-800/50 backdrop-blur border border-slate-700/50 rounded-xl px-4 py-1.5">
            <span className="text-xs font-black uppercase tracking-widest text-slate-500">Sırala</span>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              className="bg-transparent text-sm font-bold text-slate-200 outline-none cursor-pointer hover:text-indigo-400 transition-colors"
            >
              <option value="last_updated">En Yeni</option>
              <option value="rating">Puan</option>
              <option value="name">İsim</option>
            </select>
          </div>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="card-glass p-2 overflow-x-auto no-scrollbar">
        <div className="flex gap-2 min-w-max">
          {[
            { id: 'all', label: 'Tümü', count: userShows.length },
            { id: 'favorites', label: 'Favoriler', count: userShows.filter(s => s.is_favorite).length },
            ...Object.entries(WATCH_STATUS).map(([key, value]) => ({
              id: value,
              label: STATUS_LABELS[value],
              count: userShows.filter(s => s.status === value).length
            }))
          ].map((item) => (
            <button
              key={item.id}
              onClick={() => setFilter(item.id)}
              className={`px-5 py-2.5 rounded-xl transition-all duration-300 flex items-center gap-2.5 font-bold text-sm ${filter === item.id
                ? item.id === 'favorites'
                  ? 'bg-red-500 text-white shadow-lg shadow-red-500/30 glow-red'
                  : 'bg-indigo-500 text-white shadow-lg shadow-indigo-500/30 glow-indigo'
                : 'text-slate-400 hover:text-slate-100 hover:bg-white/5 active:scale-95'
                }`}
            >
              <span className="text-base">{STATUS_ICONS[item.id]}</span>
              <span>{item.label}</span>
              <span className={`px-2 py-0.5 rounded-lg text-[10px] font-black ${filter === item.id ? 'bg-white/20' : 'bg-slate-900 border border-slate-700'}`}>
                {item.count}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Grid */}
      {filteredAndSortedShows.length === 0 ? (
        <div className="card-glass text-center py-20 border-dashed animate-slide-up">
          <div className="text-6xl mb-6">🏜️</div>
          <h3 className="text-2xl font-bold mb-3 text-slate-200">
            {searchTerm ? 'Sonuç Bulunamadı' : 'Burası Çok Issız'}
          </h3>
          <p className="text-slate-400 max-w-sm mx-auto mb-8">
            {searchTerm
              ? `"${searchTerm}" aramasına uygun hiçbir dizi bulunamadı. Lütfen başka bir şey deneyin.`
              : 'Listenizde henüz hiç dizi yok. En iyi dizileri keşfetmeye ne dersiniz?'}
          </p>
          <a href="/discover" className="btn-primary inline-flex items-center gap-2 px-8 py-3 rounded-2xl font-black shadow-indigo-500/20">
            Keşfetmeye Başla →
          </a>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-6 animate-slide-up">
          {filteredAndSortedShows.map((userShow, idx) => {
            const showData = showsData[userShow.tmdb_show_id]
            if (!showData) return null

            return (
              <div
                key={userShow.tmdb_show_id}
                className="relative group animate-slide-up"
                style={{ animationDelay: `${idx * 50}ms` }}
              >
                <ShowCard show={showData} userShow={userShow} />

                {/* Quick Actions Overlay */}
                <div className="absolute inset-0 pointer-events-none z-[60] opacity-0 group-hover:opacity-100 transition-all duration-300">
                  <div className="absolute top-3 left-3 right-3 flex items-center gap-2 pointer-events-auto">
                    {/* Status Change Select */}
                    <div className="flex-1 bg-slate-900/95 backdrop-blur-md border border-slate-700/50 rounded-xl p-1 shadow-2xl">
                      <select
                        value={userShow.status}
                        onChange={(e) => handleStatusChange(userShow.tmdb_show_id, e.target.value)}
                        className="w-full text-[10px] font-black bg-transparent text-white outline-none cursor-pointer uppercase tracking-tighter px-2 py-1"
                      >
                        {Object.entries(WATCH_STATUS).map(([key, value]) => (
                          <option key={key} value={value} className="bg-slate-900 text-white">
                            {STATUS_LABELS[value]}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Remove/Confirm Button */}
                    <button
                      onClick={(e) => handleRemove(e, userShow.tmdb_show_id)}
                      disabled={removingId === userShow.tmdb_show_id}
                      className={`h-9 px-3 rounded-xl flex items-center justify-center shadow-xl transition-all active:scale-95 font-bold text-[10px] uppercase tracking-tighter whitespace-nowrap ${confirmDeleteId === userShow.tmdb_show_id
                        ? 'bg-red-600 text-white animate-pulse'
                        : 'bg-red-500/90 hover:bg-red-500 text-white'
                        } ${removingId === userShow.tmdb_show_id ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                      title={confirmDeleteId === userShow.tmdb_show_id ? "Onaylamak için tekrar tıkla" : "Listeden Kaldır"}
                    >
                      {removingId === userShow.tmdb_show_id ? (
                        <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      ) : confirmDeleteId === userShow.tmdb_show_id ? (
                        "EMİN MİSİN?"
                      ) : (
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      )}
                    </button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

