package com.rpplatform

import com.facebook.react.ReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.uimanager.ViewManager

/**
 * [FIX] DeviceInfoPackage — 누락된 파일 추가.
 *
 * MainApplication.kt에서 add(DeviceInfoPackage())를 참조하고 있었으나
 * 파일 자체가 존재하지 않아 컴파일 에러 발생 + DeviceInfoModule이 JS에서
 * NativeModules.DeviceInfo로 접근 불가 상태였음.
 */
class DeviceInfoPackage : ReactPackage {
    override fun createNativeModules(reactContext: ReactApplicationContext): List<NativeModule> =
        listOf(DeviceInfoModule(reactContext))

    override fun createViewManagers(reactContext: ReactApplicationContext): List<ViewManager<*, *>> =
        emptyList()
}
