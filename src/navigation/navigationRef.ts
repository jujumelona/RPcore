﻿// src/navigation/navigationRef.ts
// 순환 참조 방지용 분리 파일
// AppNavigator와 NotificationService 모두 여기서 import
import { createNavigationContainerRef } from '@react-navigation/native';
import { RootStackParamList } from '../types/navigation';

export const navigationRef = createNavigationContainerRef<RootStackParamList>();
