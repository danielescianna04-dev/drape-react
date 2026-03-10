import './globals.css';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'ed - Apple Style',
  description: 'Un sito ispirato al design Apple',
};

export default function RootLayout({
  children,
}: { 
  children: React.ReactNode 
}) {
  return (
    <html lang="it">
      <body className="bg-white text-black antialiased overflow-x-hidden">
        <nav className="fixed top-0 w-full z-50 bg-white/80 backdrop-blur-md border-b border-gray-100">
          <div className="max-w-screen-xl mx-auto px-4 h-12 flex items-center justify-between">
            <div className="text-xl font-semibold tracking-tight"></div>
            <div className="hidden md:flex space-x-8 text-xs font-medium text-gray-600">
              <a href="#">Store</a>
              <a href="#">Mac</a>
              <a href="#">iPad</a>
              <a href="#">iPhone</a>
              <a href="#">Watch</a>
              <a href="#">Supporto</a>
            </div>
            <div className="flex space-x-4">
              <span className="text-sm">🔍</span>
              <span className="text-sm">👜</span>
            </div>
          </div>
        </nav>
        <main className="pt-12">
          {children}
        </main>
        <footer className="bg-[#f5f5f7] py-12 px-6 text-xs text-gray-500">
          <div className="max-w-screen-lg mx-auto">
            <p className="mb-4">Copyright © 2024 ed Inc. Tutti i diritti riservati.</p>
            <div className="flex flex-wrap gap-4">
              <span>Privacy Policy</span>
              <span>Cookie Policy</span>
              <span>Termini di utilizzo</span>
              <span>Mappa del sito</span>
            </div>
          </div>
        </footer>
      </body>
    </html>
  );
}