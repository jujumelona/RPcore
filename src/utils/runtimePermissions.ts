/* eslint-disable @typescript-eslint/no-unused-vars */
import { PermissionsAndroid, Platform } from 'react-native';
import { launchImageLibrary,
  type ImageLibraryOptions,
  type ImagePickerResponse } from 'react-native-image-picker';

/* eslint-disable @typescript-eslint/no-unused-vars */

export interface PhotoPermissionCopy {
  title?: string;
  message?: string;
  allow?: string;
  deny?: string;
}

const DEFAULT_COPY: Required<PhotoPermissionCopy> = {
  title: 'Photo permission',
  message: 'Photo access is required to select an image.',
  allow: 'Allow',
  deny: 'Deny' };

export async function requestPhotoLibraryPermission(
  copy: PhotoPermissionCopy = DEFAULT_COPY,
): Promise<boolean> {

  const sdkVersion = Platform.Version as number;
  const permission = sdkVersion >= 33
    ? PermissionsAndroid.PERMISSIONS.READ_MEDIA_IMAGES
    : PermissionsAndroid.PERMISSIONS.READ_EXTERNAL_STORAGE;

  const granted = await PermissionsAndroid.check(permission).catch(() => false);
  if (granted) return true;

  const result = await PermissionsAndroid.request(permission, {
    title: copy.title ?? DEFAULT_COPY.title,
    message: copy.message ?? DEFAULT_COPY.message,
    buttonPositive: copy.allow ?? DEFAULT_COPY.allow,
    buttonNegative: copy.deny ?? DEFAULT_COPY.deny }).catch(() => PermissionsAndroid.RESULTS.DENIED);

  if (result === PermissionsAndroid.RESULTS.GRANTED) {
    await new Promise<void>(resolve => setTimeout(() => resolve(), 250));
    return true;
  }

  return false;
}

export async function openImageLibrary(
  options: ImageLibraryOptions,
): Promise<ImagePickerResponse> {
  return new Promise(resolve => {
    launchImageLibrary(options, response => resolve(response));
  });
}
