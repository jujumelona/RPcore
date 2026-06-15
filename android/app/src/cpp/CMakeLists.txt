# android/app/src/main/cpp/CMakeLists.txt
# ═══════════════════════════════════════════════════════
# llama.cpp JNI 빌드
#
# 준비 작업:
#   cd android/app/src/main/cpp
#   git clone https://github.com/ggerganov/llama.cpp llama
# ═══════════════════════════════════════════════════════

cmake_minimum_required(VERSION 3.22.1)
project(llama_android)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_C_STANDARD   11)

# ARM64 NEON+dotprod+fp16 최적화
if(ANDROID_ABI STREQUAL "arm64-v8a")
    add_compile_options(-march=armv8-a+dotprod+fp16)
endif()

set(LLAMA_DIR ${CMAKE_CURRENT_SOURCE_DIR}/llama)

# Vulkan 감지 (NDK r25+에 포함)
find_package(Vulkan QUIET)
if(Vulkan_FOUND)
    set(GGML_VULKAN ON CACHE BOOL "" FORCE)
    message(STATUS "✅ Vulkan 활성화")
else()
    set(GGML_VULKAN OFF CACHE BOOL "" FORCE)
    message(WARNING "⚠️ Vulkan 없음 — CPU 모드")
endif()

# llama.cpp 빌드 (테스트/예제 제외)
set(LLAMA_BUILD_TESTS    OFF CACHE BOOL "" FORCE)
set(LLAMA_BUILD_EXAMPLES OFF CACHE BOOL "" FORCE)
set(LLAMA_BUILD_SERVER   OFF CACHE BOOL "" FORCE)
set(GGML_NATIVE          OFF CACHE BOOL "" FORCE)  # 크로스 컴파일용

add_subdirectory(${LLAMA_DIR} llama_build)

# JNI 공유 라이브러리
add_library(llama_jni SHARED llama_jni.cpp)

target_include_directories(llama_jni PRIVATE
    ${LLAMA_DIR}
    ${LLAMA_DIR}/common
    ${LLAMA_DIR}/ggml/include
)

target_link_libraries(llama_jni llama ggml android log)

if(GGML_VULKAN)
    find_library(VULKAN_LIB vulkan)
    if(VULKAN_LIB)
        target_link_libraries(llama_jni ${VULKAN_LIB})
        target_compile_definitions(llama_jni PRIVATE GGML_USE_VULKAN)
    endif()
endif()
