import { defineConfig } from 'wxt';

// See https://wxt.dev/api/config.html
export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  manifest: {
    name: 'OSRS TCG Group Collection',
    description: 'Compare OSRS TCG cards, duplicates, and foils with friends.',
    permissions: ['storage'],
    action: {
      default_title: 'OSRS TCG Group Collection',
    },
    host_permissions: [
      'https://osrs-tcg.net/*',
      'https://www.osrs-tcg.net/*',
      'https://api.osrs-tcg.net/*',
    ],
  },
});
