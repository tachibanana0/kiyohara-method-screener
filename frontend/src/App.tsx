/// <reference types="vite/client" />
import type { RouteRecord } from 'vite-react-ssg';
import { lazy, Suspense } from 'react';

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

export const routes: RouteRecord[] = [
  {
    path: '/',
    lazy: async () => {
      const m = await import('./Landing');
      return { Component: m.default, loader: m.loader };
    },
  },
  {
    path: '/dashboard',
    lazy: async () => {
      const m = await import('./Dashboard');
      return { Component: m.default, loader: m.loader };
    },
  },
  {
    path: '/method',
    Component: () => (
      <Suspense fallback={<Loading />}>
        <Method />
      </Suspense>
    ),
  },
  {
    path: '/faq',
    Component: () => (
      <Suspense fallback={<Loading />}>
        <FAQ />
      </Suspense>
    ),
  },
  {
    path: '/about',
    Component: () => (
      <Suspense fallback={<Loading />}>
        <About />
      </Suspense>
    ),
  },
  {
    path: '/picks/:code',
    lazy: async () => {
      const m = await import('./StockDetail');
      return { Component: m.default, loader: m.loader };
    },
    getStaticPaths: async () => {
      const { readFileSync, existsSync } = await import('node:fs');
      const { resolve } = await import('node:path');
      const picksFile = resolve(process.cwd(), '.picks-cache.json');
      if (!existsSync(picksFile)) return [];
      try {
        const data = JSON.parse(readFileSync(picksFile, 'utf-8')) as Array<{ code: string }>;
        return data.map((p) => `/picks/${p.code}`);
      } catch {
        return [];
      }
    },
  },
];
