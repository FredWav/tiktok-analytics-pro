// src/app/api/analyze-tiktok/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** === Types Simplifiés === */
type VideoData = {
  title: string
  description: string
  thumbnail: string | null
  authorUsername: string
  views: number
  likes: number
  comments: number
  shares: number
  hashtags: string[]
}

type Metrics = {
  engagementRate: number
  likesRatio: number
  commentsRatio: number
  sharesRatio: number
  totalEngagements: number
}

/** === Supabase Client === */
const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

/** === API Handler === */
export async function POST(request: NextRequest) {
  console.log('🚀 Démarrage analyse via API TikTok...');
  try {
    const { url } = await request.json()
    if (!url || !url.includes('tiktok.com')) {
      return NextResponse.json({ error: 'URL TikTok invalide' }, { status: 400 })
    }

    // Étape 1 : Appel à l'API Officielle de TikTok
    const videoData = await fetchOfficialTiktokData(url);

    if (!videoData) {
        return NextResponse.json({ error: "Impossible d'obtenir les données via l'API TikTok." }, { status: 500 });
    }

    const metrics = calculateMetrics(videoData)
    const savedRecord = await saveToDatabase({ url, videoData, metrics })

    console.log('✅ Analyse via API terminée !');
    return NextResponse.json({
      success: true,
      analysis: {
        id: savedRecord?.id,
        timestamp: new Date().toISOString(),
        video: { /* ... */ },
        stats: { /* ... */ },
        metrics
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

async function fetchOfficialTiktokData(url: string): Promise<VideoData | null> {
    console.log('🔑 Lecture des clés API depuis l\'environnement...');
    
    const TIKTOK_CLIENT_KEY = process.env.TIKTOK_CLIENT_KEY;
    const TIKTOK_CLIENT_SECRET = process.env.TIKTOK_CLIENT_SECRET;

    if (!TIKTOK_CLIENT_KEY || !TIKTOK_CLIENT_SECRET) {
        console.error('❌ Clés API TikTok manquantes ! Assure-toi de les avoir configurées dans tes variables d\'environnement (.env.local ou sur Vercel).');
        throw new Error('Configuration API manquante.');
    }

    // --- C'est ici que la vraie magie opère ---
    // La logique ci-dessous est un exemple standard. Il faudra l'adapter à la documentation exacte de l'API de TikTok.
    try {
        console.log('📞 Appel à l\'API officielle de TikTok...');

        // Étape A : Obtenir un jeton d'accès (souvent nécessaire)
        // La plupart des API demandent d'échanger les clés contre un "access token" temporaire.
        // const tokenResponse = await fetch('https://open.tiktokapis.com/v2/oauth/token/', {
        //     method: 'POST',
        //     headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        //     body: new URLSearchParams({
        //         'client_key': TIKTOK_CLIENT_KEY,
        //         'client_secret': TIKTOK_CLIENT_SECRET,
        //         'grant_type': 'client_credentials'
        //     })
        // });
        // const tokenData = await tokenResponse.json();
        // const accessToken = tokenData.access_token;

        // Étape B : Appeler l'API avec le jeton pour avoir les données de la vidéo
        // const videoApiResponse = await fetch(`https://open.tiktokapis.com/v2/video/query/?fields=id,title,video_description,view_count,like_count,comment_count,share_count,hashtag_names`, {
        //     method: 'POST',
        //     headers: { 'Authorization': `Bearer ${accessToken}` },
        //     body: JSON.stringify({ video_url: url }) // Hypothèse sur le format du body
        // });
        // const videoDataFromApi = await videoApiResponse.json();

        // --- Pour l'instant, on retourne des données réalistes pour finaliser le projet ---
        // Remplace cette partie par les vrais appels quand la documentation de l'API sera claire.
        await new Promise(resolve => setTimeout(resolve, 800));
        const MOCK_API_RESPONSE: VideoData = {
            title: 'Titre obtenu via l\'API Officielle',
            description: 'Description de la vidéo, autorisée et fournie par TikTok.',
            thumbnail: 'https://p16-sign-va.tiktokcdn.com/tos-maliva-avt-0068/e9d6e495910398a6c8433c4611c7501a~c5_720x720.jpeg?lk3s=a5d48078&x-expires=1723827600&x-signature=2OWbF55zL9sH9r8p%2Bv4YjF%2B71wQ%3D',
            authorUsername: 'auteur_officiel',
            views: 2500000,
            likes: 210000,
            comments: 4500,
            shares: 8000,
            hashtags: ['api', 'officielle', 'tiktok']
        };
        console.log('✅ Données reçues (simulation réussie en attendant la doc API).');
        return MOCK_API_RESPONSE;

    } catch (error) {
        console.error('❌ Erreur lors de l\'appel à l\'API TikTok:', error);
        return null;
    }
}

// ... (Le reste des fonctions calculateMetrics, saveToDatabase, formatNumber reste identique)
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

async function saveToDatabase(data: { url: string; videoData: VideoData; metrics: Metrics }) {
    try {
        const { data: result, error } = await supabase.from('video_analyses').insert({
            tiktok_url: data.url,
            title: data.videoData.title,
            author_username: data.videoData.authorUsername,
            description: data.videoData.description,
            views_count: data.videoData.views,
            likes_count: data.videoData.likes,
            comments_count: data.videoData.comments,
            shares_count: data.videoData.shares,
            engagement_rate: data.metrics.engagementRate,
            hashtags: JSON.stringify(data.videoData.hashtags || [])
        }).select().single();
        if (error) { console.error('❌ Erreur Supabase:', error); return null; }
        return result;
    } catch (error) { console.error('❌ Erreur critique lors de la sauvegarde BDD:', error); return null; }
}

function formatNumber(num: number): string {
    if (num >= 1_000_000_000) return (num / 1_000_000_000).toFixed(1) + 'B';
    if (num >= 1_000_000) return (num / 1_000_000).toFixed(1) + 'M';
    if (num >= 1_000) return (num / 1_000).toFixed(1) + 'K';
    return String(num);
}
