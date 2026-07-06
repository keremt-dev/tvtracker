import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { getUserShows, getWatchedEpisodes, addWatchedEpisode } from '../services/supabase'
import { getAiringToday, getOnTheAir, getSeasonDetails, getShowDetails } from '../services/tmdb'
import ShowCard from '../components/common/ShowCard'
import Loader from '../components/common/Loader'
import { generateWatchUrlWithOverrides, getWatchUrlSettings } from '../utils/watchUrl'

export default function Calendar() {
    const { user } = useAuth()
    const [groupedEpisodes, setGroupedEpisodes] = useState({})
    const [airingToday, setAiringToday] = useState([])
    const [onTheAir, setOnTheAir] = useState([])
    const [loading, setLoading] = useState(true)
    const [markingId, setMarkingId] = useState(null)
    const [expandedShows, setExpandedShows] = useState({})
    const [watchUrlConfig, setWatchUrlConfig] = useState({ baseUrl: '', pattern: '' })
    const [userShows, setUserShows] = useState([])

    useEffect(() => {
        const fetchData = async () => {
            if (!user) return

            setLoading(true)
            try {
                const [todayData, onAirData, fetchedUserShows, watchedEpisodes] = await Promise.all([
                    getAiringToday(),
                    getOnTheAir(),
                    getUserShows(user.id),
                    getWatchedEpisodes(user.id)
                ])
                setAiringToday(todayData.results || [])
                setOnTheAir(onAirData.results || [])
                setUserShows(fetchedUserShows)

                const watchedMap = new Set(
                    watchedEpisodes.map(e => `${e.tmdb_show_id}-${e.season_number}-${e.episode_number}`)
                )

                const today = new Date().toISOString().split('T')[0]

                // Tüm diziler (ve her dizinin tüm sezonları) paralel çekilir;
                // önceki sıralı yapı dizi×sezon kadar ardışık istek bekletiyordu
                const showResults = await Promise.all(fetchedUserShows.map(async (userShow) => {
                    try {
                        const showDetails = await getShowDetails(userShow.tmdb_show_id)
                        if (!showDetails) return null

                        const seasonNumbers = Array.from(
                            { length: showDetails.number_of_seasons || 1 },
                            (_, i) => i + 1
                        )
                        const seasons = await Promise.all(seasonNumbers.map(season =>
                            getSeasonDetails(userShow.tmdb_show_id, season).catch(() => null)
                        ))

                        const showEpisodes = []
                        seasons.forEach((seasonData, idx) => {
                            if (!seasonData?.episodes) return
                            const season = seasonNumbers[idx]

                            for (const episode of seasonData.episodes) {
                                const key = `${userShow.tmdb_show_id}-${season}-${episode.episode_number}`

                                if (watchedMap.has(key)) continue
                                if (!episode.air_date) continue
                                if (episode.air_date > today) continue
                                if (episode.episode_number === 0) continue

                                showEpisodes.push({
                                    id: key,
                                    showId: userShow.tmdb_show_id,
                                    showName: showDetails.name,
                                    showPoster: showDetails.poster_path,
                                    seasonNumber: season,
                                    episodeNumber: episode.episode_number,
                                    episodeName: episode.name,
                                    airDate: episode.air_date,
                                    stillPath: episode.still_path,
                                    runtime: episode.runtime,
                                    voteAverage: episode.vote_average,
                                    overview: episode.overview
                                })
                            }
                        })

                        if (showEpisodes.length === 0) return null

                        showEpisodes.sort((a, b) => {
                            if (a.seasonNumber !== b.seasonNumber) return a.seasonNumber - b.seasonNumber
                            return a.episodeNumber - b.episodeNumber
                        })

                        return {
                            showId: userShow.tmdb_show_id,
                            showName: showDetails.name,
                            showPoster: showDetails.poster_path,
                            episodes: showEpisodes
                        }
                    } catch (err) {
                        console.error('Error fetching show details:', err)
                        return null
                    }
                }))

                const showsMap = {}
                showResults.filter(Boolean).forEach(showData => {
                    showsMap[showData.showName] = showData
                })

                setGroupedEpisodes(showsMap)
                const expanded = {}
                Object.keys(showsMap).forEach(name => expanded[name] = true)
                setExpandedShows(expanded)

                // Load watch URL settings
                setWatchUrlConfig(getWatchUrlSettings())

            } catch (error) {
                console.error('Error fetching calendar data:', error)
            } finally {
                setLoading(false)
            }
        }

        fetchData()
    }, [user])

    const handleMarkAsWatched = async (episode) => {
        setMarkingId(episode.id)
        try {
            await addWatchedEpisode(
                user.id,
                episode.showId,
                episode.seasonNumber,
                episode.episodeNumber
            )
            setTimeout(() => {
                setGroupedEpisodes(prev => {
                    const updated = { ...prev }
                    const showName = episode.showName
                    if (updated[showName]) {
                        updated[showName] = {
                            ...updated[showName],
                            episodes: updated[showName].episodes.filter(e => e.id !== episode.id)
                        }
                        if (updated[showName].episodes.length === 0) {
                            delete updated[showName]
                        }
                    }
                    return updated
                })
                setMarkingId(null)
            }, 400)
        } catch (error) {
            console.error('Error marking as watched:', error)
            setMarkingId(null)
        }
    }

    const toggleShow = (showName) => {
        setExpandedShows(prev => ({ ...prev, [showName]: !prev[showName] }))
    }

    const formatDate = (dateString) => {
        return new Date(dateString).toLocaleDateString('tr-TR', {
            day: 'numeric',
            month: 'short',
            year: 'numeric'
        })
    }

    const totalEpisodes = Object.values(groupedEpisodes).reduce((sum, show) => sum + show.episodes.length, 0)

    if (loading) return <Loader />

    return (
        <div className="space-y-12 animate-fade-in pb-16">

            {/* Page Header */}
            <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
                <div>
                    <h1 className="text-4xl md:text-5xl font-black bg-clip-text text-transparent bg-gradient-to-r from-white via-amber-200 to-amber-400">
                        Takvim
                    </h1>
                    <p className="text-slate-400 mt-2 text-lg">Kaçırdığın bölümleri takip et</p>
                </div>
                {totalEpisodes > 0 && (
                    <div className="flex items-center gap-2 text-sm text-slate-400 bg-slate-800/50 px-4 py-2 rounded-full border border-slate-700/50">
                        <span className="w-2 h-2 bg-red-500 rounded-full animate-pulse"></span>
                        <span><strong className="text-white">{totalEpisodes}</strong> bölüm bekliyor</span>
                    </div>
                )}
            </div>

            {/* Grouped Episodes */}
            {Object.keys(groupedEpisodes).length > 0 ? (
                <div className="space-y-6">
                    {Object.entries(groupedEpisodes).map(([showName, showData]) => (
                        <section key={showName} className="card-glass p-0 overflow-hidden">

                            {/* Show Header */}
                            <button
                                onClick={() => toggleShow(showName)}
                                className="w-full flex items-center gap-4 p-4 hover:bg-white/[0.02] transition-colors text-left"
                            >
                                <div className="w-14 h-20 rounded-lg overflow-hidden bg-slate-800 flex-shrink-0 shadow-lg ring-1 ring-white/10">
                                    {showData.showPoster ? (
                                        <img
                                            src={`https://image.tmdb.org/t/p/w92${showData.showPoster}`}
                                            alt={showName}
                                            className="w-full h-full object-cover"
                                        />
                                    ) : (
                                        <div className="w-full h-full flex items-center justify-center text-slate-600 text-2xl">🎬</div>
                                    )}
                                </div>

                                <div className="flex-1 min-w-0">
                                    <h2 className="text-xl font-bold text-white truncate">{showName}</h2>
                                    <p className="text-sm text-slate-400">
                                        {showData.episodes.length} izlenmemiş bölüm
                                    </p>
                                </div>

                                <div className={`w-8 h-8 rounded-full bg-slate-800 flex items-center justify-center transition-transform duration-300 ${expandedShows[showName] ? 'rotate-180' : ''}`}>
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                    </svg>
                                </div>
                            </button>

                            {/* Episodes List */}
                            {expandedShows[showName] && (
                                <div className="border-t border-slate-800/50 divide-y divide-slate-800/30">
                                    {showData.episodes.map((episode) => (
                                        <div
                                            key={episode.id}
                                            className={`group flex items-start gap-4 p-4 hover:bg-white/[0.02] transition-all duration-300 ${markingId === episode.id ? 'opacity-0 translate-x-4' : 'opacity-100'}`}
                                        >
                                            {/* Episode Still Image */}
                                            <div className="w-28 h-16 md:w-36 md:h-20 rounded-lg overflow-hidden bg-slate-800 flex-shrink-0 shadow-md ring-1 ring-white/5 group-hover:ring-amber-500/30 transition-all">
                                                {episode.stillPath ? (
                                                    <img
                                                        src={`https://image.tmdb.org/t/p/w300${episode.stillPath}`}
                                                        alt={episode.episodeName}
                                                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                                                    />
                                                ) : (
                                                    <div className="w-full h-full flex items-center justify-center text-slate-700 bg-gradient-to-br from-slate-800 to-slate-900">
                                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                                                        </svg>
                                                    </div>
                                                )}
                                            </div>

                                            {/* Episode Info */}
                                            <div className="flex-1 min-w-0 space-y-1">
                                                {/* Season/Episode Badge */}
                                                <div className="flex items-center gap-2 flex-wrap">
                                                    <span className="px-2 py-0.5 bg-amber-500/20 text-amber-400 rounded text-xs font-bold font-mono">
                                                        S{String(episode.seasonNumber).padStart(2, '0')}
                                                    </span>
                                                    <span className="px-2 py-0.5 bg-slate-800 text-slate-300 rounded text-xs font-bold font-mono">
                                                        B{String(episode.episodeNumber).padStart(2, '0')}
                                                    </span>

                                                    {/* Runtime */}
                                                    {episode.runtime && (
                                                        <span className="text-xs text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded flex items-center gap-1">
                                                            <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                                                            </svg>
                                                            {episode.runtime} dk
                                                        </span>
                                                    )}

                                                    {/* Rating */}
                                                    {episode.voteAverage > 0 && (
                                                        <span className="text-xs text-yellow-400 bg-yellow-500/10 px-2 py-0.5 rounded flex items-center gap-1">
                                                            <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" fill="currentColor" viewBox="0 0 24 24">
                                                                <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
                                                            </svg>
                                                            {episode.voteAverage.toFixed(1)}
                                                        </span>
                                                    )}
                                                </div>

                                                {/* Episode Name */}
                                                <h3 className="font-semibold text-slate-200 group-hover:text-white transition-colors truncate">
                                                    {episode.episodeName}
                                                </h3>

                                                {/* Air Date */}
                                                <p className="text-xs text-slate-500 font-mono">
                                                    📅 {formatDate(episode.airDate)}
                                                </p>

                                                {/* Overview - Always visible */}
                                                {episode.overview && (
                                                    <p className="text-xs text-slate-400 line-clamp-2 mt-1 leading-relaxed">
                                                        {episode.overview}
                                                    </p>
                                                )}
                                            </div>

                                            {/* Action Buttons */}
                                            <div className="flex items-center gap-2 self-center flex-shrink-0">
                                                {/* Watch Button */}
                                                {watchUrlConfig.baseUrl && (
                                                    <a
                                                        href={generateWatchUrlWithOverrides({
                                                            showName: episode.showName,
                                                            season: episode.seasonNumber,
                                                            episode: episode.episodeNumber,
                                                            userShow: userShows.find(s => s.tmdb_show_id === episode.showId)
                                                        })}
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                        className="w-10 h-10 rounded-full bg-purple-500/10 text-purple-400 hover:bg-purple-500 hover:text-white flex items-center justify-center transition-all duration-300 hover:scale-110 hover:shadow-lg hover:shadow-purple-500/30 active:scale-95"
                                                        title="Bölümü izle"
                                                    >
                                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="currentColor" viewBox="0 0 24 24">
                                                            <path d="M8 5v14l11-7z" />
                                                        </svg>
                                                    </a>
                                                )}

                                                {/* Mark as Watched Button */}
                                                <button
                                                    onClick={() => handleMarkAsWatched(episode)}
                                                    disabled={markingId === episode.id}
                                                    className="w-10 h-10 rounded-full bg-green-500/10 text-green-500 hover:bg-green-500 hover:text-white flex items-center justify-center transition-all duration-300 hover:scale-110 hover:shadow-lg hover:shadow-green-500/30 active:scale-95"
                                                    title="İzlendi olarak işaretle"
                                                >
                                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                                                    </svg>
                                                </button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </section>
                    ))}
                </div>
            ) : (
                <section className="card-glass p-12 text-center">
                    <div className="text-6xl mb-4">🎉</div>
                    <h2 className="text-2xl font-bold text-white mb-2">Hepsini Bitirdin!</h2>
                    <p className="text-slate-400">Şu an için izlemediğin yayınlanmış bir bölüm yok.</p>
                </section>
            )}

            {/* Airing Today */}
            {airingToday.length > 0 && (
                <section>
                    <div className="flex items-center gap-3 mb-6">
                        <span className="animate-pulse w-3 h-3 bg-red-500 rounded-full shadow-lg shadow-red-500/50"></span>
                        <h2 className="text-2xl font-bold">Bugün Yayında</h2>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
                        {airingToday.slice(0, 12).map(show => (
                            <ShowCard key={show.id} show={show} />
                        ))}
                    </div>
                </section>
            )}

            {/* Currently On The Air */}
            {onTheAir.length > 0 && (
                <section>
                    <div className="flex items-center gap-3 mb-6">
                        <span className="w-3 h-3 bg-emerald-500 rounded-full"></span>
                        <h2 className="text-2xl font-bold">Şu An Yayında</h2>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
                        {onTheAir.slice(0, 12).map(show => (
                            <ShowCard key={show.id} show={show} />
                        ))}
                    </div>
                </section>
            )}

        </div>
    )
}
