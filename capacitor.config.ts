import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'kr.gcalc.app',
  appName: '껨산기',
  bundledWebRuntime: false,
  server: {
    url: 'https://www.gcalc.kr',
    cleartext: false,
  },
  android: {
    allowMixedContent: false,
  },
};

export default config;
