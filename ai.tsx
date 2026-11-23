import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  ShieldAlert,
  ShieldCheck,
  HelpCircle,
  Info,
  Volume2,
  VolumeX,
  Plus,
  Trash2,
  Camera,
  QrCode,
  Store,
  MessageSquareText,
  FileText,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Sparkles,
  BrainCircuit,
  Cpu,
  ChevronRight,
  Copy,
  Check,
  Utensils,
  Search,
  RefreshCw,
  ArrowLeft,
  Eye,
  Type,
  Calendar,
  Database,
  Building2,
  Layers
} from 'lucide-react';

// ============================================================================
// [타입 정의 영역] - 추론 엔진, 기계학습 모듈, 음식 및 출처 데이터 모델
// ============================================================================

/** 4가지 핵심 추론 판단 상태 (절대 '안전함'이나 '섭취 가능' 표현을 사용하지 않음) */
export type InferenceStatus =
  | 'ALLERGEN_DETECTED'   // 1. 알레르기 유발 성분 확인
  | 'NOT_FOUND_IN_LIST'   // 2. 표시된 성분에서 등록 알레르겐 미발견
  | 'NEEDS_VERIFICATION'  // 3. 추가 확인 필요
  | 'INSUFFICIENT_INFO';  // 4. 정보 부족

/** 정보 출처 구분 */
export type InformationSource =
  | 'OFFICIAL_LABEL'      // 공식 제품 원재료 표시를 통해 확인한 정보
  | 'RESTAURANT_DIRECT'   // 식당 직접 등록 정보
  | 'STAFF_CONFIRMED'     // 식당 직원에게 확인한 정보
  | 'UNVERIFIED';         // 확인되지 않은 정보

/** 추론 엔진이 반환하는 상세 결과 */
export interface InferenceResult {
  status: InferenceStatus;
  statusLabel: string;
  matchedAllergens: {
    userAllergen: string;
    matchedKeyword: string;
    location: string;
  }[];
  ambiguousItems: string[]; // 추가 확인이 필요한 복합재료/소스/육수 등
  ruleTrace: {
    ruleId: string;
    ruleName: string;
    description: string;
    triggered: boolean;
  }[];
  summaryMessage: string;
}

/** 기계학습 프로토타입 모듈의 4가지 분류 결과 */
export interface MLClassificationResult {
  isPrototypeNotice: string; // '기계학습 기능 시연용 프로토타입' 명시
  hasAllergenMention: {
    detected: boolean;
    extractedAllergens: string[];
    confidenceScore: number;
  };
  ingredientsAndCompounds: {
    rawIngredients: string[];
    compoundIngredients: string[];
  };
  sauceAndBrothInfo: {
    detected: boolean;
    extractedTerms: string[];
  };
  ambiguityAnalysis: {
    isAmbiguous: boolean;
    ambiguousPhrases: string[];
    reason: string;
  };
}

/** 식당 메뉴 데이터 모델 */
export interface RestaurantMenu {
  id: string;
  restaurantId: string;
  restaurantName: string;
  tableNumber?: string;
  menuName: string;
  ingredients: string;
  sauce: string;
  broth: string;
  topping: string;
  source: InformationSource;
  updatedAt: string;
  isSampleData: boolean;
}

/** 분석 이력 및 상세 결과 데이터 모델 */
export interface AnalysisRecord {
  id: string;
  targetName: string;
  category: 'PACKAGED_FOOD' | 'RESTAURANT_MENU' | 'STAFF_QA';
  rawText: string;
  inference: InferenceResult;
  mlClassification: MLClassificationResult;
  source: InformationSource;
  updatedAt: string;
  isSampleData?: boolean;
}

// ============================================================================
// [모듈 1: 핵심 AI - 규칙 기반 추론 엔진 (Rule-Based Inference Engine)]
// ============================================================================

/**
 * 사전 정의된 알레르겐 동의어 및 파생 원재료 지식 베이스 (Knowledge Base)
 * 예: '우유' 등록 시 '유청단백', '카제인', '버터', '치즈', '생크림' 등을 추론 규칙으로 매칭
 */
const ALLERGEN_KNOWLEDGE_BASE: Record<string, string[]> = {
  땅콩: ['땅콩', '피넛', '땅콩버터', '땅콩분태', '낙화생', 'peanut'],
  호두: ['호두', '월넛', '호두분태', 'walnut'],
  잣: ['잣', '백자', '해송자', 'pine nut'],
  아몬드: ['아몬드', '아몬드슬라이스', '아몬드밀크', 'almond'],
  우유: ['우유', '유청', '카제인', '버터', '치즈', '생크림', '연유', '분유', '탈지분유', '전지분유', '유크림', '락토스', '유당', '요거트', 'milk', 'dairy'],
  달걀: ['달걀', '계란', '난황', '난백', '전란액', '알부민', '마요네즈', 'egg'],
  대두: ['대두', '콩', '두부', '간장', '된장', '고추장', '콩기름', '대두유', '레시틴', '대두단백', '콩나물', '두유', 'soy'],
  밀: ['밀', '밀가루', '소맥', '소맥분', '글루텐', '빵가루', '면', '국수', '우동면', '파스타면', '부침가루', '튀김가루', 'wheat', 'gluten'],
  메밀: ['메밀', '메밀가루', '소바', '메밀면', 'buckwheat'],
  새우: ['새우', '새우젓', '건새우', '새우분말', '크릴', 'shrimp', 'prawn'],
  게: ['게', '꽃게', '대게', '게맛살', '게살', 'crab'],
  고등어: ['고등어', 'mackerel'],
  복숭아: ['복숭아', '황도', '백도', 'peach'],
  토마토: ['토마토', '케첩', '토마토페이스트', '토마토소스', '토마토퓨레', 'tomato'],
  아황산류: ['아황산', '아황산나트륨', '메타중아황산칼륨', '이산화황', '산화방지제(아황산)', '와인', '건포도'],
  돼지고기: ['돼지고기', '돈육', '베이컨', '햄', '소시지', '삼겹살', '목살', '라드', '돈골', 'pork'],
  닭고기: ['닭고기', '계육', '치킨', '닭가슴살', '닭육수', '치킨스톡', 'chicken'],
  쇠고기: ['쇠고기', '소고기', '우육', '한우', '사골', '우골', '비프스톡', 'beef'],
  조개류: ['조개', '굴', '전복', '홍합', '바지락', '가리비', '모시조개', '굴소스', 'shellfish', 'oyster']
};

/** 세부 성분이 불명확하여 '추가 확인 필요' 규칙을 트리거하는 복합/모호 키워드 사전 */
const AMBIGUOUS_COMPOUND_KEYWORDS = [
  '복합조미식품',
  '향미증진제',
  '특제소스',
  '비법소스',
  '비밀양념',
  '시즈닝',
  '향신료',
  '혼합제제',
  '육수',
  '채수',
  '다시',
  '소스',
  '양념장',
  '드레싱',
  '스톡',
  '엑기스',
  '농축액',
  '분말스프',
  '조미료',
  '기타가공품'
];

class InferenceEngine {
  /**
   * 핵심 추론 함수: 사용자 알레르기 목록과 음식 정보를 규칙(R1~R4)에 따라 평가
   */
  public static evaluate(
    userAllergens: string[],
    foodSections: {
      ingredients: string;
      sauce?: string;
      broth?: string;
      topping?: string;
      staffNote?: string;
    },
    mlResult?: MLClassificationResult
  ): InferenceResult {
    const ruleTrace: InferenceResult['ruleTrace'] = [];
    const matchedAllergens: InferenceResult['matchedAllergens'] = [];
    const ambiguousItems: string[] = [];

    const combinedText = [
      foodSections.ingredients,
      foodSections.sauce,
      foodSections.broth,
      foodSections.topping,
      foodSections.staffNote
    ]
      .filter(Boolean)
      .join(' ')
      .trim();

    // [규칙 R1] 정보 부족 판별 규칙
    const isInsufficient = combinedText.length < 2 || combinedText === '정보 없음' || combinedText === '미등록';
    ruleTrace.push({
      ruleId: 'RULE-01',
      ruleName: '원재료 정보 유효성 검증 규칙',
      description: '입력된 원재료/메뉴 정보가 비어있거나 2자 미만인 경우 [정보 부족]으로 분류합니다.',
      triggered: isInsufficient
    });

    if (isInsufficient) {
      return {
        status: 'INSUFFICIENT_INFO',
        statusLabel: '정보 부족',
        matchedAllergens: [],
        ambiguousItems: ['등록된 원재료 정보가 없습니다.'],
        ruleTrace,
        summaryMessage: '원재료 정보가 등록되지 않았거나 너무 부족하여 알레르기 여부를 판단할 수 없습니다.'
      };
    }

    // [규칙 R2] 직접 및 파생 알레르겐 매칭 규칙 (최우선 위험 탐지)
    const sectionEntries: { label: string; text: string }[] = [
      { label: '주원재료', text: foodSections.ingredients || '' },
      { label: '소스', text: foodSections.sauce || '' },
      { label: '육수', text: foodSections.broth || '' },
      { label: '토핑', text: foodSections.topping || '' },
      { label: '직원 답변/비고', text: foodSections.staffNote || '' }
    ];

    for (const userAllergen of userAllergens) {
      const normalizedUserAllergen = userAllergen.trim();
      // 지식 베이스에 있으면 동의어/파생어 목록 사용, 없으면 사용자 입력어 자체만 사용
      const synonyms = ALLERGEN_KNOWLEDGE_BASE[normalizedUserAllergen] || [normalizedUserAllergen];

      for (const section of sectionEntries) {
        if (!section.text) continue;
        const lowerSection = section.text.toLowerCase();

        for (const keyword of synonyms) {
          if (lowerSection.includes(keyword.toLowerCase())) {
            // 중복 기록 방지
            const alreadyRecorded = matchedAllergens.some(
              (m) =>
                m.userAllergen === normalizedUserAllergen &&
                m.matchedKeyword === keyword &&
                m.location === section.label
            );
            if (!alreadyRecorded) {
              matchedAllergens.push({
                userAllergen: normalizedUserAllergen,
                matchedKeyword: keyword,
                location: section.label
              });
            }
          }
        }
      }
    }

    const hasDirectOrDerivedMatch = matchedAllergens.length > 0;
    ruleTrace.push({
      ruleId: 'RULE-02',
      ruleName: '알레르겐 및 파생 원재료 매칭 규칙 (최우선 경고)',
      description:
        '사용자 등록 알레르겐 및 파생어(예: 우유→버터·카제인, 대두→간장)가 원재료·소스·육수·토핑에서 발견되면 즉시 [알레르기 유발 성분 확인]으로 판정합니다.',
      triggered: hasDirectOrDerivedMatch
    });

    if (hasDirectOrDerivedMatch) {
      const uniqueAllergens = Array.from(new Set(matchedAllergens.map((m) => m.userAllergen)));
      return {
        status: 'ALLERGEN_DETECTED',
        statusLabel: '알레르기 유발 성분 확인',
        matchedAllergens,
        ambiguousItems: [],
        ruleTrace,
        summaryMessage: `주의! 등록하신 알레르기 유발 성분(${uniqueAllergens.join(', ')}) 또는 관련 파생 원재료가 확인되었습니다.`
      };
    }

    // [규칙 R3] 복합재료·소스·육수·모호 답변에 따른 추가 확인 필요 규칙
    for (const section of sectionEntries) {
      if (!section.text) continue;
      for (const ambWord of AMBIGUOUS_COMPOUND_KEYWORDS) {
        if (section.text.includes(ambWord)) {
          // 괄호 안에 세부 성분이 풀어서 적혀있는지 간단 확인 (예: '특제소스(토마토, 양파)')
          const hasParenthesesDetail = new RegExp(`${ambWord}\\s*\\([^)]+\\)`).test(section.text);
          if (!hasParenthesesDetail) {
            const itemDesc = `${section.label}의 '${ambWord}' (세부 원재료 미표기)`;
            if (!ambiguousItems.includes(itemDesc)) {
              ambiguousItems.push(itemDesc);
            }
          }
        }
      }
    }

    // 보조 AI(ML 프로토타입)가 직원 답변의 모호성을 감지한 경우 규칙 R3에 반영
    if (mlResult && mlResult.ambiguityAnalysis.isAmbiguous) {
      ambiguousItems.push(`직원 답변 모호성 감지: ${mlResult.ambiguityAnalysis.reason}`);
    }

    const needsVerification = ambiguousItems.length > 0;
    ruleTrace.push({
      ruleId: 'RULE-03',
      ruleName: '복합재료·육수·소스 세부 성분 검증 규칙',
      description:
        '직접 알레르겐은 없으나 세부 원재료가 명시되지 않은 소스, 육수, 복합조미식품이 포함되었거나 답변이 모호한 경우 [추가 확인 필요]로 판정합니다.',
      triggered: needsVerification
    });

    if (needsVerification) {
      return {
        status: 'NEEDS_VERIFICATION',
        statusLabel: '추가 확인 필요',
        matchedAllergens: [],
        ambiguousItems,
        ruleTrace,
        summaryMessage:
          '등록된 알레르기 성분이 직접 표기되지는 않았으나, 세부 성분이 불명확한 소스·육수·복합재료가 있어 추가 확인이 필요합니다.'
      };
    }

    // [규칙 R4] 표시된 성분 내 미발견 규칙 (절대 '안전함'이나 '섭취 가능' 표현 금지)
    ruleTrace.push({
      ruleId: 'RULE-04',
      ruleName: '표시 성분 내 미발견 판정 규칙 (보수적 안전 원칙)',
      description:
        '제공된 원재료 정보에서 등록 알레르겐이 발견되지 않았더라도 교차 오염 가능성을 고려해 [안전함] 대신 [표시된 성분에서 등록 알레르겐 미발견]으로 판정합니다.',
      triggered: true
    });

    return {
      status: 'NOT_FOUND_IN_LIST',
      statusLabel: '표시된 성분에서 등록 알레르겐 미발견',
      matchedAllergens: [],
      ambiguousItems: [],
      ruleTrace,
      summaryMessage:
        '표시된 원재료 정보에서는 등록하신 알레르기 유발 성분이 발견되지 않았습니다. (조리 과정의 교차 오염 여부는 별도 확인을 권장합니다.)'
    };
  }
}

