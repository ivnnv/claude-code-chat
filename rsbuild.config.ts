import { defineConfig } from '@rsbuild/core';
import { pluginSass } from '@rsbuild/plugin-sass';

export default defineConfig({
  plugins: [pluginSass()],
  source: {
    entry: {
      index: './src/ui-scripts.ts',
    },
  },
  html: {
    template: './src/index.html',
  },
  output: {
    distPath: {
      root: './out/webview',
    },
    filename: {
      js: '[name].js',
      css: '[name].css',
      html: '[name].html',
    },
    // Disable hash for VS Code extension compatibility
    filenameHash: false,
    // Use relative paths for VS Code webview
    assetPrefix: './',
  },
  tools: {
    rspack: {
      optimization: {
        // Disable code splitting for single webview bundle
        splitChunks: false,
      },
    },
  },
  server: {
    port: 3000,
    open: false,
  },
  dev: {
    // For VS Code webview development
    writeToDisk: true,
  },
});