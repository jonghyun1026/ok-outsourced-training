export type OutsourcedTrainingRow = {
  대분류: string | null
  기관명: string | null
  기관링크: string | null
  카테고리: string | null
  과정명: string | null
  시작일: string | null // YYYY-MM-DD
  종료일: string | null // YYYY-MM-DD
  '교육기간(일)': number | null
  '교육기간(시간)': number | null
  교육비용: string | null
}
