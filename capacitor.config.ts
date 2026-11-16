import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.kliplokal.app',
  appName: 'KlipLokal',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
  },
  android: {
    allowMixedContent: true,
    backgroundColor: '#000000',
  },
};

export default config;
