import { BrowserRouter, Link, Route, Routes } from 'react-router-dom';
import WelcomePage from './pages/WelcomePage.jsx';

function NotFoundPage() {
  return (
    <main className="grid min-h-screen place-items-center bg-[#eef2f6] px-6 text-center">
      <div className="rounded-2xl border border-slate-200/90 bg-white p-8 shadow-xs">
        <p className="text-sm font-semibold text-slate-500">Page not found</p>
        <Link className="mt-4 inline-block rounded-xl bg-sky-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-sky-500 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-sky-600 transition" to="/">
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
