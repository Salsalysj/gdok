export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import HomeClient from './home-client';

// YouTube RSS 피드를 사용하여 채널의 최신 동영상 가져오기
async function getLatestYouTubeVideo() {
  const CHANNEL_ID = 'UCjTgPJoznJgeUta2qTI60SQ'; // 채널 ID
  const RSS_URL = `https://www.youtube.com/feeds/videos.xml?channel_id=${CHANNEL_ID}`;
  
  try {
    const response = await fetch(RSS_URL, {
      next: { revalidate: 3600 } // 1시간마다 갱신
    });
    
    if (!response.ok) {
      console.error('YouTube RSS 피드 호출 실패:', response.status);
      return null;
    }
    
    const xmlText = await response.text();
    
    // XML 파싱
    const videoIdMatch = xmlText.match(/<yt:videoId>(.*?)<\/yt:videoId>/);
    const titleMatch = xmlText.match(/<title>(.*?)<\/title>/);
    const descriptionMatch = xmlText.match(/<media:description>(.*?)<\/media:description>/);
    const publishedMatch = xmlText.match(/<published>(.*?)<\/published>/);
    const thumbnailMatch = xmlText.match(/<media:thumbnail url="(.*?)"/);
    
    if (videoIdMatch && titleMatch) {
      // 첫 번째 <title>은 채널 제목이므로 두 번째를 사용
      const titles = xmlText.match(/<title>(.*?)<\/title>/g);
      const videoTitle = titles && titles.length > 1 
        ? titles[1].replace(/<title>|<\/title>/g, '') 
        : titleMatch[1];
      
      return {
        videoId: videoIdMatch[1],
        title: videoTitle,
        description: descriptionMatch ? descriptionMatch[1] : '',
        thumbnail: thumbnailMatch ? thumbnailMatch[1] : `https://img.youtube.com/vi/${videoIdMatch[1]}/maxresdefault.jpg`,
        publishedAt: publishedMatch ? publishedMatch[1] : new Date().toISOString(),
      };
    }
    
    return null;
  } catch (error) {
    console.error('YouTube RSS 피드 가져오기 실패:', error);
    return null;
  }
}

// 로스트아크 공지사항 가져오기
async function getLostArkNotices() {
  try {
    const response = await fetch(
      'https://developer-lostark.game.onstove.com/news/notices',
      {
        headers: {
          'Accept': 'application/json',
          'Authorization': `bearer ${process.env.LOSTARK_API_KEY || ''}`,
        },
        next: { revalidate: 1800 } // 30분마다 갱신
      }
    );
    
    if (!response.ok) {
      console.error('로스트아크 API 호출 실패:', response.status);
      return [];
    }
    
    const data = await response.json();
    return data.slice(0, 5); // 최신 5개만 가져오기
  } catch (error) {
    console.error('로스트아크 공지사항 가져오기 실패:', error);
    return [];
  }
}

export default async function HomePage() {
  const [youtubeVideo, lostarkNotices] = await Promise.all([
    getLatestYouTubeVideo(),
    getLostArkNotices(),
  ]);
  
  return (
    <HomeClient 
      youtubeVideo={youtubeVideo}
      lostarkNotices={lostarkNotices}
    />
  );
}
