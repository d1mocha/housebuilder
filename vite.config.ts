import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // GitHub Pages: сайт публикуется по адресу https://<user>.github.io/housebuilder/
  base: '/housebuilder/',
  build: { chunkSizeWarningLimit: 2500 },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
});
