import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';

export default defineConfig(() => {
  return {
    base: './',
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    build: {
      rollupOptions: {
        input: {
          main: path.resolve(__dirname, 'index.html'),
          about: path.resolve(__dirname, 'about.html'),
          activity: path.resolve(__dirname, 'activity.html'),
          adminBugs: path.resolve(__dirname, 'admin-bugs.html'),
          admin: path.resolve(__dirname, 'admin.html'),
          dailyRewards: path.resolve(__dirname, 'daily-rewards.html'),
          deleteAccount: path.resolve(__dirname, 'delete-account.html'),
          emergency: path.resolve(__dirname, 'emergency.html'),
          leaderboard: path.resolve(__dirname, 'leaderboard.html'),
          notifications: path.resolve(__dirname, 'notifications.html'),
          philosophy: path.resolve(__dirname, 'philosophy.html'),
          privacy: path.resolve(__dirname, 'privacy.html'),
          profile: path.resolve(__dirname, 'profile.html'),
          story: path.resolve(__dirname, 'story.html'),
          submit: path.resolve(__dirname, 'submit.html'),
          suggest: path.resolve(__dirname, 'suggest.html'),
          terms: path.resolve(__dirname, 'terms.html'),
          transactions: path.resolve(__dirname, 'transactions.html'),
          welcome: path.resolve(__dirname, 'welcome.html'),
          donate: path.resolve(__dirname, 'donate.html'),
        },
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
