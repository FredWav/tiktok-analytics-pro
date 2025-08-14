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
    
    try {
        console.log('📞 Appel à l\'API officielle de TikTok...');
        // --- VRAI APPEL API (à adapter selon la documentation de TikTok) ---
        // La plupart des API nécessitent un "access token" que l'on obtient avec les clés.
        
        // EXEMPLE DE LOGIQUE
        /*
        const tokenResponse = await fetch('https://open.tiktokapis.com/v2/oauth/token/', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
                client_key: TIKTOK_CLIENT_KEY,
                client_secret: TIKTOK_CLIENT_SECRET,
                grant_type: 'client_credentials'
            })
        });
        if (!tokenResponse.ok) throw new Error('Échec de l\'obtention du token');
        const tokenData = await tokenResponse.json();
        const accessToken = tokenData.access_token;
        
        const videoApiResponse = await fetch(`https://open.tiktokapis.com/v2/video/query/`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({
                 // Le champ attendu par TikTok peut être "video_id", "url", etc. À VÉRIFIER
                "filters": { "video_id": ["TON_ID_VIDEO_EXTRAIT_DE_L_URL"] }, 
                "fields": "view_count,like_count,comment_count,share_count,title,description,hashtags,cover_image_url,author_name"
            })
        });
        if (!videoApiResponse.ok) throw new Error('Échec de la récupération des données vidéo');
        const videoDataFromApi = await videoApiResponse.json();
        
        // Il faudrait ensuite mapper la réponse de `videoDataFromApi` à notre type `VideoData`
        */

        // En attendant, on utilise des données réalistes pour que le frontend fonctionne
        await new Promise(resolve => setTimeout(resolve, 800));
        const MOCK_API_RESPONSE: VideoData = {
            title: 'Titre obtenu via l\'API Officielle',
            description: 'Description de la vidéo, autorisée et fournie par TikTok.',
            thumbnail: 'https://p16-sign-va.tiktokcdn.com/tos-maliva-avt-0068/e9d6e495910398a6c8433c4611c7501a~c5_720x720.jpeg',
            authorUsername: 'auteur_officiel',
            views: 2500000,
            likes: 210000,
            comments: 4500,
            shares: 8000,
            hashtags: ['api', 'officielle', 'tiktok']
        };
        console.log('✅ Données reçues (simulation en attendant l\'implémentation finale).');
        return MOCK_API_RESPONSE;

    } catch (error) {
        console.error('❌ Erreur lors de l\'appel à l\'API TikTok:', error);
        return null;
    }
}

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
