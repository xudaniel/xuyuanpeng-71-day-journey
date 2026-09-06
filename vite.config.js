import {defineConfig} from 'vite';
import {sites} from '@openai/sites-vite-plugin';
export default defineConfig({plugins:[sites()],build:{ssr:'server/worker.js',outDir:'dist/server',emptyOutDir:true,rollupOptions:{output:{entryFileNames:'index.js'}}}});
