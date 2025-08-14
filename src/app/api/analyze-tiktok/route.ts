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

    // Étape 1 : Extraction optimisée avec Scrapingbee
    if (!process.env.SCRAPINGBEE_API_KEY) {
        throw new Error("La clé d'API SCRAPINGBEE_API_KEY est manquante.");
    }
    
    const videoData = await extractDetailedStats(url);

    if (!videoData) {
        return NextResponse.json({ error: "Impossible d'extraire les données de la vidéo TikTok." }, { status: 500 });
    }

    // Le reste de la logique
    const seoAnalysis = await analyzeSEO(videoData)
    const metrics = calculateMetrics(videoData)
    const retentionCurve = generateRetentionCurve(videoData, metrics)
    const savedRecord = await saveToDatabase({ url, videoData, seoAnalysis, metrics, retentionCurve })
    const averageRetention = retentionCurve.reduce((sum, p) => sum + p.retention, 0) / (retentionCurve.length || 1)

    console.log('✅ Analyse terminée !');
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

/** === Fonctions principales === */

async function extractDetailedStats(url: string): Promise<VideoData | null> {
    console.log('🐝 Lancement de l\'extraction optimisée avec Scrapingbee...');

    // La règle d'extraction corrigée
    const extractRules = {
        sigi_state: {
            selector: 'script#SIGI_STATE',
            type: 'text' 
        }
    };

    try {
        const scrapingUrl = new URL('https://app.scrapingbee.com/api/v1/');
        scrapingUrl.searchParams.set('api_key', process.env.SCRAPINGBEE_API_KEY!);
        scrapingUrl.searchParams.set('url', url);
        scrapingUrl.searchParams.set('render_js', 'true');
        scrapingUrl.searchParams.set('premium_proxy', 'true');
        scrapingUrl.searchParams.set('country_code', 'fr');
        scrapingUrl.searchParams.set('wait', '2000');
        scrapingUrl.searchParams.set('extract_rules', JSON.stringify(extractRules));

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 25_000);

        const response = await fetch(scrapingUrl.toString(), { signal: controller.signal });
        clearTimeout(timeoutId);

        if (!response.ok) {
            console.error(`⚠️ Erreur ScrapingBee (status: ${response.status}):`, await response.text());
            return null;
        }
        
        const scrapedData = await response.json();
        const sigiStateText = scrapedData.sigi_state;

        if (!sigiStateText) {
            console.error('❌ SIGI_STATE non trouvé dans la réponse de Scrapingbee (TikTok a probablement bloqué la requête).');
            return null;
        }

        const jsonData = JSON.parse(sigiStateText);
        const videoId = Object.keys(jsonData.ItemModule || {})[0];
        const item = jsonData.ItemModule?.[videoId];
        if (!item?.stats) return null;
        
        const result: VideoData = {
            title: item.desc || 'Titre non disponible',
            description: item.desc || '',
            thumbnail: item.video?.cover || null,
            authorUsername: item.author || '',
            authorUrl: `https://www.tiktok.com/@${item.author}`,
            authorFollowers: Number(item.authorStats?.followerCount) || 0,
            views: Number(item.stats.playCount) || 0,
            likes: Number(item.stats.diggCount) || 0,
            comments: Number(item.stats.commentCount) || 0,
            shares: Number(item.stats.shareCount) || 0,
            saves: Number(item.stats.collectCount) || 0,
            hashtags: Array.isArray(item.textExtra)
                ? item.textExtra.map((t: any) => t?.hashtagName).filter(Boolean)
                : []
        };
        console.log('✅ Extraction optimisée réussie !');
        return result;

    } catch (error) {
        console.error('❌ Erreur critique lors de l\'extraction ScrapingBee:', error);
        return null;
    }
}

