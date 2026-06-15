package com.rpplatform.di

import android.content.Context
import app.cash.sqldelight.db.SqlDriver
import app.cash.sqldelight.driver.android.AndroidSqliteDriver
import com.rpplatform.db.RPDatabase
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.android.qualifiers.ApplicationContext
import dagger.hilt.components.SingletonComponent
import javax.inject.Singleton

@Module
@InstallIn(SingletonComponent::class)
object DatabaseModule {

    /**
     * [FIX] 반환 타입을 AndroidSqliteDriver(구체 클래스) → SqlDriver(인터페이스)로 변경.
     *
     * 이전: fun provideSqlDriver(...): AndroidSqliteDriver
     *   - Hilt 그래프 전체가 Android 구현에 의존 → 단위 테스트 시 JdbcSqliteDriver로 교체 불가
     *
     * 수정: fun provideSqlDriver(...): SqlDriver
     *   - 테스트에서 @TestInstallIn으로 JdbcSqliteDriver(인메모리)를 주입 가능
     */
    @Provides
    @Singleton
    fun provideSqlDriver(@ApplicationContext context: Context): SqlDriver {
        return AndroidSqliteDriver(
            schema = RPDatabase.Schema,
            context = context,
            name = "rp_core_v2.db"
        )
    }

    @Provides
    @Singleton
    fun provideDatabase(driver: SqlDriver): RPDatabase {
        return RPDatabase(driver = driver)
    }
}
