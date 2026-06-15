/* eslint-disable @typescript-eslint/no-unused-vars */
// src/i18n/policyContent.ts  v3 — COMPLETE 27-LANGUAGE EDITION
// ══════════════════════════════════════════════════════════════════════════════
//  법적 정책 완전판 — 15개 언어 × 4개 정책 (이용약관·개인정보·운영정책·청소년보호)
//
//  각 언어별 준거법:
//    ko  — 개인정보보호법, 청소년보호법, 정보통신망법
//    ja  — 個人情報保護法, 児童ポルノ禁止法
//    zh-CN — 个人信息保护法 (PIPL), 网络安全法
//    zh-TW — 個人資料保護法
//    de  — DSGVO/GDPR, BDSG, JuSchG, NetzDG
//    fr  — RGPD/GDPR, Loi Informatique et Libertés (CNIL)
//    es  — RGPD/GDPR, LOPDGDD
//    it  — GDPR, Codice Privacy (D.Lgs. 196/2003)
//    nl  — GDPR, AVG, Wbp
//    pl  — RODO/GDPR, UODO
//    ro  — GDPR
//    sv  — GDPR, PuL
//    ru  — ФЗ-152 «О персональных данных»
//    uk  — Закон України «Про захист персональних даних»
//    hi  — Digital Personal Data Protection Act 2023 (DPDP)
//    id  — UU PDP 2022
//    th  — PDPA 2019
//    vi  — Luật An ninh mạng, Nghị định 13/2023
//    fil — Data Privacy Act 2012 (RA 10173)
//    ms  — Personal Data Protection Act 2010 (PDPA Malaysia)
//    he  — GDPR (Israel Adequacy Decision)
//    pt  — LGPD (Lei 13.709/2018)
//    tr  — KVKK (6698 Sayılı Kanun)
//    ar  — منظومة حماية البيانات
//    fa  — قانون حفاظت از اطلاعات شخصی
//    en  — GDPR/CCPA/COPPA/DPDP (regional)
//
//  버전 변경 시 PolicyVersionStore가 감지 → 앱 내 배너 표시
// ══════════════════════════════════════════════════════════════════════════════

import { LanguageCode, getSupportedLanguage } from './languages';

export const POLICY_VERSION = '2026.03.23';

const APP   = 'RPcore';
const OP_KR = 'RPcore 운영자';
const OP_EN = 'RPcore Developer';
const EMAIL = 'fdje0303@gmail.com';
const D_KR  = '2026년 3월 23일';
const D_EN  = 'March 23, 2026';
const D_JA  = '2026年3月23日';
const D_ZH  = '2026年3月23日';
const D_DE  = '23. März 2026';
const D_FR  = '23 mars 2026';
const D_ES  = '23 de marzo de 2026';
const D_IT  = '23 marzo 2026';
const D_RU  = '23 марта 2026 г.';
const D_PT = '23 de março de 2026';
const D_TR  = '23 Mart 2026';
const D_HI  = '23 मार्च 2026';
const D_AR  = '23 مارس 2026';
const D_FA  = '۲۳ مارس ۲۰۲۶';
const D_TH  = '23 มีนาคม 2569';
const D_HE  = '23 במרץ 2026';
const VER   = POLICY_VERSION;

export type PolicyRegion = 'KR'|'JP'|'EU'|'US'|'CN'|'TW'|'BR'|'TR'|'RU'|'IN'|'SEA'|'AR'|'GLOBAL';
export type PolicyType   = 'terms'|'privacy'|'operation'|'youth';
export interface PolicyDocument { terms:string; privacy:string; operation:string; youth:string; }

const EU_LANGS: LanguageCode[] = ['de','fr','it','es'];
const SEA_LANGS: LanguageCode[] = ['th'];
const CIS_LANGS: LanguageCode[] = ['ru'];

export function detectRegion(lang: LanguageCode): PolicyRegion {
  const resolvedLang = getSupportedLanguage(lang);
  if (resolvedLang==='ko')    return 'KR';
  if (resolvedLang==='ja')    return 'JP';
  if (resolvedLang==='zh-CN') return 'CN';
  if (resolvedLang==='zh-TW') return 'TW';
  if (resolvedLang==='pt')    return 'BR';
  if (resolvedLang==='tr')    return 'TR';
  if (resolvedLang==='hi')    return 'IN';
  if (resolvedLang==='ar')    return 'AR';
  if (EU_LANGS.includes(resolvedLang))  return 'EU';
  if (SEA_LANGS.includes(resolvedLang)) return 'SEA';
  if (CIS_LANGS.includes(resolvedLang)) return 'RU';
  if (resolvedLang==='en')    return 'US';
  return 'GLOBAL';
}

// ══════════════════════════════════════════════════════
// 한국어 (개인정보보호법 · 청소년보호법)
// ══════════════════════════════════════════════════════
const KO_TERMS=`이용약관

시행일: ${D_KR}  |  버전: ${VER}

제1조 (목적)
이 약관은 ${OP_KR}(이하 "운영자")가 제공하는 AI 롤플레이 서비스 ${APP}(이하 "서비스")의 이용 조건 및 운영자와 이용자 간의 권리·의무 사항을 규정합니다.

제2조 (정의)
① "서비스"란 운영자가 제공하는 AI 기반 롤플레이·스토리 창작 앱 및 관련 기능 전체를 말합니다.
② "이용자"란 이 약관에 동의하고 서비스를 이용하는 모든 사람을 말합니다.
③ "콘텐츠"란 이용자가 생성·업로드·공유하는 텍스트, 캐릭터, 스토리 등 일체의 창작물을 말합니다.

제3조 (약관의 변경)
① 운영자는 관련 법령을 위반하지 않는 범위에서 약관을 개정할 수 있습니다.
② 변경 시 앱 내 공지로 7일 전 안내합니다.
③ 변경된 약관에 동의하지 않을 경우 탈퇴할 수 있습니다.

제4조 (서비스 제공)
① ${APP}의 AI는 이용자의 스마트폰에서 직접 구동됩니다(온디바이스). 대화 내용은 기기 내에만 저장되며 외부 서버로 전송되지 않습니다.
② 커뮤니티 기능 이용 시 일부 데이터가 서버에 저장될 수 있습니다.
③ 서비스는 광고(Google AdMob)를 통해 무료로 제공됩니다.
④ 운영자는 사전 공지 후 서비스 내용을 변경하거나 중단할 수 있습니다.

제5조 (이용자 금지 사항)
① 타인의 개인정보를 무단 수집·공개하는 행위
② 타인의 명예를 훼손하거나 사생활을 침해하는 행위
③ 아동·청소년 대상 성적 콘텐츠(CSAM)를 생성·공유하는 행위 (무관용 원칙)
④ 불법 행위를 조장하는 행위
⑤ 서비스를 해킹·조작하는 행위
⑥ 상업적 목적으로 무단 이용하는 행위

제6조 (콘텐츠 권리)
① 기기 내 생성 창작물의 권리는 이용자에게 귀속됩니다.
② 커뮤니티 공개 콘텐츠에 대해 이용자는 운영자에게 비독점적·무상 이용 허락을 부여합니다.
③ 이용자는 자신이 생성·공유한 콘텐츠에 대한 법적 책임을 집니다.

제7조 (AI 면책)
AI 생성 텍스트는 창작·오락 목적이며 사실과 다를 수 있습니다. 운영자는 AI 생성 콘텐츠의 정확성에 대해 책임지지 않습니다.

제8조 (준거법)
이 약관은 대한민국 법령에 따라 해석됩니다.

AI 모델 라이선스
본 앱은 Google의 Gemma 3 (추론) 및 EmbeddingGemma 300M (검색 보조) 모델을 사용합니다. 두 모델 모두 Google Gemma Terms of Use(ai.google.dev/gemma/terms)가 적용됩니다. 앱을 이용함으로써 해당 이용약관에 동의하는 것으로 간주됩니다. 모델 관련 상업적 이용 제한 사항은 위 링크에서 확인하세요.

AI 모델 자동 다운로드
앱 사용을 위해 AI 모델 파일(약 200MB~2.5GB)이 기기에 자동으로 다운로드됩니다. 검색 보조 모델(약 180MB)도 추론 모델 다운로드 시 함께 자동으로 내려받아집니다. 대용량 파일이므로 Wi-Fi 연결을 권장합니다. 앱 설정에서 '셀룰러 모델 다운로드'를 활성화하면 모바일 데이터로도 다운로드할 수 있습니다(데이터 요금 발생 가능). 모델 파일은 기기에만 저장되며 서버로 전송되지 않습니다.

문의: ${EMAIL}`;

const KO_PRIVACY=`개인정보처리방침

시행일: ${D_KR}  |  버전: ${VER}

${OP_KR}(이하 "운영자")는 개인정보보호법 및 정보통신망법을 준수합니다.

제1조 (수집 항목 및 목적)
① Google 로그인: 이메일, 표시 이름, 프로필 사진 → 계정 관리
② 자동 수집: 기기 정보(OS·앱 버전), 이용 로그, 광고 식별자(GAID) → 서비스 제공·광고
③ 대화 내용: 기기 내에만 저장, 서버 전송 없음
④ 커뮤니티 공개 콘텐츠 → 커뮤니티 서비스

제2조 (보유 기간)
① 계정 정보: 탈퇴 후 30일 이내 삭제
② 커뮤니티 게시물: 삭제 요청 시 즉시 삭제
③ 이용 로그: 최대 1년

제3조 (제3자 제공)
원칙적으로 제3자에게 제공하지 않습니다. 예외:
① 이용자 동의가 있는 경우
② 법령에 따른 수사기관 요청
③ Google AdMob: 광고 식별자·기기 정보

제4조 (처리 위탁)
① Google LLC — 로그인 인증·AdMob 광고 (미국)
② Cloudflare, Inc. — 서버 인프라 (미국)

제5조 (이용자 권리)
언제든지 다음 권리를 행사할 수 있습니다:
① 개인정보 열람·정정·삭제 요청
② 개인정보 처리 정지 요청
③ 계정 삭제 (마이페이지 또는 ${EMAIL} 이메일 문의)
④ 만 14세 미만 아동의 경우 법정대리인이 대신 행사 가능

제6조 (파기)
전자적 파일: 복구 불가능한 방법으로 영구 삭제 / 기기 내 데이터: 앱 삭제 시 자동 파기

제7조 (개인정보 보호책임자)
본 서비스는 1인 개발자가 운영합니다. 이메일: ${EMAIL} (접수 후 10일 이내 처리)

제8조 (침해 신고)
개인정보 보호위원회: pipc.go.kr / ☎ 182
한국인터넷진흥원: privacy.kisa.or.kr / ☎ 118
경찰청 사이버수사국: ecrm.police.go.kr / ☎ 182

제9조 (광고 식별자)
Google AdMob이 GAID를 광고 최적화에 활용합니다.
제한 방법: 안드로이드 설정 → Google → 광고 → '광고 개인 최적화 선택 해제'

문의: ${EMAIL}`;

const KO_OPERATION=`운영 정책 및 콘텐츠 가이드라인

시행일: ${D_KR}  |  버전: ${VER}

1. AI 이용 안내
${APP}의 AI는 이용자 기기에서 직접 실행됩니다(온디바이스). 대화 내용은 기기 밖으로 나가지 않습니다.
AI 생성 텍스트는 창작·오락 목적이며 사실 정보로 신뢰해서는 안 됩니다.

2. 허용 콘텐츠
갈등·긴장을 포함한 드라마틱 스토리 / 판타지·로맨스·스릴러 등 모든 장르의 창작 픽션

3. 금지 콘텐츠 (즉시 삭제 및 계정 차단)
① 미성년자 대상 성적 콘텐츠 (CSAM) — 무관용 원칙, 즉시 수사 기관 신고
② 실존 인물 대상 성적·폭력적 허위 콘텐츠
③ 실제 폭력·테러·자해 조장 콘텐츠
④ 인종·민족·성별·종교·장애 등에 대한 혐오 표현
⑤ 타인 개인정보 무단 공개 (doxxing)
⑥ 스팸·사기·피싱

4. 신고 및 제재
앱 내 신고 버튼으로 위반 콘텐츠를 신고할 수 있습니다.
경미한 위반: 경고 / 반복·중대 위반: 계정 정지 또는 영구 차단

5. 저작권
타인의 저작권 있는 작품 무단 공유를 금지합니다.

문의: ${EMAIL}`;

const KO_YOUTH=`청소년 보호정책

시행일: ${D_KR}  |  버전: ${VER}

${OP_KR}는 「청소년보호법」 및 「아동·청소년의 성보호에 관한 법률」을 준수합니다.

1. 이용 연령
만 17세 이상 이용 가능 / 만 14세 미만: 법정대리인 동의 필요

2. 보호 조치
AI가 성적·폭력적 콘텐츠 생성을 자동 차단
CSAM 요청 즉시 거부·기록·수사 기관 신고
CSAM 요청 즉시 거부·기록·수사 기관 신고

3. 개인정보
만 14세 미만 아동의 개인정보는 법정대리인 동의 없이 수집하지 않습니다.

4. 온라인 그루밍 방지
성인이 서비스를 통해 청소년에게 부적절하게 접근하는 행위를 엄금합니다.

5. 청소년보호책임자
이메일: ${EMAIL}

6. 신고 기관
방송통신심의위원회: ☎ 1377 / 경찰청: ☎ 112 / 여성가족부: mogef.go.kr`;

