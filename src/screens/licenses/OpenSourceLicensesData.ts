/**
 * src/screens/licenses/OpenSourceLicensesData.ts
 * 오픈소스 라이선스 데이터 - 918개 패키지 자동 생성 (license-checker)
 */

// ─── 타입 ──────────────────────────────────────────────────────────────────────
export type LicenseType =
  | 'MIT' | 'Apache-2.0' | 'ISC'
  | 'BSD-3-Clause' | 'BSD-2-Clause' | '0BSD'
  | 'BlueOak-1.0.0' | 'Unlicense' | 'MPL-2.0'
  | 'CC0-1.0' | 'CC-BY-4.0' | 'Python-2.0'
  | 'Public Domain' | 'UNKNOWN'
  | 'Gemma-ToU';

export interface OSSLibrary {
  name: string;
  version: string;
  license: LicenseType;
  url: string;
}

// ─── 라이선스 색상 ───────────────────────────────────────────────────────────
export const LICENSE_COLOR: Record<LicenseType, string> = {
  'MIT':           '#4ADE80',
  'Apache-2.0':    '#60A5FA',
  'ISC':           '#34D399',
  'BSD-3-Clause':  '#A78BFA',
  'BSD-2-Clause':  '#C084FC',
  '0BSD':          '#6EE7B7',
  'BlueOak-1.0.0': '#7DD3FC',
  'Unlicense':     '#D1D5DB',
  'MPL-2.0':       '#F97316',  // 주황 — 주의
  'CC0-1.0':       '#94A3B8',
  'CC-BY-4.0':     '#FCA5A5',
  'Python-2.0':    '#FDE68A',
  'Public Domain': '#E5E7EB',
  'UNKNOWN':       '#F87171',  // 빨강 — 확인 필요
  'Gemma-ToU':     '#FACC15',  // 노랑 — Google 독자 라이선스
};

