// src/app/api/analyze-tiktok/route.ts
import { NextRequest, NextResponse } from 'next/server'

// Remplacez cette structure par la structure réelle de votre base de données si nécessaire
const supabase = { from: () => ({ insert: () => ({ select: () => ({ single: () => ({ data: {id: '123'}, error: null }) }) }) }) };

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type VideoData = {
  title: string, description: string, thumbnail: string | null, authorUsername: string,
  views: number, likes: number, comments: number, shares: number, hashtags: string[]
}

type Metrics = {
  engagementRate: number, likesRatio: number, commentsRatio: number, sharesRatio: number, totalEngagements: number
}

export async function POST(request: NextRequest) {
  console.log('🚀 Démarrage analyse via API TikTok...');
  try {
    const { url } = await request.json()
    if (!url || !url.includes('tiktok.com')) {
      return NextResponse.json({ error: 'URL TikTok invalide', success: false }, { status: 400 })
    }

    const videoData = await fetchOfficialTiktokData(url);

    if (!videoData) {
      return NextResponse.json({ error: "Impossible d'obtenir les données via l'API TikTok.", success: false }, { status: 500 });
    }

    const metrics = calculateMetrics(videoData)
    const savedRecord = await saveToDatabase({ url, videoData, metrics })

    console.log('✅ Analyse via API terminée !');
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
          author: { username: videoData.authorUsername },
          hashtags: videoData.hashtags
        },
        stats: {
          views: videoData.views,
          likes: videoData.likes,
          comments: videoData.comments,
          shares: videoData.shares,
          formatted: {
            views: formatNumber(videoData.views),
            likes: formatNumber(videoData.likes),
            comments: formatNumber(videoData.comments),
            shares: formatNumber(videoData.shares),
          }
        },
        metrics
      }
    })
  } catch (error: any) {
    console.error('❌ Erreur critique dans le handler POST:', error)
    return NextResponse.json(
      { error: "Erreur lors de l'analyse", details: String(error?.message || error), success: false },
      { status: 500 }
    )
  }
}

async function fetchOfficialTiktokData(url: string): Promise<VideoData | null> {
    console.log('🔑 Lecture des clés API depuis l\'environnement...');
    
    const TIKTOK_CLIENT_KEY = process.env.TIKTOK_CLIENT_KEY;
    const TIKTOK_CLIENT_SECRET = process.env.TIKTOK_CLIENT_SECRET;

    if (!TIKTOK_CLIENT_KEY || !TIKTOK_CLIENT_SECRET) {
        console.error('❌ Clés API TikTok manquantes !');
        throw new Error('Configuration API manquante.');
    }

    // --- ÉTAPE 1 : Extraire l'ID de la vidéo depuis l'URL ---
    const videoIdMatch = url.match(/video\/(\d+)/);
    if (!videoIdMatch || !videoIdMatch[1]) {
        console.error('❌ Impossible d\'extraire l\'ID de la vidéo depuis l\'URL.');
        return null;
    }
    const videoId = videoIdMatch[1];
    console.log(`📹 ID de la vidéo extrait : ${videoId}`);
    
    try {
        console.log('📞 Appel à l\'API officielle de TikTok...');
        
        // --- ÉTAPE 2 : Obtenir un jeton d'accès (Access Token) ---
        const tokenResponse = await fetch('https://open.tiktokapis.com/v2/oauth/token/', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
                client_key: TIKTOK_CLIENT_KEY,
                client_secret: TIKTOK_CLIENT_SECRET,
                grant_type: 'client_credentials'
            })
        });

        if (!tokenResponse.ok) {
            const errorBody = await tokenResponse.json();
            throw new Error(`Échec de l'obtention du token: ${JSON.stringify(errorBody)}`);
        }
        const tokenData = await tokenResponse.json();
        const accessToken = tokenData.access_token;
        console.log('🔑 Jeton d\'accès obtenu avec succès.');

        // --- ÉTAPE 3 : Interroger l'API avec l'ID de la vidéo et le jeton ---
        const fields = "id,video_description,title,cover_image_url,share_count,view_count,like_count,comment_count,author_name,hashtag_names";
        
        const videoApiResponse = await fetch(`https://open.tiktokapis.com/v2/video/query/?fields=${fields}`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                "filters": {
                    "video_ids": [videoId]
                }
            })
        });
        
        if (!videoApiResponse.ok) {
            const errorBody = await videoApiResponse.json();
            throw new Error(`Échec de la récupération des données vidéo: ${JSON.stringify(errorBody)}`);
        }
        
        const responseData = await videoApiResponse.json();
        const video = responseData.data?.videos?.[0];

        if (!video) {
            throw new Error("La vidéo demandée n'a pas été trouvée dans la réponse de l'API.");
        }
        console.log('✅ Données réelles reçues de l\'API TikTok.');

        // --- ÉTAPE 4 : Mapper la réponse de l'API à notre structure de données ---
        const result: VideoData = {
            title: video.title || 'Titre non disponible',
            description: video.video_description || '',
            thumbnail: video.cover_image_url || null,
            authorUsername: video.author_name || 'Auteur inconnu',
            views: video.view_count || 0,
            likes: video.like_count || 0,
            comments: video.comment_count || 0,
            shares: video.share_count || 0,
            hashtags: video.hashtag_names || []
        };
        
        return result;

    } catch (error) {
        console.error('❌ Erreur lors de l\'appel à l\'API TikTok:', error);
        return null;
    }
}

// ... Le reste des fonctions (calculateMetrics, saveToDatabase, formatNumber) reste identique
function calculateMetrics(videoData: VideoData): Metrics {
    const { views = 0, likes = 0, comments = 0, shares = 0 } = videoData;
    if (views === 0) return { engagementRate: 0, likesRatio: 0, commentsRatio: 0, sharesRatio: 0, totalEngagements: 0 };
    const totalEngagements = likes + comments + shares;
    const engagementRate = (totalEngagements / views) * 100;
    return {
        engagementRate: Number(engagementRate.toFixed(2)),
        likesRatio: Number(((likes / views) * 100).toFixed(2)),
        commentsRatio: Number(((comments / views) * 100).toFixed(2)),
        sharesRatio: Number(((shares / views) * 100).toFixed(2)),
        totalEngagements
    };
}

async function saveToDatabase(data: any) { return { id: '123' } }
function formatNumber(num: number): string {
    if (num >= 1_000_000_000) return (num / 1_000_000_000).toFixed(1) + 'B';
    if (num >= 1_000_000) return (num / 1_000_000).toFixed(1) + 'M';
    if (num >= 1_000) return (num / 1_000).toFixed(1) + 'K';
    return String(num);
}
