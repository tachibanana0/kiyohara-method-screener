import { ViteReactSSG } from 'vite-react-ssg';
import { routes } from './App';
import './index.css';

export const createRoot = ViteReactSSG(
  { routes },
  ({ isClient, router }) => {
    if (isClient) {
      router?.subscribe?.(() => {
        window.scrollTo(0, 0);
      });
    }
  },
);
