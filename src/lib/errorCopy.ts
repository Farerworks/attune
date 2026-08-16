export function isKoreanText(text: string): boolean {
  return /[가-힣]/.test(text);
}

// status: HTTP 상태코드. null = 네트워크 실패/응답 파싱 불가.
export function friendlyError(status: number | null, retryAfterMinutes?: number, ko: boolean = false): string {
  if (ko) {
    if (status === null) return 'Attune에 연결할 수 없어요. 인터넷 연결을 확인하고 다시 시도해 주세요.';
    if (status === 429) {
      if (retryAfterMinutes && retryAfterMinutes > 0)
        return `Attune도 잠시 숨을 고를게요. 약 ${retryAfterMinutes}분 후 다시 시도해 주세요.`;
      return 'Attune이 생각하는 것보다 조금 빠르게 움직이고 있어요. 1분 후 다시 시도해 주세요.';
    }
    if (status >= 500) return 'Attune이 생각을 마무리하지 못했어요. 잠시 후 다시 시도해 주세요.';
    return '문제가 발생했어요. 잠시 후 다시 시도해 주세요.';
  }
  if (status === null) return "Can't reach Attune — check your connection and try again.";
  if (status === 429) {
    if (retryAfterMinutes && retryAfterMinutes > 0)
      return `Attune needs a breather — try again in about ${retryAfterMinutes} minutes.`;
    return "You're moving faster than Attune can think — try again in a minute.";
  }
  if (status >= 500) return "Attune couldn't finish that thought — try again in a moment.";
  return 'Something went wrong — try again in a moment.';
}
