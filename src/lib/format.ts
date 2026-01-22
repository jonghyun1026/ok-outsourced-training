export function formatDateYYYYMMDD(date: string | null | undefined) {
  if (!date) return ''
  // 기대 포맷: YYYY-MM-DD
  return date.replaceAll('-', '.')
}

export function safeUrl(url: string | null | undefined) {
  if (!url) return null
  const trimmed = url.trim()
  if (!trimmed) return null

  // http(s) 없으면 붙여주기 (기관링크 데이터가 도메인만 있을 수도 있음)
  if (/^https?:\/\//i.test(trimmed)) return trimmed
  return `https://${trimmed}`
}

/**
 * 숫자 문자열에 천 단위 쉼표 추가
 * 예: "1000000" → "1,000,000"
 */
export function formatCurrency(value: string | null | undefined) {
  if (!value) return '-'
  const trimmed = value.trim()
  if (!trimmed) return '-'
  
  // 숫자만 추출
  const numMatch = trimmed.match(/[\d,]+/)
  if (!numMatch) return trimmed
  
  const numStr = numMatch[0].replace(/,/g, '')
  const num = parseInt(numStr, 10)
  if (isNaN(num)) return trimmed
  
  // 천 단위 쉼표
  const formatted = num.toLocaleString('ko-KR')
  
  // 원래 문자열에서 숫자를 formatted로 교체
  return trimmed.replace(/[\d,]+/, formatted)
}
