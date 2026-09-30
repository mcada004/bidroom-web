export const VIDEO_ROOM = 'survivor-51-2026';

export type DraftVideo = { url: string };

export function videoSource(raw: string): { kind: 'embed' | 'file'; src: string } | null {
  try {
    const url = new URL(raw.trim());
    if (url.protocol !== 'https:' || url.username || url.password || raw.length > 500) return null;
    const host = url.hostname.toLowerCase();
    let id = '';
    if (host === 'youtu.be') id = url.pathname.slice(1);
    else if (host === 'youtube.com' || host === 'www.youtube.com' || host === 'm.youtube.com') {
      if (url.pathname === '/watch') id = url.searchParams.get('v') ?? '';
      else if (url.pathname.startsWith('/shorts/')) id = url.pathname.split('/')[2];
    }
    if (id && /^[a-zA-Z0-9_-]{11}$/.test(id))
      return { kind: 'embed', src: `https://www.youtube-nocookie.com/embed/${id}?autoplay=1&rel=0` };
    if ((host === 'vimeo.com' || host === 'www.vimeo.com') && /^\/\d+$/.test(url.pathname))
      return { kind: 'embed', src: `https://player.vimeo.com/video/${url.pathname.slice(1)}?autoplay=1` };
    if (/\.(mp4|webm)$/i.test(url.pathname)) return { kind: 'file', src: url.href };
    return null;
  } catch { return null; }
}
