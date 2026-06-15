// android/app/src/main/java/com/rpplatform/ModelConfig.kt
// ════════════════════════════════════════════════════════════
// llama.rn 전환 후 간소화된 모델 레지스트리
//
// ⚠️  실제 모델 목록은 TypeScript ModelConfig.ts가 주도적으로 관리.
//     이 Kotlin 파일은 네이티브 측에서 모델 경로 조회가 필요한 경우에만 사용.
//
// llama.rn은 JS 레이어에서 직접 initLlama()를 호출하므로
// Kotlin 측에 복잡한 네이티브 레지스트리가 필요 없음.
// ════════════════════════════════════════════════════════════

package com.rpplatform

import android.content.Context
import java.io.File

data class ModelSpec(
    /** GGUF 파일명 (e.g. "gemma-3-4b-it-Q4_K_M.gguf") */
    val fileName: String,
    /** 모델 서브디렉토리명 — JS ModelConfig.ts dirName 과 일치해야 함 */
    val dirName: String,
    /** 표시용 이름 */
    val displayName: String,
    /** 최소 가용 RAM (MB) */
    val minAvailRamMB: Long,
    /** JS ModelConfig.ts id 값 — dirName과 다를 수 있음 (e.g. gemma-3n-e2b-reasoning) */
    val id: String = dirName,
)

object ModelRegistry {

    val ALL: List<ModelSpec> = listOf(
        ModelSpec(
            fileName      = "google_gemma-3-270m-it-qat-Q8_0.gguf",
            dirName       = "gemma-3-270m",
            displayName   = "Gemma 3 270M (미니)",
            minAvailRamMB = 2000,
            id            = "gemma-3-270m",
        ),
        ModelSpec(
            fileName      = "gemma-3-1b-it-q4_0_s.gguf",
            dirName       = "gemma-3-1b-qat",
            displayName   = "Gemma 3 1B (라이트)",
            minAvailRamMB = 3000,
            id            = "gemma-3-1b-qat",
        ),
        ModelSpec(
            fileName      = "google_gemma-3n-E2B-it-Q4_K_M.gguf",
            dirName       = "gemma-3n-e2b",
            displayName   = "Gemma 3n E2B (스탠다드)",
            minAvailRamMB = 6000,
            // [FIX] JS DEFAULT_MODEL_ID = 'gemma-3n-e2b-reasoning' 와 일치
            id            = "gemma-3n-e2b-reasoning",
        ),
    )

    /** DocumentDirectory 내 모델 절대 경로 — JS ModelDownloader.getModelPath()와 동일한 경로 구조 */
    fun modelPath(ctx: Context, spec: ModelSpec): String {
        return "${ctx.filesDir.absolutePath}/models/${spec.dirName}/${spec.fileName}"
    }

    /** 모델 파일이 기기에 존재하는지 확인 */
    fun isDownloaded(ctx: Context, spec: ModelSpec): Boolean {
        return File(modelPath(ctx, spec)).exists()
    }

    /** JS ModelConfig.id 로 ModelSpec 조회 — id가 dirName과 다른 경우(reasoning) 대응 */
    fun findById(modelId: String): ModelSpec? = ALL.find { it.id == modelId }
}
