import { BrowserRouter, Link, Route, Routes } from 'react-router-dom';
import WelcomePage from './pages/WelcomePage.jsx';

function NotFoundPage() {
  return (
    <main className="grid min-h-screen place-items-center px-6 text-center">
      <div>
        <p className="text-sm font-medium text-zinc-400">Page not found</p>
        <Link className="mt-4 inline-block rounded-lg text-white underline decoration-zinc-600 underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white" to="/">
          Return to BalaKavach
        </Link>
      </div>
    </main>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<WelcomePage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </BrowserRouter>
  );
}