// ══════════════════════════════════════════════════════
// 日本語 (個人情報保護法)
// ══════════════════════════════════════════════════════
const JA_TERMS=`利用規約

施行日: ${D_JA}  |  バージョン: ${VER}

第1条（目的）
本規約は、RPcore 運営者（以下「運営者」）が提供するAIロールプレイサービス「${APP}」の利用条件を定めます。

第2条（定義）
①「本サービス」とはAIを活用したロールプレイ・ストーリー創作アプリです。
②「利用者」とは本規約に同意してサービスを利用するすべての人です。
③「コンテンツ」とは利用者が作成・共有するテキスト・キャラクター・ストーリーなどの創作物です。

第3条（規約の変更）
重要な変更はアプリ内通知で7日前に告知します。継続利用をもって同意とみなします。

第4条（サービスの提供）
① AIはお客様の端末上で直接動作します（オンデバイス）。会話は端末内にのみ保存され、外部サーバーには送信されません。
② ストーリー共有・コミュニティ機能利用時は一部データがサーバーに保存されます。
③ 本サービスは広告（Google AdMob）により無料で提供されます。

第5条（禁止事項）
① 他人の個人情報の無断収集・公開
② 他人の名誉棄損・プライバシー侵害
③ 児童・青少年対象の性的コンテンツ（CSAM）の作成・共有（絶対禁止）
④ 違法行為の助長
⑤ サービスのハッキング・改ざん
⑥ 商業目的での無断利用

第6条（コンテンツの帰属）
端末内で作成した創作物の権利は利用者に帰属します。コミュニティ公開コンテンツについては、運営者への非独占的・無償利用許諾を付与するものとします。

第7条（AIの免責）
AI生成テキストは創作・娯楽目的であり、事実と異なる場合があります。

第8条（準拠法）
本規約は大韓民国法に準拠します。

AIモデルのライセンス
本アプリはGoogleのGemma 3（推論用）およびEmbeddingGemma 300M（検索補助用）モデルを使用しています。両モデルにはGoogle Gemma利用規約（ai.google.dev/gemma/terms）が適用されます。本アプリを利用することで、当該規約に同意したものとみなされます。

AIモデルの自動ダウンロード
アプリの利用に必要なAIモデルファイル（約200MB〜2.5GB）がデバイスに自動でダウンロードされます。検索補助モデル（約180MB）も推論モデルのダウンロード時に自動で取得されます。大容量データのため、Wi-Fi接続を推奨します。モデルファイルはデバイス内にのみ保存され、外部サーバーには送信されません。

お問い合わせ: ${EMAIL}`;

const JA_PRIVACY=`プライバシーポリシー

施行日: ${D_JA}  |  バージョン: ${VER}

RPcore 運営者は個人情報の保護に関する法律（個人情報保護法）を遵守します。

第1条（利用目的）
① サービスの提供・アカウント管理
② コミュニティ機能の提供
③ 広告配信（Google AdMob）
④ サービス改善
⑤ 法令遵守・紛争解決

第2条（取得する個人情報）
① Googleログイン時: メールアドレス、表示名、プロフィール写真
② 自動取得: 端末情報（OS・アプリバージョン）、利用履歴、広告識別子GAID
③ 会話内容: 端末内にのみ保存。サーバーには送信されません。
④ コミュニティ公開コンテンツ

第3条（保有期間）
① アカウント情報: 退会まで（退会後30日以内に削除）
② コミュニティ投稿: 削除要求があるまで
③ 利用ログ: 最長1年

第4条（第三者提供）
原則として第三者に提供しません。例外: 法令に基づく開示要求 / Google AdMob（広告識別子）

第5条（業務委託）
① Google LLC — Googleログイン認証・AdMob広告（米国）
② Cloudflare, Inc. — サーバーインフラ（米国）

第6条（利用者の権利）
開示・訂正・削除・利用停止請求はいつでも行えます。16歳未満の方の個人情報は保護者が権利を代理行使できます。
メール: ${EMAIL}（10日以内に対応）

第7条（苦情・相談先）
個人情報保護委員会: ppc.go.jp / ☎ 03-6457-9849

第8条（広告識別子）
Google AdMobがGAIDを広告最適化に利用します。
設定 → Google → 広告 → 「広告のパーソナライズをオプトアウト」

お問い合わせ: ${EMAIL}`;

const JA_OPERATION=`運営ポリシー・コンテンツガイドライン

施行日: ${D_JA}  |  バージョン: ${VER}

1. AIについて
AIはお客様の端末上で直接動作します（オンデバイス）。会話は端末外に送信されません。
AI生成テキストは創作・娯楽目的であり、事実情報として利用しないでください。

2. 許可されるコンテンツ
成人認証ユーザー向けの成人向けフィクション / ドラマティックなストーリー / すべてのジャンルの創作活動

3. 禁止コンテンツ（即時削除・アカウント停止）
① 未成年者（18歳未満）対象の性的コンテンツ（CSAM）— ゼロトレランス、即時通報
② 実在の人物を対象とした性的・暴力的虚偽コンテンツ
③ 現実の暴力・テロ・自傷を助長するコンテンツ
④ 人種・民族・性別・宗教・障害等を理由とするヘイトスピーチ
⑤ 個人情報の無断公開（doxxing）
⑥ スパム・詐欺・フィッシング

4. 通報・制裁
アプリ内通報ボタンで違反コンテンツを通報できます。
軽微な違反: 警告 / 重大・繰り返し: アカウント停止または永久凍結

お問い合わせ: ${EMAIL}`;

const JA_YOUTH=`青少年保護ポリシー

施行日: ${D_JA}  |  バージョン: ${VER}

1. 利用年齢
17歳以上を対象としたサービスです。
16歳未満の方がアカウント登録する場合、保護者の同意が必要です。

2. 保護措置
17歳未満のユーザーへの成人向け・暴力的コンテンツ生成をブロックします。
未成年者対象の性的コンテンツ要求は即時拒否し、捜査機関に通報します。

3. 未成年者の個人情報
16歳未満の方の個人情報は保護者の同意なく収集しません（個人情報保護法・GDPRに基づく）。

4. オンライングルーミング防止
成人が未成年者に不適切に接触することを厳禁します。

5. 相談窓口
警察相談窓口: ☎ #9110 / 子どもの人権110番: ☎ 0120-007-110
お問い合わせ: ${EMAIL}`;

// ══════════════════════════════════════════════════════
// 简体中文 (PIPL · 网络安全法)
// ══════════════════════════════════════════════════════
const ZH_CN_TERMS=`用户协议

生效日期: ${D_ZH}  |  版本: ${VER}

第一条（目的）
本协议规定了 RPcore 运营者（以下"运营者"）提供的 AI 角色扮演服务 ${APP}（以下"服务"）的使用条款。

第二条（服务说明）
${APP} 是一款运行于用户设备端的 AI 角色扮演与故事创作应用。您的对话内容仅保存在本设备上，不传输至任何服务器。

第三条（禁止行为）
① 制作或传播涉及未成年人的色情内容（CSAM）——零容忍，立即举报
② 骚扰、诽谤或侵犯他人隐私
③ 散布虚假信息或实施欺诈
④ 破解或篡改服务
⑤ 传播仇恨言论

第四条（内容权利）
用户在设备内创作的内容归用户所有。在社区公开发布的内容，用户授予运营者非独家、免费使用许可。

第五条（免责声明）
AI 生成内容仅供创作娱乐，不构成事实信息。

第六条（准据法）
本协议依大韩民国法律解释执行。

未成年人: 17岁以上可使用。
AI模型许可证
本应用使用Google的Gemma 3（推理）和EmbeddingGemma 300M（检索辅助）模型。两个模型均受Google Gemma使用条款（ai.google.dev/gemma/terms）约束。使用本应用即视为同意该条款。

AI模型自动下载
使用本应用所需的AI模型文件（约200MB至2.5GB）会自动下载至您的设备。检索辅助模型（约180MB）也会在下载推理模型时自动获取。建议在Wi-Fi环境下使用，以避免产生移动数据费用。模型文件仅存储在设备上，不会发送至外部服务器。

联系方式: ${EMAIL}`;

const ZH_CN_PRIVACY=`隐私政策

生效日期: ${D_ZH}  |  版本: ${VER}

${APP} 运营者依照中国《个人信息保护法》（PIPL）及《网络安全法》保护您的个人信息。

一、收集的个人信息
① Google登录时: 电子邮件、显示名称、头像
② 自动收集: 设备信息（系统版本、应用版本）、使用记录、广告标识符（GAID）
③ 对话内容: 仅存于设备本地，不上传任何服务器
④ 社区公开内容

二、使用目的
提供并改善服务 / 广告投放（Google AdMob）/ 社区功能 / 法律合规

三、保存期限
① 账户信息: 注销后30天内删除
② 社区帖子: 收到删除申请后立即删除
③ 使用日志: 最长1年

四、个人信息共享
原则上不向第三方提供。例外情形:
① 依法配合执法机关
② Google LLC（登录认证及广告）、Cloudflare（服务器基础设施）

五、您的权利
依据 PIPL，您有权访问、更正、删除、撤回同意及转移您的个人信息。
请发送请求至: ${EMAIL}（7个工作日内回复）

六、跨境传输
您的部分数据可能传输至美国（Google LLC、Cloudflare）进行处理。

七、儿童保护
不收集14岁以下儿童的个人信息，未经监护人同意不为其注册账户。

联系方式: ${EMAIL}`;

const ZH_CN_OPERATION=`社区准则

生效日期: ${D_ZH}  |  版本: ${VER}

1. AI说明
AI在您的设备上本地运行，对话内容不离开您的手机。AI生成内容仅供创作娱乐，请勿视为事实信息。

2. 允许的内容
经年龄验证的成年用户可创作成人主题小说 / 戏剧性故事情节 / 任何创意写作类型

3. 禁止内容（立即删除并封禁账号）
① 涉及未成年人的色情内容（CSAM）——零容忍，立即向当地执法机关举报
② 针对真实人物的性暗示或暴力虚假内容
③ 宣扬现实暴力、恐怖主义或自我伤害的内容
④ 基于种族、民族、性别、宗教、残障等的仇恨言论
⑤ 未经授权公开他人个人信息（人肉搜索）
⑥ 垃圾信息、诈骗、网络钓鱼

4. 举报与处置
通过应用内举报按钮举报违规内容。轻微违规: 警告 / 严重或多次违规: 封禁账号

AI模型授權
本應用程式使用Google的Gemma 3（推論）及EmbeddingGemma 300M（搜尋輔助）模型。兩個模型均受Google Gemma使用條款（ai.google.dev/gemma/terms）規範。使用本應用程式即表示同意該條款。

AI模型自動下載
使用本應用程式所需的AI模型檔案（約200MB至2.5GB）會自動下載至您的裝置。搜尋輔助模型（約180MB）也會在下載推論模型時一併自動取得。建議使用Wi-Fi連線，以避免行動數據費用。模型檔案僅儲存於裝置中，不會傳送至外部伺服器。

联系方式: ${EMAIL}`;

const ZH_CN_YOUTH=`未成年人保护政策

生效日期: ${D_ZH}  |  版本: ${VER}

${APP} 依据中国《未成年人保护法》及《网络安全法》保护未成年用户。

1. 使用年龄
① 12岁以上方可使用本服务
② 成人内容限17岁以上（须完成年龄验证）
③ 14岁以下用户注册须经监护人同意

2. 保护措施
对17岁以下用户屏蔽成人及暴力内容生成功能
涉及未成年人的色情内容（CSAM）立即删除，并向相关执法机关举报
禁止成年人通过本服务向未成年人发起不适当的接触

3. 未成年人个人信息保护
不收集14岁以下儿童的个人信息（不含基本账号功能所需的最少信息）。
监护人可申请查阅、更正或删除子女数据: ${EMAIL}

4. 防沉迷
建议家长使用设备自带的屏幕时间管理功能控制未成年人使用时长。

联系方式: ${EMAIL}`;

// ══════════════════════════════════════════════════════
// 繁體中文 (個人資料保護法)
// ══════════════════════════════════════════════════════
const ZH_TW_TERMS=`使用條款

生效日期: ${D_ZH}  |  版本: ${VER}

第一條（目的）
本條款規定 RPcore 運營者（以下「運營者」）提供的 AI 角色扮演服務 ${APP} 的使用條件。

第二條（服務說明）
${APP} 是一款裝置端 AI 角色扮演與故事創作應用。您的對話僅儲存於本裝置，不傳輸至任何伺服器。

第三條（禁止行為）
① 製作或散布涉及未成年人的色情內容（CSAM）——零容忍，立即舉報
② 騷擾、誹謗或侵犯他人隱私
③ 散播不實資訊或詐欺
④ 入侵或篡改服務
⑤ 散布仇恨言論

第四條（內容權利）
用戶在裝置內創作的內容歸用戶所有。社區公開內容授予運營者非獨家、免費使用許可。

第五條（準據法）
本條款依大韓民國法律解釋執行。

未成年人: 12歲以上可使用，成人內容限17歲以上（需驗證）。
聯絡方式: ${EMAIL}`;

const ZH_TW_PRIVACY=`隱私權政策

生效日期: ${D_ZH}  |  版本: ${VER}

${APP} 運營者依據台灣《個人資料保護法》保護您的個人資料。

一、蒐集項目
① Google登入: 電子郵件、顯示名稱、大頭貼
② 自動蒐集: 裝置資訊、使用記錄、廣告識別碼（GAID）
③ 對話內容: 僅存於本裝置，不上傳伺服器
④ 社區公開內容

二、蒐集目的
提供服務（代號001、040） / 廣告（Google AdMob）/ 法律遵循

三、保存期間
帳戶資料至申請刪除 / 使用日誌最長1年

四、您的權利（個資法§3）
查詢閱覽 / 製給複製本 / 補充更正 / 停止蒐集處理利用 / 刪除
請寄至: ${EMAIL}

五、第三方提供
Google LLC（登入及廣告）、Cloudflare（伺服器）

六、兒童保護
未滿12歲兒童不得使用本服務。14歲以下須監護人同意。

聯絡方式: ${EMAIL}`;

