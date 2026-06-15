package com.rpplatform

/**
 * Release 빌드용 LeakCanaryConfig no-op 스텁.
 *
 * LeakCanary는 debugImplementation으로만 포함되므로
 * release 빌드에서는 이 파일이 컴파일됩니다.
 *
 * MainApplication.onCreate()에서 LeakCanaryConfig.apply()를 호출하지만
 * release 빌드에서는 아무 작업도 하지 않습니다.
 *
 * ⚠️ 이 파일이 없으면 release 빌드 컴파일 오류 발생:
 *    "Unresolved reference: LeakCanaryConfig"
 */
object LeakCanaryConfig {
    fun apply() {
        // no-op: LeakCanary는 debug 빌드에서만 활성화됩니다.
    }
}
