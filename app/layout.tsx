import type { Metadata, Viewport } from 'next';
import './globals.css';
import { PWAInstallPrompt } from '@/components/pwa/PWAInstallPrompt';

export const viewport: Viewport = {
  themeColor: '#020617',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
};

export const metadata: Metadata = {
  title: 'سام تك لإدارة الشبكات - نظام إدارة وتوزيع كروت شبكات المايكروتك',
  description: 'نظام سحابي متكامل لإدارة شبكات المايكروتك، تصميم وطباعة كروت الإنترنت بدقة A4، إدارة المخزون ونقاط البيع، والتحصيل المالي والمزامنة الذكية.',
  icons: {
    icon: '/icon.svg',
    apple: '/apple-touch-icon.png',
  },
  manifest: '/manifest.webmanifest',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'سام تك',
  },
  openGraph: {
    title: 'سام تك لإدارة الشبكات',
    description: 'نظام احترافي سحابي متكامل لإدارة شبكات المايكروتك وتوليد وتصميم كروت الإنترنت وطباعتها وتوزيعها على نقاط البيع ومتابعة المبيعات والديون والمزامنة الذكية',
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ar" dir="rtl" className="dark">
      <body suppressHydrationWarning className="font-cairo bg-slate-950 text-slate-100 min-h-screen antialiased selection:bg-sky-500 selection:text-white">
        {children}
        <PWAInstallPrompt />
      </body>
    </html>
  );
}
