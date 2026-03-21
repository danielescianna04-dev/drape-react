// @refresh reload
import { Router } from '@solidjs/router';
import { FileRoutes } from '@solidjs/start/router';
import { Suspense } from 'solid-js';
import Navbar from '~/components/Navbar';
import Footer from '~/components/Footer';
import './app.css';

export default function App() {
  return (
    <Router
      root={(props) => (
        <div class="min-h-screen flex flex-col">
          <Navbar />
          <main class="flex-1">
            <Suspense>{props.children}</Suspense>
          </main>
          <Footer />
        </div>
      )}
    >
      <FileRoutes />
    </Router>
  );
}
