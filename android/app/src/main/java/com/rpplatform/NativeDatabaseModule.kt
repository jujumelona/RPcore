package com.rpplatform

import android.database.Cursor
import android.database.sqlite.SQLiteDatabase
import android.database.sqlite.SQLiteException
import android.util.Base64
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.ReadableArray
import com.facebook.react.bridge.WritableNativeArray
import com.facebook.react.bridge.WritableNativeMap
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch

class NativeDatabaseModule(
    private val reactContext: ReactApplicationContext
) : ReactContextBaseJavaModule(reactContext) {

    // SupervisorJob: 자식 코루틴 하나가 실패해도 나머지 DB 작업이 취소되지 않음
    private val scope = CoroutineScope(Dispatchers.IO + SupervisorJob())

    // [FIX] by lazy val은 ::db.isInitialized 불가 (lateinit var 전용)
    // → nullable var로 변경, getDb()에서 lazy 초기화, destroy에서 null 체크 후 close
    private var db: SQLiteDatabase? = null
    private var changesStatement: android.database.sqlite.SQLiteStatement? = null

    // [BUG FIX] getDb() 스레드 안전성 추가
    // Dispatchers.IO 스레드풀에서 동시 호출 시 두 스레드가 모두 db==null을 확인해
    // openOrCreateDatabase()가 두 번 호출될 수 있었음 → @Synchronized로 보호
    @Synchronized
    private fun getDb(): SQLiteDatabase {
        return db ?: run {
            val dbFile = reactContext.applicationContext
                .getDatabasePath("rp_core_v2.db")
            SQLiteDatabase.openOrCreateDatabase(dbFile, null).also { db = it }
        }
    }

    override fun getName() = "NativeDatabase"

    /**
     * executeQuery: Android Cursor를 통한 raw SELECT 실행.
     * 결과를 WritableArray(rows) of WritableMap(columns)으로 반환.
     * [BUG FIX] SQL injection 방지: params 배열로 파라미터 바인딩 지원
     */
    @ReactMethod
    fun executeQuery(sql: String, params: ReadableArray?, promise: Promise) {
        scope.launch {
            var cursor: Cursor? = null
            try {
                // [BUG FIX] 파라미터 바인딩으로 SQL injection 방지
                // 기존: rawQuery(sql, null) → JS에서 직접 SQL에 값 삽입 → injection 가능
                // 수정: ReadableArray params를 selectionArgs로 변환해 바인딩
                val selectionArgs: Array<String>? = params?.let { arr ->
                    Array(arr.size()) { i -> arr.getString(i) ?: "" }
                }
                cursor = getDb().rawQuery(sql, selectionArgs)
                val rows = WritableNativeArray()
                while (cursor.moveToNext()) {
                    val row = WritableNativeMap()
                    for (i in 0 until cursor.columnCount) {
                        val colName = cursor.getColumnName(i)
                        when (cursor.getType(i)) {
                            // ✅ [BUG FIX] getInt() → getLong() — conversations.id 등 INTEGER PRIMARY KEY AUTOINCREMENT는 64비트
                            // 기존: getInt() 사용 → 2,147,483,647 초과 ID에서 음수/잘림 (32비트 오버플로우)
                            // 수정: getLong()으로 64비트 정수 안전하게 읽고, JS에서 표현 가능한 범위면 Int로, 아니면 String으로 저장
                            Cursor.FIELD_TYPE_INTEGER -> {
                                val longVal = cursor.getLong(i)
                                if (longVal >= Int.MIN_VALUE && longVal <= Int.MAX_VALUE) {
                                    row.putInt(colName, longVal.toInt())
                                } else {
                                    row.putString(colName, longVal.toString())
                                }
                            }
                            Cursor.FIELD_TYPE_FLOAT   -> row.putDouble(colName, cursor.getDouble(i))
                            Cursor.FIELD_TYPE_STRING  -> row.putString(colName, cursor.getString(i))
                            // [BUG FIX] BLOB을 getString()으로 읽으면 바이너리 손상 → getBlob()+Base64
                            Cursor.FIELD_TYPE_BLOB    -> {
                                val bytes = cursor.getBlob(i)
                                row.putString(colName, Base64.encodeToString(bytes, Base64.NO_WRAP))
                            }
                            Cursor.FIELD_TYPE_NULL    -> row.putNull(colName)
                        }
                    }
                    rows.pushMap(row)
                }
                promise.resolve(rows)
            } catch (e: SQLiteException) {
                promise.reject("DB_ERROR", e.message, e)
            } catch (e: Exception) {
                promise.reject("DB_ERROR", e.message, e)
            } finally {
                cursor?.close()
            }
        }
    }

    /**
     * executeWrite: raw DML(INSERT/UPDATE/DELETE) 실행.
     * 트랜잭션 안에서 실행하고 영향받은 rowsAffected(Int)를 반환.
     * [BUG FIX] SQL injection 방지: params 배열로 파라미터 바인딩 지원
     */
    @ReactMethod
    fun executeWrite(sql: String, params: ReadableArray?, promise: Promise) {
        scope.launch {
            val database = getDb()
            try {
                database.beginTransaction()
                try {
                    // [BUG FIX] compileStatement + bindAllArgsAsStrings로 파라미터 바인딩
                    // 기존: execSQL(sql) → raw SQL 직접 실행 → SQL injection 가능
                    // 수정: params가 있으면 bindAllArgsAsStrings, 없으면 execSQL
                    if (params != null && params.size() > 0) {
                        val bindArgs = Array(params.size()) { i -> params.getString(i) ?: "" }
                        database.execSQL(sql, bindArgs)
                    } else {
                        // [BUG-27 FIX] params=null인데 SQL에 ?가 있으면 SQLiteException 방지 및 SQL Injection 방어
                        if (sql.contains("?")) {
                            promise.reject("DB_WRITE_ERROR", "SQL contains '?' but no parameters provided")
                            return@launch
                        }
                        database.execSQL(sql)
                    }

                    // [BUG-4 FIX] SELECT changes() 쿼리 캐싱 (메모리 누수 및 컴파일 비용 절감)
                    val statement = changesStatement ?: database.compileStatement("SELECT changes()").also { changesStatement = it }
                    val affected = statement.simpleQueryForLong().toInt()
                    
                    database.setTransactionSuccessful()
                    promise.resolve(affected)
                } finally {
                    database.endTransaction()
                }
            } catch (e: SQLiteException) {
                promise.reject("DB_WRITE_ERROR", e.message, e)
            } catch (e: Exception) {
                promise.reject("DB_WRITE_ERROR", e.message, e)
            }
        }
    }

    // React Native 인스턴스 해제 시 코루틴 스코프 + DB 연결 정리
    override fun onCatalystInstanceDestroy() {
        super.onCatalystInstanceDestroy()
        scope.cancel()
        changesStatement?.close()
        changesStatement = null
        db?.let { if (it.isOpen) it.close() }
        db = null
    }
}