// ============================================================================
// [모듈 2: 보조 AI - 기계학습 기능 시연용 프로토타입 (MLClassifierPrototype)]
// * 추후 실제 학습된 NLP/개체명 인식(NER) 모델 API로 교체할 수 있도록 독립 모듈화
// ============================================================================

class MLClassifierPrototype {
  public static readonly PROTOTYPE_LABEL =
    '기계학습 기능 시연용 프로토타입 (규칙·키워드 기반 NLP 분류 모듈 - 추후 실제 학습 모델로 교체 가능)';

  /**
   * 비정형 텍스트(식당 직원 답변 또는 원재료 문장)를 4개 핵심 항목으로 분류
   */
  public static classifyText(rawText: string, userAllergens: string[]): MLClassificationResult {
    const text = rawText.trim();

    // 1) 알레르기 유발 성분 포함 여부 및 언급 성분 추출
    const extractedAllergens: string[] = [];
    const allKnownAllergenKeys = Object.keys(ALLERGEN_KNOWLEDGE_BASE);
    const searchTargets = Array.from(new Set([...allKnownAllergenKeys, ...userAllergens]));

    for (const allergen of searchTargets) {
      const synonyms = ALLERGEN_KNOWLEDGE_BASE[allergen] || [allergen];
      for (const syn of synonyms) {
        if (text.toLowerCase().includes(syn.toLowerCase())) {
          // 부정문('땅콩은 안 들어갑니다') 여부 간단 체크
          const negativePattern = new RegExp(`${syn}[은는이가\\s]*(안|없|미포함|제외)`);
          if (!negativePattern.test(text) && !extractedAllergens.includes(allergen)) {
            extractedAllergens.push(allergen);
          }
        }
      }
    }

    // 2) 원재료명 및 복합재료 정보 추출
    const tokens = text
      .split(/[,/·\n()]+/)
      .map((t) => t.trim())
      .filter((t) => t.length >= 2 && t.length <= 20);

    const compoundIngredients = tokens.filter((token) =>
      AMBIGUOUS_COMPOUND_KEYWORDS.some((kw) => token.includes(kw))
    );
    const rawIngredients = tokens
      .filter((token) => !compoundIngredients.includes(token))
      .slice(0, 10);

    // 3) 소스 및 육수 관련 정보 추출
    const sauceBrothKeywords = ['소스', '육수', '채수', '양념', '간장', '된장', '고추장', '스톡', '드레싱', '국물', '베이스'];
    const extractedSauceBroth = tokens.filter((token) =>
      sauceBrothKeywords.some((kw) => token.includes(kw))
    );

    // 4) 답변 불충분 / 모호성 여부 분류
    const ambiguityTriggers = [
      '아마',
      '글쎄',
      '모르겠',
      '잘 모르',
      '확인해 봐야',
      '확인해봐야',
      '기성품',
      '납품',
      '그럴 수도',
      '확실하지',
      '안 적혀',
      '비밀'
    ];
    const detectedAmbiguousPhrases = ambiguityTriggers.filter((phrase) => text.includes(phrase));
    const isTooShort = text.length < 4;
    const isAmbiguous = detectedAmbiguousPhrases.length > 0 || isTooShort;

    let reason = '명확한 원재료 또는 포함 여부 진술이 감지되었습니다.';
    if (isTooShort) {
      reason = '입력된 텍스트가 너무 짧아 충분한 정보를 추출할 수 없습니다.';
    } else if (detectedAmbiguousPhrases.length > 0) {
      reason = `불확실성을 나타내는 표현(${detectedAmbiguousPhrases.map((p) => `'${p}'`).join(', ')})이 포함되어 있습니다.`;
    }

    return {
      isPrototypeNotice: MLClassifierPrototype.PROTOTYPE_LABEL,
      hasAllergenMention: {
        detected: extractedAllergens.length > 0,
        extractedAllergens,
        confidenceScore: text.length > 5 ? 0.88 : 0.52
      },
      ingredientsAndCompounds: {
        rawIngredients,
        compoundIngredients
      },
      sauceAndBrothInfo: {
        detected: extractedSauceBroth.length > 0,
        extractedTerms: extractedSauceBroth
      },
      ambiguityAnalysis: {
        isAmbiguous,
        ambiguousPhrases: detectedAmbiguousPhrases,
        reason
      }
    };
  }
}

// ============================================================================
// [모듈 3: 음성 안내(TTS) 및 접근성 유틸리티]
// ============================================================================

const speakKorean = (text: string, onEnd?: () => void) => {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
    return;
  }
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = 'ko-KR';
  utterance.rate = 0.98;
  utterance.pitch = 1.0;
  if (onEnd) {
    utterance.onend = onEnd;
    utterance.onerror = onEnd;
  }
  window.speechSynthesis.speak(utterance);
};

// ============================================================================
// [초기 예시 데이터 및 상수]
// ============================================================================

const COMMON_ALLERGENS = [
  '땅콩',
  '호두',
  '잣',
  '아몬드',
  '우유',
  '달걀',
  '대두',
  '밀',
  '메밀',
  '새우',
  '게',
  '고등어',
  '복숭아',
  '토마토',
  '아황산류',
  '돼지고기',
  '닭고기',
  '쇠고기',
  '조개류'
];

const SOURCE_META: Record<
  InformationSource,
  { label: string; badgeClass: string; description: string }
> = {
  OFFICIAL_LABEL: {
    label: '공식 제품 원재료 표시 확인 정보',
    badgeClass: 'bg-emerald-50 text-emerald-800 border-emerald-300',
    description: '포장식품 뒷면의 공식 원재료명 표기를 기반으로 분석된 정보입니다.'
  },
  RESTAURANT_DIRECT: {
    label: '식당 직접 등록 정보',
    badgeClass: 'bg-blue-50 text-blue-800 border-blue-300',
    description:
      '식당 운영자가 직접 입력한 정보입니다. 조리 환경에 따른 교차 오염 가능성은 별도 확인이 필요합니다.'
  },
  STAFF_CONFIRMED: {
    label: '식당 직원에게 확인한 정보',
    badgeClass: 'bg-amber-50 text-amber-800 border-amber-300',
    description: '식당 직원의 구두/텍스트 답변을 AI가 분석하여 정리한 정보입니다.'
  },
  UNVERIFIED: {
    label: '확인되지 않은 정보',
    badgeClass: 'bg-slate-100 text-slate-700 border-slate-300',
    description: '아직 원재료 정보가 등록되거나 검증되지 않았습니다.'
  }
};

/** QR 스캔 및 식당 메뉴 확인용 가상의 예시 데이터 */
const INITIAL_SAMPLE_MENUS: RestaurantMenu[] = [
  {
    id: 'menu-101',
    restaurantId: 'REST-GREEN-01',
    restaurantName: '[예시 식당] 초록숲 샐러드 & 파스타',
    tableNumber: '테이블 04번',
    menuName: '구운 닭가슴살 아보카도 샐러드',
    ingredients: '닭가슴살(국내산), 로메인, 방울토마토, 아보카도, 올리브오일',
    sauce: '발사믹 드레싱(포도식초, 올리브유, 꿀)',
    broth: '해당 없음',
    topping: '구운 아몬드 슬라이스, 크랜베리',
    source: 'RESTAURANT_DIRECT',
    updatedAt: '2026-11-15',
    isSampleData: true
  },
  {
    id: 'menu-102',
    restaurantId: 'REST-GREEN-01',
    restaurantName: '[예시 식당] 초록숲 샐러드 & 파스타',
    tableNumber: '테이블 04번',
    menuName: '트러플 버섯 크림 파스타',
    ingredients: '스파게티면(듀럼밀 세몰리나), 양송이버섯, 표고버섯, 마늘, 양파',
    sauce: '생크림(우유), 파마산치즈, 버터, 트러플오일',
    broth: '채수(양파, 대파, 셀러리)',
    topping: '이탈리안 파슬리, 후추',
    source: 'RESTAURANT_DIRECT',
    updatedAt: '2026-11-15',
    isSampleData: true
  },
  {
    id: 'menu-103',
    restaurantId: 'REST-NOODLE-02',
    restaurantName: '[예시 식당] 한그릇 온면집',
    tableNumber: '테이블 02번',
    menuName: '얼큰 해물 쌀국수',
    ingredients: '쌀면(쌀 90%, 타피오카전분), 숙주, 청경채, 양파',
    sauce: '특제 매운 소스',
    broth: '해물 육수',
    topping: '고수, 레몬, 홍고추',
    source: 'RESTAURANT_DIRECT',
    updatedAt: '2026-11-10',
    isSampleData: true
  },
  {
    id: 'menu-104',
    restaurantId: 'REST-NOODLE-02',
    restaurantName: '[예시 식당] 한그릇 온면집',
    tableNumber: '테이블 02번',
    menuName: '신메뉴 계절 비빔밥 (원재료 미등록)',
    ingredients: '',
    sauce: '',
    broth: '',
    topping: '',
    source: 'UNVERIFIED',
    updatedAt: '미등록',
    isSampleData: true
  }
];

