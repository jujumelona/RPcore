// MemoryGuard.kt
// ════════════════════════════════════════════════════════════
// RAM 4GB 이하 저사양 폰 OOM 방지 가드
//
// [FIX 2026-03] 임계치 근거 재산정
//   Android OS 자체가 상시 200~300MB를 점유하므로
//   CRITICAL=180MB는 이미 OOM이 진행 중인 수준.
//   Google Android Performance Docs 및 실측 데이터 기반:
//     MODERATE : 800MB  (KV 캐시 확장 여유 경고)
//     HIGH     : 500MB  (history trim + 스트리밍 중단)
//     CRITICAL : 300MB  (추론 즉시 중단 — OS 최소 여유 확보)
//   ref: developer.android.com/topic/performance/memory-overview
//
// 역할:
//   1. 앱 시작 시 / 주기적으로 가용 RAM 체크
//   2. OOM 임박 시 추론 중단 + history trim 요청
//   3. ComponentCallbacks2를 통한 시스템 메모리 압박 수신
//   4. 모델 로드 전 안전 여부 검증
//
// 사용 방법:
//   // Application.onCreate() 에서 등록
//   MemoryGuard.register(this)
//
//   // 추론 전 체크
//   val safe = MemoryGuard.checkBeforeInference(ctx, model.estimatedVramBytes)
//   if (!safe) { /* 경고 표시 or 1B 모델로 다운그레이드 */ }
//
//   // 주기적 모니터링 (선택)
//   MemoryGuard.startMonitoring(ctx, intervalMs = 5000L) { level ->
//     if (level == MemoryGuard.PressureLevel.CRITICAL) inferenceEngine.trimHistory(6)
//   }
// ════════════════════════════════════════════════════════════

package com.rpplatform

import android.app.ActivityManager
import android.app.Application
import android.content.ComponentCallbacks2
import android.content.Context
import android.content.res.Configuration
import android.os.Build
import android.util.Log
import kotlinx.coroutines.*

enum class MemoryPressureLevel {
    /** 여유 있음 — 정상 추론 */
    NORMAL,
    /** 주의 — history를 20턴으로 trim 권장 */
    MODERATE,
    /** 위험 — history를 6턴으로 trim, 스트리밍 중단 고려 */
    HIGH,
    /** OOM 임박 — 추론 즉시 중단, GC 강제 실행 */
    CRITICAL,
}

object MemoryGuard {

    private const val TAG = "MemoryGuard"

    // 임계치 (MB)
    //   Android OS 상시 점유량 ~200–300MB를 감안.
    //   이전 값(CRITICAL=180)은 OS 점유 후 실질 여유가 0MB에 가까워 OOM 방지 불가.
    private const val THRESHOLD_MODERATE_MB = 800L  // 이전: 600
    private const val THRESHOLD_HIGH_MB     = 500L  // 이전: 350
    private const val THRESHOLD_CRITICAL_MB = 300L  // 이전: 180 ← 핵심 수정

    @Volatile private var monitorJob: Job? = null

    // ── 현재 가용 RAM (MB) ────────────────────────────────────

    fun availMB(ctx: Context): Long {
        val am   = ctx.getSystemService(Context.ACTIVITY_SERVICE) as ActivityManager
        val info = ActivityManager.MemoryInfo().also { am.getMemoryInfo(it) }
        return info.availMem / 1_048_576L
    }

    /**
     * 지수 이동평균(EMA) 스무딩 — 순간 스파이크 제거
     * EngineModule에서 RAM 기반 trim/빌드 판단에 사용.
     *
     * alpha = 0.3 (새 측정값 가중치): 급격한 변화를 완충하면서도
     * 실제 메모리 압박에 1~2초 내로 반응.
     * smoothedRef가 0이면(최초 호출) 현재 값으로 초기화.
     */
    // [BUG-31 FIX] @Volatile은 가시성만 보장하고 read-modify-write 원자성은 보장하지 않음.
    // Dispatchers.IO 멀티스레드에서 동시 호출 시 lost-update 발생 가능.
    // @Synchronized 으로 변경해 원자적 갱신 보장.
    @Volatile private var _smoothedAvailMB: Long = 0L

    @Synchronized
    fun availMBSmoothed(ctx: Context): Long {
        val current = availMB(ctx)
        val prev    = _smoothedAvailMB
        val smoothed = if (prev == 0L) current
        else ((current * 3L + prev * 7L) / 10L)  // alpha ≈ 0.3
        _smoothedAvailMB = smoothed
        return smoothed
    }

