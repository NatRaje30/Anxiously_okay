import type { CapacitorConfig } from '@capacitor/cli';

/*
 * The app is bundled into the binary from www/. There is deliberately no `server.url`:
 * the native app never loads the Netlify site or any other remote page.
 */
const config: CapacitorConfig = {
  loggingBehavior: process.env.AO_FLAVOR === 'dev' ? 'debug' : 'none',  // no native console logging in release
  appId: 'com.anxiouslyokay.app',
  appName: 'Anxiously Okay',
  webDir: 'www',
  backgroundColor: '#fffbf5',
  ios: {
    contentInset: 'never',
    backgroundColor: '#fffbf5',
  },
  android: {
    backgroundColor: '#fffbf5',
    allowMixedContent: false,
    webContentsDebuggingEnabled: process.env.AO_FLAVOR === 'dev',  // off for beta/release
  },
  plugins: {
    SplashScreen: {
      launchAutoHide: false,            // hidden by the app once the store has opened
      backgroundColor: '#fffbf5',
      showSpinner: false,
    },
    LocalNotifications: {
      smallIcon: 'ic_stat_notify',
      iconColor: '#3a8a4a',
    },
  },
};

export default config;
