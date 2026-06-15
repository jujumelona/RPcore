package com.rpplatform

import android.app.ActivityManager
import android.content.Context
import android.os.Build
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.WritableMap

class DeviceInfoModule(
    private val reactContext: ReactApplicationContext
) : ReactContextBaseJavaModule(reactContext) {

    override fun getName() = "DeviceInfo"

    // ── 공통 헬퍼: ActivityManager + MemoryInfo 한 번만 생성 ───────────────────
    private fun getMemoryInfo(): ActivityManager.MemoryInfo {
        val am = reactContext.getSystemService(Context.ACTIVITY_SERVICE) as ActivityManager
        return ActivityManager.MemoryInfo().also { am.getMemoryInfo(it) }
    }

    @ReactMethod
    fun getTotalRAM(promise: Promise) {
        // [BUG FIX] totalMem은 bytes 단위 → JS DeviceProfiler가 MB 단위로 기대하므로
        // 1024*1024로 나눠 MB로 변환해서 반환. 미변환 시 모든 기기가 flagship으로
        // 오판정되어 저사양 기기에서 OOM 크래시 발생.
        promise.resolve((getMemoryInfo().totalMem / (1024 * 1024)).toDouble())
    }

    @ReactMethod
    fun getAvailableRAM(promise: Promise) {
        // [BUG FIX] availMem도 bytes → MB 변환
        promise.resolve((getMemoryInfo().availMem / (1024 * 1024)).toDouble())
    }

    @ReactMethod
    fun isLowMemory(promise: Promise) {
        promise.resolve(getMemoryInfo().lowMemory)
    }

    @ReactMethod
    fun getRAMInfo(promise: Promise) {
        val info = getMemoryInfo()
        val mb = 1024.0 * 1024.0
        val map: WritableMap = Arguments.createMap().apply {
            // [BUG FIX] bytes → MB 변환 (getTotalRAM/getAvailableRAM와 단위 통일)
            putDouble("totalMem",    info.totalMem  / mb)
            putDouble("availMem",    info.availMem  / mb)
            putDouble("threshold",   info.threshold / mb)
            putBoolean("lowMemory",  info.lowMemory)
        }
        promise.resolve(map)
    }

    /**
     * [BUG FIX] getSoCModel 메서드 누락 수정.
     * DeviceProfiler.ts에서 memoryInfo.getSoCModel?.()로 호출하지만 구현이 없어
     * socVendor가 항상 'unknown'이었음 → Qualcomm 기기에서도 HTP 가속이 비활성화됨.
     * Build.HARDWARE / Build.SOC_MODEL(API 31+)로 SoC 정보를 반환.
     */
    @ReactMethod
    fun getSoCModel(promise: Promise) {
        try {
            // API 31+ (Android 12+)에서는 Build.SOC_MODEL 사용
            val socModel = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                Build.SOC_MODEL?.takeIf { it.isNotBlank() && it != Build.UNKNOWN }
                    ?: Build.HARDWARE
            } else {
                Build.HARDWARE
            }
            promise.resolve(socModel ?: "unknown")
        } catch (e: Exception) {
            promise.resolve("unknown")
        }
    }

    // 하위 호환 별칭 (기존 JS 호출 코드 유지)
    @ReactMethod fun getTotalMemory(promise: Promise)     = getTotalRAM(promise)
    @ReactMethod fun getAvailableMemory(promise: Promise) = getAvailableRAM(promise)
}