    /** 총 RAM (MB) — 기기 사양 판단용 */
    fun totalMB(ctx: Context): Long {
        val am   = ctx.getSystemService(Context.ACTIVITY_SERVICE) as ActivityManager
        val info = ActivityManager.MemoryInfo().also { am.getMemoryInfo(it) }
        return info.totalMem / 1_048_576L
    }

    // ── 압박 레벨 판단 ────────────────────────────────────────

    fun pressureLevel(ctx: Context): MemoryPressureLevel {
        val avail = availMBSmoothed(ctx)
        return when {
            avail < THRESHOLD_CRITICAL_MB -> MemoryPressureLevel.CRITICAL
            avail < THRESHOLD_HIGH_MB     -> MemoryPressureLevel.HIGH
            avail < THRESHOLD_MODERATE_MB -> MemoryPressureLevel.MODERATE
            else                          -> MemoryPressureLevel.NORMAL
        }
    }

    // ── 모델 로드 전 안전 체크 ────────────────────────────────
    //
    // 추론 피크 메모리 ≈ 모델 VRAM + KV 캐시 + prefill 버퍼
    // KV 캐시 ≈ contextWindowSize × nLayers × headSize × 2bytes (bf16)
    // Gemma 3 1B 기준: ~600MB 총 피크 (1024 context, prefill 256)
    //
    // 반환: true = 로드 안전, false = OOM 위험

    fun checkBeforeLoad(ctx: Context, estimatedVramBytes: Long): Boolean {
        val avail       = availMBSmoothed(ctx)
        val neededMB    = estimatedVramBytes / 1_048_576L + 500L // 500MB 버퍼 (이전: 300, OS 여유 포함)
        val safe        = avail >= neededMB
        Log.i(TAG, "로드 전 체크: 가용=${avail}MB, 필요=${neededMB}MB, 안전=${safe}")
        return safe
    }

    /** 추론 1회 전 가용 RAM이 최소 안전선 이상인지 확인 */
    fun checkBeforeInference(ctx: Context): Boolean {
        val avail  = availMBSmoothed(ctx)
        val level  = pressureLevel(ctx)
        val safe   = level != MemoryPressureLevel.CRITICAL
        if (!safe) {
            Log.w(TAG, "⚠️ 추론 전 메모리 위험: ${avail}MB — 추론 중단 권장")
            // ✅ [FIX] System.gc()를 추론 전에 호출하면 STW pause → UI 순간 멈춤
            // → 추론 완료 후 postInferenceGcHint()로 비동기 호출할 것
        }
        return safe
    }

    /**
     * 추론 완료 후 호출 — GC 힌트를 IO 스레드에서 딜레이 후 요청
     * UI 스레드 블로킹 없이 메모리 반환 유도
     */
    fun postInferenceGcHint(scope: CoroutineScope) {
        scope.launch(Dispatchers.IO) {
            delay(500) // 추론 직후가 아닌 화면 렌더 안정 후
            System.gc()
            Log.d(TAG, "postInferenceGcHint: GC 요청 (IO thread, 500ms delay)")
        }
    }

    // ── 주기적 모니터링 ────────────────────────────────────────

    /**
     * 백그라운드에서 주기적으로 RAM 체크
     * @param onPressure 압박 레벨 변화 시 콜백 (Main thread에서 호출됨)
     */
    // [BUG FIX] startMonitoring/stopMonitoring에 @Synchronized 추가.
    // @Volatile은 가시성만 보장, monitorJob?.cancel() + 신규 job 할당 사이의
    // read-modify-write 원자성은 보장하지 않음. 두 스레드가 동시에 진입 시
    // 신규 job이 cancel()되지 않고 monitorJob=null로 유실될 수 있음.
    @Synchronized
    fun startMonitoring(
        ctx: Context,
        intervalMs: Long = 5_000L,
        onPressure: suspend (MemoryPressureLevel) -> Unit,
    ) {
        monitorJob?.cancel()
        // [FIX] SupervisorJob 추가 — 내부 예외가 스코프 전체를 취소하지 않도록.
        // 이전: CoroutineScope(Dispatchers.IO) — 자식 예외 시 전체 모니터링 중단됨.
        monitorJob = CoroutineScope(Dispatchers.IO + SupervisorJob()).launch {
            var lastLevel = MemoryPressureLevel.NORMAL
            while (isActive) {
                val level = pressureLevel(ctx)
                if (level != lastLevel) {
                    lastLevel = level
                    Log.i(TAG, "RAM 레벨 변화: $level (가용 ${availMB(ctx)}MB)")
                    withContext(Dispatchers.Main) { onPressure(level) }
                }
                delay(intervalMs)
            }
        }
    }

