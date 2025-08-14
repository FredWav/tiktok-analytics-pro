// src/app/api/analyze-tiktok/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** === Types === */
type VideoData = {
  title: string
  description: string
  thumbnail: string | null
  authorUsername: string
  authorUrl: string
  authorFollowers: number
  views: number
  likes: number
  comments: number
  shares: number
  saves: number
  hashtags: string[]
}

type RetentionPoint = { timePercent: number; retention: number }
type SeoAnalysis = { score: number; niche: string; recommendations: string[] }
type Metrics = {
  engagementRate: number
  viralScore: number
  retentionRate: number
  likesRatio: number
  commentsRatio: number
  sharesRatio: number
  savesRatio: number
  totalEngagements: number
}

/** === Supabase Client === */
const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

/** === API Handler === */
export async function POST(request: NextRequest) {
  console.log('🚀 Démarrage analyse TikTok...')
  try {
    const { url } = await request.json()
    if (!url || !url.includes('tiktok.com')) {
      return NextResponse.json({ error: 'URL TikTok invalide' }, { status: 400 })
    }

    console.log('📱 Analyse URL:', url)

    // 1. Données de base (garantit un objet VideoData complet)
    let videoData: VideoData = await extractBasicData(url)

    // 2. Données détaillées (si possible, fusionne les nouvelles données)
    if (process.env.SCRAPINGBEE_API_KEY) {
      const detailedStats = await extractDetailedStats(url)
      if (detailedStats) {
        videoData = { ...videoData, ...detailedStats }
      }
    }

    // 3. Analyse SEO
    const seoAnalysis = await analyzeSEO(videoData)

    // 4. Métriques
    const metrics = calculateMetrics(videoData)

    // 5. Courbe de rétention
    const retentionCurve = generateRetentionCurve(videoData, metrics)

    // 6. Sauvegarde en BDD
    const savedRecord = await saveToDatabase({
      url,
      videoData,
      seoAnalysis,
      metrics,
      retentionCurve
    })
    
    // 7. Construction de la réponse finale
    const averageRetention =
      retentionCurve.reduce((sum, p) => sum + p.retention, 0) / (retentionCurve.length || 1)

    console.log('✅ Analyse terminée!')
    return NextResponse.json({
      success: true,
      analysis: {
        id: savedRecord?.id,
        timestamp: new Date().toISOString(),
        video: {
          url,
          title: videoData.title,
          description: videoData.description,
          thumbnail: videoData.thumbnail,
          author: {
            username: videoData.authorUsername,
            followers: videoData.authorFollowers // Accès direct et sûr
          },
          hashtags: videoData.hashtags
        },
        stats: {
          views: videoData.views,
          likes: videoData.likes,
          comments: videoData.comments,
          shares: videoData.shares,
          saves: videoData.saves,
          formatted: {
            views: formatNumber(videoData.views),
            likes: formatNumber(videoData.likes),
            comments: formatNumber(videoData.comments),
            shares: formatNumber(videoData.shares),
            saves: formatNumber(videoData.saves)
          }
        },
        metrics,
        seo: seoAnalysis,
        retention: { curve: retentionCurve, averageRetention: Number(averageRetention.toFixed(1)) }
      }
    })
  } catch (error: any) {
    console.error('❌ Erreur critique dans le handler POST:', error)
    return NextResponse.json(
      { error: "Erreur lors de l'analyse", details: String(error?.message || error) },
      { status: 500 }
    )
  }
}

/** === Fonctions d'extraction et d'analyse === */

async function extractBasicData(url: string): Promise<VideoData> {
  // On initialise TOUJOURS un objet complet pour respecter le type
  const defaultData: VideoData = {
    title: 'Vidéo TikTok',
    description: '',
    thumbnail: null,
    authorUsername: '',
    authorUrl: '',
    authorFollowers: 0, // Clé initialisée
    views: 0,
    likes: 0,
    comments: 0,
    shares: 0,
    saves: 0,
    hashtags: []
  }

  try {
    const oembedUrl = `https://www.tiktok.com/oembed?url=${encodeURIComponent(url)}`
    const response = await fetch(oembedUrl)
    
    if (response.ok) {
      const data = (await response.json()) as any
      return {
        ...defaultData,
        title: data?.title || 'Titre non disponible',
        description: data?.title || '',
        thumbnail: data?.thumbnail_url || null,
        authorUsername: data?.author_name || '',
        authorUrl: data?.author_url || ''
      }
    }
  } catch (error) {
    console.error('⚠️ Erreur oEmbed:', error)
  }

  return defaultData
}

async function extractDetailedStats(url: string): Promise<Partial<VideoData> | null> {
    if (!process.env.SCRAPINGBEE_API_KEY) return null

    try {
        const scrapingUrl = new URL('https://app.scrapingbee.com/api/v1/')
        scrapingUrl.searchParams.set('api_key', process.env.SCRAPINGBEE_API_KEY)
        scrapingUrl.searchParams.set('url', url)
        scrapingUrl.searchParams.set('render_js', 'true')
        scrapingUrl.searchParams.set('wait', '3000')

        const controller = new AbortController()
        const timeoutId = setTimeout(() => controller.abort(), 25_000)

        const response = await fetch(scrapingUrl.toString(), { signal: controller.signal })
        clearTimeout(timeoutId)

        if (response.ok) {
            const html = await response.text()
            return parseDetailedStats(html)
        }
    } catch (error) {
        console.error('⚠️ Erreur ScrapingBee:', error)
    }

    return null
}

