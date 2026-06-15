package com.rpplatform

import leakcanary.LeakCanary
import shark.IgnoredReferenceMatcher
import shark.ReferencePattern

object LeakCanaryConfig {

    fun apply() {
        LeakCanary.config = LeakCanary.config.copy(
            referenceMatchers = LeakCanary.config.referenceMatchers + knownLeaks()
        )
    }

    private fun knownLeaks(): List<IgnoredReferenceMatcher> = listOf(

        // [1] react-native-screens Screen.fragmentWrapper
        IgnoredReferenceMatcher(
            pattern = ReferencePattern.InstanceFieldPattern(
                className = "com.swmansion.rnscreens.Screen",
                fieldName = "fragmentWrapper"
            )
        ),

        // [2] ScreenStackFragment.screen
        IgnoredReferenceMatcher(
            pattern = ReferencePattern.InstanceFieldPattern(
                className = "com.swmansion.rnscreens.ScreenStackFragment",
                fieldName = "screen"
            )
        ),

        // [3] ScreenStack.stack
        IgnoredReferenceMatcher(
            pattern = ReferencePattern.InstanceFieldPattern(
                className = "com.swmansion.rnscreens.ScreenStack",
                fieldName = "stack"
            )
        ),

        // [4] ScreenFragment.screen — Fragment#onDestroy() 후 screen 참조 유지
        //     react-native-screens 내부에서 Fragment 소멸 후 Screen View가 잠시 남는 알려진 이슈
        IgnoredReferenceMatcher(
            pattern = ReferencePattern.InstanceFieldPattern(
                className = "com.swmansion.rnscreens.ScreenFragment",
                fieldName = "screen"
            )
        ),

        // [5] ScreenFragment$ScreensFrameLayout — onDestroyView() 후 FrameLayout 잔류
        //     ScreenFragment가 View를 destroy한 뒤 FrameLayout 래퍼가 잠시 GC되지 않는 알려진 이슈
        IgnoredReferenceMatcher(
            pattern = ReferencePattern.InstanceFieldPattern(
                className = "com.swmansion.rnscreens.ScreenFragment",
                fieldName = "mContainerView"
            )
        ),

        // [6] ScreenContainer.screens — ScreenContainer가 Screen 리스트를 보유하다 onDetach 이후 해제 지연
        IgnoredReferenceMatcher(
            pattern = ReferencePattern.InstanceFieldPattern(
                className = "com.swmansion.rnscreens.ScreenContainer",
                fieldName = "screens"
            )
        ),

        // [7] androidx.lifecycle.SavedStateHandlesVM — ViewModel#onCleared() 이후 LeakCanary 감시
        //     SavedStateHandlesVM은 시스템이 직접 관리하며, onCleared 직후 GC 전에 탐지되는 false positive
        IgnoredReferenceMatcher(
            pattern = ReferencePattern.InstanceFieldPattern(
                className = "androidx.lifecycle.SavedStateHandlesVM",
                fieldName = "handles"
            )
        ),

        // [8] LoaderManagerImpl$LoaderViewModel — Fragment 소멸 시 Loader 정리 타이밍 차이로 인한 false positive
        IgnoredReferenceMatcher(
            pattern = ReferencePattern.InstanceFieldPattern(
                className = "androidx.loader.app.LoaderManagerImpl\$LoaderViewModel",
                fieldName = "mLoaders"
            )
        ),
    )
}
