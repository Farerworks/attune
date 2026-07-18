// status: HTTP 상태코드. null = 네트워크 실패/응답 파싱 불가.
export function friendlyError(status: number | null, retryAfterMinutes?: number): string {
  if (status === null) return "Can't reach Attune — check your connection and try again.";
  if (status === 429) {
    if (retryAfterMinutes && retryAfterMinutes > 0)
      return `Attune needs a breather — try again in about ${retryAfterMinutes} minutes.`;
    return "You're moving faster than Attune can think — try again in a minute.";
  }
  if (status >= 500) return "Attune couldn't finish that thought — try again in a moment.";
  return 'Something went wrong — try again in a moment.';
}
