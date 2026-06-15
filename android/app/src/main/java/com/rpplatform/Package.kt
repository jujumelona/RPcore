// LlamaPackage.kt
// llama.rn (llama.cpp) 전환 후 커스텀 네이티브 모듈 불필요
// → 모든 추론/KV 세션은 llama.rn 패키지가 자동 링크로 처리
package com.rpplatform

import com.facebook.react.ReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.uimanager.ViewManager

class LlamaPackage : ReactPackage {
    override fun createNativeModules(reactContext: ReactApplicationContext): List<NativeModule> =
        emptyList()

    override fun createViewManagers(reactContext: ReactApplicationContext): List<ViewManager<*, *>> =
        emptyList()
}