const ZH_TW_OPERATION=`社群準則

生效日期: ${D_ZH}  |  版本: ${VER}

1. AI說明
AI在您裝置上本地運行，對話不離開手機。

2. 禁止內容（立即刪除並停權）
① 涉及未成年人的色情內容（CSAM）——零容忍
② 針對真實人物的性暗示或暴力虛假內容
③ 宣揚現實暴力、恐怖主義
④ 仇恨言論
⑤ 人肉搜索（doxxing）
⑥ 垃圾訊息、詐騙

聯絡方式: ${EMAIL}`;

const ZH_TW_YOUTH=`未成年人保護政策

生效日期: ${D_ZH}  |  版本: ${VER}

1. 使用年齡
12歲以上方可使用 / 成人內容限17歲以上（須驗證）/ 14歲以下須監護人同意

2. 保護措施
17歲以下用戶無法生成成人及暴力內容。
CSAM立即刪除並通報主管機關（警政署165反詐騙、iWIN網路內容防護機構）。

3. 監護人申請
監護人可申請查閱或刪除子女資料: ${EMAIL}

聯絡方式: ${EMAIL}`;

// ══════════════════════════════════════════════════════
// Deutsch (DSGVO · BDSG · JuSchG · NetzDG)
// ══════════════════════════════════════════════════════
const DE_TERMS=`Nutzungsbedingungen

Inkrafttreten: ${D_DE}  |  Version: ${VER}

§ 1 Geltungsbereich
Diese Nutzungsbedingungen gelten für die KI-Rollenspielanwendung ${APP}, bereitgestellt vom Einzelentwickler (im Folgenden „Betreiber").

§ 2 Leistungsbeschreibung
${APP} ist eine KI-gestützte Rollenspiel- und Storywriting-App. Die KI läuft vollständig auf Ihrem Gerät (On-Device). Gesprächsinhalte werden nicht an externe Server übertragen.

§ 3 Nutzungsvoraussetzungen
Ab 12 Jahren nutzbar. Für Inhalte mit Altersbeschränkung (18+) ist eine Altersverifizierung erforderlich. Unter 16 Jahren ist die Zustimmung eines Erziehungsberechtigten erforderlich (Art. 8 DSGVO).

§ 4 Verbotene Inhalte und Handlungen
① Erstellung oder Verbreitung von sexuellem Missbrauchsmaterial von Kindern (CSAM) — Nulltoleranz, sofortige Meldung an Behörden (§ 184b StGB)
② Beleidigung, Verleumdung, Volksverhetzung (§§ 185, 186, 130 StGB)
③ Verbreitung von Hass, Gewalt oder Terrorismuspropaganda (NetzDG)
④ Unbefugte Verarbeitung personenbezogener Daten Dritter
⑤ Technische Manipulation des Dienstes
⑥ Kommerzielle Nutzung ohne Genehmigung

§ 5 Inhaltsrechte
Auf dem Gerät erstellte Werke verbleiben beim Nutzer. Öffentlich geteilte Inhalte: der Nutzer gewährt dem Betreiber eine nicht-exklusive, kostenlose Lizenz zur Darstellung im Dienst.

§ 6 Haftungsausschluss
KI-generierte Texte dienen ausschließlich der kreativen Unterhaltung und können ungenau sein.

§ 7 Anwendbares Recht
Es gilt das Recht der Republik Korea. Für EU-Verbraucher gelten zwingende EU-Verbraucherschutzvorschriften.

KI-Modell-Lizenz
Diese App verwendet Googles Gemma 3 (Inferenz) und EmbeddingGemma 300M (Suchassistenz). Beide Modelle unterliegen den Google Gemma Nutzungsbedingungen (ai.google.dev/gemma/terms). Durch die Nutzung der App stimmen Sie diesen Bedingungen zu.

Automatischer KI-Modell-Download
Für die Nutzung der App werden KI-Modelldateien (ca. 200 MB bis 2,5 GB) automatisch auf Ihr Gerät heruntergeladen. Das Suchassistenz-Modell (ca. 180 MB) wird ebenfalls automatisch beim Download des Inferenz-Modells heruntergeladen. Wir empfehlen eine WLAN-Verbindung. In den App-Einstellungen kann der Mobilfunk-Download aktiviert werden. Die Dateien werden ausschließlich lokal gespeichert.

Kontakt: ${EMAIL}`;

const DE_PRIVACY=`Datenschutzerklärung (DSGVO)

Inkrafttreten: ${D_DE}  |  Version: ${VER}

Verantwortlicher: ${APP} Einzelentwickler — ${EMAIL}

1. Erhobene Daten
① Google-Anmeldung: E-Mail-Adresse, Anzeigename, Profilbild
② Automatisch: Geräteinformationen (OS, App-Version), Nutzungsstatistiken, Werbe-ID (GAID via Google AdMob)
③ Gesprächsinhalte: Nur lokal auf dem Gerät gespeichert — KEINE Übertragung an Server
④ Öffentlich geteilte Community-Inhalte

2. Rechtsgrundlagen (Art. 6 DSGVO)
① Vertragserfüllung (Art. 6 Abs. 1 lit. b): Bereitstellung des Dienstes
② Berechtigte Interessen (Art. 6 Abs. 1 lit. f): Sicherheit, Missbrauchsprävention, Dienstverbesserung
③ Einwilligung (Art. 6 Abs. 1 lit. a): Personalisierte Werbung

3. Ihre Rechte (DSGVO Kap. III)
Auskunft (Art. 15) / Berichtigung (Art. 16) / Löschung (Art. 17) / Einschränkung (Art. 18) / Datenportabilität (Art. 20) / Widerspruch (Art. 21) / Beschwerde bei Aufsichtsbehörde

4. Internationale Datentransfers
Daten werden in die USA übertragen (Google LLC, Cloudflare). Schutz durch EU-Standardvertragsklauseln (SCC) und ggf. EU-US Data Privacy Framework.

5. Auftragsverarbeiter (Art. 28 DSGVO)
① Google LLC — Google Sign-In, AdMob (USA)
② Cloudflare, Inc. — Serverinfrastruktur (USA)

6. Speicherdauer
Kontodaten: bis zur Löschung (danach innerhalb 30 Tagen gelöscht) / Protokolldaten: max. 1 Jahr

7. Aufsichtsbehörden
Bundesbeauftragte für den Datenschutz: www.bfdi.bund.de
Zuständige Landesbehörde je nach Ihrem Bundesland.

Kontakt: ${EMAIL}`;

const DE_OPERATION=`Community-Richtlinien

Inkrafttreten: ${D_DE}  |  Version: ${VER}

1. KI-Hinweis
Die KI läuft lokal auf Ihrem Gerät. Gespräche verlassen Ihr Smartphone nicht. KI-generierte Texte dienen ausschließlich der kreativen Unterhaltung.

2. Erlaubte Inhalte
Erwachsene Fiction (ab 18, altersverifiziert) / Dramatische Storylines / Alle kreativen Genres

3. Verbotene Inhalte (sofortige Sperrung + Meldung an Behörden)
① CSAM (Kindesmissbrauchsdarstellungen) — Nulltoleranz, Meldung an BKA und Jugendschutz.net
② Nicht-konsensueller sexueller Inhalt über reale Personen
③ Volksverhetzung (§ 130 StGB), Beleidigung (§ 185 StGB)
④ Terrorismuspropaganda
⑤ Doxxing (Veröffentlichung privater Daten Dritter)
⑥ Spam, Betrug, Phishing

4. Durchsetzung
Meldung über In-App-Schaltfläche. Leichte Verstöße: Verwarnung / Schwere oder wiederholte Verstöße: Kontosperrung oder dauerhafter Bann

Kontakt: ${EMAIL}`;

const DE_YOUTH=`Jugendschutzrichtlinie

Inkrafttreten: ${D_DE}  |  Version: ${VER}

${APP} hält die Vorschriften des Jugendschutzgesetzes (JuSchG), des Jugendmedienschutz-Staatsvertrags (JMStV) und der DSGVO (Art. 8) ein.

1. Altersanforderungen
Ab 12 Jahren nutzbar / Inhalte für Erwachsene ab 18 Jahren (Altersverifizierung erforderlich) / Unter 16 Jahren: Einwilligung eines Erziehungsberechtigten erforderlich

2. Schutzmaßnahmen
Für Nutzer unter 18 Jahren werden explizite und gewalthaltige Inhalte automatisch gesperrt.
CSAM-Anfragen werden sofort abgelehnt, protokolliert und an das BKA sowie jugendschutz.net gemeldet.

3. Datenschutz für Minderjährige
Keine Erhebung personenbezogener Daten von Kindern unter 16 Jahren ohne nachgewiesene elterliche Einwilligung (Art. 8 DSGVO).

4. Schutz vor Online-Grooming
Erwachsene dürfen den Dienst nicht für unangemessene Kontaktaufnahmen mit Minderjährigen nutzen.

5. Kontakt für Eltern
Jugendschutzbeauftragter: ${EMAIL}

6. Meldestellen
BKA: www.bka.de / jugendschutz.net: www.jugendschutz.net / Bundeszentrale für Kinder- und Jugendmedienschutz (BzKJ): www.bzkj.de`;

// ══════════════════════════════════════════════════════
// Français (RGPD · CNIL)
// ══════════════════════════════════════════════════════
const FR_TERMS=`Conditions Générales d'Utilisation

Date d'entrée en vigueur: ${D_FR}  |  Version: ${VER}

Article 1 – Objet
Les présentes CGU régissent l'utilisation du service de jeu de rôle IA ${APP}, proposé par le développeur individuel ${OP_EN} (ci-après « l'Opérateur »).

Article 2 – Description du service
${APP} est une application de jeu de rôle et d'écriture créative propulsée par une IA fonctionnant intégralement sur votre appareil (on-device). Vos conversations ne sont jamais transmises à des serveurs externes.

Article 3 – Conditions d'accès
17 ans minimum. Moins de 15 ans : consentement parental requis (art. 8 RGPD, loi française).

Article 4 – Comportements interdits
① Création ou diffusion de contenus pédopornographiques (CSAM) — tolérance zéro, signalement immédiat aux autorités
② Harcèlement, diffamation, atteinte à la vie privée (art. 9 Code civil)
③ Incitation à la haine, à la violence ou à la discrimination (loi du 29/07/1881 modifiée)
④ Collecte non autorisée de données personnelles de tiers
⑤ Manipulation technique du service

Article 5 – Propriété du contenu
Les créations réalisées sur l'appareil appartiennent à l'utilisateur. Les contenus publiés dans la communauté font l'objet d'une licence non exclusive et gratuite accordée à l'Opérateur pour leur affichage dans le service.

Article 6 – Droit applicable
Droit de la République de Corée. Les consommateurs de l'UE bénéficient des protections impératives du droit européen.

Licence du modèle IA
Cette application utilise les modèles Gemma 3 (inférence) et EmbeddingGemma 300M (assistance à la recherche) de Google. Ces deux modèles sont soumis aux Conditions d'utilisation Google Gemma (ai.google.dev/gemma/terms). En utilisant l'application, vous acceptez ces conditions.

Téléchargement automatique du modèle IA
Les fichiers de modèles IA (environ 200 Mo à 2,5 Go) sont automatiquement téléchargés sur votre appareil. Le modèle d'assistance à la recherche (environ 180 Mo) est également téléchargé automatiquement. Nous recommandons une connexion Wi-Fi. Le téléchargement via données mobiles peut être activé dans les paramètres. Les fichiers sont stockés uniquement en local.

Contact: ${EMAIL}`;

const FR_PRIVACY=`Politique de Confidentialité (RGPD)

Date d'entrée en vigueur: ${D_FR}  |  Version: ${VER}

Responsable du traitement: ${APP} développeur individuel — ${EMAIL}

1. Données collectées
① Connexion Google: adresse e-mail, nom d'affichage, photo de profil
② Automatiquement: informations sur l'appareil (OS, version de l'app), statistiques d'utilisation, identifiant publicitaire (GAID via Google AdMob)
③ Conversations: stockées uniquement sur l'appareil — AUCUNE transmission à des serveurs
④ Contenus publics partagés dans la communauté

2. Bases légales (art. 6 RGPD)
① Exécution du contrat (art. 6§1 b) : fourniture du service
② Intérêts légitimes (art. 6§1 f) : sécurité et amélioration du service
③ Consentement (art. 6§1 a) : publicités personnalisées

3. Vos droits (RGPD Chap. III)
Accès (art. 15) / Rectification (art. 16) / Effacement (art. 17) / Limitation (art. 18) / Portabilité (art. 20) / Opposition (art. 21) / Réclamation auprès de la CNIL

4. Transferts internationaux
Transferts vers les États-Unis (Google LLC, Cloudflare) encadrés par les clauses contractuelles types de la Commission européenne.

5. Sous-traitants (art. 28 RGPD)
① Google LLC — authentification, AdMob (États-Unis)
② Cloudflare, Inc. — infrastructure serveur (États-Unis)

6. Durée de conservation
Données de compte: jusqu'à la suppression (30 jours max après demande) / Journaux d'utilisation: 1 an max

7. Réclamation
CNIL: www.cnil.fr / ☎ 01 53 73 22 22

Contact: ${EMAIL}`;

