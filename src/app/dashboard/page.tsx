// src/app/page.tsx
'use client'

import { useState } from 'react'

export default function Home() {
  const [url, setUrl] = useState('')
  const [loading, setLoading] = useState(false)
  const [analysis, setAnalysis] = useState<any>(null)
  const [error, setError] = useState('')

  const handleAnalyze = async (e: React.FormEvent) => {
    e.preventDefault(); // Empêche le rechargement de la page
    if (!url.includes('tiktok.com')) {
      setError('Veuillez entrer une URL TikTok valide.')
      return
    }

    setLoading(true)
    setError('')
    setAnalysis(null)

    try {
      const response = await fetch('/api/analyze-tiktok', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url })
      })
      const data = await response.json()
      if (!response.ok || !data.success) {
        throw new Error(data.error || "Une erreur est survenue lors de l'analyse.")
      }
      setAnalysis(data.analysis)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen w-full max-w-4xl mx-auto p-4 md:p-8">
      <header className="text-center mb-10">
        <h1 className="text-4xl md:text-5xl font-bold text-white">
          Analyseur Vidéo TikTok
        </h1>
        <p className="text-gray-400 mt-2">
          Collez l'URL d'une vidéo TikTok pour obtenir ses statistiques publiques via l'API officielle.
        </p>
      </header>

      <main>
        <form onSubmit={handleAnalyze} className="bg-gray-800 border border-gray-700 rounded-2xl p-6 shadow-lg flex flex-col md:flex-row gap-4">
          <input
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://www.tiktok.com/@username/video/..."
            className="flex-grow bg-gray-900 border border-gray-600 rounded-lg px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-pink-500"
            required
          />
          <button
            type="submit"
            disabled={loading}
            className="bg-pink-600 text-white font-semibold px-8 py-3 rounded-lg hover:bg-pink-700 transition-all disabled:bg-gray-600 disabled:cursor-not-allowed flex items-center justify-center"
          >
            {loading ? (
              <div className="animate-spin w-5 h-5 border-2 border-white border-t-transparent rounded-full"></div>
            ) : (
              'Analyser'
            )}
          </button>
        </form>

        {error && (
          <div className="mt-6 p-4 bg-red-900/50 border border-red-500 rounded-lg text-red-300 text-center">
            {error}
          </div>
        )}
        
        <div className="mt-8">
          {loading && (
             <div className="text-center py-12 text-gray-400">
                <p>Appel à l'API Officielle de TikTok...</p>
             </div>
          )}
          {analysis && <AnalysisResult data={analysis} />}
        </div>
      </main>
    </div>
  )
}


// --- Composant pour afficher les résultats ---
function AnalysisResult({ data }: { data: any }) {
  const MetricCard = ({ title, value, ratio, icon }: any) => (
    <div className="bg-gray-800 border border-gray-700 rounded-2xl p-5">
      <div className="flex items-center gap-3 mb-2">
        <span className="text-xl">{icon}</span>
        <h3 className="text-gray-400">{title}</h3>
      </div>
      <p className="text-3xl font-bold text-white">{value}</p>
      {ratio && <p className="text-sm text-gray-500">{ratio} ratio</p>}
    </div>
  );

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="bg-gray-800 border border-gray-700 rounded-2xl p-6 flex flex-col md:flex-row gap-6">
        <img 
          src={data.video.thumbnail} 
          alt="Video thumbnail"
          className="w-40 h-56 object-cover rounded-lg self-center md:self-start"
        />
        <div className="flex-1">
          <p className="text-sm text-gray-500">@{data.video.author.username}</p>
          <h2 className="text-2xl font-bold text-white mt-1 mb-3">{data.video.title}</h2>
          <p className="text-gray-400 text-sm mb-4">{data.video.description}</p>
          
          {data.video.hashtags && data.video.hashtags.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {data.video.hashtags.map((tag: string, i: number) => (
                <span key={i} className="px-3 py-1 bg-gray-700 text-gray-300 rounded-full text-xs">
                  #{tag}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
      
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <MetricCard title="Vues" icon="👁️" value={data.stats.formatted.views} ratio={`${data.stats.views.toLocaleString()} vues totales`} />
        <MetricCard title="Likes" icon="❤️" value={data.stats.formatted.likes} ratio={`${data.metrics.likesRatio}%`} />
        <MetricCard title="Commentaires" icon="💬" value={data.stats.formatted.comments} ratio={`${data.metrics.commentsRatio}%`} />
        <MetricCard title="Partages" icon="📤" value={data.stats.formatted.shares} ratio={`${data.metrics.sharesRatio}%`} />
      </div>

      <div className="text-center text-xs text-gray-600 pt-4">
        Analyse générée le {new Date(data.timestamp).toLocaleString('fr-FR')}
      </div>
    </div>
  )
}
