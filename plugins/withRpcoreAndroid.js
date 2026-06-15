const {
  AndroidConfig,
  createRunOncePlugin,
  withAndroidManifest,
  withAppBuildGradle,
  withMainActivity,
  withMainApplication,
} = require('expo/config-plugins');

const ADMOB_APP_ID = 'ca-app-pub-9020691040370881~6462881546';
const PACKAGE_NAME = 'com.rpplatform';
const PLUGIN_NAME = 'with-rpcore-android';
const PLUGIN_VERSION = '1.0.0';
const MEMORY_GUARD_BLOCK = [
  '        MemoryGuard.register(this) {',
  '            Log.e("MainApplication", "OOM - emergency save")',
  '            try {',
  '                val reactContext = reactHost.currentReactContext',
  '                if (reactContext != null && reactContext.hasActiveCatalystInstance()) {',
  '                    val params = Arguments.createMap().apply {',
  '                        putString("reason", "oom_critical")',
  '                    }',
  '                    reactContext',
  '                        .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)',
  '                        ?.emit("engine:oom_emergency", params)',
  '                }',
  '            } catch (e: Exception) {',
  '                Log.e("MainApplication", "OOM event failed: ${e.message}")',
  '            }',
  '        }',
].join('\n');

const PACKAGING_BLOCK = [
  '    packaging {',
  '        jniLibs {',
  '            useLegacyPackaging = true',
  '            pickFirsts += [',
  "                    'lib/*/libc++_shared.so',",
  "                    'lib/*/libomp.so',",
  "                    'lib/*/libllama.so',",
  "                    'lib/*/librnllama.so',",
  "                    'lib/*/librnllama_android.so',",
  '            ]',
  '        }',
  '        resources {',
  "            excludes += ['META-INF/DEPENDENCIES']",
  '        }',
  '    }',
].join('\n');

const VECTOR_ICONS_BLOCK = [
  'apply from: "../../node_modules/react-native-vector-icons/fonts.gradle"',
  '',
  'android.applicationVariants.all { variant ->',
  '    variant.mergeAssetsProvider.configure {',
  '        doLast {',
  '            def fontsDir = new File(outputDir.get().asFile, "fonts")',
  '            fontsDir.mkdirs()',
  '            def iconFonts = [',
  '                "Ionicons.ttf",',
  '                "MaterialIcons.ttf",',
  '                "FontAwesome.ttf",',
  '                "FontAwesome5_Regular.ttf",',
  '                "FontAwesome5_Solid.ttf",',
  '                "AntDesign.ttf",',
  '                "Entypo.ttf",',
  '                "EvilIcons.ttf",',
  '                "Feather.ttf",',
  '                "Foundation.ttf",',
  '                "MaterialCommunityIcons.ttf",',
  '                "Octicons.ttf",',
  '                "SimpleLineIcons.ttf",',
  '                "Zocial.ttf",',
  '            ]',
  '            iconFonts.each { fontName ->',
  '                def src = new File("${rootDir}/../node_modules/react-native-vector-icons/Fonts/${fontName}")',
  '                if (src.exists()) {',
  '                    copy { from src; into fontsDir }',
  '                }',
  '            }',
  '        }',
  '    }',
  '}',
  '',
  'configurations.all {',
  "    exclude group: 'com.caverock', module: 'androidsvg'",
  '}',
].join('\n');

function ensureImport(source, statement) {
  if (source.includes(statement)) {
    return source;
  }

  const lines = source.split('\n');
  const packageIndex = lines.findIndex((line) => line.startsWith('package '));
  if (packageIndex === -1) {
    throw new Error(`Unable to find package declaration for import: ${statement}`);
  }

  lines.splice(packageIndex + 1, 0, statement);
  return lines.join('\n').replace(/\n{3,}/g, '\n\n');
}

function ensureLinesAfterAnchor(source, anchor, newLines) {
  const lines = source.split('\n');
  const anchorIndex = lines.findIndex((line) => line.includes(anchor));
  if (anchorIndex === -1) {
    throw new Error(`Unable to find anchor: ${anchor}`);
  }

  let insertIndex = anchorIndex + 1;
  for (const newLine of newLines) {
    if (lines.some((line) => line.trim() === newLine.trim())) {
      continue;
    }
    lines.splice(insertIndex, 0, newLine);
    insertIndex += 1;
  }

  return lines.join('\n');
}

function updateFunctionBody(source, signature, updater) {
  const lines = source.split('\n');
  const startIndex = lines.findIndex((line) => line.includes(signature));
  if (startIndex === -1) {
    throw new Error(`Unable to find function: ${signature}`);
  }

  let depth = 0;
  let endIndex = -1;
  for (let index = startIndex; index < lines.length; index += 1) {
    const line = lines[index];
    depth += (line.match(/\{/g) || []).length;
    depth -= (line.match(/\}/g) || []).length;
    if (index > startIndex && depth === 0) {
      endIndex = index;
      break;
    }
  }

  if (endIndex === -1) {
    throw new Error(`Unable to find function end: ${signature}`);
  }

  const updatedBody = updater(lines.slice(startIndex + 1, endIndex));
  lines.splice(startIndex + 1, endIndex - startIndex - 1, ...updatedBody);
  return lines.join('\n');
}