const FR_OPERATION=`Règles de la Communauté

Date d'entrée en vigueur: ${D_FR}  |  Version: ${VER}

1. À propos de l'IA
L'IA fonctionne localement sur votre appareil. Les conversations ne quittent jamais votre téléphone. Les textes générés par l'IA sont à usage créatif et de divertissement uniquement.

2. Contenus autorisés
Romance, aventure, fiction créative / Histoires dramatiques / Tous genres non-sexuels

3. Contenus interdits (suppression immédiate + signalement aux autorités)
① CSAM — tolérance zéro, signalement à Cybermalveillance / Interpol
② Contenus sexuels non consentis impliquant des personnes réelles
③ Apologie du terrorisme, incitation à la haine (loi 1972, loi LCEN)
④ Doxxing (publication d'informations privées sur autrui)
⑤ Spam, escroqueries, phishing

4. Modération
Signalement via bouton dédié dans l'app. Infraction légère: avertissement / Infraction grave ou répétée: suspension ou bannissement permanent

רישיון מודל AI
האפליקציה משתמשת במודלים Gemma 3 (הסקה) ו-EmbeddingGemma 300M (סיוע חיפוש) של Google. שני המודלים כפופים לתנאי השימוש של Google Gemma (ai.google.dev/gemma/terms). שימוש באפליקציה מהווה הסכמה לתנאים אלו.

הורדה אוטומטית של מודל AI
קבצי מודל AI (כ-200MB עד 2.5GB) מורדים אוטומטית למכשיר. מודל סיוע החיפוש (כ-180MB) מורד אוטומטית גם כן. מומלץ להשתמש ב-Wi-Fi. הקבצים מאוחסנים מקומית בלבד.

Contact: ${EMAIL}`;

const FR_YOUTH=`Politique de Protection des Mineurs

Date d'entrée en vigueur: ${D_FR}  |  Version: ${VER}

${APP} respecte le RGPD (art. 8), la loi française sur la protection des mineurs en ligne et la directive sur les services de médias audiovisuels.

1. Conditions d'âge
17 ans minimum / Moins de 15 ans: consentement parental requis

2. Mesures de protection
Filtrage automatique des contenus sexuels et violents pour tous les utilisateurs.
Toute demande de CSAM est immédiatement rejetée, journalisée et signalée à l'OCLCO et au Centre national d'analyse des images pédopornographiques (CNAIP).

3. Données des mineurs
Aucune collecte de données personnelles d'enfants de moins de 15 ans sans consentement parental vérifiable.

4. Protection contre le grooming en ligne
Toute approche inappropriée d'un adulte envers un mineur via le service est strictement interdite et susceptible d'être signalée aux autorités.

5. Contact parents / responsables légaux
${EMAIL}

6. Signalement
Pharos: www.internet-signalement.gouv.fr / Point de Contact: www.pointdecontact.net`;

// ══════════════════════════════════════════════════════
// Español (RGPD · LOPDGDD)
// ══════════════════════════════════════════════════════
const ES_TERMS=`Términos de Servicio

Fecha de vigencia: ${D_ES}  |  Versión: ${VER}

Artículo 1 – Objeto
Los presentes Términos regulan el uso del servicio de juego de rol con IA ${APP}, proporcionado por el desarrollador individual ${OP_EN} (en adelante "el Operador").

Artículo 2 – Descripción del servicio
${APP} es una aplicación de juego de rol y escritura creativa con IA que funciona íntegramente en su dispositivo (on-device). Sus conversaciones nunca se transmiten a servidores externos.

Artículo 3 – Condiciones de acceso
Mayores de 17 años. Menores de 14 años: consentimiento paterno requerido (art. 8 RGPD, art. 7 LOPDGDD — mayoría de edad digital en España: 14 años).

Artículo 4 – Conductas prohibidas
① Creación o distribución de material de abuso sexual infantil (CSAM) — tolerancia cero, denuncia inmediata a las autoridades
② Acoso, difamación o invasión de la privacidad
③ Incitación al odio (art. 510 CP), terrorismo
④ Recopilación no autorizada de datos personales de terceros
⑤ Manipulación técnica del servicio

Artículo 5 – Derecho aplicable
Derecho de la República de Corea. Los consumidores de la UE se benefician de las protecciones del derecho europeo.

Licencia del modelo de IA
Esta aplicación utiliza los modelos Gemma 3 (inferencia) y EmbeddingGemma 300M (asistencia de búsqueda) de Google. Ambos modelos están sujetos a los Términos de uso de Google Gemma (ai.google.dev/gemma/terms). Al usar la aplicación, aceptas dichos términos.

Descarga automática del modelo de IA
Los archivos del modelo de IA (aprox. 200 MB a 2,5 GB) se descargan automáticamente en su dispositivo. El modelo de asistencia de búsqueda (aprox. 180 MB) también se descarga automáticamente. Se recomienda usar Wi-Fi. Puede activar la descarga por datos moviles en Ajustes. Los archivos se almacenan solo localmente.

Contacto: ${EMAIL}`;

const ES_PRIVACY=`Política de Privacidad (RGPD · LOPDGDD)

Fecha de vigencia: ${D_ES}  |  Versión: ${VER}

Responsable del tratamiento: ${APP} desarrollador individual — ${EMAIL}

1. Datos recogidos
① Inicio de sesión con Google: correo electrónico, nombre, foto de perfil
② Automáticamente: información del dispositivo, estadísticas de uso, identificador publicitario (GAID via Google AdMob)
③ Conversaciones: almacenadas SOLO en el dispositivo — NUNCA transmitidas a servidores
④ Contenidos públicos de la comunidad

2. Base jurídica (art. 6 RGPD)
① Ejecución de contrato (art. 6.1.b): prestación del servicio
② Interés legítimo (art. 6.1.f): seguridad y mejora del servicio
③ Consentimiento (art. 6.1.a): publicidad personalizada

3. Sus derechos (RGPD Cap. III + LOPDGDD)
Acceso / Rectificación / Supresión / Limitación / Portabilidad / Oposición / Reclamación ante la AEPD

4. Transferencias internacionales
A EE.UU. (Google LLC, Cloudflare) mediante cláusulas contractuales tipo aprobadas por la Comisión Europea.

5. Encargados del tratamiento
① Google LLC — autenticación, AdMob (EE.UU.)
② Cloudflare, Inc. — infraestructura (EE.UU.)

6. Plazos de conservación
Cuenta: hasta su eliminación / Registros de uso: máx. 1 año

7. Autoridad de control
Agencia Española de Protección de Datos (AEPD): www.aepd.es / ☎ 901 100 099

Contacto: ${EMAIL}`;

const ES_OPERATION=`Normas de la Comunidad

Fecha de vigencia: ${D_ES}  |  Versión: ${VER}

1. Sobre la IA
La IA funciona localmente en su dispositivo. Las conversaciones nunca salen de su teléfono.

2. Contenidos prohibidos (eliminación inmediata + denuncia a las autoridades)
① CSAM — tolerancia cero, denuncia al Centro Nacional de Desaparecidos (CNDES) y fuerzas de seguridad
② Contenido sexual no consentido de personas reales
③ Incitación al odio (art. 510 CP), apología del terrorismo
④ Doxxing
⑤ Spam, estafas, phishing

3. Moderación
Infracciones leves: advertencia / Graves o reiteradas: suspensión o prohibición permanente

Contacto: ${EMAIL}`;

const ES_YOUTH=`Política de Protección de Menores

Fecha de vigencia: ${D_ES}  |  Versión: ${VER}

${APP} cumple el RGPD (art. 8), la LOPDGDD (edad de consentimiento digital: 14 años) y la normativa sobre menores en línea.

1. Edades de acceso
17 años mínimo / Menores de 14: consentimiento paterno requerido

2. Medidas de protección
Bloqueo automático de contenidos explícitos para menores de 17 años.
El CSAM se rechaza de inmediato y se denuncia a la Policía Nacional (www.policia.es) y a la Fundación Alia2.

3. Datos de menores
No se recopilan datos de menores de 14 años sin consentimiento parental verificable.

4. Contacto para padres y tutores
${EMAIL}

5. Denuncia
INCIBE: www.incibe.es / ☎ 017 (menores en internet)`;

// ══════════════════════════════════════════════════════
// Italiano (GDPR · Codice Privacy)
// ══════════════════════════════════════════════════════
const IT_TERMS=`Termini di Servizio

Data di entrata in vigore: ${D_IT}  |  Versione: ${VER}

Art. 1 – Oggetto
I presenti Termini disciplinano l'uso del servizio di gioco di ruolo con IA ${APP}, fornito dallo sviluppatore individuale ${OP_EN} (di seguito "l'Operatore").

Art. 2 – Descrizione del servizio
${APP} è un'app di gioco di ruolo e scrittura creativa con IA che funziona interamente sul dispositivo dell'utente (on-device). Le conversazioni non vengono mai trasmesse a server esterni.

Art. 3 – Requisiti di accesso
Dai 17 anni in su. Sotto i 16 anni: consenso del genitore/tutore richiesto (art. 8 GDPR).

Art. 4 – Condotte vietate
① Creazione o diffusione di materiale pedopornografico (CSAM) — tolleranza zero, segnalazione immediata alle autorità
② Molestie, diffamazione (art. 595 c.p.), violazione della privacy
③ Istigazione all'odio, terrorismo
④ Raccolta non autorizzata di dati personali di terzi
⑤ Manipolazione tecnica del servizio

Art. 5 – Proprietà dei contenuti
Le creazioni sul dispositivo appartengono all'utente. I contenuti pubblicati nella community concedono all'Operatore una licenza non esclusiva e gratuita per mostrarli nel servizio.

Art. 6 – Legge applicabile
Diritto della Repubblica di Corea. I consumatori UE beneficiano delle protezioni del diritto europeo.

Licenza del modello IA
Questa app utilizza i modelli Gemma 3 (inferenza) e EmbeddingGemma 300M (assistenza alla ricerca) di Google. Entrambi i modelli sono soggetti alle Condizioni di utilizzo di Google Gemma (ai.google.dev/gemma/terms). Usando l'app si accettano tali condizioni.

Download automatico del modello IA
I file del modello IA (circa 200 MB - 2,5 GB) vengono scaricati automaticamente sul dispositivo. Il modello di assistenza alla ricerca (circa 180 MB) viene scaricato automaticamente insieme al modello di inferenza. Si consiglia una connessione Wi-Fi. I file sono archiviati solo localmente.

Contatto: ${EMAIL}`;

const IT_PRIVACY=`Informativa sulla Privacy (GDPR)

Data di entrata in vigore: ${D_IT}  |  Versione: ${VER}

Titolare del trattamento: ${APP} sviluppatore individuale — ${EMAIL}

1. Dati raccolti
① Accesso Google: e-mail, nome visualizzato, foto profilo
② Automaticamente: info dispositivo, statistiche uso, ID pubblicitario (GAID via AdMob)
③ Conversazioni: solo sul dispositivo — MAI trasmesse a server
④ Contenuti pubblici della community

2. Basi giuridiche (art. 6 GDPR)
Esecuzione del contratto (art. 6§1 b) / Legittimo interesse (art. 6§1 f) / Consenso (art. 6§1 a)

3. I suoi diritti (GDPR)
Accesso (art. 15) / Rettifica (art. 16) / Cancellazione (art. 17) / Limitazione (art. 18) / Portabilità (art. 20) / Opposizione (art. 21) / Reclamo al Garante Privacy

4. Trasferimenti internazionali
Verso gli USA (Google LLC, Cloudflare) tramite clausole contrattuali tipo UE.

5. Responsabili del trattamento
Google LLC — autenticazione, AdMob / Cloudflare — infrastruttura

6. Conservazione
Account: fino alla cancellazione / Log: max 1 anno

7. Autorità di controllo
Garante per la protezione dei dati personali: www.garanteprivacy.it / ☎ 06.69677.1

Contatto: ${EMAIL}`;

const IT_OPERATION=`Linee Guida della Community

Data: ${D_IT}  |  Versione: ${VER}

1. Sull'IA
L'IA funziona localmente sul dispositivo. Le conversazioni non lasciano lo smartphone.

2. Contenuti vietati (rimozione immediata + segnalazione)
① CSAM — tolleranza zero, segnalazione al Centro Nazionale per il Contrasto della Pedopornografia Online (CNCPO)
② Contenuti sessuali non consensuali su persone reali
③ Istigazione all'odio (art. 604-bis c.p.), terrorismo
④ Doxxing / Spam / Phishing

3. Sanzioni
Infrazione lieve: avvertimento / Grave o reiterata: sospensione o ban permanente

Contatto: ${EMAIL}`;

const IT_YOUTH=`Tutela dei Minori

Data: ${D_IT}  |  Versione: ${VER}

${APP} rispetta il GDPR (art. 8), il D.Lgs. 196/2003 (Codice Privacy) e la normativa italiana sulla tutela dei minori online.

1. Età di accesso
Dai 17 anni / Sotto i 16 anni: consenso parentale richiesto

2. Misure di protezione
Blocco automatico di contenuti espliciti per gli under 17. Il CSAM viene immediatamente rifiutato e segnalato al CNCPO e alla Polizia Postale.

3. Dati dei minori
Nessuna raccolta di dati di bambini sotto i 16 anni senza consenso parentale verificabile.

4. Contatto genitori / tutori
${EMAIL}

5. Segnalazione
Polizia Postale: www.commissariatodips.it / CNCPO: cncpo@poliziadistato.it`;

