import { useState, useEffect } from 'react'
import { useAuth } from '../hooks/useAuth'
import { updateProfile, getWatchUrlPrefs, saveWatchUrlPrefs } from '../services/supabase'
import { validateUsername } from '../utils/sanitize'
import { getWatchUrlSettings, saveWatchUrlSettings } from '../utils/watchUrl'

const AVATAR_STYLES = [
  'adventurer',
  'avataaars',
  'big-ears',
  'bottts',
  'croodles',
  'fun-emoji',
  'icons',
  'lorelei',
  'micah',
  'miniavs',
  'open-peeps',
  'personas',
  'pixel-art'
]

export default function Settings() {
  const { user, signOut } = useAuth()
  const [loading, setLoading] = useState(false)
  const [msg, setMsg] = useState({ type: '', text: '' })
  const [usernameError, setUsernameError] = useState('')

  // Form State
  const [formData, setFormData] = useState({
    username: '',
    avatarStyle: 'adventurer',
    avatarSeed: '',
  })

  // Watch URL Settings State
  const [watchUrlSettings, setWatchUrlSettings] = useState({
    baseUrl: 'https://dizipal1984.com/dizi',
    pattern: '%dizi_adi%/%sezon%-sezon/%bolum%-bolum',
  })
  const [watchUrlSaved, setWatchUrlSaved] = useState(false)
  const [watchUrlError, setWatchUrlError] = useState('')

  // Load initial data
  useEffect(() => {
    if (user) {
      setFormData({
        username: user.user_metadata?.username || '',
        avatarStyle: user.user_metadata?.avatarStyle || 'adventurer',
        avatarSeed: user.user_metadata?.avatarSeed || user.email,
      })
    }

    // Önce cihaz cache'inden göster, sonra hesaptaki güncel değeri çek
    const savedWatchSettings = getWatchUrlSettings()
    setWatchUrlSettings(savedWatchSettings)

    if (user) {
      getWatchUrlPrefs(user.id)
        .then((prefs) => {
          if (prefs?.watch_base_url || prefs?.watch_url_pattern) {
            const merged = {
              baseUrl: prefs.watch_base_url || savedWatchSettings.baseUrl,
              pattern: prefs.watch_url_pattern || savedWatchSettings.pattern,
            }
            setWatchUrlSettings(merged)
            saveWatchUrlSettings(merged.baseUrl, merged.pattern)
          }
        })
        .catch((error) => console.error('Hesaptaki izleme linki ayarları okunamadı:', error))
    }
  }, [user])

  const handleSaveWatchUrl = async () => {
    setWatchUrlError('')
    // Cihaz cache'i her durumda güncellensin
    saveWatchUrlSettings(watchUrlSettings.baseUrl, watchUrlSettings.pattern)

    try {
      await saveWatchUrlPrefs(user.id, watchUrlSettings)
      setWatchUrlSaved(true)
      setTimeout(() => setWatchUrlSaved(false), 2000)
    } catch (error) {
      console.error('İzleme linki ayarları hesaba kaydedilemedi:', error)
      setWatchUrlError('Hesaba kaydedilemedi — ayar şimdilik yalnızca bu cihazda geçerli.')
    }
  }

  const handleSave = async (e) => {
    e.preventDefault()
    setLoading(true)
    setMsg({ type: '', text: '' })
    setUsernameError('')

    // Validate username
    const usernameValidation = validateUsername(formData.username)
    if (!usernameValidation.valid) {
      setUsernameError(usernameValidation.error)
      setMsg({ type: 'error', text: usernameValidation.error })
      setLoading(false)
      return
    }

    try {
      await updateProfile(user.id, {
        username: usernameValidation.sanitized,
        avatar_url: `https://api.dicebear.com/7.x/${formData.avatarStyle}/svg?seed=${formData.avatarSeed}`,
        // Store raw avatar data for editing later
        avatar_meta: {
          style: formData.avatarStyle,
          seed: formData.avatarSeed
        }
      })

      // Update local storage or trigger re-fetch if needed (Supabase auth listener usually handles this)
      setMsg({ type: 'success', text: 'Profil başarıyla güncellendi!' })

      // No need to reload, React state and Supabase auth listener will handle Navbar update
    } catch (error) {
      console.error('Profile update error:', error)
      setMsg({ type: 'error', text: 'Güncelleme başarısız oldu.' })
    } finally {
      setLoading(false)
    }
  }

  const handleSignOut = async () => {
    if (confirm('Çıkış yapmak istediğinizden emin misiniz?')) {
      try {
        await signOut()
      } catch (error) {
        console.error('Sign out error:', error)
      }
    }
  }

  // Generate preview URL
  const previewUrl = `https://api.dicebear.com/7.x/${formData.avatarStyle}/svg?seed=${formData.avatarSeed}`

  return (
    <div className="max-w-4xl mx-auto space-y-8 animate-fade-in pb-10">
      <div>
        <h1 className="text-4xl font-black mb-2 bg-clip-text text-transparent bg-gradient-to-r from-white to-slate-500">
          Ayarlar
        </h1>
        <p className="text-slate-400">Kimliğinizi ve tercihlerinizi yönetin.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">

        {/* Left Column: Avatar & Form */}
        <div className="lg:col-span-2 space-y-8">

          {/* Profile Card */}
          <div className="card-glass p-8">
            <h2 className="text-xl font-bold mb-6 flex items-center gap-2">
              <span className="w-1 h-6 bg-indigo-500 rounded-full"></span>
              Profil Düzenle
            </h2>

            {msg.text && (
              <div className={`p-4 rounded-xl mb-6 text-sm font-medium ${msg.type === 'success' ? 'bg-green-500/10 text-green-400 border border-green-500/20' : 'bg-red-500/10 text-red-400 border border-red-500/20'}`}>
                {msg.text}
              </div>
            )}

            <form onSubmit={handleSave} className="space-y-8">
              {/* Avatar Section */}
              <div className="flex flex-col sm:flex-row gap-8 items-start">
                <div className="flex-shrink-0 relative group mx-auto sm:mx-0">
                  <div className="w-32 h-32 rounded-2xl bg-slate-800 border-2 border-slate-700 overflow-hidden shadow-2xl">
                    <img src={previewUrl} alt="Avatar Preview" className="w-full h-full object-cover bg-white/5" />
                  </div>
                  <button
                    type="button"
                    onClick={() => setFormData({ ...formData, avatarSeed: Math.random().toString(36).substring(7) })}
                    className="absolute -bottom-2 -right-2 p-2 bg-indigo-500 rounded-xl shadow-lg hover:bg-indigo-400 transition-colors text-white"
                    title="Rastgele Salla"
                  >
                    🎲
                  </button>
                </div>

                <div className="flex-1 space-y-4 w-full">
                  <div>
                    <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Avatar Stili</label>
                    <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                      {AVATAR_STYLES.slice(0, 8).map(style => (
                        <button
                          key={style}
                          type="button"
                          onClick={() => setFormData({ ...formData, avatarStyle: style })}
                          className={`p-2 rounded-lg text-xs font-medium transition-all ${formData.avatarStyle === style
                            ? 'bg-indigo-500 text-white shadow-lg shadow-indigo-500/25 ring-2 ring-indigo-500/50'
                            : 'bg-slate-800/50 text-slate-400 hover:bg-slate-700'
                            }`}
                        >
                          {style}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Seed (Tohum)</label>
                    <input
                      type="text"
                      value={formData.avatarSeed}
                      onChange={(e) => setFormData({ ...formData, avatarSeed: e.target.value })}
                      className="w-full bg-slate-900/50 border border-slate-700 rounded-xl px-4 py-3 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all text-slate-200 font-mono text-sm"
                      placeholder="Avatarını kişiselleştir..."
                    />
                  </div>
                </div>
              </div>

              <hr className="border-slate-800" />

              {/* User Info */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Kullanıcı Adı</label>
                  <input
                    type="text"
                    value={formData.username}
                    onChange={(e) => {
                      setFormData({ ...formData, username: e.target.value })
                      setUsernameError('')
                    }}
                    className={`w-full bg-slate-900/50 border rounded-xl px-4 py-3 focus:outline-none focus:ring-1 transition-all text-white placeholder-slate-600 ${usernameError
                      ? 'border-red-500 focus:border-red-500 focus:ring-red-500/20'
                      : 'border-slate-700 focus:border-indigo-500 focus:ring-indigo-500'
                      }`}
                    placeholder="Görünen isminiz"
                  />
                  {usernameError && (
                    <p className="text-red-400 text-xs mt-1.5">{usernameError}</p>
                  )}
                  <p className="text-slate-500 text-xs mt-1.5">3-20 karakter, sadece harf, rakam, _ ve -</p>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">E-posta</label>
                  <input
                    type="email"
                    value={user?.email}
                    disabled
                    className="w-full bg-slate-900/30 border border-slate-800 rounded-xl px-4 py-3 text-slate-500 cursor-not-allowed"
                  />
                </div>
              </div>

              <div className="flex justify-end pt-4">
                <button
                  type="submit"
                  disabled={loading}
                  className="px-8 py-3 bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-400 hover:to-purple-500 text-white font-bold rounded-xl shadow-lg shadow-indigo-500/20 transform hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                >
                  {loading ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                      Kaydediliyor...
                    </>
                  ) : (
                    'Değişiklikleri Kaydet'
                  )}
                </button>
              </div>
            </form>
          </div>

          {/* Watch URL Settings Card */}
          <div className="card-glass p-8">
            <h2 className="text-xl font-bold mb-6 flex items-center gap-2">
              <span className="w-1 h-6 bg-purple-500 rounded-full"></span>
              İzleme Linkleri
            </h2>

            <p className="text-slate-400 text-sm mb-6">
              Bölümlere tıkladığınızda açılacak izleme sitesinin URL formatını yapılandırın.
              Bu ayar hesabınıza kaydedilir ve tüm cihazlarınızda geçerli olur.
            </p>

            <div className="space-y-6">
              <div>
                <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">
                  Base URL (Site Adresi)
                </label>
                <input
                  type="text"
                  value={watchUrlSettings.baseUrl}
                  onChange={(e) => setWatchUrlSettings({ ...watchUrlSettings, baseUrl: e.target.value })}
                  className="w-full bg-slate-900/50 border border-slate-700 rounded-xl px-4 py-3 focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500 transition-all text-slate-200 font-mono text-sm"
                  placeholder="https://dizipal1984.com/dizi"
                />
                <p className="text-slate-500 text-xs mt-1.5">Sitenin temel adresi (sonunda / olmadan)</p>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">
                  URL Şablonu
                </label>
                <input
                  type="text"
                  value={watchUrlSettings.pattern}
                  onChange={(e) => setWatchUrlSettings({ ...watchUrlSettings, pattern: e.target.value })}
                  className="w-full bg-slate-900/50 border border-slate-700 rounded-xl px-4 py-3 focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500 transition-all text-slate-200 font-mono text-sm"
                  placeholder="%dizi_adi%/%sezon%-sezon/%bolum%-bolum"
                />
                <p className="text-slate-500 text-xs mt-1.5">
                  Kullanılabilir değişkenler: <code className="text-purple-400">%dizi_adi%</code>, <code className="text-purple-400">%sezon%</code>, <code className="text-purple-400">%bolum%</code>
                </p>
              </div>

              {/* Preview */}
              {watchUrlSettings.baseUrl && (
                <div className="p-4 bg-slate-900/50 rounded-xl border border-slate-800">
                  <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Önizleme</p>
                  <p className="text-purple-400 font-mono text-sm break-all">
                    {watchUrlSettings.baseUrl}/{watchUrlSettings.pattern.replace(/%dizi_adi%/g, 'ornek-dizi').replace(/%sezon%/g, '1').replace(/%bolum%/g, '5')}
                  </p>
                </div>
              )}

              {watchUrlError && (
                <div className="p-3 rounded-xl text-sm font-medium bg-red-500/10 text-red-400 border border-red-500/20">
                  {watchUrlError}
                </div>
              )}

              <div className="flex justify-end pt-2">
                <button
                  type="button"
                  onClick={handleSaveWatchUrl}
                  className={`px-6 py-2.5 font-bold rounded-xl transition-all flex items-center gap-2 ${watchUrlSaved
                    ? 'bg-green-500 text-white'
                    : 'bg-purple-500/10 hover:bg-purple-500/20 text-purple-400 border border-purple-500/30'
                    }`}
                >
                  {watchUrlSaved ? (
                    <>
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                      </svg>
                      Kaydedildi!
                    </>
                  ) : (
                    'Kaydet'
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: Preferences & Account */}
        <div className="space-y-8">

          {/* Preferences */}
          <div className="card-glass p-8">
            <h2 className="text-xl font-bold mb-6 flex items-center gap-2">
              <span className="w-1 h-6 bg-purple-500 rounded-full"></span>
              Tercihler
            </h2>

            <div className="space-y-6">
              <div>
                <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">Tema Rengi</label>
                <div className="flex gap-3">
                  {['bg-indigo-500', 'bg-purple-500', 'bg-emerald-500', 'bg-rose-500'].map((color) => (
                    <button
                      key={color}
                      className={`w-10 h-10 rounded-xl ${color} shadow-lg hover:scale-110 transition-transform ring-offset-2 ring-offset-[#0f172a] focus:ring-2 ring-white/20`}
                      title="Yakında..."
                    />
                  ))}
                </div>
                <p className="text-xs text-slate-500 mt-2 italic">Tema özelliği yakında aktif olacak.</p>
              </div>

              <div className="pt-4 border-t border-slate-800">
                <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">Uygulama Dili</label>
                <select className="w-full bg-slate-900/50 border border-slate-700 rounded-xl px-4 py-3 text-slate-300 focus:outline-none focus:border-indigo-500">
                  <option>Türkçe (TR)</option>
                  <option disabled>English (EN) - Soon</option>
                </select>
              </div>
            </div>
          </div>

          {/* Danger Zone */}

          <div className="card-glass p-8 border border-red-500/10">
            <h2 className="text-xl font-bold mb-6 flex items-center gap-2 text-red-400">
              <span className="w-1 h-6 bg-red-500 rounded-full"></span>
              Hesap İşlemleri
            </h2>
            <button
              onClick={handleSignOut}
              className="w-full py-3 px-4 bg-red-500/10 hover:bg-red-500/20 text-red-500 font-bold rounded-xl border border-red-500/20 transition-all flex items-center justify-center gap-2 group"
            >
              <span>Çıkış Yap</span>
              <span className="group-hover:translate-x-1 transition-transform">→</span>
            </button>
          </div>

        </div>
      </div>
    </div>
  )
}