/** 포장식품 OCR 시뮬레이션용 프리셋 */
const OCR_PRESETS = [
  {
    id: 'ocr-1',
    label: '예시 라벨 ① 고소함 가득 아몬드 초코쿠키',
    productName: '고소함 가득 아몬드 초코쿠키',
    extractedText:
      '밀가루(밀:미국산), 백설탕, 가공버터(우유), 코코아분말, 전란액(달걀), 아몬드분태 8%, 대두레시틴(대두), 정제소금, 합성향료(바닐린)'
  },
  {
    id: 'ocr-2',
    label: '예시 라벨 ② 담백한 현미 쌀과자',
    productName: '담백한 현미 쌀과자',
    extractedText: '현미(국산) 94%, 찹쌀(국산) 5%, 천일염(국산) 1%'
  },
  {
    id: 'ocr-3',
    label: '예시 라벨 ③ 매콤달콤 떡볶이 밀키트',
    productName: '매콤달콤 떡볶이 밀키트',
    extractedText:
      '쌀떡(쌀, 정제소금, 주정), 어묵(연육, 밀가루, 대두유), 떡볶이특제소스, 복합조미식품, 건조대파'
  }
];

type TabId = 'home' | 'allergies' | 'packaged' | 'restaurant' | 'register' | 'question';

// ============================================================================
// [메인 React 애플리케이션 컴포넌트]
// ============================================================================