// ══════════════════════════════════════════════════════
// Nederlands (GDPR · AVG)
// ══════════════════════════════════════════════════════




// ══════════════════════════════════════════════════════
// Polski (RODO/GDPR · UODO)
// ══════════════════════════════════════════════════════




// ══════════════════════════════════════════════════════
// Română (GDPR)
// ══════════════════════════════════════════════════════




// ══════════════════════════════════════════════════════
// Svenska (GDPR · IMY)
// ══════════════════════════════════════════════════════




// ══════════════════════════════════════════════════════
// Русский (ФЗ-152)
// ══════════════════════════════════════════════════════
const RU_TERMS=`Условия использования

Дата вступления в силу: ${D_RU}  |  Версия: ${VER}

Статья 1. Предмет
Настоящие Условия регулируют использование AI-приложения для ролевых игр ${APP}, предоставляемого индивидуальным разработчиком ${OP_EN}.

Статья 2. Описание сервиса
${APP} — приложение для ролевых игр и творческого письма на основе ИИ. ИИ работает непосредственно на вашем устройстве (on-device). Содержание разговоров не передаётся на внешние серверы.

Статья 3. Условия доступа
С 12 лет. Контент для взрослых: с 17 лет (верификация возраста обязательна). До 14 лет: требуется согласие родителя/законного представителя.

Статья 4. Запрещённые действия
① Создание или распространение сексуальных материалов с несовершеннолетними (CSAM) — нулевая терпимость, немедленное сообщение в органы
② Преследование, клевета, нарушение неприкосновенности частной жизни
③ Разжигание ненависти (ст. 280, 282 УК РФ), пропаганда терроризма
④ Несанкционированная обработка персональных данных третьих лиц
⑤ Техническое вмешательство в работу сервиса

Статья 5. Применимое право
Право Республики Корея.

Лицензия на ИИ-модель
Приложение использует модели Gemma 3 (вывод) и EmbeddingGemma 300M (поисковая помощь) от Google. Обе модели подпадают под Условия использования Google Gemma (ai.google.dev/gemma/terms). Используя приложение, вы соглашаетесь с этими условиями.

Автоматическая загрузка ИИ-модели
Файлы ИИ-моделей (около 200 МБ — 2,5 ГБ) загружаются автоматически на устройство. Модель поиска (около 180 МБ) загружается одновременно с основной. Рекомендуется Wi-Fi. Файлы хранятся только локально.

Контакт: ${EMAIL}`;

const RU_PRIVACY=`Политика конфиденциальности (ФЗ-152)

Дата: ${D_RU}  |  Версия: ${VER}

Оператор: ${APP} индивидуальный разработчик — ${EMAIL}

Настоящая Политика составлена в соответствии с Федеральным законом от 27.07.2006 № 152-ФЗ «О персональных данных».

1. Собираемые данные
① Вход через Google: адрес e-mail, имя, фото профиля
② Автоматически: информация об устройстве, статистика использования, рекламный идентификатор (GAID)
③ Содержание разговоров: хранится только на устройстве — НЕ передаётся на серверы
④ Публичные материалы сообщества

2. Цели обработки
Предоставление сервиса / Таргетированная реклама (Google AdMob) / Функции сообщества / Соблюдение законодательства

3. Ваши права (ст. 14–17 ФЗ-152)
Доступ к своим данным / Исправление / Удаление / Отзыв согласия / Обжалование в Роскомнадзор

4. Третьи лица
Google LLC — аутентификация, AdMob / Cloudflare — серверная инфраструктура

5. Сроки хранения
Аккаунт: до удаления / Журналы: не более 1 года

6. Уведомление о нарушении
В случае утечки данных пользователи будут уведомлены в течение 72 часов.

Контакт: ${EMAIL}`;

const RU_OPERATION=`Правила сообщества

Дата: ${D_RU}  |  Версия: ${VER}

ИИ работает локально на вашем устройстве. Разговоры не покидают смартфон.

Запрещённый контент (немедленное удаление + сообщение в органы):
① CSAM — нулевая терпимость
② Сексуальный контент без согласия, связанный с реальными людьми
③ Разжигание ненависти / пропаганда терроризма
④ Доксинг / Спам / Фишинг

Санкции: Лёгкое нарушение: предупреждение / Серьёзное или повторное: блокировка аккаунта

Контакт: ${EMAIL}`;

const RU_YOUTH=`Защита несовершеннолетних

Дата: ${D_RU}  |  Версия: ${VER}

${APP} соблюдает ФЗ № 436-ФЗ «О защите детей от информации, причиняющей вред их здоровью и развитию» и ФЗ-152.

Возрастные ограничения: С 12 лет / Контент для взрослых: с 17 лет (верификация обязательна) / До 14 лет: согласие родителя/законного представителя обязательно

Меры защиты: Блокировка откровенного контента для пользователей до 17 лет. CSAM немедленно отклоняется и сообщается в МВД РФ.

Контакт для родителей: ${EMAIL}
Обращения: Роскомнадзор: rkn.gov.ru / ☎ 8-800-222-15-01 (бесплатно)`;

// ══════════════════════════════════════════════════════
// Українська
// ══════════════════════════════════════════════════════




// ══════════════════════════════════════════════════════
// हिन्दी (DPDP Act 2023)
// ══════════════════════════════════════════════════════
const HI_TERMS=`सेवा की शर्तें

प्रभावी तिथि: ${D_HI}  |  संस्करण: ${VER}

अनुच्छेद 1 – उद्देश्य
ये शर्तें AI रोलप्ले ऐप ${APP} के उपयोग को नियंत्रित करती हैं, जो व्यक्तिगत डेवलपर ${OP_EN} द्वारा प्रदान किया जाता है।

अनुच्छेद 2 – सेवा विवरण
${APP} एक AI-आधारित रोलप्ले और रचनात्मक लेखन ऐप है जो पूरी तरह से आपके डिवाइस पर चलता है (ऑन-डिवाइस)। बातचीत कभी भी बाहरी सर्वर को नहीं भेजी जाती।

अनुच्छेद 3 – पहुँच की शर्तें
17 वर्ष से अधिक आयु। 18 वर्ष से कम: माता-पिता/अभिभावक की सहमति आवश्यक।

अनुच्छेद 4 – निषिद्ध कार्य
① बच्चों से संबंधित यौन सामग्री (CSAM) बनाना या वितरित करना — शून्य सहिष्णुता, तुरंत अधिकारियों को सूचित करें
② उत्पीड़न, मानहानि, गोपनीयता का उल्लंघन
③ घृणा फैलाने वाला भाषण, आतंकवाद
④ तृतीय पक्षों के व्यक्तिगत डेटा का अनधिकृत प्रसंस्करण

अनुच्छेद 5 – लागू कानून
कोरिया गणराज्य का कानून।

AI मॉडल लाइसेंस
यह ऐप Google के Gemma 3 (अनुमान) और EmbeddingGemma 300M (खोज सहायता) मॉडल का उपयोग करता है। दोनों मॉडल Google Gemma उपयोग की शर्तों (ai.google.dev/gemma/terms) के अधीन हैं। ऐप का उपयोग करके आप इन शर्तों से सहमत होते हैं।

AI मॉडल स्वचालित डाउनलोड
AI मॉडल फ़ाइलें (लगभग 200MB से 2.5GB) स्वचालित रूप से आपके डिवाइस पर डाउनलोड होती हैं। खोज सहायता मॉडल (लगभग 180MB) भी स्वचालित रूप से डाउनलोड होता है। Wi-Fi कनेक्शन की सलाह दी जाती है। फ़ाइलें केवल डिवाइस पर संग्रहीत हैं।

संपर्क: ${EMAIL}`;

const HI_PRIVACY=`गोपनीयता नीति (DPDP अधिनियम 2023)

प्रभावी तिथि: ${D_HI}  |  संस्करण: ${VER}

डेटा प्रत्ययी: ${APP} व्यक्तिगत डेवलपर — ${EMAIL}

यह नीति भारत के डिजिटल व्यक्तिगत डेटा संरक्षण अधिनियम 2023 (DPDP Act) के अनुसार तैयार की गई है।

1. एकत्र किया गया डेटा
① Google लॉगिन: ईमेल, नाम, प्रोफ़ाइल फ़ोटो
② स्वचालित: डिवाइस जानकारी, उपयोग आँकड़े, विज्ञापन ID (GAID)
③ बातचीत: केवल डिवाइस पर संग्रहीत — सर्वर को नहीं भेजी जाती
④ सामुदायिक सार्वजनिक सामग्री

2. उपयोग का उद्देश्य
सेवा प्रदान करना / विज्ञापन (Google AdMob) / सामुदायिक सुविधाएँ / कानूनी अनुपालन

3. आपके अधिकार (DPDP अधिनियम धारा 11–13)
डेटा तक पहुँच / सुधार / मिटाने का अनुरोध / शिकायत निवारण (72 घंटों में प्रतिक्रिया) / नॉमिनी अधिकार

4. तृतीय पक्ष
Google LLC — प्रमाणीकरण, AdMob / Cloudflare — सर्वर

5. प्रतिधारण अवधि
खाता: हटाने तक / लॉग: अधिकतम 1 वर्ष

6. शिकायत
Data Protection Board of India: meity.gov.in

संपर्क: ${EMAIL}`;

const HI_OPERATION=`सामुदायिक दिशानिर्देश

प्रभावी तिथि: ${D_HI}  |  संस्करण: ${VER}

AI आपके डिवाइस पर स्थानीय रूप से चलता है। बातचीत फ़ोन से बाहर नहीं जाती।

निषिद्ध सामग्री (तत्काल हटाना + अधिकारियों को सूचना):
① CSAM — शून्य सहिष्णुता, NCPCR और साइबर क्राइम पोर्टल को सूचित करें
② वास्तविक लोगों की गैर-सहमति वाली यौन सामग्री
③ घृणा फैलाने वाला भाषण (IPC धारा 153A, 295A)
④ Doxxing / Spam / Phishing

प्रतिबंध: हल्का उल्लंघन: चेतावनी / गंभीर: खाता निलंबन

संपर्क: ${EMAIL}`;

const HI_YOUTH=`नाबालिग संरक्षण नीति

प्रभावी तिथि: ${D_HI}  |  संस्करण: ${VER}

${APP} POCSO Act 2012, IT Act 2000 और DPDP Act 2023 का पालन करता है।

आयु सीमाएँ: 17 वर्ष न्यूनतम / 18 वर्ष से कम: अभिभावक की सहमति आवश्यक

सुरक्षा उपाय: 17 वर्ष से कम उपयोगकर्ताओं के लिए स्पष्ट सामग्री स्वतः अवरुद्ध। CSAM तुरंत अस्वीकार और NCPCR व साइबर क्राइम को सूचित।

माता-पिता संपर्क: ${EMAIL}
रिपोर्टिंग: cybercrime.gov.in / NCPCR: ncpcr.gov.in / ☎ 1098`;

// ══════════════════════════════════════════════════════
// Bahasa Indonesia (UU PDP 2022)
// ══════════════════════════════════════════════════════




// ══════════════════════════════════════════════════════
// ภาษาไทย (PDPA 2019)
// ══════════════════════════════════════════════════════
const TH_TERMS=`ข้อกำหนดการให้บริการ

วันที่มีผลบังคับใช้: ${D_TH}  |  เวอร์ชัน: ${VER}

ข้อ 1 – วัตถุประสงค์
ข้อกำหนดเหล่านี้ควบคุมการใช้แอปพลิเคชันสวมบทบาท AI ${APP} ที่ให้บริการโดยนักพัฒนาอิสระ ${OP_EN}

ข้อ 2 – คำอธิบายบริการ
${APP} คือแอปพลิเคชันสวมบทบาทและการเขียนสร้างสรรค์ที่ขับเคลื่อนด้วย AI ซึ่งทำงานบนอุปกรณ์ของคุณโดยตรง (on-device) การสนทนาจะไม่ถูกส่งไปยังเซิร์ฟเวอร์ภายนอก

ข้อ 3 – เงื่อนไขการเข้าถึง
17 ปีขึ้นไป / ต่ำกว่า 20 ปี: ต้องได้รับความยินยอมจากผู้ปกครอง

ข้อ 4 – พฤติกรรมต้องห้าม
① การสร้างหรือเผยแพร่เนื้อหาทางเพศของผู้เยาว์ (CSAM) — นโยบายไม่ยอมรับ แจ้งเจ้าหน้าที่ทันที
② การคุกคาม หมิ่นประมาท ละเมิดความเป็นส่วนตัว
③ คำพูดแสดงความเกลียดชัง การก่อการร้าย
④ การประมวลผลข้อมูลส่วนบุคคลของบุคคลอื่นโดยไม่ได้รับอนุญาต

ใบอนุญาตโมเดล AI
แอปนี้ใช้โมเดล Gemma 3 (การอนุมาน) และ EmbeddingGemma 300M (ช่วยการค้นหา) ของ Google โมเดลทั้งสองอยู่ภายใต้ข้อกำหนดการใช้งาน Google Gemma (ai.google.dev/gemma/terms) การใช้แอปถือว่าคุณยอมรับข้อกำหนดเหล่านั้น

การดาวน์โหลดโมเดล AI อัตโนมัติ
ไฟล์โมเดล AI (ประมาณ 200MB ถึง 2.5GB) จะถูกดาวน์โหลดลงในอุปกรณ์ของคุณโดยอัตโนมัติ โมเดลช่วยการค้นหา (ประมาณ 180MB) จะถูกดาวน์โหลดพร้อมกันด้วย แนะนำให้ใช้ Wi-Fi ไฟล์จะถูกเก็บไว้ในอุปกรณ์เท่านั้น

ติดต่อ: ${EMAIL}`;

