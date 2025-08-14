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

/** === Supabase (clé Service Role côté serveur uniquement) === */
const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

/** === Handler === */
export async function POST(request: NextRequest) {
  try {
    const { url } = await request.json()
    if (!url || !url.includes('tiktok.com')) {
      return NextResponse.json({ error: 'URL TikTok invalide' }, { status: 400 })
    }

    // 1) Base
    let videoData: VideoData = await extractBasicData(url)

    // 2) Détails
    if (process.env.SCRAPINGBEE_API_KEY) {
      const detailedStats = await extractDetailedStats(url)
      if (detailedStats) videoData = { ...videoData, ...detailedStats }
    }

    // 3) SEO
    const seoAnalysis = await analyzeSEO(videoData)

    // 4) Métriques
    const metrics = calculateMetrics(videoData)

    // 5) Courbe
    const retentionCurve = generateRetentionCurve(videoData, metrics)

    // 6) DB
    const savedRecord = await saveToDatabase({
      url,
      videoData,
      seoAnalysis,
      metrics,
      retentionCurve
    })

    // 7) Réponse — ***AUCUN ACCÈS DIRECT A LA PROPRIÉTÉ***
    const vd: any = videoData
    const followers =
      typeof vd?.authorFollowers === 'number' && Number.isFinite(vd.authorFollowers)
        ? vd.authorFollowers
        : 0

    const averageRetention =
      retentionCurve.reduce((sum, p) => sum + p.retention, 0) / retentionCurve.length

    return NextResponse.json({
      success: true,
      analysis: {
        id: savedRecord?.id,
        timestamp: new Date().toISOString(),
        video: {
          url,
          title: videoData.title || 'Titre non disponible',
          description: videoData.description || '',
          thumbnail: videoData.thumbnail || null,
          author: {
            username: videoData.authorUsername || '',
            followers // <-- variable typée localement (pas d’accès direct)
          },
          hashtags: videoData.hashtags || []
        },
        stats: {
          views: videoData.views || 0,
          likes: videoData.likes || 0,
          comments: videoData.comments || 0,
          shares: videoData.shares || 0,
          saves: videoData.saves || 0,
          formatted: {
            views: formatNumber(videoData.views || 0),
            likes: formatNumber(videoData.likes || 0),
            comments: formatNumber(videoData.comments || 0),
            shares: formatNumber(videoData.shares || 0),
            saves: formatNumber(videoData.saves || 0)
          }
        },
        metrics: {
          engagementRate: metrics.engagementRate,
          viralScore: metrics.viralScore,
          retentionRate: metrics.retentionRate,
          likesRatio: metrics.likesRatio,
          commentsRatio: metrics.commentsRatio,
          sharesRatio: metrics.sharesRatio,
          savesRatio: metrics.savesRatio,
          totalEngagements: metrics.totalEngagements
        },
        seo: seoAnalysis,
        retention: { curve: retentionCurve, averageRetention }
      }
    })
  } catch (error: any) {
    return NextResponse.json(
      { error: "Erreur lors de l'analyse", details: String(error?.message || error) },
      { status: 500 }
    )
  }
}

/** === Implémentations === */

async function extractBasicData(url: string): Promise<VideoData> {
  const defaultData: VideoData = {
    title: 'Vidéo TikTok',
    description: '',
    thumbnail: null,
    authorUsername: '',
    authorUrl: '',
    authorFollowers: 0,
    views: 0,
    likes: 0,
    comments: 0,
    shares: 0,
    saves: 0,
    hashtags: []
  }

  try {
    const oembedUrl = `https://www.tiktok.com/oembed?url=${encodeURIComponent(url)}`
    const response = await fetch(oembedUrl, {
      headers: { Accept: 'application/json', 'User-Agent': 'Mozilla/5.0' }
    })
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
  } catch {}

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
  } catch {}

  return null
}

