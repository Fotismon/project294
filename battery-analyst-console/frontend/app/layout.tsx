import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Battery Analyst Console',
  description: 'Energy market decision support for battery operations',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}