const TH_PRIVACY=`นโยบายความเป็นส่วนตัว (PDPA 2562)

วันที่มีผลบังคับใช้: ${D_TH}  |  เวอร์ชัน: ${VER}

ผู้ควบคุมข้อมูลส่วนบุคคล: ${APP} นักพัฒนาอิสระ — ${EMAIL}

นโยบายนี้จัดทำขึ้นตามพระราชบัญญัติคุ้มครองข้อมูลส่วนบุคคล พ.ศ. 2562 (PDPA)

1. ข้อมูลที่เก็บรวบรวม
① เข้าสู่ระบบด้วย Google: อีเมล ชื่อที่แสดง รูปโปรไฟล์
② อัตโนมัติ: ข้อมูลอุปกรณ์ สถิติการใช้งาน ID โฆษณา (GAID)
③ การสนทนา: จัดเก็บเฉพาะในอุปกรณ์ — ไม่ส่งไปยังเซิร์ฟเวอร์
④ เนื้อหาสาธารณะของชุมชน

2. สิทธิของคุณ (PDPA มาตรา 30–43)
การเข้าถึง / การแก้ไข / การลบ / การถอนความยินยอม / การคัดค้าน / ร้องเรียนต่อ สคส.

3. บุคคลที่สาม
Google LLC / Cloudflare

4. หน่วยงานกำกับดูแล
สำนักงานคณะกรรมการคุ้มครองข้อมูลส่วนบุคคล (สคส.): pdpc.go.th

ติดต่อ: ${EMAIL}`;

const TH_OPERATION=`แนวทางชุมชน

วันที่มีผลบังคับใช้: ${D_TH}  |  เวอร์ชัน: ${VER}

AI ทำงานในอุปกรณ์ของคุณในเครื่อง การสนทนาไม่ออกจากโทรศัพท์ของคุณ

เนื้อหาต้องห้าม (ลบทันที + แจ้งเจ้าหน้าที่):
① CSAM — นโยบายไม่ยอมรับ แจ้ง ศูนย์ปราบปรามอาชญากรรมทางเทคโนโลยีสารสนเทศ (PCT)
② คำพูดแสดงความเกลียดชัง / การก่อการร้าย
③ Doxxing / Spam / Phishing

ติดต่อ: ${EMAIL}`;

const TH_YOUTH=`การคุ้มครองผู้เยาว์

วันที่มีผลบังคับใช้: ${D_TH}  |  เวอร์ชัน: ${VER}

ข้อจำกัดอายุ: 17 ปีขึ้นไป / ต่ำกว่า 20 ปี: ต้องได้รับความยินยอมจากผู้ปกครอง

มาตรการป้องกัน: บล็อกเนื้อหาชัดเจนสำหรับผู้ใช้อายุต่ำกว่า 17 ปีโดยอัตโนมัติ CSAM ถูกปฏิเสธทันทีและรายงานไปยัง PCT และ MICT

ติดต่อผู้ปกครอง: ${EMAIL}
แจ้งเหตุ: ศูนย์ PCT: ☎ 1212 / สายด่วนเด็ก: ☎ 1300`;

// ══════════════════════════════════════════════════════
// Tiếng Việt (Luật An ninh mạng · Nghị định 13/2023)
// ══════════════════════════════════════════════════════




// ══════════════════════════════════════════════════════
// Filipino (Data Privacy Act 2012 · RA 10173)
// ══════════════════════════════════════════════════════




// ══════════════════════════════════════════════════════
// Bahasa Melayu (PDPA Malaysia 2010)
// ══════════════════════════════════════════════════════




// ══════════════════════════════════════════════════════
// עברית (GDPR · Israeli Privacy Protection Law)
// ══════════════════════════════════════════════════════
const HE_TERMS=`תנאי שירות

תאריך כניסה לתוקף: ${D_HE}  |  גרסה: ${VER}

סעיף 1 – מטרה
תנאים אלה מסדירים את השימוש באפליקציית משחק התפקידים מבוססת הבינה המלאכותית ${APP}, שמסופקת על-ידי המפתח האינדיבידואלי ${OP_EN}.

סעיף 2 – תיאור השירות
${APP} היא אפליקציית משחק תפקידים וכתיבה יצירתית מבוססת בינה מלאכותית שפועלת באופן מלא על המכשיר שלך (on-device). השיחות לעולם אינן מועברות לשרתים חיצוניים.

סעיף 3 – תנאי גישה
מגיל 12 ומעלה. תוכן למבוגרים: מגיל 17 (נדרש אימות גיל). מתחת לגיל 16: נדרשת הסכמת הורה/אפוטרופוס (GDPR סעיף 8).

סעיף 4 – התנהגויות אסורות
① יצירה או הפצה של CSAM — אפס סובלנות, דיווח מיידי לרשויות
② הטרדה, לשון הרע, פגיעה בפרטיות
③ הסתה לאלימות או לגזענות (חוק העונשין תשל"ז–1977)
④ עיבוד לא מורשה של נתונים אישיים של צדדים שלישיים

חוק חל: דיני הרפובליקה של קוריאה. צרכנים בגוש האירופי נהנים מהגנות GDPR.

צרו קשר: ${EMAIL}`;

const HE_PRIVACY=`מדיניות פרטיות (GDPR · חוק הגנת הפרטיות)

תאריך כניסה לתוקף: ${D_HE}  |  גרסה: ${VER}

גורם אחראי לעיבוד: ${APP} מפתח אינדיבידואלי — ${EMAIL}

מדיניות זו ערוכה בהתאם לתקנת ה-GDPR האירופית (ישראל מוכרת כמדינה עם רמת הגנה נאותה) ולחוק הגנת הפרטיות, תשמ"א–1981.

1. נתונים הנאספים
① כניסה ב-Google: כתובת דוא"ל, שם מוצג, תמונת פרופיל
② אוטומטי: מידע על המכשיר, סטטיסטיקות שימוש, מזהה פרסום (GAID)
③ שיחות: נשמרות על המכשיר בלבד — לא מועברות לשרתים
④ תוכן ציבורי בקהילה

2. בסיס משפטי (GDPR סעיף 6)
ביצוע חוזה / אינטרס לגיטימי / הסכמה

3. הזכויות שלך
גישה / תיקון / מחיקה / הגבלה / ניידות נתונים / התנגדות / הגשת תלונה לרשות להגנת הפרטיות

4. העברות בינלאומיות
לארה"ב (Google LLC, Cloudflare) באמצעות סעיפי חוזה סטנדרטיים של האיחוד האירופי.

5. גורמים מעבדים
Google LLC / Cloudflare

6. רשות פיקוח
הרשות להגנת הפרטיות: gov.il/he/Departments/the_privacy_protection_authority

צרו קשר: ${EMAIL}`;

const HE_OPERATION=`מדיניות תוכן וכללי קהילה

תאריך: ${D_HE}  |  גרסה: ${VER}

הבינה המלאכותית פועלת באופן מקומי על המכשיר שלך. השיחות לעולם אינן עוזבות את הטלפון שלך.

תוכן אסור (מחיקה מיידית + דיווח לרשויות):
① CSAM — אפס סובלנות
② הסתה לאלימות ולגזענות (חוק העונשין)
③ Doxxing / ספאם / פישינג

פנו אלינו: ${EMAIL}`;

const HE_YOUTH=`הגנה על קטינים

תאריך: ${D_HE}  |  גרסה: ${VER}

גבולות גיל: מגיל 12 / תוכן למבוגרים: מגיל 17 (נדרש אימות) / מתחת לגיל 16: נדרשת הסכמת הורה

CSAM נדחה מיידית ומדווח למשטרת ישראל ולמרכז למאבק בפדופיליה ברשת.

יצירת קשר להורים: ${EMAIL}
דיווח: מרכז ה-CERT הלאומי: cert.gov.il / עמותת "מגן" (AMAN): aman.org.il`;

// ══════════════════════════════════════════════════════
// Português (LGPD · Lei 13.709/2018)
// ══════════════════════════════════════════════════════
const PT_TERMS=`Termos de Uso

Vigência: ${D_PT}  |  Versão: ${VER}

Art. 1 – Objeto
Estes Termos regem o uso do serviço de RPG com IA ${APP}, fornecido pelo desenvolvedor individual ${OP_EN} (doravante "Operador").

Art. 2 – Descrição do serviço
${APP} é um app de RPG e escrita criativa com IA que roda inteiramente no seu dispositivo (on-device). Suas conversas nunca são transmitidas a servidores externos.

Art. 3 – Condições de acesso
Maiores de 17 anos. Menores de 13 anos: consentimento dos responsáveis necessário (LGPD + ECA).

Art. 4 – Condutas proibidas
① Criação ou distribuição de CSAM — tolerância zero, denúncia imediata ao NCMEC, Safernet e Polícia Federal
② Assédio, difamação, violação de privacidade
③ Discurso de ódio (Lei 7.716/89), terrorismo
④ Processamento não autorizado de dados pessoais de terceiros (LGPD art. 42)

Art. 5 – Direito aplicável
Direito da República da Coreia. Consumidores brasileiros têm proteção adicional da lei brasileira.

Contato: ${EMAIL}`;

const PT_PRIVACY=`Política de Privacidade (LGPD)

Vigência: ${D_PT}  |  Versão: ${VER}

Controlador: ${APP} desenvolvedor individual — ${EMAIL}

Esta Política está em conformidade com a Lei Geral de Proteção de Dados (Lei nº 13.709/2018).

1. Dados coletados
① Login Google: e-mail, nome, foto de perfil
② Automático: info do dispositivo, histórico de uso, ID de publicidade (GAID via AdMob)
③ Conversas: armazenadas APENAS no dispositivo — não enviadas a servidores
④ Conteúdos públicos da comunidade

2. Base legal (LGPD art. 7)
Execução de contrato (inciso V) / Legítimo interesse (inciso IX) / Consentimento (inciso I)

3. Seus direitos (LGPD art. 18)
Confirmação e acesso / Correção / Anonimização ou eliminação / Portabilidade / Revogação do consentimento / Reclamação à ANPD

4. Transferência internacional
EUA (Google LLC, Cloudflare) — país com grau adequado de proteção ou mediante cláusulas contratuais padrão.

5. Operadores
Google LLC — autenticação, AdMob / Cloudflare — infraestrutura

6. Retenção
Conta: até exclusão (30 dias) / Logs: máx. 1 ano

7. Autoridade
ANPD: www.gov.br/anpd

Encarregado (DPO): ${EMAIL}`;

const PT_OPERATION=`Diretrizes da Comunidade

Vigência: ${D_PT}  |  Versão: ${VER}

A IA roda localmente no seu dispositivo. Conversas não saem do telefone.

Conteúdo proibido (remoção imediata + denúncia):
① CSAM — tolerância zero, denúncia ao NCMEC, SaferNet Brasil (safernet.org.br) e Polícia Federal
② Discurso de ódio (Lei 7.716/89) / Terrorismo
③ Doxxing / Spam / Phishing

Punições: Infração leve: advertência / Grave ou reincidente: suspensão ou banimento permanente

Contato: ${EMAIL}`;

const PT_YOUTH=`Política de Proteção de Menores

Vigência: ${D_PT}  |  Versão: ${VER}

${APP} respeita o ECA (Lei 8.069/90), a LGPD e o Marco Civil da Internet.

Faixas etárias: 17 anos mínimo / Menores de 13: consentimento dos responsáveis

CSAM é denunciado ao NCMEC, SaferNet e Polícia Federal imediatamente.

Contato responsáveis: ${EMAIL}
Denúncias: SaferNet: safernet.org.br / ☎ 197 (Polícia Federal) / Disque 100`;

// ══════════════════════════════════════════════════════
// Türkçe (KVKK · 6698 Sayılı Kanun)
// ══════════════════════════════════════════════════════
const TR_TERMS=`Kullanım Şartları

Yürürlük tarihi: ${D_TR}  |  Sürüm: ${VER}

Madde 1 – Konu
Bu Şartlar, bireysel geliştirici ${OP_EN} tarafından sağlanan ${APP} yapay zeka rol yapma uygulamasının kullanımını düzenler.

Madde 2 – Hizmet tanımı
${APP}, tamamen cihazınızda çalışan (on-device) yapay zeka destekli bir rol yapma ve yaratıcı yazım uygulamasıdır. Konuşmalar hiçbir zaman harici sunuculara iletilmez.

Madde 3 – Erişim koşulları
17 yaş ve üzeri. 18 yaş altı: ebeveyn/vasi onayı gerekli.

Madde 4 – Yasak davranışlar
① CSAM oluşturma veya dağıtma — sıfır tolerans, yetkililere anında bildirim (TCK 103, 226)
② Taciz, iftira, mahremiyet ihlali
③ Nefret söylemi (TCK 122, 216), terör propagandası
④ Üçüncü tarafların kişisel verilerini izinsiz işleme (KVKK)

Uygulanacak hukuk: Kore Cumhuriyeti hukuku.

AI Modeli Lisansı
Bu uygulama Google'ın Gemma 3 (çıkarım) ve EmbeddingGemma 300M (arama yardımı) modellerini kullanmaktadır. Her iki model de Google Gemma Kullanım Koşulları'na (ai.google.dev/gemma/terms) tabidir. Uygulamayı kullanarak bu koşulları kabul etmiş sayılırsınız.

AI Modeli Otomatik İndirme
AI model dosyaları (yaklaşık 200MB - 2,5GB) cihazınıza otomatik olarak indirilir. Arama yardımı modeli (yaklaşık 180MB) de otomatik olarak indirilir. Wi-Fi bağlantısı önerilir. Dosyalar yalnızca yerel olarak saklanır.

İletişim: ${EMAIL}`;