export default function App() {
  // 네비게이션 탭 상태
  const [activeTab, setActiveTab] = useState<TabId>('home');

  // 접근성 상태 (글자 크기 100%, 115%, 130% & TTS 재생 중 상태)
  const [fontScale, setFontScale] = useState<'normal' | 'large' | 'xlarge'>('normal');
  const [isSpeaking, setIsSpeaking] = useState<boolean>(false);

  // 1. 사용자 등록 알레르기 상태 (LocalStorage 영구 저장)
  const [userAllergens, setUserAllergens] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('safebite_user_allergens');
      return saved ? JSON.parse(saved) : ['땅콩', '우유', '새우'];
    } catch {
      return ['땅콩', '우유', '새우'];
    }
  });
  const [customAllergenInput, setCustomAllergenInput] = useState('');

  // 2. 포장식품 분석 상태
  const [foodNameInput, setFoodNameInput] = useState('고소함 가득 아몬드 초코쿠키');
  const [ocrTextInput, setOcrTextInput] = useState(OCR_PRESETS[0].extractedText);
  const [uploadedFileName, setUploadedFileName] = useState<string | null>(null);
  const [isOcrProcessing, setIsOcrProcessing] = useState(false);

  // 3. 식당 메뉴 데이터베이스 (기본 예시 데이터 + 사장님 모드 직접 등록 데이터)
  const [restaurantMenus, setRestaurantMenus] = useState<RestaurantMenu[]>(() => {
    try {
      const saved = localStorage.getItem('safebite_restaurant_menus');
      const customMenus: RestaurantMenu[] = saved ? JSON.parse(saved) : [];
      return [...customMenus, ...INITIAL_SAMPLE_MENUS];
    } catch {
      return INITIAL_SAMPLE_MENUS;
    }
  });
  const [selectedRestaurantFilter, setSelectedRestaurantFilter] = useState<string>('ALL');
  const [qrScanNotice, setQrScanNotice] = useState<string | null>(null);

  // 4. 식당 사장님 원재료 등록 폼 상태
  const [regRestaurantName, setRegRestaurantName] = useState('우리동네 바른식당');
  const [regMenuName, setRegMenuName] = useState('');
  const [regIngredients, setRegIngredients] = useState('');
  const [regSauce, setRegSauce] = useState('');
  const [regBroth, setRegBroth] = useState('');
  const [regTopping, setRegTopping] = useState('');
  const [registerFeedback, setRegisterFeedback] = useState<string | null>(null);

  // 5. 알레르기 확인 질문 & 직원 답변 분석 상태
  const [questionTargetMenu, setQuestionTargetMenu] = useState<string>('얼큰 해물 쌀국수');
  const [staffReplyInput, setStaffReplyInput] = useState(
    '육수는 해물 다시팩을 쓰는데 정확한 성분은 확인해 봐야 할 것 같고, 특제 매운 소스에는 땅콩가루가 조금 들어갑니다.'
  );
  const [copiedQuestionIdx, setCopiedQuestionIdx] = useState<number | null>(null);

  // 6. 최근 분석 이력 및 상세 결과 모달 상태
  const [analysisHistory, setAnalysisHistory] = useState<AnalysisRecord[]>([]);
  const [selectedDetailRecord, setSelectedDetailRecord] = useState<AnalysisRecord | null>(null);

  // LocalStorage 동기화
  useEffect(() => {
    try {
      localStorage.setItem('safebite_user_allergens', JSON.stringify(userAllergens));
    } catch (e) {
      console.error('로컬 저장소 저장 실패:', e);
    }
  }, [userAllergens]);

  // 접근성: 글자 크기 비율에 따라 루트 폰트 사이즈 동적 조정
  useEffect(() => {
    const root = document.documentElement;
    if (fontScale === 'normal') root.style.fontSize = '16px';
    if (fontScale === 'large') root.style.fontSize = '18.5px';
    if (fontScale === 'xlarge') root.style.fontSize = '21px';
    return () => {
      root.style.fontSize = '16px';
    };
  }, [fontScale]);

  // TTS 음성 안내 실행 핸들러
  const handleSpeak = useCallback((text: string) => {
    setIsSpeaking(true);
    speakKorean(text, () => setIsSpeaking(false));
  }, []);

  const handleStopSpeak = useCallback(() => {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
    setIsSpeaking(false);
  }, []);

  // 알레르기 토글 / 추가 / 삭제
  const toggleAllergen = (item: string) => {
    setUserAllergens((prev) =>
      prev.includes(item) ? prev.filter((a) => a !== item) : [...prev, item]
    );
  };

  const handleAddCustomAllergen = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = customAllergenInput.trim();
    if (!trimmed) return;
    if (!userAllergens.includes(trimmed)) {
      setUserAllergens((prev) => [...prev, trimmed]);
    }
    setCustomAllergenInput('');
  };

  const handleClearAllAllergens = () => {
    setUserAllergens([]);
    handleSpeak('등록된 모든 알레르기 정보가 삭제되었습니다.');
  };

  // 포장식품 사진 업로드 시뮬레이션 (실제 Tesseract.js / Cloud Vision OCR 연동 지점 포함)
  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadedFileName(file.name);
    setIsOcrProcessing(true);

    // [실제 서비스 연동 지점]
    // 추후 이 위치에서 Tesseract.js 또는 Google Cloud Vision OCR API로 이미지 파일을 전송하여 텍스트를 추출합니다.
    setTimeout(() => {
      setIsOcrProcessing(false);
      const matchedPreset =
        file.name.includes('쌀') || file.name.includes('과자')
          ? OCR_PRESETS[1]
          : file.name.includes('떡')
          ? OCR_PRESETS[2]
          : OCR_PRESETS[0];

      setFoodNameInput(matchedPreset.productName);
      setOcrTextInput(matchedPreset.extractedText);
      handleSpeak(
        `사진에서 원재료 텍스트 추출이 완료되었습니다. 오인식된 글자가 있는지 확인 후 분석하기 버튼을 눌러주세요.`
      );
    }, 700);
  };

  // 포장식품 원재료 분석 실행 (핵심 추론 엔진 + 보조 ML 프로토타입 동시 가동)
  const handleAnalyzePackagedFood = () => {
    const mlClassification = MLClassifierPrototype.classifyText(ocrTextInput, userAllergens);
    const inference = InferenceEngine.evaluate(
      userAllergens,
      { ingredients: ocrTextInput },
      mlClassification
    );

    const newRecord: AnalysisRecord = {
      id: `rec-${Date.now()}`,
      targetName: foodNameInput.trim() || '포장식품 원재료 분석',
      category: 'PACKAGED_FOOD',
      rawText: ocrTextInput,
      inference,
      mlClassification,
      source: 'OFFICIAL_LABEL',
      updatedAt: new Date().toISOString().split('T')[0]
    };

    setAnalysisHistory((prev) => [newRecord, ...prev]);
    setSelectedDetailRecord(newRecord);
    handleSpeak(
      `분석 결과: ${inference.statusLabel}. ${inference.summaryMessage}`
    );
  };

  // 식당 메뉴 개별 분석 및 상세 모달 열기
  const handleInspectRestaurantMenu = (menu: RestaurantMenu) => {
    const combinedRaw = [menu.ingredients, menu.sauce, menu.broth, menu.topping]
      .filter(Boolean)
      .join(', ');
    const mlClassification = MLClassifierPrototype.classifyText(combinedRaw, userAllergens);
    const inference = InferenceEngine.evaluate(
      userAllergens,
      {
        ingredients: menu.ingredients,
        sauce: menu.sauce,
        broth: menu.broth,
        topping: menu.topping
      },
      mlClassification
    );

    const record: AnalysisRecord = {
      id: `menu-rec-${Date.now()}`,
      targetName: `${menu.restaurantName} - ${menu.menuName}`,
      category: 'RESTAURANT_MENU',
      rawText: combinedRaw || '원재료 정보 미등록',
      inference,
      mlClassification,
      source: menu.source,
      updatedAt: menu.updatedAt,
      isSampleData: menu.isSampleData
    };

    setAnalysisHistory((prev) => [record, ...prev]);
    setSelectedDetailRecord(record);
    handleSpeak(
      `${menu.menuName} 분석 결과: ${inference.statusLabel}. ${inference.summaryMessage}`
    );
  };

  // QR코드 스캔 시뮬레이션 핸들러
  const handleSimulateQrScan = (restaurantId: string, label: string) => {
    setSelectedRestaurantFilter(restaurantId);
    setQrScanNotice(`QR코드 인식 완료: ${label}의 최신 메뉴 원재료 정보를 불러왔습니다.`);
    handleSpeak(`${label} QR코드가 인식되었습니다. 메뉴별 알레르기 분석 결과를 확인하세요.`);
  };

  // 식당 사장님 메뉴 등록 핸들러
  const handleRegisterRestaurantMenu = (e: React.FormEvent) => {
    e.preventDefault();
    if (!regMenuName.trim() || !regIngredients.trim()) {
      setRegisterFeedback('메뉴명과 주원재료는 필수 입력 항목입니다.');
      return;
    }

    const today = new Date().toISOString().split('T')[0];
    const newMenu: RestaurantMenu = {
      id: `custom-menu-${Date.now()}`,
      restaurantId: 'REST-CUSTOM-OWNER',
      restaurantName: regRestaurantName.trim() || '직접 등록 식당',
      tableNumber: 'QR 테이블 연동됨',
      menuName: regMenuName.trim(),
      ingredients: regIngredients.trim(),
      sauce: regSauce.trim() || '없음',
      broth: regBroth.trim() || '없음',
      topping: regTopping.trim() || '없음',
      source: 'RESTAURANT_DIRECT',
      updatedAt: today,
      isSampleData: false
    };

    const updatedMenus = [newMenu, ...restaurantMenus];
    setRestaurantMenus(updatedMenus);

    try {
      const onlyCustom = updatedMenus.filter((m) => !m.isSampleData);
      localStorage.setItem('safebite_restaurant_menus', JSON.stringify(onlyCustom));
    } catch (err) {
      console.error(err);
    }

    setRegMenuName('');
    setRegIngredients('');
    setRegSauce('');
    setRegBroth('');
    setRegTopping('');
    setRegisterFeedback(
      `[${newMenu.menuName}] 메뉴가 '식당 직접 등록 정보' 출처로 데이터베이스에 저장되었습니다. (업데이트: ${today})`
    );
    handleSpeak(`${newMenu.menuName} 메뉴의 원재료 정보가 등록되었습니다.`);
  };

  // 맞춤형 알레르기 확인 질문 자동 생성 로직
  const generatedQuestions = React.useMemo(() => {
    const allergyText =
      userAllergens.length > 0 ? userAllergens.join(', ') : '특정 알레르기 유발 성분';
    const menuLabel = questionTargetMenu.trim() || '선택하신 메뉴';

    return [
      `안녕하세요. 제가 [${allergyText}] 알레르기가 있어서 확인차 여쭤봅니다. '${menuLabel}'의 소스나 양념에 해당 성분이 포함되어 있나요?`,
      `이 메뉴에 사용되는 육수, 채수 또는 기성품 조미료의 세부 원재료에 [${allergyText}] 성분이 들어가는지 확인할 수 있을까요?`,
      `조리 과정에서 [${allergyText}] 성분이 들어간 다른 메뉴와 같은 조리 기구나 튀김기, 도마를 함께 사용하나요?`
    ];
  }, [userAllergens, questionTargetMenu]);

  // 직원 답변 AI 분석 실행 (보조 ML 프로토타입 + 핵심 추론 엔진 연동)
  const handleAnalyzeStaffReply = () => {
    const mlClassification = MLClassifierPrototype.classifyText(staffReplyInput, userAllergens);
    const inference = InferenceEngine.evaluate(
      userAllergens,
      {
        ingredients: staffReplyInput,
        staffNote: staffReplyInput
      },
      mlClassification
    );

    const record: AnalysisRecord = {
      id: `qa-rec-${Date.now()}`,
      targetName: `직원 확인: ${questionTargetMenu || '식당 메뉴'}`,
      category: 'STAFF_QA',
      rawText: staffReplyInput,
      inference,
      mlClassification,
      source: 'STAFF_CONFIRMED',
      updatedAt: new Date().toISOString().split('T')[0]
    };

    setAnalysisHistory((prev) => [record, ...prev]);
    setSelectedDetailRecord(record);
    handleSpeak(
      `직원 답변 분석 결과: ${inference.statusLabel}. ${inference.summaryMessage}`
    );
  };

  // 추론 상태별 시각적 스타일 헬퍼 (색상 + 아이콘 + 텍스트 병기로 색각 이상자 및 시각장애인 배려)
  const getStatusBadgeConfig = (status: InferenceStatus) => {
    switch (status) {
      case 'ALLERGEN_DETECTED':
        return {
          bg: 'bg-red-50 border-red-600 text-red-900',
          headerBg: 'bg-red-600 text-white',
          badge: 'bg-red-100 text-red-900 border-red-400',
          icon: <XCircle className="w-6 h-6 shrink-0 text-red-600" aria-hidden="true" />,
          headerIcon: <XCircle className="w-7 h-7 shrink-0 text-white" aria-hidden="true" />
        };
      case 'NEEDS_VERIFICATION':
        return {
          bg: 'bg-orange-50 border-orange-500 text-orange-950',
          headerBg: 'bg-orange-600 text-white',
          badge: 'bg-orange-100 text-orange-900 border-orange-400',
          icon: <AlertTriangle className="w-6 h-6 shrink-0 text-orange-600" aria-hidden="true" />,
          headerIcon: <AlertTriangle className="w-7 h-7 shrink-0 text-white" aria-hidden="true" />
        };
      case 'INSUFFICIENT_INFO':
        return {
          bg: 'bg-slate-100 border-slate-500 text-slate-900',
          headerBg: 'bg-slate-700 text-white',
          badge: 'bg-slate-200 text-slate-900 border-slate-400',
          icon: <HelpCircle className="w-6 h-6 shrink-0 text-slate-700" aria-hidden="true" />,
          headerIcon: <HelpCircle className="w-7 h-7 shrink-0 text-white" aria-hidden="true" />
        };
      case 'NOT_FOUND_IN_LIST':
        return {
          bg: 'bg-emerald-50 border-emerald-600 text-emerald-950',
          headerBg: 'bg-emerald-700 text-white',
          badge: 'bg-emerald-100 text-emerald-900 border-emerald-400',
          icon: <CheckCircle2 className="w-6 h-6 shrink-0 text-emerald-700" aria-hidden="true" />,
          headerIcon: <CheckCircle2 className="w-7 h-7 shrink-0 text-white" aria-hidden="true" />
        };
    }
  };

  // 필터링된 식당 메뉴
  const filteredMenus =
    selectedRestaurantFilter === 'ALL'
      ? restaurantMenus
      : restaurantMenus.filter((m) => m.restaurantId === selectedRestaurantFilter);

  return (
    <div className="min-h-screen bg-white text-slate-900 flex flex-col font-sans selection:bg-emerald-200">
      {/* ====================================================================
          상단 고정 접근성 바 (글자 크기 조절 + 음성 안내 제어)
          ==================================================================== */}
      <header className="sticky top-0 z-40 bg-white border-b-2 border-emerald-700 shadow-sm">
        <div className="max-w-5xl mx-auto px-4 py-2.5 flex flex-wrap items-center justify-between gap-2 bg-emerald-950 text-white text-xs sm:text-sm">
          <div className="flex items-center gap-2">
            <Eye className="w-4 h-4 text-emerald-300 shrink-0" aria-hidden="true" />
            <span className="font-semibold">접근성 및 음성 안내 설정</span>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* 글자 크기 3단계 조절 */}
            <div className="flex items-center bg-emerald-900 rounded-lg p-0.5 border border-emerald-700" role="group" aria-label="화면 글자 크기 조절">
              <span className="px-2 text-emerald-200 flex items-center gap-1">
                <Type className="w-3.5 h-3.5" aria-hidden="true" />
                <span className="hidden sm:inline">글자:</span>
              </span>
              <button
                type="button"
                onClick={() => setFontScale('normal')}
                aria-pressed={fontScale === 'normal'}
                aria-label="글자 크기 보통 100%"
                className={`px-2.5 py-1 rounded-md font-bold transition focus:outline-none focus:ring-2 focus:ring-orange-400 ${
                  fontScale === 'normal'
                    ? 'bg-white text-emerald-950'
                    : 'text-emerald-100 hover:bg-emerald-800'
                }`}
              >
                보통
              </button>
              <button
                type="button"
                onClick={() => setFontScale('large')}
                aria-pressed={fontScale === 'large'}
                aria-label="글자 크기 크게 115%"
                className={`px-2.5 py-1 rounded-md font-bold transition focus:outline-none focus:ring-2 focus:ring-orange-400 ${
                  fontScale === 'large'
                    ? 'bg-white text-emerald-950'
                    : 'text-emerald-100 hover:bg-emerald-800'
                }`}
              >
                크게
              </button>
              <button
                type="button"
                onClick={() => setFontScale('xlarge')}
                aria-pressed={fontScale === 'xlarge'}
                aria-label="글자 크기 매우 크게 130%"
                className={`px-2.5 py-1 rounded-md font-bold transition focus:outline-none focus:ring-2 focus:ring-orange-400 ${
                  fontScale === 'xlarge'
                    ? 'bg-white text-emerald-950'
                    : 'text-emerald-100 hover:bg-emerald-800'
                }`}
              >
                매우 크게
              </button>
            </div>

            {/* 현재 화면 요약 음성 읽기 / 정지 */}
            {isSpeaking ? (
              <button
                type="button"
                onClick={handleStopSpeak}
                aria-label="음성 안내 중지하기"
                className="flex items-center gap-1.5 bg-orange-600 hover:bg-orange-500 text-white font-bold px-3 py-1.5 rounded-lg transition focus:outline-none focus:ring-2 focus:ring-white"
              >
                <VolumeX className="w-4 h-4" aria-hidden="true" />
                <span>음성 중지</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={() =>
                  handleSpeak(
                    `AI 식품 알레르기 경고 도우미입니다. 현재 등록된 내 알레르기는 ${
                      userAllergens.length > 0 ? userAllergens.join(', ') : '없음'
                    }입니다.`
                  )
                }
                aria-label="현재 등록된 알레르기 요약 음성으로 듣기"
                className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold px-3 py-1.5 rounded-lg transition focus:outline-none focus:ring-2 focus:ring-white"
              >
                <Volume2 className="w-4 h-4" aria-hidden="true" />
                <span>음성 안내 듣기</span>
              </button>
            )}
          </div>
        </div>

        {/* 앱 로고 및 메인 내비게이션 탭 */}
        <div className="max-w-5xl mx-auto px-4 py-3">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-3">
            <button
              type="button"
              onClick={() => setActiveTab('home')}
              className="flex items-center gap-3 text-left focus:outline-none focus:ring-2 focus:ring-emerald-600 rounded-lg p-1"
              aria-label="AI 식품 알레르기 경고 도우미 홈으로 이동"
            >
              <div className="w-11 h-11 rounded-xl bg-emerald-700 text-white flex items-center justify-center shadow-sm shrink-0">
                <ShieldAlert className="w-6 h-6" aria-hidden="true" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="text-lg sm:text-xl font-extrabold text-emerald-950 tracking-tight">
                    세이프바이트 AI (SafeBite)
                  </h1>
                  <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-orange-100 text-orange-800 border border-orange-300">
                    창업 시제품
                  </span>
                </div>
                <p className="text-xs sm:text-sm text-slate-600 font-medium">
                  추론 엔진 기반 개인 맞춤형 식품 알레르기 경고 도우미
                </p>
              </div>
            </button>

            {/* AI 아키텍처 상태 배지 */}
            <div className="flex flex-wrap items-center gap-1.5 text-xs">
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-emerald-50 text-emerald-900 border border-emerald-300 font-bold">
                <BrainCircuit className="w-3.5 h-3.5 text-emerald-700" aria-hidden="true" />
                핵심 AI: 규칙 기반 추론 엔진
              </span>
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-orange-50 text-orange-900 border border-orange-300 font-bold">
                <Cpu className="w-3.5 h-3.5 text-orange-600" aria-hidden="true" />
                보조 AI: ML 분류 프로토타입
              </span>
            </div>
          </div>

          {/* 6개 주요 화면 탭 내비게이션 (7번째 화면은 분석 결과 상세 화면/모달) */}
          <nav aria-label="주요 기능 메뉴" className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
            {[
              { id: 'home', label: '1. 메인 홈', icon: ShieldCheck },
              { id: 'allergies', label: '2. 알레르기 설정', icon: Plus },
              { id: 'packaged', label: '3. 포장식품 분석', icon: Camera },
              { id: 'restaurant', label: '4. 식당·QR 메뉴', icon: QrCode },
              { id: 'register', label: '5. 식당 원재료 등록', icon: Store },
              { id: 'question', label: '6. AI 질문·답변', icon: MessageSquareText }
            ].map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id as TabId)}
                  aria-current={isActive ? 'page' : undefined}
                  className={`flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl font-bold text-sm border-2 transition focus:outline-none focus:ring-2 focus:ring-orange-500 ${
                    isActive
                      ? 'bg-emerald-700 text-white border-emerald-700 shadow-sm'
                      : 'bg-white text-slate-800 border-slate-200 hover:border-emerald-500 hover:bg-emerald-50'
                  }`}
                >
                  <Icon className="w-4 h-4 shrink-0" aria-hidden="true" />
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </nav>
        </div>
      </header>

      {/* ====================================================================
          메인 콘텐츠 영역
          ==================================================================== */}
      <main className="flex-1 max-w-5xl w-full mx-auto px-4 py-6 space-y-6">
        {/* ------------------------------------------------------------------
            [화면 1] 메인 화면
            ------------------------------------------------------------------ */}
        {activeTab === 'home' && (
          <div className="space-y-6">
            {/* 히어로 소개 배너 */}
            <section
              aria-labelledby="hero-heading"
              className="rounded-2xl border-2 border-emerald-700 bg-gradient-to-br from-emerald-50 via-white to-orange-50 p-6 shadow-sm"
            >
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="space-y-2">
                  <span className="inline-block px-3 py-1 rounded-full bg-emerald-700 text-white text-xs font-bold">
                    고등학생 창업 시제품 · 모두를 위한 식품 안전 AI
                  </span>
                  <h2 id="hero-heading" className="text-2xl sm:text-3xl font-extrabold text-slate-900">
                    내 알레르기 정보로 원재료를 즉시 추론하고 경고합니다
                  </h2>
                  <p className="text-slate-700 leading-relaxed">
                    포장식품 라벨 사진과 식당 메뉴의 소스·육수·복합재료를 <strong>규칙 기반 추론 엔진</strong>으로
                    분석하고, <strong>한국어 음성 안내(TTS)</strong>로 시각장애인도 독립적으로 확인할 수 있습니다.
                  </p>
                </div>
              </div>
            </section>

            {/* 내 등록 알레르기 요약 카드 */}
            <section
              aria-labelledby="my-allergy-heading"
              className="rounded-2xl border-2 border-slate-200 bg-white p-5 shadow-sm"
            >
              <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                <div>
                  <h3 id="my-allergy-heading" className="text-lg font-extrabold text-slate-900 flex items-center gap-2">
                    <ShieldAlert className="w-5 h-5 text-orange-600" aria-hidden="true" />
                    <span>현재 등록된 내 알레르기 유발 성분 ({userAllergens.length}개)</span>
                  </h3>
                  <p className="text-sm text-slate-600">
                    모든 포장식품 및 식당 메뉴 분석 시 아래 성분과 파생 원재료가 자동 매칭됩니다.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setActiveTab('allergies')}
                  className="px-4 py-2.5 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white font-bold text-sm transition focus:outline-none focus:ring-2 focus:ring-orange-500"
                >
                  알레르기 수정·추가하기
                </button>
              </div>

              {userAllergens.length === 0 ? (
                <div className="p-4 rounded-xl bg-orange-50 border border-orange-300 text-orange-900 font-medium">
                  등록된 알레르기 성분이 없습니다. &apos;알레르기 수정·추가하기&apos; 버튼을 눌러 성분을 등록해 주세요.
                </div>
              ) : (
                <div className="flex flex-wrap gap-2" role="list" aria-label="등록된 알레르기 목록">
                  {userAllergens.map((allergen) => (
                    <span
                      key={allergen}
                      role="listitem"
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-orange-100 text-orange-950 border-2 border-orange-400 font-extrabold text-sm"
                    >
                      <AlertTriangle className="w-4 h-4 text-orange-700" aria-hidden="true" />
                      {allergen}
                    </span>
                  ))}
                </div>
              )}
            </section>

            {/* 핵심 기능 빠른 실행 버튼 그리드 */}
            <section aria-labelledby="quick-actions-heading" className="space-y-3">
              <h3 id="quick-actions-heading" className="text-lg font-extrabold text-slate-900">
                바로 시작하기
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <button
                  type="button"
                  onClick={() => setActiveTab('packaged')}
                  className="flex flex-col justify-between p-5 rounded-2xl border-2 border-emerald-600 bg-white hover:bg-emerald-50 text-left transition shadow-sm focus:outline-none focus:ring-4 focus:ring-orange-400"
                >
                  <div className="w-12 h-12 rounded-xl bg-emerald-100 text-emerald-800 flex items-center justify-center mb-3">
                    <Camera className="w-6 h-6" aria-hidden="true" />
                  </div>
                  <div>
                    <h4 className="text-lg font-extrabold text-slate-900 mb-1">포장식품 원재료 분석</h4>
                    <p className="text-sm text-slate-600">
                      원재료 사진 업로드(OCR) 또는 직접 입력으로 알레르겐과 파생 성분을 추론합니다.
                    </p>
                  </div>
                  <span className="mt-4 inline-flex items-center gap-1 text-emerald-700 font-bold text-sm">
                    분석 시작하기 <ChevronRight className="w-4 h-4" aria-hidden="true" />
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => setActiveTab('restaurant')}
                  className="flex flex-col justify-between p-5 rounded-2xl border-2 border-orange-500 bg-white hover:bg-orange-50 text-left transition shadow-sm focus:outline-none focus:ring-4 focus:ring-emerald-500"
                >
                  <div className="w-12 h-12 rounded-xl bg-orange-100 text-orange-800 flex items-center justify-center mb-3">
                    <QrCode className="w-6 h-6" aria-hidden="true" />
                  </div>
                  <div>
                    <h4 className="text-lg font-extrabold text-slate-900 mb-1">식당 메뉴 & QR 확인</h4>
                    <p className="text-sm text-slate-600">
                      테이블 QR코드로 식당이 직접 등록한 메뉴별 원재료·소스·육수를 즉시 비교합니다.
                    </p>
                  </div>
                  <span className="mt-4 inline-flex items-center gap-1 text-orange-700 font-bold text-sm">
                    메뉴 확인하기 <ChevronRight className="w-4 h-4" aria-hidden="true" />
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => setActiveTab('question')}
                  className="flex flex-col justify-between p-5 rounded-2xl border-2 border-slate-300 bg-white hover:bg-slate-50 text-left transition shadow-sm focus:outline-none focus:ring-4 focus:ring-orange-400"
                >
                  <div className="w-12 h-12 rounded-xl bg-slate-100 text-slate-800 flex items-center justify-center mb-3">
                    <MessageSquareText className="w-6 h-6" aria-hidden="true" />
                  </div>
                  <div>
                    <h4 className="text-lg font-extrabold text-slate-900 mb-1">AI 확인 질문 & 답변 분석</h4>
                    <p className="text-sm text-slate-600">
                      식당 직원에게 물어볼 질문을 생성하고, 답변의 모호성과 성분을 AI로 분석합니다.
                    </p>
                  </div>
                  <span className="mt-4 inline-flex items-center gap-1 text-slate-800 font-bold text-sm">
                    질문 생성하기 <ChevronRight className="w-4 h-4" aria-hidden="true" />
                  </span>
                </button>
              </div>
            </section>

            {/* 최근 분석 결과 이력 */}
            <section aria-labelledby="recent-history-heading" className="space-y-3">
              <h3 id="recent-history-heading" className="text-lg font-extrabold text-slate-900">
                최근 분석 결과 이력 ({analysisHistory.length}건)
              </h3>
              {analysisHistory.length === 0 ? (
                <div className="p-6 rounded-2xl border-2 border-dashed border-slate-300 text-center text-slate-600">
                  아직 수행한 분석 기록이 없습니다. 포장식품 분석이나 식당 메뉴 확인을 실행해 보세요.
                </div>
              ) : (
                <div className="space-y-3">
                  {analysisHistory.map((item) => {
                    const badgeCfg = getStatusBadgeConfig(item.inference.status);
                    return (
                      <div
                        key={item.id}
                        className={`p-4 rounded-2xl border-2 ${badgeCfg.bg} flex flex-col sm:flex-row sm:items-center justify-between gap-3`}
                      >
                        <div className="space-y-1">
                          <div className="flex flex-wrap items-center gap-2">
                            {badgeCfg.icon}
                            <span className="font-extrabold text-base">{item.inference.statusLabel}</span>
                            <span className="text-xs px-2 py-0.5 rounded-md bg-white/80 border border-slate-300 font-semibold">
                              {SOURCE_META[item.source].label}
                            </span>
                          </div>
                          <p className="font-bold text-slate-900">{item.targetName}</p>
                          <p className="text-xs text-slate-700">분석 일자: {item.updatedAt}</p>
                        </div>
                        <button
                          type="button"
                          onClick={() => setSelectedDetailRecord(item)}
                          className="px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-sm shrink-0 focus:outline-none focus:ring-2 focus:ring-orange-400"
                        >
                          추론 근거 상세 보기
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
          </div>
        )}

        {/* ------------------------------------------------------------------
            [화면 2] 개인별 알레르기 정보 설정 화면
            ------------------------------------------------------------------ */}
        {activeTab === 'allergies' && (
          <section aria-labelledby="allergy-settings-heading" className="space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 id="allergy-settings-heading" className="text-2xl font-extrabold text-slate-900">
                  개인별 알레르기 정보 설정
                </h2>
                <p className="text-slate-600 text-sm mt-1">
                  선택한 정보는 브라우저 로컬 저장소(LocalStorage)에 안전하게 저장되며 언제든 수정·삭제할 수 있습니다.
                </p>
              </div>
              {userAllergens.length > 0 && (
                <button
                  type="button"
                  onClick={handleClearAllAllergens}
                  className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-red-600 hover:bg-red-700 text-white font-bold text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
                >
                  <Trash2 className="w-4 h-4" aria-hidden="true" />
                  <span>전체 삭제</span>
                </button>
              )}
            </div>

            {/* 주요 식품 알레르기 유발 성분 버튼 그리드 */}
            <div className="p-5 rounded-2xl border-2 border-slate-200 bg-white space-y-4">
              <h3 className="font-extrabold text-slate-900">
                1. 주요 알레르기 유발 성분 선택 (클릭하여 선택/해제)
              </h3>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2.5">
                {COMMON_ALLERGENS.map((item) => {
                  const selected = userAllergens.includes(item);
                  return (
                    <button
                      key={item}
                      type="button"
                      onClick={() => toggleAllergen(item)}
                      aria-pressed={selected}
                      className={`flex items-center justify-between px-4 py-3 rounded-xl border-2 font-bold text-sm transition focus:outline-none focus:ring-2 focus:ring-orange-500 ${
                        selected
                          ? 'bg-orange-600 text-white border-orange-600 shadow-sm'
                          : 'bg-white text-slate-800 border-slate-200 hover:border-emerald-600'
                      }`}
                    >
                      <span>{item}</span>
                      {selected ? (
                        <Check className="w-4 h-4 shrink-0" aria-hidden="true" />
                      ) : (
                        <Plus className="w-4 h-4 text-slate-400 shrink-0" aria-hidden="true" />
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* 사용자 직접 입력 추가 폼 */}
            <form
              onSubmit={handleAddCustomAllergen}
              className="p-5 rounded-2xl border-2 border-emerald-600 bg-emerald-50/50 space-y-3"
            >
              <label htmlFor="custom-allergen-input" className="block font-extrabold text-slate-900">
                2. 목록에 없는 알레르기 성분 직접 추가 (예: 키위, 참깨, 셀러리 등)
              </label>
              <div className="flex flex-col sm:flex-row gap-2">
                <input
                  id="custom-allergen-input"
                  type="text"
                  value={customAllergenInput}
                  onChange={(e) => setCustomAllergenInput(e.target.value)}
                  placeholder="알레르기 유발 성분명을 입력하세요"
                  className="flex-1 px-4 py-3 rounded-xl border-2 border-slate-300 bg-white text-slate-900 font-medium focus:outline-none focus:border-emerald-700"
                />
                <button
                  type="submit"
                  className="px-6 py-3 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white font-extrabold transition focus:outline-none focus:ring-2 focus:ring-orange-500"
                >
                  성분 등록하기
                </button>
              </div>
            </form>

            {/* 현재 등록 목록 및 개별 삭제 */}
            <div className="p-5 rounded-2xl border-2 border-slate-200 bg-white space-y-3">
              <h3 className="font-extrabold text-slate-900">
                현재 저장된 알레르기 목록 ({userAllergens.length}개)
              </h3>
              <div className="flex flex-wrap gap-2">
                {userAllergens.map((allergen) => (
                  <span
                    key={allergen}
                    className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-slate-100 border border-slate-300 font-bold text-sm"
                  >
                    <span>{allergen}</span>
                    <button
                      type="button"
                      onClick={() => toggleAllergen(allergen)}
                      aria-label={`${allergen} 알레르기 삭제`}
                      className="p-1 rounded-lg bg-slate-200 hover:bg-red-600 hover:text-white transition"
                    >
                      <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                    </button>
                  </span>
                ))}
              </div>
            </div>
          </section>
        )}

        {/* ------------------------------------------------------------------
            [화면 3] 포장식품 원재료 분석 화면 (OCR 시뮬레이션 + 직접 수정 + 추론 분석)
            ------------------------------------------------------------------ */}
        {activeTab === 'packaged' && (
          <section aria-labelledby="packaged-food-heading" className="space-y-6">
            <div>
              <h2 id="packaged-food-heading" className="text-2xl font-extrabold text-slate-900">
                포장식품 원재료 분석
              </h2>
              <p className="text-slate-600 text-sm mt-1">
                원재료 표시 사진을 업로드하여 OCR로 텍스트를 추출하거나, 오인식된 글자를 직접 수정해 AI 추론 분석을 실행하세요.
              </p>
            </div>

            {/* OCR 시뮬레이션 및 사진 업로드 영역 */}
            <div className="p-5 rounded-2xl border-2 border-emerald-600 bg-white space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="font-extrabold text-slate-900 flex items-center gap-2">
                  <Camera className="w-5 h-5 text-emerald-700" aria-hidden="true" />
                  <span>1단계: 원재료 표시 사진 업로드 (OCR 추출)</span>
                </h3>
                <span className="text-xs px-2.5 py-1 rounded-md bg-slate-100 text-slate-700 font-semibold">
                  * 실제 외부 OCR API(Tesseract.js / Cloud Vision) 연동 모듈 구조 포함
                </span>
              </div>

              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
                <label
                  htmlFor="label-image-upload"
                  className="cursor-pointer inline-flex items-center justify-center gap-2 px-5 py-3.5 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white font-extrabold transition focus-within:ring-2 focus-within:ring-orange-500"
                >
                  <Camera className="w-5 h-5" aria-hidden="true" />
                  <span>원재료 사진 파일 선택</span>
                  <input
                    id="label-image-upload"
                    type="file"
                    accept="image/*"
                    onChange={handleImageUpload}
                    className="sr-only"
                  />
                </label>

                {uploadedFileName && (
                  <span className="text-sm font-bold text-emerald-800 bg-emerald-50 px-3 py-2 rounded-lg border border-emerald-300">
                    선택된 파일: {uploadedFileName}
                  </span>
                )}
              </div>

              {/* 시제품 테스트용 OCR 샘플 프리셋 */}
              <div className="space-y-2 pt-2 border-t border-slate-200">
                <p className="text-xs font-bold text-slate-600">
                  사진이 없으신가요? 아래 시제품 테스트용 라벨 예시를 눌러 OCR 결과를 바로 불러올 수 있습니다:
                </p>
                <div className="flex flex-wrap gap-2">
                  {OCR_PRESETS.map((preset) => (
                    <button
                      key={preset.id}
                      type="button"
                      onClick={() => {
                        setFoodNameInput(preset.productName);
                        setOcrTextInput(preset.extractedText);
                        setUploadedFileName(`${preset.productName}_라벨.jpg (시뮬레이션)`);
                      }}
                      className="px-3 py-2 rounded-xl bg-slate-100 hover:bg-orange-100 border border-slate-300 hover:border-orange-400 text-xs font-bold text-slate-800 transition"
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>
              </div>

              {isOcrProcessing && (
                <div className="p-3 rounded-xl bg-orange-50 border border-orange-300 text-orange-900 font-bold text-sm flex items-center gap-2">
                  <RefreshCw className="w-4 h-4 animate-spin" aria-hidden="true" />
                  <span>이미지에서 원재료 텍스트를 추출하고 있습니다...</span>
                </div>
              )}
            </div>

            {/* 추출 텍스트 검수·직접 수정 입력 영역 */}
            <div className="p-5 rounded-2xl border-2 border-slate-200 bg-white space-y-4">
              <h3 className="font-extrabold text-slate-900">
                2단계: 제품명 및 원재료 텍스트 확인 (OCR 오인식 시 직접 수정 가능)
              </h3>

              <div className="space-y-1.5">
                <label htmlFor="packaged-food-name" className="block text-sm font-bold text-slate-800">
                  제품명
                </label>
                <input
                  id="packaged-food-name"
                  type="text"
                  value={foodNameInput}
                  onChange={(e) => setFoodNameInput(e.target.value)}
                  placeholder="예: 고소함 가득 아몬드 초코쿠키"
                  className="w-full px-4 py-3 rounded-xl border-2 border-slate-300 font-medium focus:outline-none focus:border-emerald-700"
                />
              </div>

              <div className="space-y-1.5">
                <label htmlFor="ocr-extracted-textarea" className="block text-sm font-bold text-slate-800">
                  원재료명 표기 내용 (직접 입력 또는 수정)
                </label>
                <textarea
                  id="ocr-extracted-textarea"
                  rows={4}
                  value={ocrTextInput}
                  onChange={(e) => setOcrTextInput(e.target.value)}
                  placeholder="원재료명 표기를 입력하거나 수정하세요 (예: 밀가루, 버터, 땅콩분태, 특제소스 등)"
                  className="w-full px-4 py-3 rounded-xl border-2 border-slate-300 font-medium leading-relaxed focus:outline-none focus:border-emerald-700"
                />
              </div>

              <button
                type="button"
                onClick={handleAnalyzePackagedFood}
                className="w-full py-4 rounded-xl bg-orange-600 hover:bg-orange-700 text-white font-extrabold text-lg shadow-sm transition flex items-center justify-center gap-2 focus:outline-none focus:ring-4 focus:ring-emerald-500"
              >
                <BrainCircuit className="w-6 h-6" aria-hidden="true" />
                <span>AI 추론 엔진으로 알레르기 분석 실행 (음성 안내 포함)</span>
              </button>
            </div>
          </section>
        )}

        {/* ------------------------------------------------------------------
            [화면 4] 식당 메뉴 및 QR코드 연결 화면
            ------------------------------------------------------------------ */}
        {activeTab === 'restaurant' && (
          <section aria-labelledby="restaurant-menu-heading" className="space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 id="restaurant-menu-heading" className="text-2xl font-extrabold text-slate-900">
                  식당 메뉴 및 테이블 QR코드 확인
                </h2>
                <p className="text-slate-600 text-sm mt-1">
                  식당 테이블에 부착된 QR코드를 스캔하면 등록된 메뉴별 원재료·소스·육수를 내 알레르기와 자동 비교합니다.
                </p>
              </div>
            </div>

            {/* 테이블 QR코드 스캔 시뮬레이터 */}
            <div className="p-5 rounded-2xl border-2 border-emerald-700 bg-emerald-50/60 space-y-4">
              <div className="flex items-center gap-2">
                <QrCode className="w-6 h-6 text-emerald-800" aria-hidden="true" />
                <h3 className="font-extrabold text-emerald-950">
                  테이블 QR코드 스캔 시뮬레이터 (QR 태그 선택)
                </h3>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                <button
                  type="button"
                  onClick={() => handleSimulateQrScan('ALL', '전체 등록 식당')}
                  className={`p-3 rounded-xl border-2 font-bold text-sm text-left transition ${
                    selectedRestaurantFilter === 'ALL'
                      ? 'bg-emerald-700 text-white border-emerald-700'
                      : 'bg-white text-slate-800 border-slate-300 hover:border-emerald-600'
                  }`}
                >
                  <div className="text-xs opacity-80">전체 보기</div>
                  <div>모든 식당 메뉴판 보기</div>
                </button>

                <button
                  type="button"
                  onClick={() =>
                    handleSimulateQrScan('REST-GREEN-01', '[예시 식당] 초록숲 샐러드 & 파스타 (테이블 04)')
                  }
                  className={`p-3 rounded-xl border-2 font-bold text-sm text-left transition ${
                    selectedRestaurantFilter === 'REST-GREEN-01'
                      ? 'bg-emerald-700 text-white border-emerald-700'
                      : 'bg-white text-slate-800 border-slate-300 hover:border-emerald-600'
                  }`}
                >
                  <div className="text-xs opacity-80">QR 스캔 #1 (예시 데이터)</div>
                  <div>초록숲 샐러드 & 파스타</div>
                </button>

                <button
                  type="button"
                  onClick={() =>
                    handleSimulateQrScan('REST-NOODLE-02', '[예시 식당] 한그릇 온면집 (테이블 02)')
                  }
                  className={`p-3 rounded-xl border-2 font-bold text-sm text-left transition ${
                    selectedRestaurantFilter === 'REST-NOODLE-02'
                      ? 'bg-emerald-700 text-white border-emerald-700'
                      : 'bg-white text-slate-800 border-slate-300 hover:border-emerald-600'
                  }`}
                >
                  <div className="text-xs opacity-80">QR 스캔 #2 (예시 데이터)</div>
                  <div>한그릇 온면집</div>
                </button>
              </div>

              {qrScanNotice && (
                <div
                  role="status"
                  className="p-3 rounded-xl bg-white border-2 border-emerald-600 text-emerald-950 font-bold text-sm flex items-center gap-2"
                >
                  <CheckCircle2 className="w-5 h-5 text-emerald-700 shrink-0" aria-hidden="true" />
                  <span>{qrScanNotice}</span>
                </div>
              )}
            </div>

            {/* 메뉴별 자동 추론 결과 카드 리스트 */}
            <div className="space-y-4">
              {filteredMenus.map((menu) => {
                // 각 메뉴에 대해 실시간으로 추론 엔진 가동
                const liveInference = InferenceEngine.evaluate(userAllergens, {
                  ingredients: menu.ingredients,
                  sauce: menu.sauce,
                  broth: menu.broth,
                  topping: menu.topping
                });
                const statusCfg = getStatusBadgeConfig(liveInference.status);

                return (
                  <article
                    key={menu.id}
                    className={`rounded-2xl border-2 p-5 shadow-sm space-y-4 ${statusCfg.bg}`}
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-xs font-extrabold px-2.5 py-0.5 rounded-md bg-slate-900 text-white">
                            {menu.restaurantName}
                          </span>
                          {menu.isSampleData && (
                            <span className="text-xs font-bold px-2 py-0.5 rounded-md bg-amber-200 text-amber-950 border border-amber-400">
                              시연용 예시 데이터
                            </span>
                          )}
                          <span
                            className={`text-xs font-bold px-2 py-0.5 rounded-md border ${
                              SOURCE_META[menu.source].badgeClass
                            }`}
                          >
                            {SOURCE_META[menu.source].label}
                          </span>
                        </div>
                        <h3 className="text-xl font-extrabold text-slate-950 pt-1">{menu.menuName}</h3>
                        <p className="text-xs text-slate-700 flex items-center gap-1">
                          <Calendar className="w-3.5 h-3.5" aria-hidden="true" />
                          <span>최종 업데이트: {menu.updatedAt}</span>
                        </p>
                      </div>

                      {/* 추론 판정 배지 */}
                      <div
                        className={`flex items-center gap-2 px-3.5 py-2 rounded-xl border-2 font-extrabold text-sm ${statusCfg.badge}`}
                      >
                        {statusCfg.icon}
                        <span>{liveInference.statusLabel}</span>
                      </div>
                    </div>

                    {/* 세부 원재료 구성 */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 bg-white/90 p-3.5 rounded-xl border border-slate-300 text-sm">
                      <div>
                        <span className="font-extrabold text-slate-700">주원재료: </span>
                        <span className="text-slate-900">{menu.ingredients || '미등록'}</span>
                      </div>
                      <div>
                        <span className="font-extrabold text-slate-700">소스/양념: </span>
                        <span className="text-slate-900">{menu.sauce || '미등록'}</span>
                      </div>
                      <div>
                        <span className="font-extrabold text-slate-700">육수/베이스: </span>
                        <span className="text-slate-900">{menu.broth || '미등록'}</span>
                      </div>
                      <div>
                        <span className="font-extrabold text-slate-700">토핑/고명: </span>
                        <span className="text-slate-900">{menu.topping || '미등록'}</span>
                      </div>
                    </div>

                    {/* 추론 요약 및 버튼 */}
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1">
                      <p className="text-sm font-bold text-slate-900">{liveInference.summaryMessage}</p>
                      <div className="flex flex-wrap items-center gap-2 shrink-0">
                        <button
                          type="button"
                          onClick={() => {
                            setQuestionTargetMenu(menu.menuName);
                            setActiveTab('question');
                          }}
                          className="px-3.5 py-2 rounded-xl bg-white hover:bg-slate-100 text-slate-900 border-2 border-slate-400 font-bold text-xs transition"
                        >
                          이 메뉴 질문 생성하기
                        </button>
                        <button
                          type="button"
                          onClick={() => handleInspectRestaurantMenu(menu)}
                          className="px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs transition"
                        >
                          상세 추론 근거 & 음성 안내
                        </button>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          </section>
        )}

        {/* ------------------------------------------------------------------
            [화면 5] 식당용 원재료 정보 등록 시스템 (사장님 모드)
            ------------------------------------------------------------------ */}
        {activeTab === 'register' && (
          <section aria-labelledby="restaurant-register-heading" className="space-y-6">
            <div>
              <span className="inline-block px-2.5 py-0.5 rounded-md bg-blue-100 text-blue-900 font-bold text-xs mb-1">
                식당 사장님 전용 입력 모드
              </span>
              <h2 id="restaurant-register-heading" className="text-2xl font-extrabold text-slate-900">
                식당 메뉴 원재료 정보 등록
              </h2>
              <p className="text-slate-600 text-sm mt-1">
                식당에서 사용하는 주원재료와 복합재료, 소스, 육수, 토핑을 등록하면 QR 메뉴판에 즉시 반영됩니다.
              </p>
            </div>

            {registerFeedback && (
              <div
                role="status"
                className="p-4 rounded-2xl bg-emerald-50 border-2 border-emerald-600 text-emerald-950 font-bold flex items-center gap-2"
              >
                <CheckCircle2 className="w-5 h-5 text-emerald-700 shrink-0" aria-hidden="true" />
                <span>{registerFeedback}</span>
              </div>
            )}

            <form
              onSubmit={handleRegisterRestaurantMenu}
              className="p-6 rounded-2xl border-2 border-slate-200 bg-white space-y-4 shadow-sm"
            >
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label htmlFor="reg-rest-name" className="block text-sm font-extrabold text-slate-800">
                    식당명
                  </label>
                  <input
                    id="reg-rest-name"
                    type="text"
                    value={regRestaurantName}
                    onChange={(e) => setRegRestaurantName(e.target.value)}
                    className="w-full px-4 py-3 rounded-xl border-2 border-slate-300 font-medium focus:outline-none focus:border-emerald-700"
                  />
                </div>

                <div className="space-y-1.5">
                  <label htmlFor="reg-menu-name" className="block text-sm font-extrabold text-slate-800">
                    메뉴명 (필수) *
                  </label>
                  <input
                    id="reg-menu-name"
                    type="text"
                    required
                    value={regMenuName}
                    onChange={(e) => setRegMenuName(e.target.value)}
                    placeholder="예: 수제 돈가스 정식"
                    className="w-full px-4 py-3 rounded-xl border-2 border-slate-300 font-medium focus:outline-none focus:border-emerald-700"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label htmlFor="reg-ingredients" className="block text-sm font-extrabold text-slate-800">
                  주원재료 및 복합재료 (필수) *
                </label>
                <textarea
                  id="reg-ingredients"
                  rows={2}
                  required
                  value={regIngredients}
                  onChange={(e) => setRegIngredients(e.target.value)}
                  placeholder="예: 돼지고기 등심(국내산), 빵가루(밀가루, 이스트), 전란액(달걀), 식용유(대두유)"
                  className="w-full px-4 py-3 rounded-xl border-2 border-slate-300 font-medium focus:outline-none focus:border-emerald-700"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="space-y-1.5">
                  <label htmlFor="reg-sauce" className="block text-sm font-extrabold text-slate-800">
                    소스 / 양념 정보
                  </label>
                  <input
                    id="reg-sauce"
                    type="text"
                    value={regSauce}
                    onChange={(e) => setRegSauce(e.target.value)}
                    placeholder="예: 데미글라스 소스(토마토, 버터)"
                    className="w-full px-4 py-3 rounded-xl border-2 border-slate-300 font-medium focus:outline-none focus:border-emerald-700"
                  />
                </div>

                <div className="space-y-1.5">
                  <label htmlFor="reg-broth" className="block text-sm font-extrabold text-slate-800">
                    육수 / 베이스 정보
                  </label>
                  <input
                    id="reg-broth"
                    type="text"
                    value={regBroth}
                    onChange={(e) => setRegBroth(e.target.value)}
                    placeholder="예: 가쓰오부시 장국(고등어, 대두)"
                    className="w-full px-4 py-3 rounded-xl border-2 border-slate-300 font-medium focus:outline-none focus:border-emerald-700"
                  />
                </div>

                <div className="space-y-1.5">
                  <label htmlFor="reg-topping" className="block text-sm font-extrabold text-slate-800">
                    토핑 / 고명 정보
                  </label>
                  <input
                    id="reg-topping"
                    type="text"
                    value={regTopping}
                    onChange={(e) => setRegTopping(e.target.value)}
                    placeholder="예: 양배추 샐러드, 참깨 드레싱"
                    className="w-full px-4 py-3 rounded-xl border-2 border-slate-300 font-medium focus:outline-none focus:border-emerald-700"
                  />
                </div>
              </div>

              <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-300 text-xs text-slate-700 space-y-1">
                <p className="font-bold text-slate-900">
                  • 정보 출처 표기 안내: 저장 시 [식당 직접 등록 정보] 배지와 오늘 날짜({new Date().toISOString().split('T')[0]})가 자동 부여됩니다.
                </p>
                <p>
                  • 보수적 안전 원칙에 따라 식당이 직접 등록한 정보라도 조리 중 교차 오염 가능성은 별도 안내됩니다.
                </p>
              </div>

              <button
                type="submit"
                className="w-full py-4 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white font-extrabold text-lg transition focus:outline-none focus:ring-4 focus:ring-orange-400"
              >
                메뉴 원재료 데이터베이스에 등록하기
              </button>
            </form>
          </section>
        )}

        {/* ------------------------------------------------------------------
            [화면 6] 알레르기 확인 질문 생성 & 직원 답변 AI 분석 화면
            ------------------------------------------------------------------ */}
        {activeTab === 'question' && (
          <section aria-labelledby="ai-question-heading" className="space-y-6">
            <div>
              <h2 id="ai-question-heading" className="text-2xl font-extrabold text-slate-900">
                식당 알레르기 확인 질문 생성 & 답변 분석
              </h2>
              <p className="text-slate-600 text-sm mt-1">
                내 알레르기 정보에 맞춰 식당에 물어볼 질문을 자동 생성하고, 직원의 답변을 AI 모듈이 분석해 위험 여부를 판단합니다.
              </p>
            </div>

            {/* 1. AI 질문 자동 생성 */}
            <div className="p-5 rounded-2xl border-2 border-emerald-600 bg-white space-y-4">
              <div className="space-y-1.5">
                <label htmlFor="question-menu-input" className="block text-sm font-extrabold text-slate-900">
                  확인하려는 메뉴명 입력
                </label>
                <input
                  id="question-menu-input"
                  type="text"
                  value={questionTargetMenu}
                  onChange={(e) => setQuestionTargetMenu(e.target.value)}
                  placeholder="예: 얼큰 해물 쌀국수"
                  className="w-full px-4 py-3 rounded-xl border-2 border-slate-300 font-bold focus:outline-none focus:border-emerald-700"
                />
              </div>

              <div className="space-y-3">
                <h3 className="font-extrabold text-emerald-950 flex items-center gap-2">
                  <Sparkles className="w-5 h-5 text-emerald-700" aria-hidden="true" />
                  <span>식당 직원에게 전달할 맞춤형 질문 (복사 또는 음성 출력)</span>
                </h3>
                {generatedQuestions.map((q, idx) => (
                  <div
                    key={idx}
                    className="p-4 rounded-xl bg-emerald-50 border border-emerald-300 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                  >
                    <p className="font-bold text-slate-900 text-sm leading-relaxed">
                      {idx + 1}. {q}
                    </p>
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => handleSpeak(q)}
                        aria-label={`${idx + 1}번 질문 음성으로 읽어주기`}
                        className="inline-flex items-center gap-1 px-3 py-2 rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white font-bold text-xs"
                      >
                        <Volume2 className="w-3.5 h-3.5" aria-hidden="true" />
                        <span>음성 전달</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          navigator.clipboard?.writeText(q);
                          setCopiedQuestionIdx(idx);
                          setTimeout(() => setCopiedQuestionIdx(null), 1500);
                        }}
                        aria-label={`${idx + 1}번 질문 텍스트 복사`}
                        className="inline-flex items-center gap-1 px-3 py-2 rounded-lg bg-white hover:bg-slate-100 text-slate-800 border border-slate-300 font-bold text-xs"
                      >
                        {copiedQuestionIdx === idx ? (
                          <>
                            <Check className="w-3.5 h-3.5 text-emerald-700" aria-hidden="true" />
                            <span>복사됨</span>
                          </>
                        ) : (
                          <>
                            <Copy className="w-3.5 h-3.5" aria-hidden="true" />
                            <span>복사</span>
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* 2. 식당 직원 답변 입력 및 보조 ML 프로토타입 + 추론 엔진 분석 */}
            <div className="p-5 rounded-2xl border-2 border-orange-500 bg-white space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="font-extrabold text-slate-900">
                  식당 직원의 답변 입력 및 AI 분석
                </h3>
                <span className="text-xs px-2.5 py-1 rounded-md bg-orange-100 text-orange-900 font-bold">
                  기계학습 기능 시연용 프로토타입 + 추론 엔진 연동
                </span>
              </div>

              <div className="space-y-1.5">
                <label htmlFor="staff-reply-textarea" className="block text-sm font-bold text-slate-800">
                  직원이 안내해 준 내용을 그대로 입력해 주세요
                </label>
                <textarea
                  id="staff-reply-textarea"
                  rows={3}
                  value={staffReplyInput}
                  onChange={(e) => setStaffReplyInput(e.target.value)}
                  placeholder="예: 육수는 해물 다시팩을 쓰는데 정확한 성분은 확인해 봐야 할 것 같고, 소스에는 땅콩가루가 들어갑니다."
                  className="w-full px-4 py-3 rounded-xl border-2 border-slate-300 font-medium focus:outline-none focus:border-orange-600"
                />
              </div>

              <button
                type="button"
                onClick={handleAnalyzeStaffReply}
                className="w-full py-4 rounded-xl bg-orange-600 hover:bg-orange-700 text-white font-extrabold text-lg transition flex items-center justify-center gap-2 focus:outline-none focus:ring-4 focus:ring-emerald-500"
              >
                <Cpu className="w-6 h-6" aria-hidden="true" />
                <span>직원 답변 AI 분류 및 최종 알레르기 추론 실행</span>
              </button>
            </div>
          </section>
        )}
      </main>

      {/* ====================================================================
          [화면 7] 분석 결과 상세 화면 (모달 오버레이)
          - 추론 엔진 판정 상태, 정보 출처, 업데이트 일자, 규칙 적용 과정, ML 분류 결과, TTS 읽기
          ==================================================================== */}
      {selectedDetailRecord && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="detail-result-title"
          className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-3 sm:p-6 overflow-y-auto"
        >
          <div className="bg-white w-full max-w-3xl rounded-3xl border-2 border-slate-300 shadow-2xl overflow-hidden my-auto max-h-[92vh] flex flex-col">
            {/* 상단 상태 헤더 (색상 + 아이콘 + 명확한 텍스트) */}
            {(() => {
              const cfg = getStatusBadgeConfig(selectedDetailRecord.inference.status);
              return (
                <div className={`${cfg.headerBg} px-6 py-5 flex items-start justify-between gap-4`}>
                  <div className="flex items-start gap-3">
                    {cfg.headerIcon}
                    <div>
                      <span className="text-xs font-bold uppercase tracking-wider opacity-90">
                        AI 추론 엔진 최종 판단 결과
                      </span>
                      <h2 id="detail-result-title" className="text-xl sm:text-2xl font-extrabold mt-0.5">
                        {selectedDetailRecord.inference.statusLabel}
                      </h2>
                      <p className="text-sm opacity-95 mt-1 font-medium">
                        대상: {selectedDetailRecord.targetName}
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setSelectedDetailRecord(null)}
                    aria-label="분석 결과 상세 창 닫기"
                    className="px-3.5 py-2 rounded-xl bg-black/25 hover:bg-black/40 text-white font-bold text-sm shrink-0 focus:outline-none focus:ring-2 focus:ring-white"
                  >
                    닫기 ✕
                  </button>
                </div>
              );
            })()}

            {/* 본문 스크롤 영역 */}
            <div className="p-6 overflow-y-auto space-y-6">
              {/* TTS 음성 읽기 버튼 & 요약 메시지 */}
              <div className="p-4 rounded-2xl bg-slate-50 border-2 border-slate-200 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-xs font-extrabold text-slate-600">종합 판단 안내</span>
                  <button
                    type="button"
                    onClick={() =>
                      handleSpeak(
                        `판단 결과: ${selectedDetailRecord.inference.statusLabel}. ${selectedDetailRecord.inference.summaryMessage}. 정보 출처는 ${
                          SOURCE_META[selectedDetailRecord.source].label
                        }입니다.`
                      )
                    }
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white font-bold text-xs"
                  >
                    <Volume2 className="w-4 h-4" aria-hidden="true" />
                    <span>전체 결과 음성으로 듣기</span>
                  </button>
                </div>
                <p className="text-base font-extrabold text-slate-900 leading-relaxed">
                  {selectedDetailRecord.inference.summaryMessage}
                </p>
              </div>

              {/* 정보 출처 및 신뢰도 분리 표시 */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="p-4 rounded-2xl border-2 border-slate-200 bg-white space-y-1">
                  <div className="text-xs font-bold text-slate-500 flex items-center gap-1">
                    <Database className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>정보 출처 구분</span>
                  </div>
                  <div className="font-extrabold text-slate-900">
                    {SOURCE_META[selectedDetailRecord.source].label}
                  </div>
                  <p className="text-xs text-slate-600 leading-relaxed">
                    {SOURCE_META[selectedDetailRecord.source].description}
                  </p>
                </div>

                <div className="p-4 rounded-2xl border-2 border-slate-200 bg-white space-y-1">
                  <div className="text-xs font-bold text-slate-500 flex items-center gap-1">
                    <Calendar className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>최종 업데이트 날짜</span>
                  </div>
                  <div className="font-extrabold text-slate-900">{selectedDetailRecord.updatedAt}</div>
                  <p className="text-xs text-slate-600 leading-relaxed">
                    출처와 확인 상태는 별개로 표시되며, 식당 직접 등록 정보라도 조리 환경 확인이 권장됩니다.
                  </p>
                </div>
              </div>

              {/* 매칭된 알레르기 유발 성분 또는 추가 확인 필요 항목 */}
              {selectedDetailRecord.inference.matchedAllergens.length > 0 && (
                <div className="p-4 rounded-2xl bg-red-50 border-2 border-red-400 space-y-2">
                  <h3 className="font-extrabold text-red-900 flex items-center gap-2">
                    <ShieldAlert className="w-5 h-5 text-red-600" aria-hidden="true" />
                    <span>탐지된 알레르기 유발 성분 및 파생 원재료</span>
                  </h3>
                  <ul className="space-y-1.5 text-sm font-bold text-red-950">
                    {selectedDetailRecord.inference.matchedAllergens.map((m, i) => (
                      <li key={i} className="flex items-center gap-2">
                        <span className="px-2 py-0.5 rounded bg-red-600 text-white text-xs">
                          내 알레르기: {m.userAllergen}
                        </span>
                        <span>
                          → [{m.location}]에서 <strong>&apos;{m.matchedKeyword}&apos;</strong> 확인됨
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {selectedDetailRecord.inference.ambiguousItems.length > 0 && (
                <div className="p-4 rounded-2xl bg-orange-50 border-2 border-orange-400 space-y-2">
                  <h3 className="font-extrabold text-orange-950 flex items-center gap-2">
                    <AlertTriangle className="w-5 h-5 text-orange-600" aria-hidden="true" />
                    <span>추가 확인이 필요한 항목</span>
                  </h3>
                  <ul className="list-disc list-inside space-y-1 text-sm font-bold text-orange-950">
                    {selectedDetailRecord.inference.ambiguousItems.map((item, i) => (
                      <li key={i}>{item}</li>
                    ))}
                  </ul>
                </div>
              )}

              {/* [핵심 AI] 규칙 기반 추론 엔진 판단 근거 (Rule Trace) */}
              <div className="p-4 rounded-2xl border-2 border-emerald-600 bg-emerald-50/40 space-y-3">
                <div className="flex items-center gap-2">
                  <BrainCircuit className="w-5 h-5 text-emerald-700" aria-hidden="true" />
                  <h3 className="font-extrabold text-emerald-950">
                    핵심 AI: 규칙 기반 추론 과정 (Inference Rule Trace)
                  </h3>
                </div>
                <div className="space-y-2">
                  {selectedDetailRecord.inference.ruleTrace.map((rule) => (
                    <div
                      key={rule.ruleId}
                      className={`p-3 rounded-xl border text-xs sm:text-sm ${
                        rule.triggered
                          ? 'bg-white border-emerald-600 shadow-xs'
                          : 'bg-slate-50 border-slate-200 opacity-75'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2 font-extrabold mb-1">
                        <span className="text-slate-900">
                          [{rule.ruleId}] {rule.ruleName}
                        </span>
                        <span
                          className={`px-2 py-0.5 rounded text-xs ${
                            rule.triggered
                              ? 'bg-emerald-700 text-white'
                              : 'bg-slate-200 text-slate-700'
                          }`}
                        >
                          {rule.triggered ? '규칙 충족 (적용됨)' : '해당 없음 (통과)'}
                        </span>
                      </div>
                      <p className="text-slate-700">{rule.description}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* [보조 AI] 기계학습 기능 시연용 프로토타입 분류 결과 */}
              <div className="p-4 rounded-2xl border-2 border-slate-300 bg-slate-50 space-y-3">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <Cpu className="w-5 h-5 text-orange-600" aria-hidden="true" />
                    <h3 className="font-extrabold text-slate-900">
                      보조 AI: 텍스트 분류 분석 결과
                    </h3>
                  </div>
                  <p className="text-xs font-bold text-orange-800 bg-orange-100 px-2.5 py-1 rounded-md inline-block">
                    {selectedDetailRecord.mlClassification.isPrototypeNotice}
                  </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs sm:text-sm">
                  <div className="p-3 rounded-xl bg-white border border-slate-200">
                    <div className="font-extrabold text-slate-700 mb-1">
                      ① 알레르기 유발 성분 언급 분류
                    </div>
                    <div className="font-bold text-slate-900">
                      {selectedDetailRecord.mlClassification.hasAllergenMention.detected
                        ? `감지됨: ${selectedDetailRecord.mlClassification.hasAllergenMention.extractedAllergens.join(
                            ', '
                          )}`
                        : '직접 언급 미감지'}
                    </div>
                  </div>

                  <div className="p-3 rounded-xl bg-white border border-slate-200">
                    <div className="font-extrabold text-slate-700 mb-1">
                      ② 원재료명 및 복합재료 추출
                    </div>
                    <div className="text-slate-900">
                      원재료:{' '}
                      {selectedDetailRecord.mlClassification.ingredientsAndCompounds.rawIngredients.join(
                        ', '
                      ) || '없음'}
                      <br />
                      복합재료:{' '}
                      <strong className="text-orange-700">
                        {selectedDetailRecord.mlClassification.ingredientsAndCompounds.compoundIngredients.join(
                          ', '
                        ) || '없음'}
                      </strong>
                    </div>
                  </div>

                  <div className="p-3 rounded-xl bg-white border border-slate-200">
                    <div className="font-extrabold text-slate-700 mb-1">
                      ③ 소스 및 육수 관련 정보 추출
                    </div>
                    <div className="text-slate-900">
                      {selectedDetailRecord.mlClassification.sauceAndBrothInfo.detected
                        ? selectedDetailRecord.mlClassification.sauceAndBrothInfo.extractedTerms.join(
                            ', '
                          )
                        : '특이 소스/육수 키워드 없음'}
                    </div>
                  </div>

                  <div className="p-3 rounded-xl bg-white border border-slate-200">
                    <div className="font-extrabold text-slate-700 mb-1">
                      ④ 답변 불충분 / 모호성 판별
                    </div>
                    <div
                      className={`font-bold ${
                        selectedDetailRecord.mlClassification.ambiguityAnalysis.isAmbiguous
                          ? 'text-orange-700'
                          : 'text-emerald-700'
                      }`}
                    >
                      {selectedDetailRecord.mlClassification.ambiguityAnalysis.reason}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* 하단 닫기 버튼 */}
            <div className="px-6 py-4 bg-slate-100 border-t border-slate-200 flex justify-end">
              <button
                type="button"
                onClick={() => setSelectedDetailRecord(null)}
                className="px-6 py-3 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-extrabold text-sm"
              >
                확인 완료
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ====================================================================
          하단 푸터 (안전 고지 및 시제품 안내)
          ==================================================================== */}
      <footer className="bg-slate-900 text-slate-300 text-xs py-6 px-4 mt-12">
        <div className="max-w-5xl mx-auto space-y-2">
          <p className="font-bold text-white">
            세이프바이트 AI (SafeBite AI) — 고등학생 창업 프로젝트 시제품
          </p>
          <p className="leading-relaxed">
            본 애플리케이션은 규칙 기반 추론 엔진(InferenceEngine)을 핵심 판단 모듈로 사용하며, 알레르기 유발 성분이 발견되지 않더라도
            조리 기구 교차 오염 가능성을 고려해 &apos;안전함&apos;이 아닌 &apos;표시된 성분에서 등록 알레르겐 미발견&apos;으로 보수적 안내를 제공합니다.
          </p>
        </div>
      </footer>
    </div>
  );
}