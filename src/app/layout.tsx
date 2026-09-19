import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: '부동산 Threads 자동화',
  description: '부동산 정보를 조사해 Threads에 자동 게시하는 관리자 화면',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
