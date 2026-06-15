package com.rpplatform

import android.app.Activity
import android.app.Application
import android.content.res.Configuration
import android.os.Build
import android.os.Bundle
import android.util.Log
import com.facebook.react.PackageList
import com.facebook.react.ReactApplication
import com.facebook.react.ReactHost
import com.facebook.react.ReactNativeHost
import com.facebook.react.ReactPackage
import com.facebook.react.bridge.Arguments
import com.facebook.react.defaults.DefaultNewArchitectureEntryPoint.load
import com.facebook.react.defaults.DefaultReactNativeHost
import com.facebook.react.modules.core.DeviceEventManagerModule
import com.facebook.react.soloader.OpenSourceMergedSoMapping
import com.facebook.soloader.SoLoader
import dagger.hilt.android.HiltAndroidApp
import expo.modules.ApplicationLifecycleDispatcher
import expo.modules.ExpoReactHostFactory

@HiltAndroidApp
class MainApplication : Application(), ReactApplication {

    private val packageList: List<ReactPackage> by lazy {
        PackageList(reactNativeHost).packages.apply {
            add(InferencePackage())
            add(DeviceInfoPackage())
            add(DisplayCutoutPackage())
        }
    }
    private val modulePath: String = "index"

    override val reactNativeHost: ReactNativeHost =
        object : DefaultReactNativeHost(this) {
            override fun getPackages(): List<ReactPackage> = packageList
            override fun getJSMainModuleName(): String = modulePath
            override fun getUseDeveloperSupport(): Boolean = BuildConfig.DEBUG
            override val isNewArchEnabled: Boolean = BuildConfig.IS_NEW_ARCHITECTURE_ENABLED
            override val isHermesEnabled: Boolean = BuildConfig.IS_HERMES_ENABLED
        }

    override val reactHost: ReactHost by lazy {
        ExpoReactHostFactory.getDefaultReactHost(
            context = applicationContext,
            packageList = packageList,
            jsMainModulePath = modulePath,
            useDevSupport = BuildConfig.DEBUG,
        )
    }

    override fun onCreate() {
        super.onCreate()

        // ✅ [FIX] MMKV 초기화 제거 (react-native-mmkv가 자동으로 처리)
        // RNBackgroundDownloaderModule에서 필요하면 자체적으로 초기화됨

        LeakCanaryConfig.apply()
        SoLoader.init(this, OpenSourceMergedSoMapping)
        if (BuildConfig.IS_NEW_ARCHITECTURE_ENABLED) { load() }
        ApplicationLifecycleDispatcher.onApplicationCreate(this)

        // ✅ [FIX] Nitro 초기화 — New Architecture 방식
        // 기존: reactNativeHost.reactInstanceManager (Old Architecture 방식)
        //       → New Architecture 환경에서 콜백이 실행되지 않아 Nitro 미설치
        //       → [runtime not ready] ReferenceError 발생
        // 수정: NitroModules.install()을 load() 직후 호출
        //       New Architecture에서는 load()가 JS context를 준비하므로 안전
        // ✅ [FIX] Nitro는 New Architecture에서 자동 초기화됨
        // ReactInstanceEventListener (Old Arch 방식) 제거
        // → load() 호출 시 Nitro가 자동으로 설치됨

        applyThreadStrategy()

        registerActivityLifecycleCallbacks(object : ActivityLifecycleCallbacks {
            override fun onActivityResumed(activity: Activity) {
                // [BUG FIX] System.gc() 제거 — 모든 Activity resume(다이얼로그, 권한 팝업 등)마다
                // GC가 강제 실행되어 STW pause → UI 프레임 드랍 + AI 추론 지연 심화.
                // GC는 MemoryGuard.postInferenceGcHint()에서만 호출 (추론 완료 후 IO thread에서 지연 실행).
            }
            override fun onActivityCreated(a: Activity, b: Bundle?) {}
            override fun onActivityStarted(a: Activity) {}
            override fun onActivityPaused(a: Activity) {}
            override fun onActivityStopped(a: Activity) {}
            override fun onActivitySaveInstanceState(a: Activity, b: Bundle) {}
            override fun onActivityDestroyed(a: Activity) {}
        })

        MemoryGuard.register(this) {
            Log.e("MainApplication", "OOM - emergency save")
            try {
                val reactContext = reactHost.currentReactContext
                // [BUG-11 FIX] Bridgeless 모드에서는 hasActiveCatalystInstance()가 false를 반환하므로
                // hasActiveReactInstance()를 사용하거나 reactContext != null 체크만으로 충분.
                if (reactContext != null && (reactContext.hasActiveReactInstance())) {
                    val params = Arguments.createMap().apply { putString("reason", "oom_critical") }
                    reactContext
                        .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
                        ?.emit("engine:oom_emergency", params)
                }
            } catch (e: Exception) {
                Log.e("MainApplication", "OOM event failed: ${e.message}")
            }
        }
    }

    private fun applyThreadStrategy() {
        try {
            Thread.currentThread().priority = Thread.NORM_PRIORITY
            android.os.Process.setThreadPriority(
                android.os.Process.myTid(),
                android.os.Process.THREAD_PRIORITY_DEFAULT,
            )

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                Log.d("MainApplication", "Android 12+: Thread group 최적화 활성화")
                android.os.Process.setThreadPriority(
                    android.os.Process.myTid(),
                    android.os.Process.THREAD_PRIORITY_DEFAULT,
                )
            }

            val coreCount = Runtime.getRuntime().availableProcessors()
            val efficiencyCores = (coreCount / 2).coerceAtLeast(2)

            Log.d("MainApplication",
                "CPU 코어 수: $coreCount, 권장 AI 추론 스레드 수: $efficiencyCores " +
                "(Efficiency Cores 할당 — RenderThread와 경쟁 방지)"
            )

            System.setProperty("ai.inference.threads", efficiencyCores.toString())
            System.setProperty("ai.efficiency.cores", efficiencyCores.toString())

            Log.d("MainApplication", "스레드 전략 적용 완료: inference_threads=$efficiencyCores")
        } catch (e: Exception) {
            Log.w("MainApplication", "스레드 전략 설정 실패 (무시): ${e.message}")
        }
    }

    override fun onConfigurationChanged(newConfig: Configuration) {
        super.onConfigurationChanged(newConfig)
        ApplicationLifecycleDispatcher.onConfigurationChanged(this, newConfig)
    }
}