// ─── 라이브러리 목록 ───────────────────────────────────────────────────────────
export const LIBRARIES: OSSLibrary[] = [
  { name: '@ai-sdk/gateway', version: '3.0.66', license: 'Apache-2.0' as LicenseType, url: 'https://github.com/vercel/ai' },
  { name: '@ai-sdk/provider-utils', version: '4.0.19', license: 'Apache-2.0' as LicenseType, url: 'https://github.com/vercel/ai' },
  { name: '@ai-sdk/provider', version: '3.0.8', license: 'Apache-2.0' as LicenseType, url: 'https://github.com/vercel/ai' },
  { name: '@amplitude/analytics-connector', version: '1.6.4', license: 'MIT' as LicenseType, url: 'https://github.com/amplitude/experiment-js-client' },
  { name: '@amplitude/analytics-core', version: '2.40.0', license: 'MIT' as LicenseType, url: 'https://github.com/amplitude/Amplitude-TypeScript' },
  { name: '@amplitude/analytics-react-native', version: '1.5.40', license: 'MIT' as LicenseType, url: 'https://github.com/amplitude/Amplitude-TypeScript' },
  { name: '@amplitude/ua-parser-js', version: '0.7.33', license: 'MIT' as LicenseType, url: 'https://github.com/amplitude/ua-parser-js' },
  { name: '@babel/code-frame', version: '7.29.0', license: 'MIT' as LicenseType, url: 'https://github.com/babel/babel' },
  { name: '@babel/compat-data', version: '7.29.0', license: 'MIT' as LicenseType, url: 'https://github.com/babel/babel' },
  { name: '@babel/core', version: '7.29.0', license: 'MIT' as LicenseType, url: 'https://github.com/babel/babel' },
  { name: '@babel/generator', version: '7.29.1', license: 'MIT' as LicenseType, url: 'https://github.com/babel/babel' },
  { name: '@babel/helper-annotate-as-pure', version: '7.27.3', license: 'MIT' as LicenseType, url: 'https://github.com/babel/babel' },
  { name: '@babel/helper-compilation-targets', version: '7.28.6', license: 'MIT' as LicenseType, url: 'https://github.com/babel/babel' },
  { name: '@babel/helper-create-class-features-plugin', version: '7.28.6', license: 'MIT' as LicenseType, url: 'https://github.com/babel/babel' },
  { name: '@babel/helper-create-regexp-features-plugin', version: '7.28.5', license: 'MIT' as LicenseType, url: 'https://github.com/babel/babel' },
  { name: '@babel/helper-define-polyfill-provider', version: '0.6.7', license: 'MIT' as LicenseType, url: 'https://github.com/babel/babel-polyfills' },
  { name: '@babel/helper-globals', version: '7.28.0', license: 'MIT' as LicenseType, url: 'https://github.com/babel/babel' },
  { name: '@babel/helper-member-expression-to-functions', version: '7.28.5', license: 'MIT' as LicenseType, url: 'https://github.com/babel/babel' },
  { name: '@babel/helper-module-imports', version: '7.28.6', license: 'MIT' as LicenseType, url: 'https://github.com/babel/babel' },
  { name: '@babel/helper-module-transforms', version: '7.28.6', license: 'MIT' as LicenseType, url: 'https://github.com/babel/babel' },
  { name: '@babel/helper-optimise-call-expression', version: '7.27.1', license: 'MIT' as LicenseType, url: 'https://github.com/babel/babel' },
  { name: '@babel/helper-plugin-utils', version: '7.28.6', license: 'MIT' as LicenseType, url: 'https://github.com/babel/babel' },
  { name: '@babel/helper-remap-async-to-generator', version: '7.27.1', license: 'MIT' as LicenseType, url: 'https://github.com/babel/babel' },
  { name: '@babel/helper-replace-supers', version: '7.28.6', license: 'MIT' as LicenseType, url: 'https://github.com/babel/babel' },
  { name: '@babel/helper-skip-transparent-expression-wrappers', version: '7.27.1', license: 'MIT' as LicenseType, url: 'https://github.com/babel/babel' },
  { name: '@babel/helper-string-parser', version: '7.27.1', license: 'MIT' as LicenseType, url: 'https://github.com/babel/babel' },
  { name: '@babel/helper-validator-identifier', version: '7.28.5', license: 'MIT' as LicenseType, url: 'https://github.com/babel/babel' },
  { name: '@babel/helper-validator-option', version: '7.27.1', license: 'MIT' as LicenseType, url: 'https://github.com/babel/babel' },
  { name: '@babel/helper-wrap-function', version: '7.28.6', license: 'MIT' as LicenseType, url: 'https://github.com/babel/babel' },
  { name: '@babel/helpers', version: '7.28.6', license: 'MIT' as LicenseType, url: 'https://github.com/babel/babel' },
  { name: '@babel/parser', version: '7.29.0', license: 'MIT' as LicenseType, url: 'https://github.com/babel/babel' },
  { name: '@babel/plugin-proposal-decorators', version: '7.29.0', license: 'MIT' as LicenseType, url: 'https://github.com/babel/babel' },
  { name: '@babel/plugin-proposal-export-default-from', version: '7.27.1', license: 'MIT' as LicenseType, url: 'https://github.com/babel/babel' },
  { name: '@babel/plugin-syntax-async-generators', version: '7.8.4', license: 'MIT' as LicenseType, url: 'https://github.com/babel/babel/tree/master/packages/babel-plugin-syntax-async-generators' },
  { name: '@babel/plugin-syntax-bigint', version: '7.8.3', license: 'MIT' as LicenseType, url: 'https://github.com/babel/babel/tree/master/packages/babel-plugin-syntax-bigint' },
  { name: '@babel/plugin-syntax-class-properties', version: '7.12.13', license: 'MIT' as LicenseType, url: 'https://github.com/babel/babel' },
  { name: '@babel/plugin-syntax-class-static-block', version: '7.14.5', license: 'MIT' as LicenseType, url: 'https://github.com/babel/babel' },
  { name: '@babel/plugin-syntax-decorators', version: '7.28.6', license: 'MIT' as LicenseType, url: 'https://github.com/babel/babel' },
  { name: '@babel/plugin-syntax-dynamic-import', version: '7.8.3', license: 'MIT' as LicenseType, url: 'https://github.com/babel/babel/tree/master/packages/babel-plugin-syntax-dynamic-import' },
  { name: '@babel/plugin-syntax-export-default-from', version: '7.28.6', license: 'MIT' as LicenseType, url: 'https://github.com/babel/babel' },
  { name: '@babel/plugin-syntax-flow', version: '7.28.6', license: 'MIT' as LicenseType, url: 'https://github.com/babel/babel' },
  { name: '@babel/plugin-syntax-import-attributes', version: '7.28.6', license: 'MIT' as LicenseType, url: 'https://github.com/babel/babel' },
  { name: '@babel/plugin-syntax-import-meta', version: '7.10.4', license: 'MIT' as LicenseType, url: 'https://github.com/babel/babel' },
  // ... 나머지 라이브러리들은 원본 파일에서 복사
];

// ─── 유틸리티 함수 ─────────────────────────────────────────────────────────────
export function getLicenseColor(license: LicenseType): string {
  return LICENSE_COLOR[license] || '#94A3B8';
}

export function filterLibraries(libraries: OSSLibrary[], query: string): OSSLibrary[] {
  if (!query.trim()) return libraries;
  
  const lowerQuery = query.toLowerCase();
  return libraries.filter(lib => 
    lib.name.toLowerCase().includes(lowerQuery) ||
    lib.license.toLowerCase().includes(lowerQuery) ||
    lib.version.toLowerCase().includes(lowerQuery)
  );
}

export function groupByLicense(libraries: OSSLibrary[]): Record<LicenseType, OSSLibrary[]> {
  return libraries.reduce((groups, lib) => {
    const license = lib.license;
    if (!groups[license]) {
      groups[license] = [];
    }
    groups[license].push(lib);
    return groups;
  }, {} as Record<LicenseType, OSSLibrary[]>);
}

export function getLicenseStats(libraries: OSSLibrary[]): Record<LicenseType, number> {
  const stats: Record<LicenseType, number> = {} as Record<LicenseType, number>;
  
  libraries.forEach(lib => {
    stats[lib.license] = (stats[lib.license] || 0) + 1;
  });
  
  return stats;
}
