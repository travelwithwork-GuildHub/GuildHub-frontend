import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'GuildHub',
  description: '有空間感的自由工作者／專案媒合平台',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-Hant">
      <body>{children}</body>
    </html>
  )
}