function ensureMainApplication(source) {
  let updated = source;
  updated = ensureImport(updated, 'import android.util.Log');
  updated = ensureImport(updated, 'import com.facebook.react.bridge.Arguments');
  updated = ensureImport(updated, 'import com.facebook.react.modules.core.DeviceEventManagerModule');
  updated = ensureLinesAfterAnchor(updated, 'PackageList(reactNativeHost).packages.apply {', [
    '                    add(InferencePackage())',
    '                    add(DeviceInfoPackage())',
  ]);

  if (!updated.includes('MemoryGuard.register(this)')) {
    updated = updated.replace(
      '        ApplicationLifecycleDispatcher.onApplicationCreate(this)',
      `        ApplicationLifecycleDispatcher.onApplicationCreate(this)\n${MEMORY_GUARD_BLOCK}`
    );
  }

  return updated;
}

function ensureMainActivity(source) {
  let updated = source;
  updated = ensureImport(updated, 'import androidx.core.view.WindowCompat');
  updated = ensureImport(
    updated,
    'import com.swmansion.rnscreens.fragment.restoration.RNScreensFragmentFactory'
  );

  updated = updateFunctionBody(updated, 'override fun onCreate(savedInstanceState: Bundle?)', (bodyLines) => {
    const nextBody = [...bodyLines];
    const superIndex = nextBody.findIndex((line) => line.includes('super.onCreate('));
    if (superIndex === -1) {
      throw new Error('Unable to find MainActivity super.onCreate call');
    }

    if (!nextBody.some((line) => line.includes('supportFragmentManager.fragmentFactory'))) {
      nextBody.splice(
        superIndex,
        0,
        '        supportFragmentManager.fragmentFactory = RNScreensFragmentFactory()'
      );
    }

    const superLineIndex = nextBody.findIndex((line) => line.includes('super.onCreate('));
    nextBody[superLineIndex] = '        super.onCreate(null)';

    const decorFitsIndex = nextBody.findIndex((line) => line.includes('WindowCompat.setDecorFitsSystemWindows'));
    if (decorFitsIndex >= 0) {
      nextBody[decorFitsIndex] = '        WindowCompat.setDecorFitsSystemWindows(window, false)';
    } else {
      nextBody.splice(
        superLineIndex + 1,
        0,
        '        WindowCompat.setDecorFitsSystemWindows(window, false)'
      );
    }

    return nextBody;
  });

  return updated;
}

