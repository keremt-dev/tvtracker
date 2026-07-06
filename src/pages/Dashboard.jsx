import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { useShowStore } from '../store/showStore'
import { getUserShows, getWatchedEpisodes } from '../services/supabase'
import { getAiringToday, getTrendingShows, getShowDetails } from '../services/tmdb'
import { addUserShow } from '../services/supabase'
import { WATCH_STATUS } from '../utils/constants'
import ShowCard from '../components/common/ShowCard'
import Skeleton, { ShowCardSkeleton } from '../components/common/Skeleton'

const STATS_CONFIG = [
  { label: 'Toplam Dizi', color: 'from-indigo-500 to-purple-500', icon: '📺' },
  { label: 'İzleniyor', color: 'from-green-500 to-emerald-500', icon: '▶️' },
  { label: 'Tamamlandı', color: 'from-blue-500 to-cyan-500', icon: '✅' },
  { label: 'İzlenecek', color: 'from-amber-500 to-orange-500', icon: '📋' },
]

export default function Dashboard() {
  const { user } = useAuth()
  const { userShows, setUserShows } = useShowStore()
  const [loading, setLoading] = useState(true)
  const [airingToday, setAiringToday] = useState([])
  const [trending, setTrending] = useState([])
  const [watchingShowsData, setWatchingShowsData] = useState({})
  const { addShow } = useShowStore()
  const [addingId, setAddingId] = useState(null)

  useEffect(() => {
    const fetchData = async () => {
      if (!user) return

      try {
        // Fetch user's shows and watched episodes in parallel
        const [shows, episodes] = await Promise.all([
          getUserShows(user.id),
          getWatchedEpisodes(user.id)
        ])

        setUserShows(shows)
        useShowStore.getState().setAllWatchedEpisodes(episodes)

        // Fetch watching-show details, airing today and trending — all in parallel
        const watching = shows.filter((s) => s.status === 'watching')
        const [detailResults, airingData, trendingData] = await Promise.all([
          Promise.all(
            watching.map((userShow) =>
              getShowDetails(userShow.tmdb_show_id).catch((error) => {
                console.error(`Error fetching show ${userShow.tmdb_show_id}:`, error)
                return null
              })
            )
          ),
          getAiringToday(),
          getTrendingShows(),
        ])

        const details = {}
        watching.forEach((userShow, i) => {
          if (detailResults[i]) details[userShow.tmdb_show_id] = detailResults[i]
        })
        setWatchingShowsData(details)

        setAiringToday(airingData.results?.slice(0, 6) || [])
        setTrending(trendingData.results?.slice(0, 6) || [])
      } catch (error) {
        console.error('Error fetching dashboard data:', error)
      } finally {
        setLoading(false)
      }
    }

    fetchData()
  }, [user, setUserShows])

  const handleAddToList = async (tmdbShowId) => {
    if (!user) return

    setAddingId(tmdbShowId)
    try {
      await addUserShow(user.id, tmdbShowId, WATCH_STATUS.PLAN_TO_WATCH)
      const newShow = {
        user_id: user.id,
        tmdb_show_id: tmdbShowId,
        status: WATCH_STATUS.PLAN_TO_WATCH,
        user_rating: 0,
        is_favorite: false,
        notes: '',
      }
      addShow(newShow)
    } catch (error) {
      console.error('Error adding show to list:', error)
    } finally {
      setAddingId(null)
    }
  }

  const watchingShows = userShows.filter((s) => s.status === 'watching')
  const planToWatch = userShows.filter((s) => s.status === 'plan_to_watch')
  const completedShows = userShows.filter((s) => s.status === 'completed')

  const statsData = [
    userShows.length,
    watchingShows.length,
    completedShows.length,
    planToWatch.length
  ]

  return (
    <div className="space-y-8 animate-fade-in">
      {/* Hero Section */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-indigo-900/50 via-purple-900/30 to-slate-900 border border-indigo-500/20 p-6 md:p-8">
        {/* Decorative elements */}
        <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-500/10 rounded-full blur-3xl" />
        <div className="absolute bottom-0 left-0 w-48 h-48 bg-purple-500/10 rounded-full blur-3xl" />

        <div className="relative z-10 text-center">
          {loading ? (
            <>
              <Skeleton className="h-10 w-72 mx-auto mb-3" />
              <Skeleton className="h-5 w-48 mx-auto" />
            </>
          ) : (
            <>
              <h1 className="text-3xl md:text-4xl font-bold mb-3">
                Hoş geldin
                {user?.user_metadata?.username && (
                  <span className="gradient-text">, {user.user_metadata.username}</span>
                )}
                ! 👋
              </h1>
              <p className="text-slate-400 text-lg">
                Kütüphanende <span className="text-indigo-400 font-semibold">{userShows.length}</span> dizi bulunuyor
              </p>
            </>
          )}
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {STATS_CONFIG.map((stat, i) => (
          <div
            key={i}
            className="card card-hover text-center space-y-3 group"
            style={{ animationDelay: `${i * 100}ms` }}
          >
            {loading ? (
              <>
                <Skeleton className="h-10 w-14 mx-auto" />
                <Skeleton className="h-4 w-24 mx-auto" />
              </>
            ) : (
              <>
                <div className="text-2xl mb-1">{stat.icon}</div>
                <div className={`text-4xl font-bold bg-gradient-to-r ${stat.color} bg-clip-text text-transparent`}>
                  {statsData[i]}
                </div>
                <div className="text-slate-400 text-sm font-medium">
                  {stat.label}
                </div>
              </>
            )}
          </div>
        ))}
      </div>

      {/* Sections */}
      {[
        { title: 'İzlemeye Devam Et', data: watchingShows, showsData: watchingShowsData, show: watchingShows.length > 0 || loading, link: '/my-shows' },
        { title: 'Bugün Yayınlananlar', data: airingToday, show: airingToday.length > 0 || loading },
        { title: 'Trend Olan Diziler', data: trending, show: trending.length > 0 || loading, link: '/discover' }
      ].map((section, idx) => section.show && (
        <section key={idx} className="animate-slide-up" style={{ animationDelay: `${(idx + 1) * 150}ms` }}>
          <div className="flex items-center justify-between mb-5">
            <h2 className="text-2xl font-bold">{section.title}</h2>
            {section.link && !loading && section.data.length > 0 && (
              <Link to={section.link} className="text-indigo-400 hover:text-indigo-300 text-sm font-medium transition-colors">
                Tümünü Gör →
              </Link>
            )}
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
            {loading ? (
              [...Array(6)].map((_, i) => <ShowCardSkeleton key={i} />)
            ) : section.data.map((item) => {
              const showData = section.showsData ? section.showsData[item.tmdb_show_id] : item;
              if (!showData) return null;
              return (
                <ShowCard
                  key={showData.id}
                  show={showData}
                  userShow={userShows.find(s => s.tmdb_show_id === showData.id)}
                  onAdd={handleAddToList}
                  isAdding={addingId === showData.id}
                />
              );
            })}
          </div>
        </section>
      ))}
    </div>
  )
}

