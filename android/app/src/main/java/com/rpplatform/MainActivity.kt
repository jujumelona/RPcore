package com.rpplatform

import android.graphics.Color
import android.os.Bundle
import android.util.Log
import androidx.activity.SystemBarStyle
import androidx.activity.enableEdgeToEdge
import androidx.core.view.WindowCompat
import com.facebook.react.ReactActivity
import com.facebook.react.ReactActivityDelegate
import com.facebook.react.defaults.DefaultNewArchitectureEntryPoint.fabricEnabled
import com.facebook.react.defaults.DefaultReactActivityDelegate
import com.swmansion.rnscreens.fragment.restoration.RNScreensFragmentFactory
import dagger.hilt.android.AndroidEntryPoint
import expo.modules.ReactActivityDelegateWrapper

/**
 * 2026년형 상용화 UI 엔진: Edge-to-Edge + Hilt Injection
 */
@AndroidEntryPoint
class MainActivity : ReactActivity() {
    override fun getMainComponentName(): String = "main"

    // 앱 배경색 (#050507) - 네비게이션 바 색상으로 사용
    private val appBg = Color.parseColor("#050507")
    private var reactDelegateInitialized = false

    private fun applySystemBarColors() {
        // [FIX] enableEdgeToEdge: navigationBarStyle을 dark(appBg)로 고정
        // styles.xml의 windowOptOutEdgeToEdgeEnforcement 제거와 함께 동작해야
        // Android 15에서 흰색/회색 네비게이션 바 버그가 사라짐
        enableEdgeToEdge(
            statusBarStyle = SystemBarStyle.dark(Color.TRANSPARENT),
            navigationBarStyle = SystemBarStyle.dark(appBg),
        )
        // edge-to-edge: 콘텐츠가 시스템 바 영역까지 확장
        WindowCompat.setDecorFitsSystemWindows(window, false)
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        applySystemBarColors()
        supportFragmentManager.fragmentFactory = RNScreensFragmentFactory()
        super.onCreate(null)
        reactDelegateInitialized = true
        // Edge-to-edge 유지: onCreate 이후에도 시스템 바 영역 확장을 되돌리지 않음
        WindowCompat.setDecorFitsSystemWindows(window, false)
    }

    override fun onResume() {
        super.onResume()
        // [FIX] 앱 복귀(백그라운드 -> 포그라운드) 시 네비게이션 바 색이 초기화되는 버그 방지
        applySystemBarColors()
    }

    override fun onUserLeaveHint() {
        // RN 0.83 + New Architecture에서 간헐적으로 delegate 초기화 전에 콜백이 올 수 있음.
        if (!reactDelegateInitialized) {
            Log.w("MainActivity", "Skip onUserLeaveHint before React delegate init")
            return
        }

        try {
            super.onUserLeaveHint()
        } catch (e: NullPointerException) {
            Log.e("MainActivity", "React delegate NPE in onUserLeaveHint", e)
        }
    }

    override fun createReactActivityDelegate(): ReactActivityDelegate =
        ReactActivityDelegateWrapper(
            this,
            BuildConfig.IS_NEW_ARCHITECTURE_ENABLED,
            object : DefaultReactActivityDelegate(this, mainComponentName, fabricEnabled) {},
        )
}
