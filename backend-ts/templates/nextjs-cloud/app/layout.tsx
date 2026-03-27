import type { Metadata } from 'next'
import './globals.css'
import Navbar from './components/Navbar'
import Footer from './components/Footer'
import { AuthProvider } from './components/auth-provider'

export const metadata: Metadata = {
  title: 'My App',
  description: 'Build something amazing with modern tools',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en">
      <body>
        <AuthProvider>
          <Navbar />
          <main className="min-h-screen pt-16">{children}</main>
          <Footer />
        </AuthProvider>
      </body>
    </html>
  )
}