    @Synchronized
    fun stopMonitoring() {
        monitorJob?.cancel()
        monitorJob = null
    }

    // ── 시스템 메모리 압박 콜백 등록 ─────────────────────────
    //
    // Android ComponentCallbacks2: 시스템이 메모리 부족 시 앱에 직접 알림
    // Application.registerComponentCallbacks()로 등록

    // [BUG FIX] 등록된 콜백 참조를 보관 → unregister() 로 해제 가능
    // 이전: register() 호출마다 새 객체를 익명으로 등록해 해제 방법 없음
    //       HMR/테스트 재시작 시 콜백 중복 등록됨
    @Volatile private var _registeredCallback: ComponentCallbacks2? = null

    fun unregister(app: Application) {
        _registeredCallback?.let { app.unregisterComponentCallbacks(it) }
        _registeredCallback = null
    }

    fun register(app: Application, onCritical: (() -> Unit)? = null) {
        // [BUG FIX] 중복 등록 방지 — 기존 콜백 먼저 해제
        unregister(app)

        val callback = object : ComponentCallbacks2 {
            override fun onTrimMemory(level: Int) {
                val msg = when (level) {
                    ComponentCallbacks2.TRIM_MEMORY_RUNNING_CRITICAL -> "RUNNING_CRITICAL"
                    ComponentCallbacks2.TRIM_MEMORY_RUNNING_LOW      -> "RUNNING_LOW"
                    ComponentCallbacks2.TRIM_MEMORY_RUNNING_MODERATE -> "RUNNING_MODERATE"
                    ComponentCallbacks2.TRIM_MEMORY_UI_HIDDEN        -> "UI_HIDDEN"
                    ComponentCallbacks2.TRIM_MEMORY_BACKGROUND       -> "BACKGROUND"
                    ComponentCallbacks2.TRIM_MEMORY_MODERATE         -> "MODERATE"
                    ComponentCallbacks2.TRIM_MEMORY_COMPLETE         -> "COMPLETE"
                    else -> "LEVEL_$level"
                }
                Log.w(TAG, "onTrimMemory: $msg (level=$level)")
                if (level >= ComponentCallbacks2.TRIM_MEMORY_RUNNING_CRITICAL) {
                    Log.e(TAG, "🔴 시스템 메모리 위기 — 추론 중단 요청")
                    onCritical?.invoke()
                }
            }
            override fun onConfigurationChanged(newConfig: Configuration) {}
            override fun onLowMemory() {
                Log.e(TAG, "🔴 onLowMemory() — 시스템 OOM 직전")
                onCritical?.invoke()
            }
        }
        // [BUG FIX] 참조 저장 후 등록 → unregister() 에서 정확히 해제 가능
        _registeredCallback = callback
        app.registerComponentCallbacks(callback)
        Log.i(TAG, "MemoryGuard 등록 완료. 총RAM=${totalMB(app)}MB")
    }

    // ── 추론 파라미터 자동 조정 ───────────────────────────────
    //
    // 가용 RAM에 따라 max_tokens를 자동으로 줄여 OOM 방지

    fun safeMaxTokens(ctx: Context, requested: Int = 512): Int {
        val avail = availMB(ctx)
        // [BUG-25 FIX] avail=0(극저메모리)도 유효한 값으로 처리 — fallback 없이 실제값 사용.
        val safe = when {
            avail >= 2500 -> requested
            avail >= 1500 -> minOf(requested, 512)
            avail >= 900  -> minOf(requested, 256)
            else          -> minOf(requested, 128)
        }
        if (safe < requested) {
            Log.i(TAG, "maxTokens 조정: $requested → $safe (가용 ${avail}MB)")
        }
        return safe
    }

    /** 가용 RAM 기반 권장 trim 임계치 (턴 수) */
    fun recommendedTrimThreshold(ctx: Context): Int {
        val total = totalMB(ctx)
        return when {
            total >= 8000 -> 40
            total >= 6000 -> 30
            total >= 4000 -> 20
            else          -> 12
        }
    }
}