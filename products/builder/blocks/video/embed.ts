/** Video URL → embed URL. Mirrors blocks/video/render.php and Embed.scala. */
export const embedUrl = (url: string): string | undefined => {
  const youtube = /(?:youtube\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/)|youtu\.be\/)([A-Za-z0-9_-]{6,20})/.exec(url);
  if (youtube) return `https://www.youtube-nocookie.com/embed/${youtube[1]}`;
  const vimeo = /vimeo\.com\/(?:video\/)?(\d{5,12})/.exec(url);
  return vimeo ? `https://player.vimeo.com/video/${vimeo[1]}` : undefined;
};
