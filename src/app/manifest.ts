import { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'كشافة هب - المنصة الكشفية الذكية',
    short_name: 'كشافة هب',
    description: 'إدارة المجموعات الكشفية، بطاقات الهوية الذكية، حضور الجمعة بالـ QR وتوزيع الفرق',
    start_url: '/',
    display: 'standalone',
    background_color: '#FCF9F2',
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