function ensureDependencyLine(contents, dependencyLine) {
  if (contents.includes(dependencyLine)) {
    return contents;
  }

  return contents.replace(/dependencies\s*\{\s*\n/, `dependencies {\n    ${dependencyLine}\n`);
}

function ensureApplyFrom(contents, applyLine) {
  if (contents.includes(applyLine)) {
    return contents;
  }

  const reactBlockMatch = contents.match(/react\s*\{[\s\S]*?\n\}/m);
  if (!reactBlockMatch || reactBlockMatch.index === undefined) {
    throw new Error(`Unable to find react block for ${applyLine}`);
  }

  const insertIndex = reactBlockMatch.index + reactBlockMatch[0].length;
  return `${contents.slice(0, insertIndex)}\n\n${applyLine}${contents.slice(insertIndex)}`;
}

function ensurePackaging(contents) {
  if (contents.includes('useLegacyPackaging = true')) {
    return contents;
  }

  const compileSdkMatch = contents.match(/compileSdk(?:Version)?\s+.*\n/);
  if (!compileSdkMatch) {
    throw new Error('Unable to find compileSdk line');
  }

  return contents.replace(compileSdkMatch[0], `${compileSdkMatch[0]}\n${PACKAGING_BLOCK}\n`);
}

function ensureBuildConfigPackage(contents) {
  if (contents.includes('build_config_package')) {
    return contents;
  }

  const applicationIdPattern = /(\s*applicationId\s+['"][^'"]+['"]\s*\n)/;
  if (!applicationIdPattern.test(contents)) {
    throw new Error('Unable to find applicationId in defaultConfig');
  }

  return contents.replace(
    applicationIdPattern,
    `$1        resValue "string", "build_config_package", "${PACKAGE_NAME}"\n`
  );
}

function ensureTopLevelBlock(contents, marker, block) {
  if (contents.includes(marker)) {
    return contents;
  }

  return `${contents.trimEnd()}\n\n${block}\n`;
}

function ensureManifestEntry(list, name, extraProps = {}) {
  const item = list.find((entry) => entry?.$?.['android:name'] === name);
  if (item) {
    Object.assign(item.$, extraProps);
    return;
  }

  list.push({
    $: {
      'android:name': name,
      ...extraProps,
    },
  });
}

function ensureMetaData(list, name, value, extraProps = {}) {
  const item = list.find((entry) => entry?.$?.['android:name'] === name);
  if (item) {
    item.$['android:value'] = value;
    Object.assign(item.$, extraProps);
    return;
  }

  list.push({
    $: {
      'android:name': name,
      'android:value': value,
      ...extraProps,
    },
  });
}

function withRpcoreAndroidManifest(config) {
  return withAndroidManifest(config, (modConfig) => {
    const manifest = modConfig.modResults;
    AndroidConfig.Manifest.ensureToolsAvailable(manifest);

    const application = AndroidConfig.Manifest.getMainApplicationOrThrow(manifest);
    manifest.manifest['uses-permission'] = manifest.manifest['uses-permission'] || [];
    application['meta-data'] = application['meta-data'] || [];
    application['uses-native-library'] = application['uses-native-library'] || [];

    ensureManifestEntry(manifest.manifest['uses-permission'], 'android.permission.VIBRATE');
    ensureManifestEntry(
      manifest.manifest['uses-permission'],
      'com.google.android.gms.permission.AD_ID'
    );
    ensureManifestEntry(
      manifest.manifest['uses-permission'],
      'android.permission.READ_MEDIA_IMAGES'
    );
    ensureManifestEntry(
      manifest.manifest['uses-permission'],
      'android.permission.READ_EXTERNAL_STORAGE',
      {'android:maxSdkVersion': '32'}
    );

    application.$['android:allowBackup'] = 'false';
    application.$['android:networkSecurityConfig'] = '@xml/network_security_config';
    application.$['android:usesCleartextTraffic'] = 'true';

    ensureManifestEntry(application['uses-native-library'], 'libvndksupport.so', {
      'android:required': 'false',
    });
    ensureManifestEntry(application['uses-native-library'], 'libOpenCL.so', {
      'android:required': 'false',
    });

    ensureMetaData(
      application['meta-data'],
      'android.window.extensions.disableEdgeToEdge',
      'true'
    );
    ensureMetaData(
      application['meta-data'],
      'com.google.android.gms.ads.APPLICATION_ID',
      ADMOB_APP_ID,
      {'tools:replace': 'android:value'}
    );

    return modConfig;
  });
}

function withRpcoreAppBuildGradle(config) {
  return withAppBuildGradle(config, (modConfig) => {
    if (modConfig.modResults.language !== 'groovy') {
      return modConfig;
    }

    let contents = modConfig.modResults.contents;
    contents = ensureApplyFrom(
      contents,
      "apply from: file('../../node_modules/react-native-config/android/dotenv.gradle')"
    );
    contents = ensurePackaging(contents);
    contents = ensureBuildConfigPackage(contents);
    contents = ensureDependencyLine(
      contents,
      "implementation 'com.google.android.gms:play-services-auth:20.7.0'"
    );
    contents = ensureDependencyLine(
      contents,
      "implementation 'com.google.android.gms:play-services-ads:22.6.0'"
    );
    contents = ensureTopLevelBlock(
      contents,
      'react-native-vector-icons/fonts.gradle',
      VECTOR_ICONS_BLOCK
    );

    modConfig.modResults.contents = contents;
    return modConfig;
  });
}

function withRpcoreMainApplication(config) {
  return withMainApplication(config, (modConfig) => {
    if (modConfig.modResults.language !== 'kt') {
      return modConfig;
    }
    try {
      modConfig.modResults.contents = ensureMainApplication(modConfig.modResults.contents);
    } catch (err) {
      console.error('[withRpcoreAndroid] MainApplication patch failed:', err.message);
      console.error('  Tip: Check that MainApplication.kt matches the expected structure.');
      throw err;
    }
    return modConfig;
  });
}

function withRpcoreMainActivity(config) {
  return withMainActivity(config, (modConfig) => {
    if (modConfig.modResults.language !== 'kt') {
      return modConfig;
    }
    try {
      modConfig.modResults.contents = ensureMainActivity(modConfig.modResults.contents);
    } catch (err) {
      console.error('[withRpcoreAndroid] MainActivity patch failed:', err.message);
      console.error('  Tip: Check that MainActivity.kt matches the expected structure.');
      throw err;
    }
    return modConfig;
  });
}

function withRpcoreAndroid(config) {
  config = withRpcoreAndroidManifest(config);
  config = withRpcoreAppBuildGradle(config);
  config = withRpcoreMainApplication(config);
  config = withRpcoreMainActivity(config);
  return config;
}

module.exports = createRunOncePlugin(withRpcoreAndroid, PLUGIN_NAME, PLUGIN_VERSION);
