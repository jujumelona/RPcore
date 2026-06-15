package com.rpplatform

import android.appwidget.AppWidgetManager
import android.content.ComponentName
import android.content.Context
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.rpplatform.widget.AIStatusWidget
import com.rpplatform.widget.AIStatusWidgetReceiver

/**
 * JS → Android 브리지: AI 추론 상태를 SharedPreferences에 저장하고 위젯을 업데이트.
 *
 * JS에서 사용:
 *   import { NativeModules } from 'react-native';
 *   NativeModules.AIWidget?.setState('generating'); // 'generating' | 'idle' | 'loading'
 */
class AIWidgetModule(
    private val reactContext: ReactApplicationContext
) : ReactContextBaseJavaModule(reactContext) {

    companion object {
        const val PREFS_NAME = "AIWidgetPrefs"
        const val KEY_STATUS  = "ai_status"
        const val KEY_CHAR    = "ai_char_name"

        // 상태 상수 (JS와 동기화)
        const val STATE_IDLE       = "idle"
        const val STATE_LOADING    = "loading"
        const val STATE_GENERATING = "generating"
    }

    override fun getName() = "AIWidget"

    /** AI 상태 문자열 저장 후 위젯 갱신 (캐릭터 이름 포함) */
    @ReactMethod
    fun setState(state: String, charName: String?) {
        _setStateInternal(state, charName)
    }

    /**
     * [BUG FIX] Kotlin default parameter는 RN Bridge에서 지원 안 됨.
     * JS에서 인자 1개만 전달 시 charName 없는 오버로드 호출.
     */
    @ReactMethod
    fun setStateNoChar(state: String) {
        _setStateInternal(state, null)
    }

    private fun _setStateInternal(state: String, charName: String?) {
        val editor = reactContext
            .getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            .edit()
            .putString(KEY_STATUS, state)

        if (charName != null) editor.putString(KEY_CHAR, charName)

        editor.apply()   // SharedPreferences.Editor.apply() — 비동기 commit

        // 설치된 모든 위젯 강제 업데이트
        val manager = AppWidgetManager.getInstance(reactContext)
        val ids = manager.getAppWidgetIds(
            ComponentName(reactContext, AIStatusWidgetReceiver::class.java)
        )
        if (ids.isNotEmpty()) {
            val intent = android.content.Intent(
                reactContext,
                AIStatusWidgetReceiver::class.java
            ).apply {
                action = AppWidgetManager.ACTION_APPWIDGET_UPDATE
                putExtra(AppWidgetManager.EXTRA_APPWIDGET_IDS, ids)
            }
            reactContext.sendBroadcast(intent)
        }
    }
}
