import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  base: './', // Rất quan trọng: Giúp định vị đúng file css/js trên GitHub Pages
});
