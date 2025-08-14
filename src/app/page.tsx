import Link from 'next/link'

export default function Home() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-pink-50 to-blue-50 flex items-center justify-center">
      <div className="text-center">
        <h1 className="text-6xl font-bold text-gray-900 mb-4">
          🎵 TikTok Analytics Pro
        </h1>
        <p className="text-xl text-gray-600 mb-8 max-w-2xl mx-auto">
          Analysez vos vidéos TikTok avec des métriques avancées, 
          la courbe de fidélisation et l'intelligence artificielle.
        </p>
        
        <div className="space-y-4">
          <Link 
            href="/dashboard" 
            className="inline-block bg-gradient-to-r from-pink-500 to-red-500 text-white px-8 py-4 rounded-lg text-lg font-semibold hover:from-pink-600 hover:to-red-600 transition-colors"
          >
            🚀 Analyser une vidéo TikTok
          </Link>
          
          <div className="text-sm text-gray-500 mt-4">
            ✅ Extraction complète des données<br/>
            ✅ Analyse SEO avec IA<br/>
            ✅ Courbe de fidélisation<br/>
            ✅ Score viral propriétaire
          </div>
        </div>
      </div>
    </div>
  )
}
