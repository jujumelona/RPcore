package com.rpplatform.ui

import androidx.compose.animation.*
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape  // 에러 8 수정: RoundedCornerDepartment → RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import coil3.compose.AsyncImage  // 에러 9 수정: coil → coil3

/**
 * 2026년형 상용 앱의 '디테일': Jetpack Compose로 구현한 고성능 캐릭터 카드
 * RN보다 부드러운 애니메이션과 그라데이션 효과 제공
 */
@Composable
fun CharacterProfileCard(
    name: String,
    personality: String,
    imageUrl: String?,
    loveScore: Int
) {
    Card(
        modifier = Modifier
            .fillMaxWidth()
            .height(280.dp)
            .padding(16.dp),
        shape = RoundedCornerShape(24.dp),
        elevation = CardDefaults.cardElevation(defaultElevation = 8.dp)
    ) {
        Box(modifier = Modifier.fillMaxSize()) {
            // 캐릭터 배경 이미지
            AsyncImage(
                model = imageUrl,
                contentDescription = null,
                modifier = Modifier.fillMaxSize(),
                contentScale = ContentScale.Crop
            )

            // 하단 그라데이션 오버레이 (텍스트 가독성)
            Box(
                modifier = Modifier
                    .fillMaxSize()
                    .background(
                        Brush.verticalGradient(
                            colors = listOf(Color.Transparent, Color.Black.copy(alpha = 0.8f)),
                            startY = 300f
                        )
                    )
            )

            // 캐릭터 정보
            Column(
                modifier = Modifier
                    .align(Alignment.BottomStart)
                    .padding(20.dp)
            ) {
                Text(
                    text = name,
                    color = Color.White,
                    fontSize = 24.sp,
                    fontWeight = FontWeight.Bold
                )
                Text(
                    text = personality,
                    color = Color.White.copy(alpha = 0.8f),
                    fontSize = 14.sp
                )

                Spacer(modifier = Modifier.height(8.dp))

                // 호감도 바
                // [FIX] progress: Float (deprecated) → progress: () -> Float 람다 형태로 변경.
                // 람다 형태는 호출 시점까지 읽기를 지연시켜 불필요한 리컴포지션 방지.
                LinearProgressIndicator(
                    progress = { loveScore / 100f },
                    modifier = Modifier.fillMaxWidth().height(4.dp),
                    color = Color(0xFFFF4081),
                    trackColor = Color.White.copy(alpha = 0.3f)
                )
            }
        }
    }
}
