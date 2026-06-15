package com.rpplatform

import android.app.Activity
import android.os.Build
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

class DisplayCutoutModule(
    private val reactContext: ReactApplicationContext
) : ReactContextBaseJavaModule(reactContext) {

    override fun getName() = "DisplayCutoutModule"

    @ReactMethod
    fun getCutoutBounds(promise: Promise) {
        val activity: Activity? = reactContext.currentActivity
        if (activity == null || Build.VERSION.SDK_INT < Build.VERSION_CODES.P) {
            promise.resolve(null)
            return
        }

        try {
            val density = activity.resources.displayMetrics.density.toDouble().coerceAtLeast(1.0)
            val rootInsets = activity.window?.decorView?.rootWindowInsets
            val cutout = rootInsets?.displayCutout
            val rects = cutout?.boundingRects

            if (rects.isNullOrEmpty()) {
                promise.resolve(null)
                return
            }

            val topRect = rects.minByOrNull { it.top } ?: rects.first()
            val map = Arguments.createMap().apply {
                putDouble("left", topRect.left / density)
                putDouble("top", topRect.top / density)
                putDouble("right", topRect.right / density)
                putDouble("bottom", topRect.bottom / density)
                putDouble("centerX", (topRect.left + topRect.right) / 2.0 / density)
                putDouble("centerY", (topRect.top + topRect.bottom) / 2.0 / density)
                putDouble("width", (topRect.right - topRect.left) / density)
                putDouble("height", (topRect.bottom - topRect.top) / density)
            }
            promise.resolve(map)
        } catch (_: Exception) {
            promise.resolve(null)
        }
    }
}

