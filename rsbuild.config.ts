import { defineConfig } from '@rsbuild/core';
import { pluginSass } from '@rsbuild/plugin-sass';

export default defineConfig(({ env, command }) => {
  const isDev = env === 'development' || command === 'dev';

  return {
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
      // Use relative paths for VS Code webview in both dev and prod
      assetPrefix: './',
    },
    tools: {
      rspack: {
        optimization: {
          // Disable code splitting for single webview bundle
          splitChunks: false,
          // Enable minification in production, disable in development
          minimize: !isDev,
        },
        // Set mode based on environment
        mode: isDev ? 'development' : 'production',
      },
    },
    server: {
      port: 3000,
      open: false,
    },
    dev: {
      // For VS Code webview development - write to disk so extension can read files
      writeToDisk: true,
      // Disable HMR in VS Code webview context as it conflicts with our custom hot reload
      hmr: false,
      liveReload: false,
    },
  };
});
