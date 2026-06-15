// src/screens/policy/constants/dataPolicy.ts

export const CONTACT = {
  dpo:     'fdje0303@gmail.com',
  support: 'fdje0303@gmail.com',
  website: 'https://rpcore.app/privacy' };

export const LAST_UPDATED = 'March 8, 2026';

export const DATA_ITEMS = [
  {
    category: 'Account Info',
    icon: '👤',
    items: [
      { name: 'Email address', purpose: 'Login authentication', retention: 'Deleted immediately on withdrawal', sensitive: false },
      { name: 'Nickname & profile image', purpose: 'In-app display', retention: 'Deleted immediately on withdrawal', sensitive: false },
      { name: 'Google login token', purpose: 'Social login', retention: 'Expires on session end', sensitive: false },
    ] },
  {
    category: 'Content Data',
    icon: '💬',
    items: [
      { name: 'AI chat history', purpose: 'Conversation restore & context', retention: 'Deleted on withdrawal / device only', sensitive: true },
      { name: 'Bookmarks & likes', purpose: 'Personalized recommendations', retention: 'Deleted immediately on withdrawal', sensitive: false },
      { name: 'Follow list', purpose: 'Author subscription management', retention: 'Deleted immediately on withdrawal', sensitive: false },
    ] },
  {
    category: 'Device & Usage Info',
    icon: '',
    items: [
      { name: 'Device OS & version', purpose: 'Error tracking & compatibility', retention: 'Auto-deleted after 90 days', sensitive: false },
      { name: 'App crash logs (Sentry)', purpose: 'Bug fixes', retention: 'Auto-deleted after 30 days', sensitive: false },
      { name: 'Event analytics (Amplitude)', purpose: 'Feature improvement', retention: '1 year after anonymization', sensitive: false },
      { name: 'Advertising ID (GAID)', purpose: 'Interest-based ads (with consent only)', retention: 'Deactivated immediately on consent withdrawal', sensitive: true },
    ] },
  {
    category: 'On-Device Storage',
    icon: '💾',
    items: [
      { name: 'AI model file (llama.rn)', purpose: 'Offline inference', retention: 'Removed on app uninstall', sensitive: false },
      { name: 'KV cache & conversation data', purpose: 'Fast resume', retention: 'Auto-deleted after 30 days of inactivity', sensitive: true },
      { name: 'Image cache', purpose: 'Improve loading speed', retention: 'Auto-deleted after 7 days', sensitive: false },
    ] },
] as const;

export const PERMISSIONS = [
  {
    permission: 'INTERNET',
    android: true, ios: false,
    reason: 'Required for loading story list, AI cloud fallback, and Firebase push notification.',
    sensitive: false },
  {
    permission: 'READ_EXTERNAL_STORAGE / Photos',
    android: true, ios: true,
    reason: 'Only requested when uploading a profile photo. Gallery access is granted only just before upload.',
    sensitive: true },
  {
    permission: 'POST_NOTIFICATIONS',
    android: true, ios: true,
    reason: 'Required for update and announcement notifications from followed authors. Core features work even if denied.',
    sensitive: false },
  {
    permission: 'RECEIVE_BOOT_COMPLETED',
    android: true, ios: false,
    reason: 'Required to restore scheduled notifications after device restart.',
    sensitive: false },
  {
    permission: 'CAMERA (optional)',
    android: true, ios: true,
    reason: 'Only requested when taking a profile photo. Never requested if this feature is not used.',
    sensitive: true },
] as const;

export const THIRD_PARTIES = [
  {
    name: 'Firebase (Google)',
    purpose: 'Authentication, push notifications, crash reporting',
    policy: 'https://firebase.google.com/support/privacy',
    transfers: 'USA' },
  {
    name: 'Google AdMob',
    purpose: 'Ad delivery (interest-based with consent, non-personalized without)',
    policy: 'https://policies.google.com/privacy',
    transfers: 'USA' },
  {
    name: 'Amplitude',
    purpose: 'Usage analytics (anonymized events only)',
    policy: 'https://amplitude.com/privacy',
    transfers: 'USA' },
  {
    name: 'Sentry',
    purpose: 'Error & crash logs (personal info masked)',
    policy: 'https://sentry.io/privacy/',
    transfers: 'USA' },
] as const;

export const USER_RIGHTS = [
  { right: 'Access',      desc: 'Request to view data held about you' },
  { right: 'Correction',  desc: 'Request correction of inaccurate data' },
  { right: 'Deletion',    desc: 'Request immediate deletion of your data (Method 2 above)' },
  { right: 'Restriction', desc: 'Request to stop processing specific data' },
  { right: 'Portability', desc: 'Request your data in machine-readable format' },
  { right: 'Objection',   desc: 'Object to automated decisions (recommendation algorithms)' },
] as const;