function parseDetailedStats(html: string): Partial<VideoData> | null {
  try {
    let jsonData: any = null
    const sigiMatch = html.match(
      /<script id="SIGI_STATE" type="application\/json">(.*?)<\/script>/s
    )
    if (sigiMatch) jsonData = JSON.parse(sigiMatch[1])
    if (!jsonData) return null

    let item: any = null
    if (jsonData.ItemModule) {
      const videoId = Object.keys(jsonData.ItemModule)[0]
      item = jsonData.ItemModule[videoId]
    }
    if (!item?.stats) return null

    const stats = item.stats
    const uniqueId = item.author
    const authorUser =
      jsonData.UserModule?.users?.[uniqueId] ||
      jsonData.UserModule?.uniqueIdToUserId?.[uniqueId] ||
      {}
    const authorStats = jsonData.UserModule?.stats?.[uniqueId] || {}

    const followerCount = Number(
      authorUser?.followerCount ?? authorStats?.followerCount ?? 0
    ) || 0

    return {
      views: Number(stats.playCount) || 0,
      likes: Number(stats.diggCount) || 0,
      comments: Number(stats.commentCount) || 0,
      shares: Number(stats.shareCount) || 0,
      saves: Number(stats.collectCount) || 0,
      description: String(item.desc || ''),
      authorUsername: String(uniqueId || ''),
      authorFollowers: followerCount,
      hashtags: Array.isArray(item.textExtra)
        ? item.textExtra.map((t: any) => t?.hashtagName).filter(Boolean)
        : []
    }
  } catch {
    return null
  }
}

async function analyzeSEO(videoData: VideoData): Promise<SeoAnalysis> {
  if (!process.env.OPENAI_API_KEY) {
    return {
      score: 50,
      niche: 'Non déterminée',
      recommendations: ['Configurez OpenAI pour une analyse complète']
    }
  }

  try {
    const prompt = `Analyse cette vidéo TikTok pour le SEO. Réponds en JSON avec:
- score: note de 0 à 100
- niche: catégorie détectée (fitness, beauté, humour, éducation, business, etc.)
- recommendations: 3 conseils d'amélioration maximum

Vidéo: "${videoData.description}"
Hashtags: ${videoData.hashtags?.join(', ') || 'Aucun'}`

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        response_format: { type: 'json_object' },
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 500,
        temperature: 0.3
      })
    })

    if (response.ok) {
      const data = await response.json()
      const content = data?.choices?.[0]?.message?.content
      if (typeof content === 'string') {
        try {
          return JSON.parse(content) as SeoAnalysis
        } catch {}
      }
    }
  } catch {}

  return { score: 50, niche: 'Non déterminée', recommendations: ['Erreur analyse IA'] }
}

function calculateMetrics(videoData: VideoData): Metrics {
  const views = videoData.views || 0
  const likes = videoData.likes || 0
  const comments = videoData.comments || 0
  const shares = videoData.shares || 0
  const saves = videoData.saves || 0

  if (views === 0) {
    return {
      engagementRate: 0,
      viralScore: 0,
      retentionRate: 0,
      likesRatio: 0,
      commentsRatio: 0,
      sharesRatio: 0,
      savesRatio: 0,
      totalEngagements: 0
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
  url: string
  videoData: VideoData
  seoAnalysis: SeoAnalysis
  metrics: Metrics
  retentionCurve: RetentionPoint[]
}) {
  try {
    const { data: result, error } = await supabase
      .from('video_analyses')
      .insert({
        tiktok_url: data.url,
        title: data.videoData.title,
        author_username: data.videoData.authorUsername,
        description: data.videoData.description,
        views_count: data.videoData.views || 0,
        likes_count: data.videoData.likes || 0,
        comments_count: data.videoData.comments || 0,
        shares_count: data.videoData.shares || 0,
        saves_count: data.videoData.saves || 0,
        engagement_rate: data.metrics.engagementRate,
        viral_score: data.metrics.viralScore,
        retention_rate: data.metrics.retentionRate,
        seo_score: data.seoAnalysis.score,
        niche: data.seoAnalysis.niche,
        hashtags: JSON.stringify(data.videoData.hashtags || []),
        retention_curve: JSON.stringify(data.retentionCurve)
      })
      .select()
      .single()

    if (error) return null
    return result
  } catch {
    return null
  }
}

function formatNumber(num: number): string {
  if (num >= 1_000_000_000) return (num / 1_000_000_000).toFixed(1) + 'B'
  if (num >= 1_000_000) return (num / 1_000_000).toFixed(1) + 'M'
  if (num >= 1_000) return (num / 1_000).toFixed(1) + 'K'
  return String(num)
}
