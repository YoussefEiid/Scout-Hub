/**
 * Centralized Branding Constants for Alfanar Scouts (كشافة الفنار)
 * Church: كنيسة الشهيدة رفقة وأولادها الخمسة - العمرانية الشرقية
 */

export const siteBranding = {
  nameAr: 'كشافة الفنار',
  nameEn: 'Alfanar Scouts',
  shortName: 'الفنار',
  churchInscription: 'كنيسة الشهيدة رفقة وأولادها الخمسة - العمرانية الشرقية',
  groupNameAr: 'مجموعة الفنار للكشافة والمرشدات',
  fullTitleAr: 'مجموعة الفنار للكشافة والمرشدات - كنيسة الشهيدة رفقة وأولادها الخمسة بالعمرانية الشرقية',
  descriptionAr: 'المنصة الرقمية الرسمية لإدارة كشافة الفنار، بطاقات الهوية الرقمية، الحضور الذكي بالـ QR، وتوزيع الطليعة والفرق.',
  logoUrl: '/branding/alfanar-logo.png',
  logoAlt: 'شعار مجموعة الفنار للكشافة والمرشدات',
  tagline: 'المنصة الرقمية الرسمية لكشافة الفنار',
  copyright: `© ${new Date().getFullYear()} مجموعة الفنار للكشافة والمرشدات. جميع الحقوق محفوظة.`,
} as const;

export type SiteBranding = typeof siteBranding;
