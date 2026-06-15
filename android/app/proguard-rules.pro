# ════════════════════════════════════════════════════════════════════════════
# RPPlatform — ProGuard / R8 난독화 규칙
# 목적: 디컴파일 시 로직 해석을 최대한 어렵게 만들기
#
# [보안 전략]
#   1. -repackageclasses ''  → 모든 클래스를 최상위 패키지로 이동, 패키지 구조 은닉
#   2. -optimizationpasses 5 → R8 최적화 패스를 5회 반복, 불필요한 메서드 제거
#   3. -allowaccessmodification → private/protected 접근자 변경 허용 (최적화 폭 확대)
#   4. -useuniqueclassmembernames → 난독화된 이름 충돌 방지
#   5. -overloadaggressively → 같은 이름으로 최대한 오버로드 (역분석 혼란)
# ════════════════════════════════════════════════════════════════════════════

# ── 전역 난독화 강화 옵션 ─────────────────────────────────────────────────────
-repackageclasses ''
-allowaccessmodification
-useuniqueclassmembernames
-overloadaggressively
-optimizationpasses 5
-dontusemixedcaseclassnames

# ── 소스 파일명 / 줄번호 정보 완전 제거 ─────────────────────────────────────
# 릴리즈 빌드에서 스택 트레이스에 원본 파일명·줄번호 노출 차단
# Sentry 크래시 리포팅을 위해 mapping.txt는 업로드 후 활용
-renamesourcefileattribute SourceFile
-keepattributes SourceFile,LineNumberTable

# ── React Native ──────────────────────────────────────────────────────────
-keep,allowobfuscation @interface com.facebook.proguard.annotations.DoNotStrip
-keep,allowobfuscation @interface com.facebook.proguard.annotations.KeepGettersAndSetters
-keep,allowobfuscation @interface com.facebook.react.bridge.ReadableType

-keep @com.facebook.proguard.annotations.DoNotStrip class *
-keepclassmembers class * {
    @com.facebook.proguard.annotations.DoNotStrip *;
}
-keepclassmembers @com.facebook.proguard.annotations.KeepGettersAndSetters class * {
  void set*(***);
  *** get*();
}

-keep class * implements com.facebook.react.bridge.JavaScriptModule { *; }
-keep class * implements com.facebook.react.bridge.NativeModule { *; }
-keepclassmembers,includedescriptorclasses class * { native <methods>; }
-keepclassmembers class *  { @com.facebook.react.uimanager.annotations.ReactProp <methods>; }
-keepclassmembers class *  { @com.facebook.react.uimanager.annotations.ReactPropGroup <methods>; }

-dontwarn com.facebook.react.**
-keep,includedescriptorclasses class com.facebook.react.bridge.** { *; }

# ── Hermes JS 엔진 ────────────────────────────────────────────────────────
-keep class com.facebook.hermes.unicode.** { *; }
-keep class com.facebook.jni.** { *; }

# ── Kotlin Serialization ──────────────────────────────────────────────────
-keepattributes *Annotation*, InnerClasses
-dontnote kotlinx.serialization.AnnotationsKt
-keepclassmembers class kotlinx.serialization.json.** {
    *** Companion;
}
-keepclasseswithmembers class kotlinx.serialization.json.** {
    kotlinx.serialization.KSerializer serializer(...);
}
-keep,includedescriptorclasses class com.rpplatform.**$$serializer { *; }
-keepclassmembers class com.rpplatform.** {
    *** Companion;
}
-keepclasseswithmembers class com.rpplatform.** {
    kotlinx.serialization.KSerializer serializer(...);
}

# ── SQLDelight 생성 코드 ──────────────────────────────────────────────────
-keep class com.rpplatform.db.** { *; }
-keep class app.cash.sqldelight.** { *; }

# ── ObjectBox ─────────────────────────────────────────────────────────────
-keep class io.objectbox.** { *; }
-dontwarn io.objectbox.**
-keep @io.objectbox.annotation.Entity class * { *; }
-keepclassmembers @io.objectbox.annotation.Entity class * { *; }

# ── Hilt ──────────────────────────────────────────────────────────────────
-keep class dagger.hilt.** { *; }
-keep class javax.inject.** { *; }
-dontwarn dagger.hilt.**

# ── Android KeyStore / Crypto (스토리 암호화 키 저장소) ───────────────────
-keep class android.security.keystore.** { *; }
-keep class java.security.** { *; }
-keep class javax.crypto.** { *; }
-dontwarn javax.crypto.**

# ── MMKV (암호화 스토리 저장소) ───────────────────────────────────────────
-keep class com.tencent.mmkv.** { *; }
-dontwarn com.tencent.mmkv.**

# ── Expo Modules ──────────────────────────────────────────────────────────
-keep class expo.modules.** { *; }
-dontwarn expo.modules.**

# ── Firebase / Google Services ────────────────────────────────────────────
-keep class com.google.firebase.** { *; }
-dontwarn com.google.firebase.**
-keep class com.google.android.gms.** { *; }
-dontwarn com.google.android.gms.**

# ── Sentry ────────────────────────────────────────────────────────────────
-keep class io.sentry.** { *; }
-dontwarn io.sentry.**

# ── Coroutines ────────────────────────────────────────────────────────────
-keepnames class kotlinx.coroutines.internal.MainDispatcherFactory {}
-keepnames class kotlinx.coroutines.CoroutineExceptionHandler {}
-keepclassmembernames class kotlinx.** {
    volatile <fields>;
}
-dontwarn kotlinx.coroutines.**

# ── llama.rn / LLM C++ JNI 브리지 ────────────────────────────────────────
-keep class com.rnllama.** { *; }
-dontwarn com.rnllama.**

# ── 앱 진입점 보호 ────────────────────────────────────────────────────────
-keep class com.rpplatform.MainActivity { *; }
-keep class com.rpplatform.MainApplication { *; }
