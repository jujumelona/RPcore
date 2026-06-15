package com.rpplatform

import android.annotation.SuppressLint
import android.content.Intent
import android.graphics.Color as AndroidColor
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.SystemBarStyle
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.animation.core.*
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.scale
import androidx.compose.ui.graphics.Color
import com.rpplatform.ui.RPLogo
import kotlinx.coroutines.delay

@SuppressLint("CustomSplashScreen")
class SplashActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        
        // [FIX] 인트로 화면 시스템 바 및 네비게이션 바 색상 통일 (#050507)
        enableEdgeToEdge(
            statusBarStyle = SystemBarStyle.dark(AndroidColor.TRANSPARENT),
            navigationBarStyle = SystemBarStyle.dark(AndroidColor.parseColor("#050507"))
        )
        
        setContent {
            RPSplashScreen {
                val intent = Intent(this, MainActivity::class.java)
                startActivity(intent)
                finish()
                // 전환 애니메이션을 페이드 인/아웃으로 설정하여 부드럽게 연결
                overridePendingTransition(android.R.anim.fade_in, android.R.anim.fade_out)
            }
        }
    }
}

@Composable
fun RPSplashScreen(onSplashFinished: () -> Unit) {
    var startAnimation by remember { mutableStateOf(false) }
    
    // 로고 애니메이션 설정
    val alphaAnim by animateFloatAsState(
        targetValue = if (startAnimation) 1f else 0f,
        animationSpec = tween(1200, easing = FastOutSlowInEasing),
        label = "alpha"
    )
    
    val scaleAnim by animateFloatAsState(
        targetValue = if (startAnimation) 1f else 0.8f,
        animationSpec = spring(
            dampingRatio = Spring.DampingRatioLowBouncy,
            stiffness = Spring.StiffnessLow
        ),
        label = "scale"
    )

    LaunchedEffect(Unit) {
        startAnimation = true
        delay(2000) // 인트로 노출 시간 (2초)
        onSplashFinished()
    }

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(Color(0xFF050507)), // 앱 기본 배경색과 동일하게 설정
        contentAlignment = Alignment.Center
    ) {
        // [IMPORTANT] RPLogo.kt 내의 디자인이 앱 아이콘(ic_launcher)과 동일한지 확인 필요
        RPLogo(
            modifier = Modifier
                .scale(scaleAnim)
                .alpha(alphaAnim),
            size = 180 // 아이콘과 비슷한 적절한 크기로 조정
        )
    }
}
