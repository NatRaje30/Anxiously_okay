/*
 * Native bridge bundle. esbuild turns this into www/js/capacitor.bundle.js.
 * It only exposes the plugin objects; all app logic lives in www/js/*.js so the
 * same code runs in a normal browser (where this bundle may be absent).
 */
import { Capacitor } from '@capacitor/core';
import { App } from '@capacitor/app';
import { Preferences } from '@capacitor/preferences';
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';
import { LocalNotifications } from '@capacitor/local-notifications';
import { Haptics, ImpactStyle } from '@capacitor/haptics';
import { StatusBar, Style } from '@capacitor/status-bar';
import { SplashScreen } from '@capacitor/splash-screen';
import { Share } from '@capacitor/share';
import { FilePicker } from '@capawesome/capacitor-file-picker';
import { SecureStorage, KeychainAccess } from '@aparajita/capacitor-secure-storage';
import { BiometricAuth } from '@aparajita/capacitor-biometric-auth';

window.AOCap = {
  Capacitor, App, Preferences, Filesystem, Directory, Encoding, LocalNotifications,
  Haptics, ImpactStyle, StatusBar, Style, SplashScreen, Share, FilePicker,
  SecureStorage, KeychainAccess, BiometricAuth,
};
