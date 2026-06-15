import { NativeModules, Platform } from 'react-native';

const { DisplayCutoutModule } = NativeModules;

export const setNavigationBarTransparent = async () => {
  if (Platform.OS !== 'android') return;
  try {
    await DisplayCutoutModule?.setNavigationBarColor('#00000000');
  } catch (e) {
    console.warn('Failed to set navigation bar transparent:', e);
  }
};

export const restoreNavigationBar = async () => {
  if (Platform.OS !== 'android') return;
  try {
    await DisplayCutoutModule?.setNavigationBarColor('#050507');
  } catch (e) {
    console.warn('Failed to restore navigation bar:', e);
  }
};