async function analyzeSEO(videoData: VideoData): Promise<SeoAnalysis> {
    const fallback: SeoAnalysis = { score: 50, niche: 'Non déterminée', recommendations: ['Configurez OpenAI pour une analyse complète'] };
    if (!process.env.OPENAI_API_KEY) return fallback;

    try {
        const prompt = `Analyse cette vidéo TikTok pour le SEO. Réponds en JSON avec:
- score: note de 0 à 100
- niche: catégorie détectée (fitness, beauté, humour, éducation, business, etc.)
- recommendations: 3 conseils d'amélioration maximum

Vidéo: "${videoData.description}"
Hashtags: ${videoData.hashtags?.join(', ') || 'Aucun'}`

        const response = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: 'gpt-4o-mini',
                response_format: { type: 'json_object' },
                messages: [{ role: 'user', content: prompt }],
                max_tokens: 500,
                temperature: 0.3
            })
        });

        if (response.ok) {
            const data = await response.json();
            const content = data?.choices?.[0]?.message?.content;
            if (typeof content === 'string') return JSON.parse(content) as SeoAnalysis;
        }
    } catch (error) {
        console.error('❌ Erreur OpenAI:', error);
    }
    return { score: 50, niche: 'Non déterminée', recommendations: ['Erreur analyse IA'] };
}

function calculateMetrics(videoData: VideoData): Metrics {
    const { views = 0, likes = 0, comments = 0, shares = 0, saves = 0 } = videoData;
    if (views === 0) return { engagementRate: 0, viralScore: 0, retentionRate: 0, likesRatio: 0, commentsRatio: 0, sharesRatio: 0, savesRatio: 0, totalEngagements: 0 };
    const totalEngagements = likes + comments + shares + saves;
    const engagementRate = (totalEngagements / views) * 100;
    let viralScore = 50;
    if (engagementRate > 15) viralScore += 30; else if (engagementRate > 10) viralScore += 20; else if (engagementRate > 5) viralScore += 10;
    if (views > 1_000_000) viralScore += 20; else if (views > 100_000) viralScore += 10;
    return {
        engagementRate: Number(engagementRate.toFixed(2)),
        viralScore: Math.min(100, viralScore),
        retentionRate: Number(Math.min(90, engagementRate * 4).toFixed(1)),
        likesRatio: Number(((likes / views) * 100).toFixed(2)),
        commentsRatio: Number(((comments / views) * 100).toFixed(2)),
        sharesRatio: Number(((shares / views) * 100).toFixed(2)),
        savesRatio: Number(((saves / views) * 100).toFixed(2)),
        totalEngagements
    };
}

function generateRetentionCurve(_: VideoData, metrics: Metrics): RetentionPoint[] {
    const points: RetentionPoint[] = [];
    const baseRetention = Math.max(30, Math.min(85, metrics.engagementRate * 5));
    for (let i = 0; i <= 100; i += 10) {
        const retention = baseRetention * (1 - (i / 100) * 0.6);
        points.push({ timePercent: i, retention: Number(Math.max(10, retention).toFixed(1)) });
    }
    return points;
}

async function saveToDatabase(data: { url: string; videoData: VideoData; seoAnalysis: SeoAnalysis; metrics: Metrics; retentionCurve: RetentionPoint[] }) {
    try {
        const { data: result, error } = await supabase.from('video_analyses').insert({
            tiktok_url: data.url, title: data.videoData.title, author_username: data.videoData.authorUsername,
            description: data.videoData.description, views_count: data.videoData.views, likes_count: data.videoData.likes,
            comments_count: data.videoData.comments, shares_count: data.videoData.shares, saves_count: data.videoData.saves,
            engagement_rate: data.metrics.engagementRate, viral_score: data.metrics.viralScore, retention_rate: data.metrics.retentionRate,
            seo_score: data.seoAnalysis.score, niche: data.seoAnalysis.niche, hashtags: JSON.stringify(data.videoData.hashtags),
            retention_curve: JSON.stringify(data.retentionCurve)
        }).select().single();
        if (error) {
            console.error('❌ Erreur Supabase:', error);
            return null;
        }
        return result;
    } catch (error) {
        console.error('❌ Erreur critique lors de la sauvegarde BDD:', error);
        return null;
    }
}

function formatNumber(num: number): string {
    if (num >= 1_000_000_000) return (num / 1_000_000_000).toFixed(1) + 'B';
    if (num >= 1_000_000) return (num / 1_000_000).toFixed(1) + 'M';
    if (num >= 1_000) return (num / 1_000).toFixed(1) + 'K';
    return String(num);
}
