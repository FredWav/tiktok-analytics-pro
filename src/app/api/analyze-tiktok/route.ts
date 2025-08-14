import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// Configuration Supabase
const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Interface pour les données vidéo
interface VideoData {
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

export async function POST(request: NextRequest) {
  console.log('🚀 Démarrage analyse TikTok...')
  
  try {
    const { url } = await request.json()
    
    if (!url || !url.includes('tiktok.com')) {
      return NextResponse.json({ 
        error: 'URL TikTok invalide' 
      }, { status: 400 })
    }

    console.log('📱 Analyse URL:', url)

    // 1. Extraction données de base via oEmbed
    let videoData: VideoData = await extractBasicData(url)
    
    // 2. Extraction stats détaillées (si ScrapingBee disponible)
    if (process.env.SCRAPINGBEE_API_KEY) {
      const detailedStats = await extractDetailedStats(url)
      if (detailedStats) {
        videoData = { ...videoData, ...detailedStats }
      }
    }

    // 3. Analyse SEO avec OpenAI
    const seoAnalysis = await analyzeSEO(videoData)
    
    // 4. Calcul métriques
    const metrics = calculateMetrics(videoData)
    
    // 5. Génération courbe fidélisation
    const retentionCurve = generateRetentionCurve(videoData, metrics)
    
    // 6. Sauvegarde en base
    const savedRecord = await saveToDatabase({
      url,
      videoData,
      seoAnalysis,
      metrics,
      retentionCurve
    })

    // 7. Réponse finale
    const response = {
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
            followers: videoData.authorFollowers
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
        
        retention: {
          curve: retentionCurve,
          averageRetention: retentionCurve.reduce((sum, point) => sum + point.retention, 0) / retentionCurve.length
        }
      }
    }

    console.log('✅ Analyse terminée!')
    return NextResponse.json(response)

  } catch (error: any) {
    console.error('❌ Erreur:', error.message)
    return NextResponse.json({
      error: 'Erreur lors de l\'analyse',
      details: error.message
    }, { status: 500 })
  }
}

// ===== FONCTIONS UTILITAIRES =====

async function extractBasicData(url: string): Promise<VideoData> {
  // Structure par défaut avec tous les champs requis
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
    const response = await fetch(oembedUrl)
    
    if (response.ok) {
      const data = await response.json()
      return {
        ...defaultData,
        title: data.title || 'Titre non disponible',
        description: data.title || '',
        thumbnail: data.thumbnail_url || null,
        authorUsername: data.author_name || '',
        authorUrl: data.author_url || ''
      }
    }
  } catch (error) {
    console.warn('⚠️ oEmbed échoué:', error)
  }
  
  return defaultData
}

async function extractDetailedStats(url: string): Promise<Partial<VideoData> | null> {
  if (!process.env.SCRAPINGBEE_API_KEY) {
    console.warn('⚠️ ScrapingBee key manquante')
    return null
  }

  try {
    const scrapingUrl = new URL('https://app.scrapingbee.com/api/v1/')
    scrapingUrl.searchParams.set('api_key', process.env.SCRAPINGBEE_API_KEY)
    scrapingUrl.searchParams.set('url', url)
    scrapingUrl.searchParams.set('render_js', 'true')
    scrapingUrl.searchParams.set('wait', '3000')
    
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 25000)
    
    const response = await fetch(scrapingUrl.toString(), { 
      signal: controller.signal 
    })
    
    clearTimeout(timeoutId)
    
    if (response.ok) {
      const html = await response.text()
      return parseDetailedStats(html)
    }
  } catch (error) {
    console.warn('⚠️ ScrapingBee échoué:', error)
  }
  
  return null
}

function parseDetailedStats(html: string): Partial<VideoData> | null {
  try {
    // Recherche du JSON TikTok dans le HTML
    let jsonData = null
    
    const sigiMatch = html.match(/<script id="SIGI_STATE" type="application\/json">(.*?)<\/script>/s)
    if (sigiMatch) {
      jsonData = JSON.parse(sigiMatch[1])
    }
    
    if (!jsonData) return null
    
    // Extraction des stats
    let videoData = null
    if (jsonData.ItemModule) {
      const videoId = Object.keys(jsonData.ItemModule)[0]
      videoData = jsonData.ItemModule[videoId]
    }
    
    if (!videoData?.stats) return null
    
    const stats = videoData.stats
    const author = videoData.author || {}
    
    return {
      views: parseInt(stats.playCount) || 0,
      likes: parseInt(stats.diggCount) || 0,
      comments: parseInt(stats.commentCount) || 0,
      shares: parseInt(stats.shareCount) || 0,
      saves: parseInt(stats.collectCount) || 0,
      description: videoData.desc || '',
      authorUsername: author.uniqueId || '',
      authorFollowers: parseInt(author.followerCount) || 0,
      hashtags: videoData.textExtra?.map((tag: any) => tag.hashtagName).filter(Boolean) || []
    }
  } catch (error) {
    console.error('❌ Erreur parsing:', error)
    return null
  }
}

async function analyzeSEO(videoData: VideoData) {
  if (!process.env.OPENAI_API_KEY) {
    console.warn('⚠️ OpenAI key manquante')
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
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
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
      const result = JSON.parse(data.choices[0].message.content)
      return result
    }
  } catch (error) {
    console.error('❌ Erreur OpenAI:', error)
  }

  return {
    score: 50,
    niche: 'Non déterminée', 
    recommendations: ['Erreur analyse IA']
  }
}

function calculateMetrics(videoData: VideoData) {
  const { views, likes, comments, shares, saves } = videoData
  
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
  
  // Score viral simplifié
  let viralScore = 50
  if (engagementRate > 15) viralScore += 30
  else if (engagementRate > 10) viralScore += 20
  else if (engagementRate > 5) viralScore += 10
  
  if (views > 1000000) viralScore += 20
  else if (views > 100000) viralScore += 10
  
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

function generateRetentionCurve(videoData: VideoData, metrics: any) {
  const points = []
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

async function saveToDatabase(data: any) {
  try {
    const { error, data: result } = await supabase
      .from('video_analyses')
      .insert({
        tiktok_url: data.url,
        title: data.videoData.title,
        author_username: data.videoData.authorUsername,
        description: data.videoData.description,
        views_count: data.videoData.views,
        likes_count: data.videoData.likes,
        comments_count: data.videoData.comments,
        shares_count: data.videoData.shares,
        saves_count: data.videoData.saves,
        engagement_rate: data.metrics.engagementRate,
        viral_score: data.metrics.viralScore,
        retention_rate: data.metrics.retentionRate,
        seo_score: data.seoAnalysis.score,
        niche: data.seoAnalysis.niche,
        hashtags: JSON.stringify(data.videoData.hashtags),
        retention_curve: JSON.stringify(data.retentionCurve)
      })
      .select()
      .single()

    if (error) {
      console.error('❌ Erreur Supabase:', error)
      return null
    }

    return result
  } catch (error) {
    console.error('❌ Erreur sauvegarde:', error)
    return null
  }
}

function formatNumber(num: number): string {
  if (num >= 1000000000) return (num / 1000000000).toFixed(1) + 'B'
  if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M'
  if (num >= 1000) return (num / 1000).toFixed(1) + 'K'
  return num.toString()
}