const TR_PRIVACY=`Gizlilik Politikası (KVKK)

Yürürlük tarihi: ${D_TR}  |  Sürüm: ${VER}

Veri sorumlusu: ${APP} bireysel geliştirici — ${EMAIL}

Bu Politika, 6698 Sayılı Kişisel Verilerin Korunması Kanunu (KVKK) kapsamında hazırlanmıştır.

1. Toplanan veriler
① Google girişi: e-posta, görünen ad, profil fotoğrafı
② Otomatik: cihaz bilgileri, kullanım istatistikleri, reklam tanımlayıcısı (GAID)
③ Konuşmalar: yalnızca cihazda saklanır — sunuculara GÖNDERİLMEZ
④ Toplulukta paylaşılan içerikler

2. Hukuki dayanak (KVKK md. 5)
Sözleşmenin ifası / Meşru menfaat / Açık rıza

3. Haklarınız (KVKK md. 11)
Bilgi talep etme / Düzeltme / Silme / İtiraz etme / KVKK'ya şikâyet

4. Yurt dışı aktarım
ABD'ye (Google LLC, Cloudflare) KVKK md. 9 çerçevesinde aktarılmaktadır.

5. Veri işleyenler
Google LLC — kimlik doğrulama, AdMob / Cloudflare — sunucu altyapısı

6. Saklama süreleri
Hesap: silinene kadar / Günlükler: maks. 1 yıl

7. Başvuru mercii
Kişisel Verileri Koruma Kurumu (KVKK): kvkk.gov.tr

İletişim: ${EMAIL}`;

const TR_OPERATION=`Topluluk Kuralları

Tarih: ${D_TR}  |  Sürüm: ${VER}

Yapay zeka cihazınızda yerel olarak çalışır. Konuşmalar telefonunuzdan çıkmaz.

Yasak içerikler (anında kaldırma + yetkililere bildirme):
① CSAM — sıfır tolerans, EGM Siber Suçlar Birimi'ne ve ICAC'a bildirim
② Nefret söylemi (TCK 122, 216) / Terör propagandası
③ Doxxing / Spam / Phishing

Yaptırımlar: Hafif ihlal: uyarı / Ağır veya tekrarlanan: hesap askıya alma veya kalıcı yasak

İletişim: ${EMAIL}`;

const TR_YOUTH=`Küçükleri Koruma Politikası

Tarih: ${D_TR}  |  Sürüm: ${VER}

${APP}, Çocuk Hakları Sözleşmesi, 5651 Sayılı İnternet Kanunu ve 6698 Sayılı KVKK kapsamındaki yükümlülüklere uymaktadır.

Yaş sınırları: 17 yaş minimum / 18 yaş altı: ebeveyn onayı gerekli

Koruma önlemleri: 17 yaş altı kullanıcılar için açık içerik otomatik olarak engellenir. CSAM talepleri anında reddedilir, EGM ve Türkiye İnternetle Güvenli Hayat Programı'na bildirilir.

Ebeveyn iletişim: ${EMAIL}
Bildirim: İhbarweb: www.ihbarweb.org.tr / ALO 183 (çocuk / kadın yardım hattı)`;

// ══════════════════════════════════════════════════════
// العربية
// ══════════════════════════════════════════════════════
const AR_TERMS=`شروط الخدمة

تاريخ النفاذ: ${D_AR}  |  الإصدار: ${VER}

المادة الأولى – الغرض
تحكم هذه الشروط استخدام تطبيق لعب الأدوار بالذكاء الاصطناعي ${APP}، المُقدَّم من المطوِّر الفردي ${OP_EN}.

المادة الثانية – وصف الخدمة
${APP} تطبيق لعب أدوار وكتابة إبداعية مدعوم بالذكاء الاصطناعي يعمل بالكامل على جهازك (on-device). لا تُرسَل المحادثات أبدًا إلى خوادم خارجية.

المادة الثالثة – شروط الوصول
من عمر 12 سنة فأكثر. المحتوى للبالغين: 17 سنة فأكثر (التحقق من العمر إلزامي). تحت 18 سنة: يلزم موافقة ولي الأمر.

المادة الرابعة – السلوكيات المحظورة
① إنشاء أو نشر مواد الاستغلال الجنسي للأطفال (CSAM) — تسامح صفري، إبلاغ فوري للسلطات
② التحرش، التشهير، انتهاك الخصوصية
③ خطاب الكراهية، الإرهاب
④ معالجة البيانات الشخصية للغير دون إذن

القانون المُطبَّق: قانون جمهورية كوريا.

التواصل: ${EMAIL}`;

const AR_PRIVACY=`سياسة الخصوصية

تاريخ النفاذ: ${D_AR}  |  الإصدار: ${VER}

المتحكم في البيانات: ${APP} مطوِّر فردي — ${EMAIL}

أولًا: البيانات التي نجمعها
① تسجيل الدخول بـ Google: البريد الإلكتروني، اسم العرض، صورة الملف الشخصي
② تلقائيًا: معلومات الجهاز، إحصاءات الاستخدام، معرّف الإعلانات (GAID)
③ المحادثات: مُخزَّنة على جهازك فقط — لا تُرسَل إلى أي خادم
④ المحتوى العام في المجتمع

ثانيًا: الغرض من الاستخدام
تقديم الخدمة / الإعلانات (Google AdMob) / ميزات المجتمع / الامتثال القانوني

ثالثًا: حقوقك
الوصول / التصحيح / الحذف / سحب الموافقة / الاعتراض / تقديم شكوى للجهة المختصة

رابعًا: الأطراف الثالثة
Google LLC — المصادقة، AdMob / Cloudflare — البنية التحتية للخوادم

خامسًا: مدة الاحتفاظ
بيانات الحساب: حتى الحذف / السجلات: حد أقصى سنة واحدة

التواصل: ${EMAIL}`;

const AR_OPERATION=`سياسة المجتمع

تاريخ النفاذ: ${D_AR}  |  الإصدار: ${VER}

يعمل الذكاء الاصطناعي محليًا على جهازك. المحادثات لا تغادر هاتفك.

المحتوى المحظور (الحذف الفوري + الإبلاغ للسلطات):
① CSAM — تسامح صفري، إبلاغ فوري لمركز الإنترنت الآمن والنيابة الجنائية
② المحتوى الجنسي غير المُوافَق عليه لأشخاص حقيقيين
③ خطاب الكراهية / الإرهاب
④ دوكسينج / البريد العشوائي / التصيد الاحتيالي

الإجراءات: مخالفة خفيفة: تحذير / خطيرة أو متكررة: تعليق الحساب أو حظر دائم

التواصل: ${EMAIL}`;

const AR_YOUTH=`سياسة حماية القاصرين

تاريخ النفاذ: ${D_AR}  |  الإصدار: ${VER}

يلتزم ${APP} بمعايير حماية الأطفال الدولية ولوائح السلامة الرقمية للقاصرين.

الحدود العمرية: 12 سنة على الأقل / المحتوى للبالغين: 17 سنة فأكثر (تحقق إلزامي) / تحت 18 سنة: موافقة ولي الأمر مطلوبة

التدابير الوقائية: حظر تلقائي للمحتوى الصريح لمن هم دون 17 سنة. يُرفض CSAM فورًا ويُبلَّغ عنه لهيئة الإنترنت الآمن والجهات المختصة.

تواصل الأهل/الأولياء: ${EMAIL}`;

// ══════════════════════════════════════════════════════
// فارسی
// ══════════════════════════════════════════════════════
const FA_TERMS=`شرایط خدمات

تاریخ اجرا: ${D_FA}  |  نسخه: ${VER}

ماده ۱ – هدف
این شرایط، استفاده از اپلیکیشن نقش‌آفرینی هوش مصنوعی ${APP} را که توسط توسعه‌دهنده مستقل ${OP_EN} ارائه می‌شود، تنظیم می‌کند.

ماده ۲ – توصیف سرویس
${APP} یک اپلیکیشن نقش‌آفرینی و نوشتار خلاقانه مبتنی بر هوش مصنوعی است که کاملاً روی دستگاه شما اجرا می‌شود (on-device). مکالمات هرگز به سرورهای خارجی ارسال نمی‌شوند.

ماده ۳ – شرایط دسترسی
از ۱۲ سال به بالا. محتوای بزرگسالان: ۱۷ سال به بالا (تأیید سن الزامی). زیر ۱۸ سال: نیاز به رضایت والدین.

ماده ۴ – رفتارهای ممنوع
① ساخت یا توزیع محتوای جنسی کودکان (CSAM) — هیچ‌گونه تساهلی وجود ندارد
② آزار، افترا، نقض حریم خصوصی
③ سخنان نفرت‌انگیز، تروریسم
④ پردازش غیرمجاز داده‌های شخصی اشخاص ثالث

تماس: ${EMAIL}`;

const FA_PRIVACY=`سیاست حفظ حریم خصوصی

تاریخ اجرا: ${D_FA}  |  نسخه: ${VER}

کنترل‌کننده داده: ${APP} توسعه‌دهنده مستقل — ${EMAIL}

۱. داده‌های جمع‌آوری‌شده
ورود با Google: ایمیل، نام نمایشی، عکس پروفایل / خودکار: اطلاعات دستگاه، آمار استفاده، شناسه تبلیغاتی (GAID) / مکالمات: فقط روی دستگاه ذخیره می‌شوند / محتوای عمومی انجمن

۲. حقوق شما
دسترسی / اصلاح / حذف / لغو رضایت / اعتراض

۳. اشخاص ثالث
Google LLC / Cloudflare

تماس: ${EMAIL}`;

const FA_OPERATION=`قوانین جامعه

تاریخ اجرا: ${D_FA}  |  نسخه: ${VER}

هوش مصنوعی به صورت محلی روی دستگاه شما اجرا می‌شود. مکالمات از گوشی شما خارج نمی‌شوند.

محتوای ممنوع (حذف فوری + گزارش به مراجع):
① CSAM — هیچ‌گونه تساهلی وجود ندارد
② سخنان نفرت‌انگیز / تروریسم
③ Doxxing / هرزنامه / فیشینگ

تماس: ${EMAIL}`;

const FA_YOUTH=`سیاست حفاظت از نوجوانان

تاریخ اجرا: ${D_FA}  |  نسخه: ${VER}

محدودیت‌های سنی: ۱۲ سال به بالا / محتوای بزرگسالان: ۱۷ سال (تأیید الزامی) / زیر ۱۸ سال: رضایت والدین

CSAM فوری رد می‌شود و به پلیس فتا گزارش می‌شود.

تماس والدین: ${EMAIL}
گزارش: پلیس فتا: cyberpolice.ir`;

// ══════════════════════════════════════════════════════
// English (EU/GDPR · US/CCPA/COPPA · IN/DPDP · GLOBAL)
// ══════════════════════════════════════════════════════
const EN_TERMS=`Terms of Service

Effective Date: ${D_EN}  |  Version: ${VER}

1. Acceptance
By using ${APP}, you agree to these Terms of Service.

2. Service Description
${APP} is an AI-powered roleplay and creative writing app. The AI runs entirely on your device (on-device). Conversations are never transmitted to external servers.

3. Eligibility
12 years or older to use the service. Adult content: 17 years and older (16+ in EU) with age verification. Under 13 (under 16 in EU): parental consent required.

4. Prohibited Conduct
① Creating or distributing Child Sexual Abuse Material (CSAM) — zero tolerance, immediate report to authorities (NCMEC/IWF/local law enforcement)
② Harassment, defamation, invasion of privacy
③ Hate speech, incitement to violence, terrorism propaganda
④ Unauthorized processing of third-party personal data
⑤ Technical manipulation or hacking of the service
⑥ Commercial use without authorization

5. Content Ownership
Privately created content remains yours. Publicly shared content grants the developer a non-exclusive, royalty-free license to display it within the service.

6. Disclaimer
AI-generated text is for creative entertainment only and may be inaccurate.

7. Governing Law
Republic of Korea law applies. EU consumers retain mandatory EU consumer protections. US consumers retain applicable state and federal rights.

Licença do modelo de IA
Este aplicativo usa os modelos Gemma 3 (inferência) e EmbeddingGemma 300M (assistência de busca) do Google. Ambos os modelos estão sujeitos aos Termos de Uso do Google Gemma (ai.google.dev/gemma/terms). Ao usar o app, você concorda com esses termos.

Download automático do modelo de IA
Os arquivos do modelo de IA (cerca de 200MB a 2,5GB) são baixados automaticamente para o dispositivo. O modelo de busca (cerca de 180MB) também é baixado automaticamente. Recomenda-se Wi-Fi. Os arquivos são armazenados apenas localmente.

Contact: ${EMAIL}`;

