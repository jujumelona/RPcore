package com.rpplatform.ui

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.platform.ComposeView
import com.facebook.react.uimanager.SimpleViewManager
import com.facebook.react.uimanager.ThemedReactContext
import com.facebook.react.uimanager.annotations.ReactProp

/**
 * 2026년형 상용화 브릿지: Compose의 고난도 애니메이션을 RN에서 직접 제어
 *
 * ✅ [OPT v2] setContent 1회 호출 + Compose State 기반 prop 업데이트
 *
 *   기존 문제점 (renderContent 방식):
 *   - setImageUrl / setName / setLoveScore 각 ReactProp 호출마다 renderContent() 실행
 *   - renderContent()는 view.setContent { ... } 를 호출 → ComposeView 전체 재구성
 *   - RN이 한 번에 3개 props를 업데이트하면 setContent가 3회 연속 호출
 *   - 각 setContent 호출이 Compose UI 트리를 폐기하고 재생성 → GPU draw call 3배 낭비
 *   - Compose Recomposition 이점 없음 (트리 재활용 불가)
 *
 *   수정:
 *   - ViewHolder 클래스에 mutableStateOf / mutableIntStateOf 로 관리되는 State 변수 보유
 *   - setContent는 createViewInstance()에서 단 1회 호출
 *   - 각 ReactProp setter는 ViewHolder State만 변경 → Compose Recomposition만 트리거
 *   - Compose는 변경된 State를 구독한 부분만 스마트하게 재구성 → draw call 최소화
 *
 *   효과:
 *   - setContent 호출: n회(prop 수) → 1회 (createViewInstance 시)
 *   - Compose Recomposition: 전체 재구성 → 변경된 State 구독 영역만 재구성
 *   - GPU 합성 비용: 대폭 감소
 */
class SignatureCharacterViewManager : SimpleViewManager<ComposeView>() {

    override fun getName() = "SignatureCharacterView"

    /**
     * view 태그별 Compose State 보관 홀더.
     * mutableStateOf / mutableIntStateOf 로 생성된 State는 Compose 런타임이 추적.
     * setter를 통해 값을 변경하면 해당 State를 읽는 Composable만 Recomposition.
     */
    private inner class ViewHolder {
        var imageUrl   by mutableStateOf<String?>(null)
        var name       by mutableStateOf("Unknown")
        var loveScore  by mutableIntStateOf(0)
    }

    private val holderMap = mutableMapOf<Int, ViewHolder>()

    override fun createViewInstance(reactContext: ThemedReactContext): ComposeView {
        val view   = ComposeView(reactContext)
        val holder = ViewHolder()
        holderMap[view.id] = holder

        // ✅ [OPT v2] setContent 단 1회 — 이후 prop 변경은 holder State 갱신으로만 처리
        // Compose 런타임이 holder.imageUrl / holder.name / holder.loveScore 읽기를 추적.
        // 각 값이 변경되면 해당 값을 읽는 Composable 범위만 Recomposition.
        view.setContent {
            SignatureCharacterView(
                imageUrl  = holder.imageUrl,
                name      = holder.name,
                loveScore = holder.loveScore,
            )
        }
        return view
    }

    override fun onDropViewInstance(view: ComposeView) {
        super.onDropViewInstance(view)
        holderMap.remove(view.id)
    }

    // ── ReactProp 세터 — State만 변경, setContent 재호출 없음 ─────────────

    @ReactProp(name = "imageUrl")
    fun setImageUrl(view: ComposeView, imageUrl: String?) {
        // holder.imageUrl 변경 → Compose가 imageUrl을 읽는 블록만 Recomposition
        holderMap[view.id]?.imageUrl = imageUrl
    }

    @ReactProp(name = "name")
    fun setName(view: ComposeView, name: String?) {
        holderMap[view.id]?.name = name ?: "Unknown"
    }

    @ReactProp(name = "loveScore", defaultInt = 0)
    fun setLoveScore(view: ComposeView, loveScore: Int) {
        holderMap[view.id]?.loveScore = loveScore
    }
}
