/** Only HTTPS links; iframe URLs are constructed from recognized provider IDs. */
export function videoSource(value: string): { url: string; embed?: string } | null {
  try {
    const url = new URL(value.trim());
    if (url.protocol !== 'https:' || url.username || url.password) return null;
    const host = url.hostname;
    let embed: string | undefined;
    if (['youtube.com', 'www.youtube.com', 'youtu.be'].includes(host)) {
      const id =
        host === 'youtu.be'
          ? url.pathname.slice(1)
          : url.pathname === '/watch'
            ? url.searchParams.get('v')
            : null;
      if (id && /^[\w-]{11}$/.test(id)) embed = `https://www.youtube-nocookie.com/embed/${id}`;
    } else if (['vimeo.com', 'www.vimeo.com'].includes(host) && /^\/\d+$/.test(url.pathname)) {
      embed = `https://player.vimeo.com/video${url.pathname}`;
    }
    return { url: url.href, ...(embed ? { embed } : {}) };
  } catch {
    return null;
  }
}
