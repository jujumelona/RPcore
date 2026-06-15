/**
 * plugins/withDisplayCutout.js
 * Expo Config Plugin — Android DisplayCutout (펀치홀 카메라) 정확한 좌표를 JS로 전달
 *
 * npx expo prebuild 후 자동으로:
 *   - DisplayCutoutModule.kt  → app/src/main/java/com/rpplatform/
 *   - DisplayCutoutPackage.kt → app/src/main/java/com/rpplatform/
 *   - MainApplication.kt 에 패키지 등록
 */
const { withMainApplication, withDangerousMod, createRunOncePlugin } = require('expo/config-plugins');
const fs   = require('fs');
const path = require('path');

const PACKAGE  = 'com.rpplatform';
const PKG_PATH = PACKAGE.split('.');

const MODULE_KT = `package ${PACKAGE}

import android.app.Activity
import android.os.Build
import com.facebook.react.bridge.*

class DisplayCutoutModule(ctx: ReactApplicationContext) : ReactContextBaseJavaModule(ctx) {
    override fun getName() = "DisplayCutoutModule"

    @ReactMethod
    fun getCutoutBounds(promise: Promise) {
        val activity: Activity? = reactContext.currentActivity
        if (activity == null || Build.VERSION.SDK_INT < Build.VERSION_CODES.P) {
            promise.resolve(null); return
        }
        try {
            val density = activity.resources.displayMetrics.density
            val insets  = activity.window.decorView.rootWindowInsets
                ?: run { promise.resolve(null); return }
            val cutout  = insets.displayCutout
                ?: run { promise.resolve(null); return }
            val rects   = cutout.boundingRects
            if (rects.isEmpty()) { promise.resolve(null); return }

            // 상단 펀치홀만: Y가 가장 작은 Rect
            val top = rects.minByOrNull { it.top } ?: rects.first()

            val map = Arguments.createMap().apply {
                putDouble("left",    top.left   / density.toDouble())
                putDouble("top",     top.top    / density.toDouble())
                putDouble("right",   top.right  / density.toDouble())
                putDouble("bottom",  top.bottom / density.toDouble())
                putDouble("centerX", (top.left + top.right)  / 2.0 / density)
                putDouble("centerY", (top.top  + top.bottom) / 2.0 / density)
                putDouble("width",   (top.right  - top.left) / density.toDouble())
                putDouble("height",  (top.bottom - top.top)  / density.toDouble())
            }
            promise.resolve(map)
        } catch (e: Exception) { promise.resolve(null) }
    }
}
`;

const PACKAGE_KT = `package ${PACKAGE}

import com.facebook.react.ReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.uimanager.ViewManager

class DisplayCutoutPackage : ReactPackage {
    override fun createNativeModules(ctx: ReactApplicationContext): List<NativeModule> =
        listOf(DisplayCutoutModule(ctx))
    override fun createViewManagers(ctx: ReactApplicationContext): List<ViewManager<*, *>> =
        emptyList()
}
`;

function withDisplayCutoutFiles(config) {
  return withDangerousMod(config, ['android', async (modConfig) => {
    const dir = path.join(
      modConfig.modRequest.platformProjectRoot,
      'app', 'src', 'main', 'java', ...PKG_PATH,
    );
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'DisplayCutoutModule.kt'), MODULE_KT, 'utf8');
    fs.writeFileSync(path.join(dir, 'DisplayCutoutPackage.kt'), PACKAGE_KT, 'utf8');
    return modConfig;
  }]);
}

function withDisplayCutoutMainApp(config) {
  return withMainApplication(config, (modConfig) => {
    if (modConfig.modResults.language !== 'kt') return modConfig;
    let c = modConfig.modResults.contents;
    if (c.includes('DisplayCutoutPackage')) return modConfig;
    if (c.includes('PackageList(reactNativeHost).packages.apply {')) {
      c = c.replace(
        'PackageList(reactNativeHost).packages.apply {',
        'PackageList(reactNativeHost).packages.apply {\n            add(DisplayCutoutPackage())',
      );
    } else {
      c = c.replace(
        /packages\.add\(PackageList\(this\)\.packages\)/,
        'packages.add(PackageList(this).packages)\n            packages.add(DisplayCutoutPackage())',
      );
    }
    modConfig.modResults.contents = c;
    return modConfig;
  });
}

module.exports = createRunOncePlugin(
  (config) => {
    let nextConfig = withDisplayCutoutFiles(config);
    return withDisplayCutoutMainApp(nextConfig);
  },
  'with-display-cutout', '1.0.0',
);



