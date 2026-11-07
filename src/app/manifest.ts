import { MetadataRoute } from 'next';
import { siteBranding } from '@/config/branding';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: siteBranding.nameAr,
    short_name: siteBranding.shortName,
    description: `${siteBranding.fullTitleAr} - ${siteBranding.descriptionAr}`,
    start_url: '/',
    display: 'standalone',
    background_color: '#FDFBF7',
    theme_color: '#173C32',
    dir: 'rtl',
    lang: 'ar',
    icons: [
      {
        src: '/icons/icon-192.png',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'maskable',
      },
      {
        src: '/icons/icon-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'any',
      },
    ],
  };
}