function parseDetailedStats(html: string): Partial<VideoData> | null {
    try {
        const sigiMatch = html.match(/<script id="SIGI_STATE" type="application\/json">(.*?)<\/script>/s)
        if (!sigiMatch?.[1]) return null
        
        const jsonData = JSON.parse(sigiMatch[1])
        const videoId = Object.keys(jsonData.ItemModule || {})[0]
        const item = jsonData.ItemModule?.[videoId]
        if (!item?.stats) return null
        
        return {
            views: Number(item.stats.playCount) || 0,
            likes: Number(item.stats.diggCount) || 0,
            comments: Number(item.stats.commentCount) || 0,
            shares: Number(item.stats.shareCount) || 0,
            saves: Number(item.stats.collectCount) || 0,
            description: String(item.desc || ''),
            authorUsername: String(item.author || ''),
            authorFollowers: Number(item.authorStats?.followerCount) || 0,
            hashtags: Array.isArray(item.textExtra)
                ? item.textExtra.map((t: any) => t?.hashtagName).filter(Boolean)
                : []
        }
    } catch (error) {
        console.error('❌ Erreur de parsing HTML/JSON:', error)
        return null
    }
}

async function analyzeSEO(videoData: VideoData): Promise<SeoAnalysis> {
  const fallback: SeoAnalysis = {
    score: 50,
    niche: 'Non déterminée',
    recommendations: ['Configurez OpenAI pour une analyse complète']
  }
  
  if (!process.env.OPENAI_API_KEY) return fallback

  try {
    const prompt = `Analyse...` // Le prompt reste le même
    //...Le reste de la fonction fetch vers OpenAI
    const response = await fetch('https://api.openai.com/v1/chat/completions', { /* ... */ })

    if (response.ok) {
      const data = await response.json()
      const content = data?.choices?.[0]?.message?.content
      if (typeof content === 'string') {
        return JSON.parse(content) as SeoAnalysis
      }
    }
  } catch (error) {
    console.error('❌ Erreur OpenAI:', error)
  }

  return { score: 50, niche: 'Non déterminée', recommendations: ['Erreur analyse IA'] }
}


function calculateMetrics(videoData: VideoData): Metrics {
  const { views = 0, likes = 0, comments = 0, shares = 0, saves = 0 } = videoData

  if (views === 0) {
    return {
      engagementRate: 0, viralScore: 0, retentionRate: 0, likesRatio: 0,
      commentsRatio: 0, sharesRatio: 0, savesRatio: 0, totalEngagements: 0
    }
  }

  const totalEngagements = likes + comments + shares + saves
  const engagementRate = (totalEngagements / views) * 100

  let viralScore = 50
  if (engagementRate > 15) viralScore += 30
  else if (engagementRate > 10) viralScore += 20
  else if (engagementRate > 5) viralScore += 10

  if (views > 1_000_000) viralScore += 20
  else if (views > 100_000) viralScore += 10

  return {
    engagementRate: Number(engagementRate.toFixed(2)),
    viralScore: Math.min(100, viralScore),
    retentionRate: Number(Math.min(90, engagementRate * 4).toFixed(1)),
    likesRatio: Number(((likes / views) * 100).toFixed(2)),
    commentsRatio: Number(((comments / views) * 100).toFixed(2)),
    sharesRatio: Number(((shares / views) * 100).toFixed(2)),
    savesRatio: Number(((saves / views) * 100).toFixed(2)),
    totalEngagements
  }
}

function generateRetentionCurve(_: VideoData, metrics: Metrics): RetentionPoint[] {
    const points: RetentionPoint[] = []
    const baseRetention = Math.max(30, Math.min(85, metrics.engagementRate * 5))

    for (let i = 0; i <= 100; i += 10) {
        const retention = baseRetention * (1 - (i / 100) * 0.6)
        points.push({
            timePercent: i,
            retention: Number(Math.max(10, retention).toFixed(1))
        })
    }
    return points
}

async function saveToDatabase(data: {
  url: string; videoData: VideoData; seoAnalysis: SeoAnalysis;
  metrics: Metrics; retentionCurve: RetentionPoint[]
}) {
  try {
    const { data: result, error } = await supabase
      .from('video_analyses')
      .insert({ /* ...colonnes... */ })
      .select()
      .single()

    if (error) {
      console.error('❌ Erreur Supabase:', error)
      return null
    }
    return result
  } catch (error) {
    console.error('❌ Erreur critique lors de la sauvegarde BDD:', error)
    return null
  }
}

function formatNumber(num: number): string {
    if (num >= 1_000_000_000) return (num / 1_000_000_000).toFixed(1) + 'B'
    if (num >= 1_000_000) return (num / 1_000_000).toFixed(1) + 'M'
    if (num >= 1_000) return (num / 1_000).toFixed(1) + 'K'
    return String(num)
}
