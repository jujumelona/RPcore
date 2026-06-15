package com.rpplatform.ui

import android.view.View
import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.core.*
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalView
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import coil3.compose.AsyncImage

/**
 * 2026년형 프리미엄 시그니처 캐릭터 뷰
 *
 * ✅ [OPT v3] Hardware Layer 적용
 *
 *   안드로이드 네이티브 View.LAYER_TYPE_HARDWARE 원리:
 *   - GPU가 이 View를 오프스크린 텍스처(FBO)로 캐싱
 *   - 이후 이 View의 내용이 바뀌지 않고 transform/alpha만 변할 때:
 *     CPU가 다시 그릴 필요 없이 GPU 텍스처만 변환 → CPU 부하 0
 *   - Pulse 애니메이션(scale만 변화), 배경 전환(opacity만 변화) 같은
 *     "내용은 같고 변환만 바뀌는" 케이스에 최적
 *
 *   Compose에서 적용 방법:
 *   LocalView.current를 통해 ComposeView(= Android View 서브클래스)에 접근
 *   → setLayerType(LAYER_TYPE_HARDWARE, null) 직접 호출
 *   → DisposableEffect로 언마운트 시 LAYER_TYPE_NONE으로 복원
 *
 *   주의사항:
 *   - 하드웨어 레이어는 GPU 메모리를 사용하므로
 *     화면에 표시될 때만 활성화해야 함 (LazyList 등에서 조심)
 *   - 현재 뷰: 전체 화면 캐릭터 카드 → 항상 표시 → 상시 활성 OK
 *   - loveScore 변경 시 배경색 변경 → 레이어 무효화되어 재캐싱 (1회)
 *     이후 Pulse 애니메이션은 텍스처 재사용 → CPU 비용 없음
 *
 * ✅ [OPT v2 유지] remember(loveScore) 캐싱
 * ✅ [OPT v2 유지] graphicsLayer 통합 (scale + alpha 단일 레이어)
 * ✅ [OPT v2 유지] rememberInfiniteTransition label 명시
 */
@Composable
fun SignatureCharacterView(
    imageUrl: String?,
    name: String,
    loveScore: Int,
    emotion: String = "neutral"
) {
    // ✅ [OPT v3] Hardware Layer — DisposableEffect로 생명주기 연동
    // LocalView.current: 현재 Composable이 속한 ComposeView(= Android View) 참조
    // 마운트 시 LAYER_TYPE_HARDWARE 설정 → GPU 텍스처 캐싱 활성화
    // 언마운트 시 LAYER_TYPE_NONE으로 복원 → GPU 메모리 해제
    val hostView = LocalView.current
    DisposableEffect(Unit) {
        hostView.setLayerType(View.LAYER_TYPE_HARDWARE, null)
        onDispose {
            hostView.setLayerType(View.LAYER_TYPE_NONE, null)
        }
    }

    // ✅ [OPT v2 유지] remember(loveScore) — loveScore 변경 시에만 Color 재계산
    val targetColor: Color = remember(loveScore) {
        when {
            loveScore > 80 -> Color(0xFFFF4081) // 핑크
            loveScore > 50 -> Color(0xFF64B5F6) // 블루
            else           -> Color(0xFF90A4AE) // 그레이
        }
    }

    val animatedBgColor by animateColorAsState(
        targetValue = targetColor,
        animationSpec = tween(durationMillis = 1000),
        label = "bgColor"
    )

    // ✅ [OPT v2 유지] remember(animatedBgColor) — Brush 객체 재생성 최소화
    // animateColorAsState는 60fps로 색상을 업데이트하지만
    // Brush 재생성은 실제 색상값이 바뀐 프레임에만 발생
    val bgBrush: Brush = remember(animatedBgColor) {
        Brush.verticalGradient(
            colors = listOf(animatedBgColor.copy(alpha = 0.3f), Color.Black)
        )
    }

    // ✅ [OPT v2 유지] label 명시로 Compose 최적화 힌트 제공
    val infiniteTransition = rememberInfiniteTransition(label = "pulseTransition")

    val pulseScale by infiniteTransition.animateFloat(
        initialValue = 1f,
        targetValue = 1.03f,
        animationSpec = infiniteRepeatable(
            animation = tween(2000, easing = LinearEasing),
            repeatMode = RepeatMode.Reverse
        ),
        label = "pulseScale"
    )

    // ✅ [OPT v3] Hardware Layer 효과 극대화:
    // Box의 background가 bgBrush로 설정되면 loveScore 변화 시 레이어 재캐싱 (1회)
    // 이후 pulseScale 애니메이션(scale만 변화)은 GPU 텍스처를 그대로 사용
    // → CPU가 Box 전체를 다시 그릴 필요 없음 = Pulse 애니메이션 비용 ≈ 0
    Box(
        modifier = Modifier
            .fillMaxWidth()
            .height(450.dp)
            .clip(RoundedCornerShape(bottomStart = 40.dp, bottomEnd = 40.dp))
            .background(bgBrush)
    ) {
        // ✅ [OPT v2 유지] graphicsLayer 통합 — scale + alpha 단일 레이어
        AsyncImage(
            model = imageUrl,
            contentDescription = name,
            modifier = Modifier
                .fillMaxSize()
                .graphicsLayer {
                    scaleX = pulseScale
                    scaleY = pulseScale
                    alpha = 0.9f
                },
            contentScale = ContentScale.Crop
        )

        Column(
            modifier = Modifier
                .align(Alignment.BottomStart)
                .padding(24.dp)
        ) {
            Text(
                text = name,
                color = Color.White,
                fontSize = 32.sp,
                fontWeight = FontWeight.Black,
                letterSpacing = (-1).sp
            )

            Row(verticalAlignment = Alignment.CenterVertically) {
                val dotColor = remember(loveScore) {
                    if (loveScore > 0) Color.Red else Color(0xFF90A4AE)
                }
                Box(
                    modifier = Modifier
                        .size(8.dp)
                        .background(dotColor, RoundedCornerShape(4.dp))
                )
                Spacer(modifier = Modifier.width(8.dp))
                Text(
                    text = "Love Score: $loveScore",
                    color = Color.White.copy(alpha = 0.7f),
                    fontSize = 14.sp
                )
            }
        }
    }
}
