export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import HomeClient from './home-client';

// YouTube Data API를 사용하여 재생목록의 최신 동영상 가져오기
async function getLatestYouTubeVideo() {
  const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY;
  const PLAYLIST_ID = 'PLQszPuhfGc7AXaDd-1h6X5M8j0KceTEP_';
  
  if (!YOUTUBE_API_KEY) {
    console.error('YouTube API 키가 설정되지 않았습니다.');
    return null;
  }
  
  try {
    const response = await fetch(
      `https://www.googleapis.com/youtube/v3/playlistItems?part=snippet&playlistId=${PLAYLIST_ID}&maxResults=1&order=date&key=${YOUTUBE_API_KEY}`,
      { next: { revalidate: 3600 } } // 1시간마다 갱신
    );
    
    if (!response.ok) {
      console.error('YouTube API 호출 실패:', response.status);
      return null;
    }
    
    const data = await response.json();
    
    if (data.items && data.items.length > 0) {
      const video = data.items[0].snippet;
      return {
        videoId: video.resourceId.videoId,
        title: video.title,
        description: video.description,
        thumbnail: video.thumbnails.high?.url || video.thumbnails.medium?.url,
        publishedAt: video.publishedAt,
      };
    }
    
    return null;
  } catch (error) {
    console.error('YouTube 동영상 가져오기 실패:', error);
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
