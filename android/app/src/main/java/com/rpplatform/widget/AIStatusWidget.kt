package com.rpplatform.widget

import android.content.Context
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.glance.GlanceId
import androidx.glance.GlanceModifier
import androidx.glance.appwidget.GlanceAppWidget
import androidx.glance.appwidget.GlanceAppWidgetReceiver
import androidx.glance.appwidget.provideContent
import androidx.glance.background
import androidx.glance.layout.*
import androidx.glance.text.Text
import androidx.glance.text.TextStyle
import androidx.glance.unit.ColorProvider
import com.rpplatform.AIWidgetModule

/**
 * 홈 화면 AI 상태 위젯 — 실제 AI 추론 상태를 반영
 */
class AIStatusWidget : GlanceAppWidget() {

    override suspend fun provideGlance(context: Context, id: GlanceId) {
        val prefs = context.getSharedPreferences(AIWidgetModule.PREFS_NAME, Context.MODE_PRIVATE)
        val rawStatus = prefs.getString(AIWidgetModule.KEY_STATUS, AIWidgetModule.STATE_IDLE)
            ?: AIWidgetModule.STATE_IDLE
        val charName = prefs.getString(AIWidgetModule.KEY_CHAR, null)

        val displayStatus = when (rawStatus) {
            AIWidgetModule.STATE_LOADING    -> "모델 로딩 중..."
            AIWidgetModule.STATE_GENERATING -> "생성 중..."
            else                            -> if (charName != null) "대화 가능" else "AI 대기 중"
        }

        provideContent {
            WidgetContent(
                charName     = charName ?: "My AI World",
                status       = displayStatus,
                isGenerating = rawStatus == AIWidgetModule.STATE_GENERATING,
                isLoading    = rawStatus == AIWidgetModule.STATE_LOADING,
            )
        }
    }

    @Composable
    private fun WidgetContent(
        charName:     String,
        status:       String,
        isGenerating: Boolean,
        isLoading:    Boolean,
    ) {
        val dotColor = when {
            isGenerating -> ColorProvider(Color(0xFF10B981))
            isLoading    -> ColorProvider(Color(0xFFFCD34D))
            else         -> ColorProvider(Color(0xFF6B7280))
        }

        Column(
            modifier = GlanceModifier
                .fillMaxSize()
                .background(ColorProvider(Color(0xFF0E0E14)))
                .padding(12.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Text(
                text = charName,
                style = TextStyle(
                    fontSize = 13.sp,
                    color = ColorProvider(Color(0xFFFFFFFF)),
                ),
            )
            Spacer(modifier = GlanceModifier.height(6.dp))
            Row(verticalAlignment = Alignment.CenterVertically) {
                Box(
                    modifier = GlanceModifier
                        .size(8.dp)
                        .background(dotColor),
                    contentAlignment = Alignment.Center,
                ) {}
                Spacer(modifier = GlanceModifier.width(6.dp))
                Text(
                    text = status,
                    style = TextStyle(
                        fontSize = 11.sp,
                        color = ColorProvider(Color(0xFFAAAAAA)),
                    ),
                )
            }
        }
    }
}

class AIStatusWidgetReceiver : GlanceAppWidgetReceiver() {
    override val glanceAppWidget: GlanceAppWidget = AIStatusWidget()
}
