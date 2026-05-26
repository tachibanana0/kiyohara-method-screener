/// <reference types="vite/client" />
import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';

const Landing = lazy(() => import('./Landing'));
const Dashboard = lazy(() => import('./Dashboard'));
const Method = lazy(() => import('./Method'));
const FAQ = lazy(() => import('./FAQ'));
const About = lazy(() => import('./About'));

function Loading() {
  return (
    <div className="min-h-screen bg-[#080c14] flex items-center justify-center">
      <div className="animate-spin w-6 h-6 border-2 border-amber-500/30 border-t-amber-500 rounded-full" />
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <Suspense fallback={<Loading />}>
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/method" element={<Method />} />
          <Route path="/faq" element={<FAQ />} />
          <Route path="/about" element={<About />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
}
