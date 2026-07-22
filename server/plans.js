// 구독 플랜 정의 — 플랜별 기능/한도 강제 + 월 요금. 실제 청구는 billing.js(토스페이먼츠 빌링)가 수행한다.
//
// features:
//   - pdf     : PDF 증거 패키지 다운로드 허용 여부
//   - anchor  : 외부 타임스탬프 앵커링 사용 가능 여부
//   - monitor : 자동 무결성 검증·알림 대상 포함 여부
//   maxEntries: 원장에 봉인 가능한 최대 블록 수 (0 미만이면 무제한)
//   priceMonthly: 월 요금(원, VAT 포함). 0이면 무료 — 결제 없이 전환 가능.
export const PLANS = {
  free: {
    key: "free",
    label: "Free",
    maxEntries: 100,
    priceMonthly: 0,
    features: { pdf: false, anchor: false, monitor: false },
  },
  pro: {
    key: "pro",
    label: "Pro",
    maxEntries: 10000,
    priceMonthly: 290000,
    features: { pdf: true, anchor: false, monitor: true },
  },
  enterprise: {
    key: "enterprise",
    label: "Enterprise",
    maxEntries: -1, // 무제한
    priceMonthly: 990000,
    features: { pdf: true, anchor: true, monitor: true },
  },
};

export const PLAN_KEYS = Object.keys(PLANS);

export function getPlan(key) {
  return PLANS[key] || PLANS.free;
}

// 해당 플랜이 특정 기능을 쓸 수 있는지
export function planAllows(planKey, feature) {
  return !!getPlan(planKey).features[feature];
}

// 현재 블록 수가 플랜 한도 내인지 (append 직전 검사용)
export function withinEntryQuota(planKey, currentCount) {
  const max = getPlan(planKey).maxEntries;
  return max < 0 || currentCount < max;
}
