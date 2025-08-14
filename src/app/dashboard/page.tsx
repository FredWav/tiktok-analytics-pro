'use client'

import { useState } from 'react'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'

export default function Dashboard() {
  const [url, setUrl] = useState('')
  const [loading, setLoading] = useState(false)
  const [analysis, setAnalysis] = useState<any>(null)
  const [error, setError] = useState('')

  const analyzeVideo = async () => {
    if (!url.includes('tiktok.com')) {
      setError('Veuillez entrer une URL TikTok valide')
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
      
      if (!response.ok) {
        throw new Error(data.error || 'Erreur lors de l\'analyse')
      }

      setAnalysis(data.analysis)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const MetricCard = ({ title, value, subtitle, color = '#ff0050' }: any) => (
    <div className="bg-white rounded-xl p-6 shadow-lg border">
      <h3 className="text-sm font-medium text-gray-600 mb-2">{title}</h3>
      <div className="text-3xl font-bold" style={{ color }}>{value}</div>
      {subtitle && <p className="text-sm text-gray-500 mt-1">{subtitle}</p>}
    </div>
  )

  return (
    <div className="min-h-screen bg-gray-50 p-4">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-gray-900 mb-2">
            🎵 TikTok Analytics Pro
          </h1>
          <p className="text-gray-600">
            Analysez vos vidéos TikTok avec des métriques avancées
          </p>
        </div>

        {/* Input Section */}
        <div className="bg-white rounded-xl p-6 shadow-lg mb-8">
          <div className="flex gap-4">
            <input
              type="url"
              placeholder="https://www.tiktok.com/@username/video/..."
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              className="flex-1 px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-pink-500 focus:border-transparent"
            />
            <button
              onClick={analyzeVideo}
              disabled={loading}
              className="px-8 py-3 bg-gradient-to-r from-pink-500 to-red-500 text-white rounded-lg hover:from-pink-600 hover:to-red-600 disabled:opacity-50 font-semibold"
            >
              {loading ? '🔄 Analyse...' : '🚀 Analyser'}
            </button>
          </div>
          
          {error && (
            <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-lg">
              <p className="text-red-700">❌ {error}</p>
            </div>
          )}
        </div>

        {/* Loading State */}
        {loading && (
          <div className="text-center py-12">
            <div className="animate-spin w-16 h-16 border-4 border-pink-500 border-t-transparent rounded-full mx-auto mb-4"></div>
            <p className="text-gray-600">Analyse en cours... Extraction des données TikTok</p>
          </div>
        )}

        {/* Results */}
        {analysis && (
          <div className="space-y-6">
            {/* Video Info */}
            <div className="bg-white rounded-xl p-6 shadow-lg">
              <div className="flex items-start gap-4">
                {analysis.video.thumbnail && (
                  <img 
                    src={analysis.video.thumbnail} 
                    alt="Video thumbnail"
                    className="w-32 h-40 object-cover rounded-lg"
                  />
                )}
                <div className="flex-1">
                  <h2 className="text-2xl font-bold mb-2">📹 {analysis.video.title}</h2>
                  <p className="text-gray-600 mb-3">@{analysis.video.author.username}</p>
                  <p className="text-gray-700 mb-4">{analysis.video.description}</p>
                  
                  {analysis.video.hashtags.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {analysis.video.hashtags.map((tag: string, i: number) => (
                        <span key={i} className="px-3 py-1 bg-blue-100 text-blue-800 rounded-full text-sm">
                          #{tag}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Main Metrics */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
              <MetricCard 
                title="👁️ Vues" 
                value={analysis.stats.formatted.views} 
                subtitle={`${analysis.stats.views.toLocaleString()} vues totales`}
              />
              <MetricCard 
                title="❤️ Likes" 
                value={analysis.stats.formatted.likes}
                subtitle={`${analysis.metrics.likesRatio}% ratio`}
                color="#ff0050"
              />
              <MetricCard 
                title="💬 Commentaires" 
                value={analysis.stats.formatted.comments}
                subtitle={`${analysis.metrics.commentsRatio}% ratio`}
                color="#00f2ea"
              />
              <MetricCard 
                title="📤 Partages" 
                value={analysis.stats.formatted.shares}
                subtitle={`${analysis.metrics.sharesRatio}% ratio`}
                color="#fe2c55"
              />
              <MetricCard 
                title="🔖 Saves" 
                value={analysis.stats.formatted.saves}
                subtitle={`${analysis.metrics.savesRatio}% ratio`}
                color="#25f4ee"
              />
            </div>

            {/* KPIs Avancés */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <MetricCard 
                title="📈 Taux d'Engagement" 
                value={`${analysis.metrics.engagementRate}%`}
                subtitle="Total engagements / vues"
                color={analysis.metrics.engagementRate > 10 ? '#22c55e' : analysis.metrics.engagementRate > 5 ? '#f59e0b' : '#ef4444'}
              />
              <MetricCard 
                title="🚀 Score Viral" 
                value={`${analysis.metrics.viralScore}/100`}
                subtitle="Potentiel de viralité"
                color={analysis.metrics.viralScore > 70 ? '#22c55e' : analysis.metrics.viralScore > 50 ? '#f59e0b' : '#ef4444'}
              />
              <MetricCard 
                title="⏱️ Retention" 
                value={`${analysis.metrics.retentionRate}%`}
                subtitle="Fidélisation estimée"
                color="#00f2ea"
              />
            </div>

            {/* Courbe de fidélisation */}
            <div className="bg-white rounded-xl p-6 shadow-lg">
              <h3 className="text-xl font-bold mb-4 flex items-center">
                📈 Courbe de Fidélisation
                <span className="ml-2 text-sm font-normal text-gray-500">
                  (Pourcentage de viewers restants)
                </span>
              </h3>
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={analysis.retention.curve}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis 
                    dataKey="timePercent"
                    tickFormatter={(value) => `${value}%`}
                    stroke="#666"
                  />
                  <YAxis 
                    domain={[0, 100]}
                    tickFormatter={(value) => `${value}%`}
                    stroke="#666"
                  />
                  <Tooltip 
                    formatter={(value: any) => [`${value}%`, 'Retention']}
                    labelFormatter={(value) => `Temps: ${value}%`}
                  />
                  <Line 
                    type="monotone" 
                    dataKey="retention" 
                    stroke="#ff0050"
                    strokeWidth={3}
                    dot={{ fill: '#ff0050', strokeWidth: 2, r: 4 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>

            {/* Analyse SEO */}
            <div className="bg-white rounded-xl p-6 shadow-lg">
              <h3 className="text-xl font-bold mb-4">🔍 Analyse SEO TikTok</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <div className="text-center mb-4">
                    <div className="text-4xl font-bold text-pink-500">{analysis.seo.score}/100</div>
                    <div className="text-sm text-gray-600">Score SEO</div>
                  </div>
                </div>
                <div>
                  <h4 className="font-semibold mb-2">🎯 Niche Détectée</h4>
                  <p className="text-blue-600 mb-4">{analysis.seo.niche}</p>
                  
                  <h4 className="font-semibold mb-2">💡 Recommandations</h4>
                  <ul className="space-y-1">
                    {analysis.seo.recommendations?.slice(0, 3).map((rec: string, i: number) => (
                      <li key={i} className="text-sm text-gray-700 flex items-start">
                        <span className="text-blue-500 mr-2">•</span>
                        {rec}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="bg-gradient-to-r from-pink-50 to-blue-50 rounded-xl p-6 border text-center">
              <h4 className="font-bold text-gray-800 mb-2">🏆 Analyse Complète Terminée</h4>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <div className="text-xl font-bold text-pink-600">
                    {analysis.metrics.viralScore > 70 ? 'Excellente' : analysis.metrics.viralScore > 50 ? 'Bonne' : 'À améliorer'}
                  </div>
                  <p className="text-sm text-gray-600">Performance Globale</p>
                </div>
                <div>
                  <div className="text-xl font-bold text-blue-600">{analysis.metrics.engagementRate}%</div>
                  <p className="text-sm text-gray-600">Taux d'Engagement</p>
                </div>
                <div>
                  <div className="text-xl font-bold text-purple-600">{analysis.seo.niche}</div>
                  <p className="text-sm text-gray-600">Niche Détectée</p>
                </div>
              </div>
              <div className="mt-4 text-xs text-gray-500">
                Analyse générée le {new Date(analysis.timestamp).toLocaleString('fr-FR')} • TikTok Analytics Pro
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