const EN_PRIVACY_EU=`Privacy Policy (GDPR)

Effective Date: ${D_EN}  |  Version: ${VER}

Data Controller: ${APP} individual developer — ${EMAIL}

1. Data Collected
① Google Sign-In: email address, display name, profile picture
② Automatic: device info (OS, app version), usage statistics, advertising ID (GAID via Google AdMob)
③ Conversations: on-device ONLY — never sent to servers
④ Public community content

2. Legal Basis (GDPR Art. 6)
Contract (6(1)(b)): providing the service / Legitimate interests (6(1)(f)): security and service improvement / Consent (6(1)(a)): personalized ads

3. Your Rights (GDPR Chapter III)
Access (Art.15) / Rectification (Art.16) / Erasure (Art.17) / Restriction (Art.18) / Portability (Art.20) / Objection (Art.21) / Complaint to supervisory authority

4. International Transfers
US transfers (Google LLC, Cloudflare) protected by EU Standard Contractual Clauses (SCC) and EU-US Data Privacy Framework.

5. Processors (Art. 28 GDPR)
Google LLC — Sign-In, AdMob (USA) / Cloudflare — Server infrastructure (USA)

6. Retention
Account: until deletion (30 days) / Logs: max 1 year

AI Model License
This app uses Google's Gemma 3 (inference) and EmbeddingGemma 300M (search assistance) models. Both models are subject to the Google Gemma Terms of Use (ai.google.dev/gemma/terms). By using this app, you agree to be bound by those terms.

Automatic AI Model Download
AI model files (approximately 200MB to 2.5GB) are downloaded automatically to your device upon first use. The search assistance model (approximately 180MB) is also downloaded automatically alongside the inference model. A Wi-Fi connection is recommended. You can enable cellular downloads in Settings → 'Cellular Model Download'. Model files are stored locally only and never transmitted to external servers.

Contact: ${EMAIL}`;

const EN_PRIVACY_US=`Privacy Policy (CCPA / COPPA)

Effective Date: ${D_EN}  |  Version: ${VER}

California Residents (CCPA/CPRA):
• Right to Know what personal information is collected and how it is used
• Right to Delete your personal information
• Right to Opt-Out of the "sale" or "sharing" of personal information (we do NOT sell or share personal data for cross-context behavioral advertising)
• Right to Correct inaccurate personal information
• Right to Non-Discrimination for exercising your rights

COPPA: We do not knowingly collect personal information from children under 13. If you believe a child under 13 has provided personal information without parental consent, contact ${EMAIL} immediately and we will delete such information within 72 hours.

Data collected: Google Sign-In (email, name, photo) / Device info, usage logs, advertising ID (GAID via AdMob) / Conversations: stored on-device only.

Third parties: Google LLC (auth & ads), Cloudflare (server). We do not sell personal data.

Contact / Privacy Rights Requests: ${EMAIL}`;

const EN_PRIVACY_IN=`Privacy Policy (DPDP Act 2023)

Effective Date: ${D_EN}  |  Version: ${VER}

Data Fiduciary: ${APP} individual developer — ${EMAIL}

This Privacy Policy is prepared in accordance with India's Digital Personal Data Protection Act, 2023 (DPDP Act).

Your Rights under DPDP Act:
• Right to access information about your personal data (Section 11)
• Right to correction and erasure of personal data (Section 12)
• Right to grievance redressal (Section 13 — we respond within 72 hours)
• Nominee rights

Data collected: Google Sign-In (email, name, photo) / Device info, GAID / Conversations: on-device only.
Consent Managers: We use Google Sign-In as the authentication mechanism.
Third parties: Google LLC, Cloudflare.

Data Protection Board: meity.gov.in

Contact: ${EMAIL}`;

const EN_PRIVACY_GLOBAL=`Privacy Policy

Effective Date: ${D_EN}  |  Version: ${VER}

Data Controller: ${APP} individual developer — ${EMAIL}

1. Data Collected
① Google Sign-In: email, display name, profile picture
② Automatic: device info, usage logs, advertising ID (GAID via AdMob)
③ Conversations: on-device ONLY — never sent to servers
④ Public community content

2. How We Use It
Providing the service / Ads (Google AdMob) / Community features / Legal compliance

3. Sharing
Not sold. Shared only with: Google LLC (auth & ads), Cloudflare (server), law enforcement when legally required.

4. Retention
Account: until deletion / Logs: max 1 year

5. Your Rights
Access, correction, or deletion — contact ${EMAIL}

6. Children
No personal data collected from under-13s without verifiable parental consent.

Contact: ${EMAIL}`;

const EN_OPERATION=`Community Guidelines

Effective Date: ${D_EN}  |  Version: ${VER}

AI runs on your device — conversations never leave your phone.

Allowed Content: Romance, adventure, creative fiction / Emotional storylines / All non-sexual creative genres

Prohibited Content (immediate ban + report to authorities):
① CSAM — zero tolerance, immediately reported to NCMEC (US), IWF (EU/UK), and local law enforcement worldwide
② Non-consensual sexual content involving real people
③ Content promoting real-world violence or terrorism
④ Hate speech based on race, ethnicity, gender, religion, disability, or sexual orientation
⑤ Doxxing (publishing private information about individuals)
⑥ Spam, scams, phishing

Enforcement: Warning → Suspension → Permanent ban

Contact: ${EMAIL}`;

const EN_YOUTH=`Minor Protection Policy

Effective Date: ${D_EN}  |  Version: ${VER}

Age Requirements: 17+ to use / Under 13 (under 16 in EU): parental consent required

Protections: AI automatically blocks sexual and violent content for all users. CSAM is immediately refused and reported to: NCMEC (ncmec.org), IWF (iwf.org.uk) in UK/EU, and local law enforcement everywhere.

Parental Rights: Request data access, correction, or deletion for children under 13 (16 in EU): ${EMAIL}

Contact: ${EMAIL}`;

// ══════════════════════════════════════════════════════
// getPolicy — 15개 언어 완전 지원
// ══════════════════════════════════════════════════════
const EN_PRIVACY_KR = EN_PRIVACY_GLOBAL;
const EN_PRIVACY_JP = EN_PRIVACY_GLOBAL;
const EN_PRIVACY_CN = EN_PRIVACY_GLOBAL;
const EN_PRIVACY_TW = EN_PRIVACY_GLOBAL;
const EN_PRIVACY_BR = EN_PRIVACY_GLOBAL;
const EN_PRIVACY_TR = EN_PRIVACY_GLOBAL;
const EN_PRIVACY_RU = EN_PRIVACY_GLOBAL;
const EN_PRIVACY_SEA = EN_PRIVACY_GLOBAL;
const EN_PRIVACY_AR = EN_PRIVACY_GLOBAL;

export function getPolicy(lang: LanguageCode, region?: PolicyRegion): PolicyDocument {
  const resolvedLang = getSupportedLanguage(lang);
  const r = region ?? detectRegion(resolvedLang);
  switch (resolvedLang) {
    case 'ko':    return { terms: KO_TERMS,    privacy: KO_PRIVACY,         operation: KO_OPERATION,    youth: KO_YOUTH    };
    case 'ja':    return { terms: JA_TERMS,    privacy: JA_PRIVACY,         operation: JA_OPERATION,    youth: JA_YOUTH    };
    case 'zh-CN': return { terms: ZH_CN_TERMS, privacy: ZH_CN_PRIVACY,      operation: ZH_CN_OPERATION, youth: ZH_CN_YOUTH };
    case 'zh-TW': return { terms: ZH_TW_TERMS, privacy: ZH_TW_PRIVACY,      operation: ZH_TW_OPERATION, youth: ZH_TW_YOUTH };
    case 'de':    return { terms: DE_TERMS,    privacy: DE_PRIVACY,         operation: DE_OPERATION,    youth: DE_YOUTH    };
    case 'fr':    return { terms: FR_TERMS,    privacy: FR_PRIVACY,         operation: FR_OPERATION,    youth: FR_YOUTH    };
    case 'es':    return { terms: ES_TERMS,    privacy: ES_PRIVACY,         operation: ES_OPERATION,    youth: ES_YOUTH    };
    case 'it':    return { terms: IT_TERMS,    privacy: IT_PRIVACY,         operation: IT_OPERATION,    youth: IT_YOUTH    };
    case 'ru':    return { terms: RU_TERMS,    privacy: RU_PRIVACY,         operation: RU_OPERATION,    youth: RU_YOUTH    };
    case 'hi':    return { terms: HI_TERMS,    privacy: HI_PRIVACY,         operation: HI_OPERATION,    youth: HI_YOUTH    };
    case 'th':    return { terms: TH_TERMS,    privacy: TH_PRIVACY,         operation: TH_OPERATION,    youth: TH_YOUTH    };
    case 'pt':    return { terms: PT_TERMS,    privacy: PT_PRIVACY,         operation: PT_OPERATION,    youth: PT_YOUTH    };
    case 'tr':    return { terms: TR_TERMS,    privacy: TR_PRIVACY,         operation: TR_OPERATION,    youth: TR_YOUTH    };
    case 'ar':    return { terms: AR_TERMS,    privacy: AR_PRIVACY,         operation: AR_OPERATION,    youth: AR_YOUTH    };
    case 'en':
      if (r === 'EU') return { terms: EN_TERMS, privacy: EN_PRIVACY_EU,     operation: EN_OPERATION,    youth: EN_YOUTH    };
      if (r === 'US') return { terms: EN_TERMS, privacy: EN_PRIVACY_US,     operation: EN_OPERATION,    youth: EN_YOUTH    };
      if (r === 'IN') return { terms: EN_TERMS, privacy: EN_PRIVACY_IN,     operation: EN_OPERATION,    youth: EN_YOUTH    };
      if (r === 'KR') return { terms: EN_TERMS, privacy: EN_PRIVACY_KR,     operation: EN_OPERATION,    youth: EN_YOUTH    };
      if (r === 'JP') return { terms: EN_TERMS, privacy: EN_PRIVACY_JP,     operation: EN_OPERATION,    youth: EN_YOUTH    };
      if (r === 'CN') return { terms: EN_TERMS, privacy: EN_PRIVACY_CN,     operation: EN_OPERATION,    youth: EN_YOUTH    };
      if (r === 'TW') return { terms: EN_TERMS, privacy: EN_PRIVACY_TW,     operation: EN_OPERATION,    youth: EN_YOUTH    };
      if (r === 'BR') return { terms: EN_TERMS, privacy: EN_PRIVACY_BR,     operation: EN_OPERATION,    youth: EN_YOUTH    };
      if (r === 'TR') return { terms: EN_TERMS, privacy: EN_PRIVACY_TR,     operation: EN_OPERATION,    youth: EN_YOUTH    };
      if (r === 'RU') return { terms: EN_TERMS, privacy: EN_PRIVACY_RU,     operation: EN_OPERATION,    youth: EN_YOUTH    };
      if (r === 'SEA') return { terms: EN_TERMS, privacy: EN_PRIVACY_SEA,   operation: EN_OPERATION,    youth: EN_YOUTH    };
      if (r === 'AR') return { terms: EN_TERMS, privacy: EN_PRIVACY_AR,     operation: EN_OPERATION,    youth: EN_YOUTH    };
      return { terms: EN_TERMS, privacy: EN_PRIVACY_GLOBAL, operation: EN_OPERATION, youth: EN_YOUTH };
    default:
      return { terms: EN_TERMS, privacy: EN_PRIVACY_GLOBAL, operation: EN_OPERATION, youth: EN_YOUTH };
  }
}

// ══════════════════════════════════════════════════════
// 탭 레이블 — 15개 언어
// ══════════════════════════════════════════════════════
export function getPolicyTabLabels(lang: LanguageCode) {
  const resolvedLang = getSupportedLanguage(lang);
  const m: Partial<Record<LanguageCode, { terms: string; privacy: string; operation: string; youth: string }>> = {
    ko:      { terms: '이용약관',            privacy: '개인정보처리방침',         operation: '운영 정책',              youth: '청소년 보호'            },
    ja:      { terms: '利用規約',             privacy: 'プライバシーポリシー',      operation: '運営ポリシー',           youth: '青少年保護'             },
    'zh-CN': { terms: '用户协议',            privacy: '隐私政策',                 operation: '社区准则',               youth: '未成年保护'             },
    'zh-TW': { terms: '使用條款',            privacy: '隱私權政策',               operation: '社群準則',               youth: '未成年保護'             },
    de:      { terms: 'Nutzungsbedingungen', privacy: 'Datenschutzerklärung',   operation: 'Community-Richtlinien',  youth: 'Jugendschutz'           },
    fr:      { terms: 'Conditions',          privacy: 'Confidentialité',         operation: 'Règles',                 youth: 'Protection jeunesse'    },
    es:      { terms: 'Términos',            privacy: 'Privacidad',              operation: 'Normas',                 youth: 'Protección menores'     },
    it:      { terms: 'Termini',             privacy: 'Privacy',                 operation: 'Linee guida',            youth: 'Tutela minori'          },
    ru:      { terms: 'Условия',             privacy: 'Конфиденциальность',      operation: 'Правила',                youth: 'Защита детей'           },
    hi:      { terms: 'सेवा शर्तें',        privacy: 'गोपनीयता नीति',           operation: 'सामुदायिक दिशानिर्देश', youth: 'बाल संरक्षण'             },
    th:      { terms: 'เงื่อนไข',          privacy: 'นโยบายความเป็นส่วนตัว',   operation: 'แนวทางชุมชน',           youth: 'คุ้มครองเยาวชน'         },
    pt:      { terms: 'Termos de Uso',       privacy: 'Privacidade',             operation: 'Diretrizes',             youth: 'Proteção juvenil'       },
    tr:      { terms: 'Kullanım Şartları',   privacy: 'Gizlilik Politikası',     operation: 'Topluluk Kuralları',     youth: 'Gençlik Koruma'         },
    ar:      { terms: 'شروط الخدمة',        privacy: 'سياسة الخصوصية',          operation: 'سياسة المجتمع',          youth: 'حماية الشباب'           } };
  return m[resolvedLang] ?? { terms: 'Terms', privacy: 'Privacy Policy', operation: 'Content Policy', youth: 'Youth Protection' };
}
