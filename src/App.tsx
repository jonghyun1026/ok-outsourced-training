import { useCallback, useEffect, useMemo, useState } from 'react'
import type { PostgrestError } from '@supabase/supabase-js'
import { safeUrl, formatDateYYYYMMDD, formatCurrency } from './lib/format'
import { getSupabaseEnvStatus, supabase } from './lib/supabase'
import type { OutsourcedTrainingRow } from './types'

const PAGE_SIZE = 20

type SortDir = 'desc' | 'asc'
type SortBy = '시작일' | '카테고리' | '과정명' | '기관명' | '교육비용'

function classNames(...xs: Array<string | false | null | undefined>) {
  return xs.filter(Boolean).join(' ')
}

// 비용 구간 정의
const COST_RANGES = [
  { label: '10만원 이하', min: 0, max: 100000 },
  { label: '10만원 ~ 20만원', min: 100000, max: 200000 },
  { label: '20만원 ~ 30만원', min: 200000, max: 300000 },
  { label: '30만원 ~ 40만원', min: 300000, max: 400000 },
  { label: '40만원 ~ 50만원', min: 400000, max: 500000 },
  { label: '50만원 ~ 60만원', min: 500000, max: 600000 },
  { label: '60만원 ~ 70만원', min: 600000, max: 700000 },
  { label: '70만원 ~ 80만원', min: 700000, max: 800000 },
  { label: '80만원 ~ 90만원', min: 800000, max: 900000 },
  { label: '90만원 ~ 100만원', min: 900000, max: 1000000 },
  { label: '100만원 이상', min: 1000000, max: 999999999 },
]

function App() {
  const envStatus = getSupabaseEnvStatus()

  // 다크모드 상태
  const [darkMode, setDarkMode] = useState(() => {
    // localStorage에서 사용자 설정 불러오기
    const saved = localStorage.getItem('darkMode')
    return saved === 'true'
  })

  // 필터 상태
  const [query, setQuery] = useState('')
  const [majorCategory, setMajorCategory] = useState<string>('') // 대분류
  const [category, setCategory] = useState<string>('') // 중분류
  const [institution, setInstitution] = useState<string>('')
  const [monthFilter, setMonthFilter] = useState<string>('') // "2026-01" 형식
  const [costRange, setCostRange] = useState<string>('') // "min-max" 형식
  const [sortBy, setSortBy] = useState<SortBy>('시작일')
  const [sortDir, setSortDir] = useState<SortDir>('desc')
  const [page, setPage] = useState(1)
  const [filterExpanded, setFilterExpanded] = useState(true)

  // 데이터 상태
  const [majorCategories, setMajorCategories] = useState<string[]>([]) // 대분류 목록
  const [allMiddleCategories, setAllMiddleCategories] = useState<Array<{ 대분류: string; 카테고리: string }>>([]) // 전체 중분류 목록
  const [institutions, setInstitutions] = useState<string[]>([])
  const [rows, setRows] = useState<OutsourcedTrainingRow[]>([])
  const [totalCount, setTotalCount] = useState<number | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<PostgrestError | Error | null>(null)

  // 2026년 1-12월 고정 옵션
  const availableMonths = useMemo(() => {
    return Array.from({ length: 12 }, (_, i) => ({
      label: `2026년 ${i + 1}월`,
      value: `2026-${String(i + 1).padStart(2, '0')}`,
    }))
  }, [])

  // 대분류에 따른 중분류 필터링
  const middleCategories = useMemo(() => {
    if (!majorCategory) return allMiddleCategories.map((x) => x.카테고리)
    return allMiddleCategories
      .filter((x) => x.대분류 === majorCategory)
      .map((x) => x.카테고리)
      .sort((a, b) => a.localeCompare(b, 'ko'))
  }, [majorCategory, allMiddleCategories])

  const offset = (page - 1) * PAGE_SIZE
  const pageCount = useMemo(() => {
    if (!totalCount) return 1
    return Math.max(1, Math.ceil(totalCount / PAGE_SIZE))
  }, [totalCount])

  // 다크모드 토글
  const toggleDarkMode = useCallback(() => {
    setDarkMode((prev) => !prev)
  }, [])

  // 다크모드 적용
  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add('dark')
      localStorage.setItem('darkMode', 'true')
    } else {
      document.documentElement.classList.remove('dark')
      localStorage.setItem('darkMode', 'false')
    }
  }, [darkMode])

  // 활성 필터 개수 계산
  const activeFiltersCount = useMemo(() => {
    let count = 0
    if (query) count++
    if (majorCategory) count++
    if (category) count++
    if (institution) count++
    if (monthFilter) count++
    if (costRange) count++
    return count
  }, [query, majorCategory, category, institution, monthFilter, costRange])

  // 대분류 변경 시 중분류 초기화
  useEffect(() => {
    setCategory('')
  }, [majorCategory])

  // 비용 구간 라벨 가져오기
  const getCostRangeLabel = (range: string) => {
    if (!range) return null
    const found = COST_RANGES.find((r) => `${r.min}-${r.max}` === range)
    return found?.label || null
  }

  // 월 필터 라벨 가져오기
  const getMonthLabel = (value: string) => {
    if (!value) return null
    const [year, month] = value.split('-')
    return `${year}년 ${parseInt(month)}월`
  }

  useEffect(() => {
    setPage(1)
  }, [query, majorCategory, category, institution, monthFilter, costRange, sortBy, sortDir])

  // 초기 메타데이터 로드
  useEffect(() => {
    if (!supabase) return
    
    let cancelled = false

    async function loadMetadata() {
      try {
        // 대분류, 카테고리, 기관명을 개별적으로 DISTINCT 쿼리
        const [majorCategoriesResult, categoriesResult, institutionsResult] = await Promise.all([
          // 대분류 목록
          supabase!
            .from('outsourced_training')
            .select('대분류')
            .not('대분류', 'is', null),
          
          // 대분류-카테고리 조합
          supabase!
            .from('outsourced_training')
            .select('대분류, 카테고리')
            .not('대분류', 'is', null)
            .not('카테고리', 'is', null),
          
          // 기관명 목록
          supabase!
            .from('outsourced_training')
            .select('기관명')
            .not('기관명', 'is', null),
        ])

        if (cancelled) return

        // 대분류 중복 제거 및 정렬
        const uniqueMajorCategories = Array.from(
          new Set(
            (majorCategoriesResult.data || [])
              .map((x: any) => x.대분류)
              .filter((x): x is string => Boolean(x && String(x).trim()))
          )
        ).sort((a, b) => a.localeCompare(b, 'ko'))

        // 중분류 중복 제거 (대분류-카테고리 조합 기준)
        const uniqueMiddleCategories = Array.from(
          new Map(
            (categoriesResult.data || [])
              .filter((x: any) => x.대분류 && x.카테고리)
              .map((x: any) => [`${x.대분류}-${x.카테고리}`, { 대분류: x.대분류, 카테고리: x.카테고리 }])
          ).values()
        )

        // 기관명 중복 제거 및 정렬
        const uniqueInstitutions = Array.from(
          new Set(
            (institutionsResult.data || [])
              .map((x: any) => x.기관명)
              .filter((x): x is string => Boolean(x && String(x).trim()))
          )
        ).sort((a, b) => a.localeCompare(b, 'ko'))

        setMajorCategories(uniqueMajorCategories)
        setAllMiddleCategories(uniqueMiddleCategories)
        setInstitutions(uniqueInstitutions)
      } catch (e) {
        // 메타데이터 로드 실패 시 무시
      }
    }

    loadMetadata()

    return () => {
      cancelled = true
    }
  }, [])

  // 데이터 조회
  useEffect(() => {
    if (!supabase) return
    
    let cancelled = false

    async function fetchData() {
      setLoading(true)
      setError(null)

      const from = offset
      const to = offset + PAGE_SIZE - 1

      let q = supabase!
        .from('outsourced_training')
        .select('*', { count: 'exact' })
        .order(sortBy, { ascending: sortDir === 'asc', nullsFirst: false })
        .range(from, to)

      if (majorCategory) q = q.eq('대분류', majorCategory)
      if (category) q = q.eq('카테고리', category)
      if (institution) q = q.eq('기관명', institution)
      if (query.trim()) q = q.ilike('과정명', `%${query.trim()}%`)

      // 월별 필터
      if (monthFilter) {
        const [year, month] = monthFilter.split('-').map(Number)
        const startDate = new Date(year, month - 1, 1)
        const endDate = new Date(year, month, 0) // 마지막 날
        q = q.gte('시작일', startDate.toISOString().split('T')[0])
        q = q.lte('시작일', endDate.toISOString().split('T')[0])
      }

      // 비용 구간 필터
      if (costRange) {
        const [min, max] = costRange.split('-').map(Number)
        q = q.gte('교육비용', min)
        if (max < 999999999) {
          q = q.lt('교육비용', max)
        }
      }

      const { data, error: qError, count } = await q

      if (cancelled) return
      
      if (qError) {
        setError(qError)
        setRows([])
        setTotalCount(null)
      } else {
        setRows((data ?? []) as OutsourcedTrainingRow[])
        setTotalCount(count ?? null)
      }
      setLoading(false)
    }

    fetchData().catch((e: unknown) => {
      if (cancelled) return
      setError(e instanceof Error ? e : new Error('알 수 없는 오류'))
      setRows([])
      setTotalCount(null)
      setLoading(false)
    })

    return () => {
      cancelled = true
    }
  }, [offset, majorCategory, category, institution, monthFilter, costRange, query, sortBy, sortDir])

  const hasEnv = envStatus.hasUrl && envStatus.hasAnonKey

  const handleSort = (column: SortBy) => {
    if (sortBy === column) {
      setSortDir((prev) => (prev === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortBy(column)
      setSortDir('asc')
    }
  }

  const handleResetFilters = () => {
    setQuery('')
    setMajorCategory('')
    setCategory('')
    setInstitution('')
    setMonthFilter('')
    setCostRange('')
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      {/* 헤더 */}
      <header className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 sticky top-0 z-50 shadow-sm">
        <div className="mx-auto max-w-7xl px-3 sm:px-4 lg:px-8">
          <div className="flex items-center justify-between h-14 sm:h-16">
            <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
              <img 
                src={darkMode ? "/ok-logo-dark.png" : "/ok-logo.png"} 
                alt="OK금융그룹" 
                className="h-5 sm:h-7 md:h-8 w-auto flex-shrink-0" 
              />
              <div className="hidden sm:block w-px h-6 sm:h-8 bg-gray-300 dark:bg-gray-600 flex-shrink-0" />
              <h1 className="text-sm sm:text-lg md:text-xl lg:text-2xl font-bold text-[#5A4E4D] dark:text-gray-100 truncate">
                2026년 위탁교육 과정 리스트
              </h1>
            </div>
            <div className="flex items-center gap-2 sm:gap-3 flex-shrink-0">
              {/* 다크모드 토글 버튼 */}
              <button
                onClick={toggleDarkMode}
                className="p-1.5 sm:p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                aria-label="다크모드 토글"
              >
                {darkMode ? (
                  // 라이트모드 아이콘 (해)
                  <svg className="w-4 h-4 sm:w-5 sm:h-5 text-yellow-500" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 2a1 1 0 011 1v1a1 1 0 11-2 0V3a1 1 0 011-1zm4 8a4 4 0 11-8 0 4 4 0 018 0zm-.464 4.95l.707.707a1 1 0 001.414-1.414l-.707-.707a1 1 0 00-1.414 1.414zm2.12-10.607a1 1 0 010 1.414l-.706.707a1 1 0 11-1.414-1.414l.707-.707a1 1 0 011.414 0zM17 11a1 1 0 100-2h-1a1 1 0 100 2h1zm-7 4a1 1 0 011 1v1a1 1 0 11-2 0v-1a1 1 0 011-1zM5.05 6.464A1 1 0 106.465 5.05l-.708-.707a1 1 0 00-1.414 1.414l.707.707zm1.414 8.486l-.707.707a1 1 0 01-1.414-1.414l.707-.707a1 1 0 011.414 1.414zM4 11a1 1 0 100-2H3a1 1 0 000 2h1z" clipRule="evenodd" />
                  </svg>
                ) : (
                  // 다크모드 아이콘 (달)
                  <svg className="w-4 h-4 sm:w-5 sm:h-5 text-gray-700 dark:text-gray-300" fill="currentColor" viewBox="0 0 20 20">
                    <path d="M17.293 13.293A8 8 0 016.707 2.707a8.001 8.001 0 1010.586 10.586z" />
                  </svg>
                )}
              </button>
              
              {totalCount !== null && (
                <div className="text-xs sm:text-sm text-gray-600 dark:text-gray-300 whitespace-nowrap">
                  <span className="font-semibold text-[#F26522] dark:text-[#F26522]">{totalCount.toLocaleString()}</span>건
                </div>
              )}
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
        {/* 환경변수 경고 */}
        {!hasEnv && (
          <div className="mb-6 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 p-4">
            <h3 className="text-sm font-semibold text-amber-900 dark:text-amber-200">환경변수 설정 필요</h3>
            <p className="mt-1 text-sm text-amber-700 dark:text-amber-300">
              .env.local 파일에 VITE_SUPABASE_URL과 VITE_SUPABASE_ANON_KEY를 설정해주세요.
            </p>
          </div>
        )}

        {/* 안내 문구 */}
        <div className="mb-6 rounded-xl bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-950/30 dark:to-indigo-950/30 border border-blue-200 dark:border-blue-800 p-5 sm:p-6 shadow-sm">
          <div className="flex gap-4">
            <div className="flex-shrink-0">
              <svg className="w-6 h-6 text-blue-600 dark:text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div className="flex-1">
              <h3 className="text-base font-semibold text-blue-900 dark:text-blue-100 mb-3">안내사항</h3>
              <ul className="space-y-2.5 text-sm text-blue-800 dark:text-blue-200">
                <li className="flex gap-2">
                  <span className="text-blue-600 dark:text-blue-400 font-bold mt-0.5">•</span>
                  <span>해당 리스트는 참고용으로, 아래 리스트 외에 다른 교육도 신청 가능합니다.</span>
                </li>
                <li className="flex gap-2">
                  <span className="text-blue-600 dark:text-blue-400 font-bold mt-0.5">•</span>
                  <span>해당 리스트는 2026년 1월 기준 교육 리스트로, 각 기관에서 제공한 자료를 기반으로 제작되었습니다.</span>
                </li>
                <li className="flex gap-2">
                  <span className="text-blue-600 dark:text-blue-400 font-bold mt-0.5">•</span>
                  <span>교육일정, 비용, 개설여부 등이 기관 사정으로 변경되었을 수 있어 신청 전 정확한 내용은 반드시 각 기관 홈페이지에서 확인 바랍니다.</span>
                </li>
              </ul>
            </div>
          </div>
        </div>

        {/* 필터 섹션 */}
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 mb-6 overflow-hidden">
          {/* 필터 헤더 */}
          <div className="px-6 py-4 bg-gradient-to-r from-gray-50 to-white dark:from-gray-800 dark:to-gray-800 border-b border-gray-200 dark:border-gray-700">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <svg className="w-5 h-5 text-[#F26522]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
                </svg>
                <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">검색 및 필터</h2>
                {activeFiltersCount > 0 && (
                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-[#F26522] text-white">
                    {activeFiltersCount}
                  </span>
                )}
              </div>
              <button
                onClick={() => setFilterExpanded(!filterExpanded)}
                className="p-2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 transition-colors"
              >
                <svg
                  className={classNames(
                    'w-5 h-5 transition-transform duration-200',
                    filterExpanded ? 'rotate-180' : ''
                  )}
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>
            </div>
          </div>

          {/* 필터 내용 */}
          <div
            className={classNames(
              'transition-all duration-300 ease-in-out overflow-hidden',
              filterExpanded ? 'max-h-[1000px] opacity-100' : 'max-h-0 opacity-0'
            )}
          >
            <div className="p-6">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
                {/* 과정명 검색 */}
                <div className="group">
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2 flex items-center gap-2">
                    <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                    </svg>
                    과정명
                  </label>
                  <input
                    type="text"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="검색어 입력"
                    className="w-full px-4 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 placeholder:text-gray-400 dark:placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-[#F26522] focus:border-transparent transition-all group-hover:border-gray-400 dark:group-hover:border-gray-500"
                  />
                </div>

                {/* 대분류 */}
                <div className="group">
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2 flex items-center gap-2">
                    <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
                    </svg>
                    대분류
                  </label>
                  <select
                    value={majorCategory}
                    onChange={(e) => setMajorCategory(e.target.value)}
                    className="w-full px-4 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-[#F26522] focus:border-transparent transition-all cursor-pointer group-hover:border-gray-400 dark:group-hover:border-gray-500"
                  >
                    <option value="">전체</option>
                    {majorCategories.map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </div>

                {/* 중분류 */}
                <div className="group">
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2 flex items-center gap-2">
                    <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
                    </svg>
                    중분류
                  </label>
                  <select
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    className="w-full px-4 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-[#F26522] focus:border-transparent transition-all cursor-pointer group-hover:border-gray-400 dark:group-hover:border-gray-500"
                    disabled={!majorCategory && middleCategories.length === 0}
                  >
                    <option value="">전체</option>
                    {middleCategories.map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </div>

                {/* 교육기관 */}
                <div className="group">
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2 flex items-center gap-2">
                    <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                    </svg>
                    교육기관
                  </label>
                  <select
                    value={institution}
                    onChange={(e) => setInstitution(e.target.value)}
                    className="w-full px-4 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-[#F26522] focus:border-transparent transition-all cursor-pointer group-hover:border-gray-400 dark:group-hover:border-gray-500"
                  >
                    <option value="">전체</option>
                    {institutions.map((inst) => (
                      <option key={inst} value={inst}>{inst}</option>
                    ))}
                  </select>
                </div>

                {/* 교육 기간 (월별) */}
                <div className="group">
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2 flex items-center gap-2">
                    <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                    교육 시작월
                  </label>
                  <select
                    value={monthFilter}
                    onChange={(e) => setMonthFilter(e.target.value)}
                    className="w-full px-4 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-[#F26522] focus:border-transparent transition-all cursor-pointer group-hover:border-gray-400 dark:group-hover:border-gray-500"
                  >
                    <option value="">전체</option>
                    {availableMonths.map((m) => (
                      <option key={m.value} value={m.value}>
                        {m.label}
                      </option>
                    ))}
                  </select>
                </div>

                {/* 비용 구간 */}
                <div className="group">
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2 flex items-center gap-2">
                    <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    교육 비용
                  </label>
                  <select
                    value={costRange}
                    onChange={(e) => setCostRange(e.target.value)}
                    className="w-full px-4 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-[#F26522] focus:border-transparent transition-all cursor-pointer group-hover:border-gray-400 dark:group-hover:border-gray-500"
                  >
                    <option value="">전체</option>
                    {COST_RANGES.map((range, idx) => (
                      <option key={idx} value={`${range.min}-${range.max}`}>
                        {range.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* 활성 필터 태그 & 초기화 버튼 */}
              {activeFiltersCount > 0 && (
                <div className="pt-4 border-t border-gray-200 dark:border-gray-700">
                  <div className="flex items-center justify-between flex-wrap gap-3">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium text-gray-600 dark:text-gray-400">활성 필터:</span>
                      {query && (
                        <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-700">
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                          </svg>
                          "{query}"
                          <button
                            onClick={() => setQuery('')}
                            className="ml-1 hover:text-blue-900 dark:hover:text-blue-100 transition-colors"
                          >
                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                          </button>
                        </span>
                      )}
                      {majorCategory && (
                        <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-700">
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
                          </svg>
                          대분류: {majorCategory}
                          <button
                            onClick={() => setMajorCategory('')}
                            className="ml-1 hover:text-indigo-900 dark:hover:text-indigo-100 transition-colors"
                          >
                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                          </button>
                        </span>
                      )}
                      {category && (
                        <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium bg-purple-50 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-700">
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
                          </svg>
                          중분류: {category}
                          <button
                            onClick={() => setCategory('')}
                            className="ml-1 hover:text-purple-900 dark:hover:text-purple-100 transition-colors"
                          >
                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                          </button>
                        </span>
                      )}
                      {institution && (
                        <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-300 border border-green-200 dark:border-green-700">
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                          </svg>
                          {institution}
                          <button
                            onClick={() => setInstitution('')}
                            className="ml-1 hover:text-green-900 dark:hover:text-green-100 transition-colors"
                          >
                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                          </button>
                        </span>
                      )}
                      {monthFilter && (
                        <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-700">
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                          </svg>
                          {getMonthLabel(monthFilter)}
                          <button
                            onClick={() => setMonthFilter('')}
                            className="ml-1 hover:text-amber-900 dark:hover:text-amber-100 transition-colors"
                          >
                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                          </button>
                        </span>
                      )}
                      {costRange && (
                        <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium bg-rose-50 dark:bg-rose-900/30 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-700">
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                          {getCostRangeLabel(costRange)}
                          <button
                            onClick={() => setCostRange('')}
                            className="ml-1 hover:text-rose-900 dark:hover:text-rose-100 transition-colors"
                          >
                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                          </button>
                        </span>
                      )}
      </div>
                    <button
                      onClick={handleResetFilters}
                      className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-600 transition-colors shadow-sm"
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                      </svg>
                      전체 초기화
        </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* 에러 메시지 */}
        {error && (
          <div className="mb-6 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 p-4">
            <h3 className="text-sm font-semibold text-red-900 dark:text-red-200">데이터 로드 오류</h3>
            <p className="mt-1 text-sm text-red-700 dark:text-red-300">
              {'message' in error ? error.message : String(error)}
        </p>
      </div>
        )}

        {/* 데이터 테이블 */}
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
          {/* 데스크톱 테이블 */}
          <div className="hidden lg:block overflow-x-auto">
            <table className="w-full">
              <thead className="bg-[#5A4E4D] dark:bg-gray-700 text-white">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider">
                    대분류
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider">
                    <button
                      onClick={() => handleSort('카테고리')}
                      className="flex items-center gap-2 hover:text-[#FCAF17] transition"
                    >
                      중분류
                      {sortBy === '카테고리' && (
                        <span className="text-[#FCAF17]">
                          {sortDir === 'asc' ? '↑' : '↓'}
                        </span>
                      )}
                    </button>
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider">
                    <button
                      onClick={() => handleSort('과정명')}
                      className="flex items-center gap-2 hover:text-[#FCAF17] transition"
                    >
                      과정명
                      {sortBy === '과정명' && (
                        <span className="text-[#FCAF17]">
                          {sortDir === 'asc' ? '↑' : '↓'}
                        </span>
                      )}
                    </button>
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider">
                    <button
                      onClick={() => handleSort('기관명')}
                      className="flex items-center gap-2 hover:text-[#FCAF17] transition"
                    >
                      기관
                      {sortBy === '기관명' && (
                        <span className="text-[#FCAF17]">
                          {sortDir === 'asc' ? '↑' : '↓'}
                        </span>
                      )}
                    </button>
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider">
                    <button
                      onClick={() => handleSort('시작일')}
                      className="flex items-center gap-2 hover:text-[#FCAF17] transition"
                    >
                      기간
                      {sortBy === '시작일' && (
                        <span className="text-[#FCAF17]">
                          {sortDir === 'asc' ? '↑' : '↓'}
                        </span>
                      )}
                    </button>
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider">
                    <button
                      onClick={() => handleSort('교육비용')}
                      className="flex items-center gap-2 hover:text-[#FCAF17] transition"
                    >
                      비용
                      {sortBy === '교육비용' && (
                        <span className="text-[#FCAF17]">
                          {sortDir === 'asc' ? '↑' : '↓'}
                        </span>
                      )}
                    </button>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                {loading ? (
                  Array.from({ length: 10 }).map((_, i) => (
                    <tr key={i} className="animate-pulse">
                      <td className="px-4 py-4">
                        <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-20" />
                      </td>
                      <td className="px-4 py-4">
                        <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-20" />
                      </td>
                      <td className="px-4 py-4">
                        <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-64 mb-2" />
                        <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-32" />
                      </td>
                      <td className="px-4 py-4">
                        <div className="h-4 bg-gray-200 rounded w-32" />
                      </td>
                      <td className="px-4 py-4">
                        <div className="h-4 bg-gray-200 rounded w-28" />
                      </td>
                      <td className="px-4 py-4">
                        <div className="h-4 bg-gray-200 rounded w-24" />
                      </td>
                    </tr>
                  ))
                ) : rows.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-12 text-center text-gray-500 dark:text-gray-400">
                      <div className="text-4xl mb-2">📭</div>
                      <div className="text-sm">표시할 데이터가 없습니다</div>
                    </td>
                  </tr>
                ) : (
                  rows.map((r, idx) => {
                    const link = safeUrl(r.기관링크)
                    const start = formatDateYYYYMMDD(r.시작일)
                    const end = formatDateYYYYMMDD(r.종료일)
                    return (
                      <tr key={idx} className="hover:bg-gray-50 dark:hover:bg-gray-700/50 transition">
                        <td className="px-4 py-4">
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-indigo-600 dark:bg-indigo-700 text-white">
                            {r.대분류 ?? '-'}
                          </span>
                        </td>
                        <td className="px-4 py-4">
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-[#F26522] text-white">
                            {r.카테고리 ?? '-'}
                          </span>
                        </td>
                        <td className="px-4 py-4">
                          <div className="text-sm font-medium text-gray-900 dark:text-gray-100">
                            {r.과정명 ?? '-'}
                          </div>
                          {(r['교육기간(일)'] || r['교육기간(시간)']) && (
                            <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                              {r['교육기간(일)'] && `${r['교육기간(일)']}일`}
                              {r['교육기간(시간)'] && ` · ${r['교육기간(시간)']}시간`}
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-4">
                          <div className="text-sm text-gray-900 dark:text-gray-100">{r.기관명 ?? '-'}</div>
                          {link && (
                            <a
                              href={link}
                              target="_blank"
                              rel="noreferrer"
                              className="mt-1 inline-block text-xs text-[#F26522] hover:text-[#d45519] transition"
                            >
                              홈페이지 →
                            </a>
                          )}
                        </td>
                        <td className="px-4 py-4 text-sm text-gray-700 dark:text-gray-300 whitespace-nowrap">
                          {start || end ? (
                            <div>
                              <div>{start}</div>
                              {end && <div className="text-xs text-gray-500 dark:text-gray-400">~ {end}</div>}
                            </div>
                          ) : (
                            '-'
                          )}
                        </td>
                        <td className="px-4 py-4 text-sm font-semibold text-gray-900 dark:text-gray-100 whitespace-nowrap">
                          {formatCurrency(r.교육비용)}
                        </td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* 모바일 카드 */}
          <div className="lg:hidden divide-y divide-gray-200 dark:divide-gray-700">
            {loading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="p-4 animate-pulse">
                  <div className="h-5 bg-gray-200 dark:bg-gray-700 rounded w-20 mb-3" />
                  <div className="h-5 bg-gray-200 dark:bg-gray-700 rounded w-full mb-2" />
                  <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-32" />
                </div>
              ))
            ) : rows.length === 0 ? (
              <div className="p-8 text-center text-gray-500 dark:text-gray-400">
                <div className="text-4xl mb-2">📭</div>
                <div className="text-sm">표시할 데이터가 없습니다</div>
              </div>
            ) : (
              rows.map((r, idx) => {
                const link = safeUrl(r.기관링크)
                const start = formatDateYYYYMMDD(r.시작일)
                const end = formatDateYYYYMMDD(r.종료일)
                return (
                  <div key={idx} className="p-4">
                    <div className="flex gap-2 mb-2">
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-indigo-600 dark:bg-indigo-700 text-white">
                        {r.대분류 ?? '-'}
                      </span>
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-[#F26522] text-white">
                        {r.카테고리 ?? '-'}
                      </span>
                    </div>
                    <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-2">
                      {r.과정명 ?? '-'}
                    </h3>
                    <div className="text-sm text-gray-700 dark:text-gray-300 mb-2">
                      {r.기관명 ?? '-'}
                    </div>
                    <div className="flex flex-wrap gap-2 text-xs text-gray-600 dark:text-gray-400">
                      {(start || end) && (
                        <span className="inline-flex items-center gap-1">
                          <span className="text-gray-400 dark:text-gray-500">•</span>
                          {start} {end && `~ ${end}`}
                        </span>
                      )}
                      {r.교육비용 && (
                        <span className="inline-flex items-center gap-1">
                          <span className="text-gray-400 dark:text-gray-500">•</span>
                          <span className="font-semibold text-gray-900 dark:text-gray-100">
                            {formatCurrency(r.교육비용)}
                          </span>
                        </span>
                      )}
                    </div>
                    {link && (
                      <a
                        href={link}
                        target="_blank"
                        rel="noreferrer"
                        className="mt-3 inline-block text-xs text-[#F26522] hover:text-[#d45519] font-medium transition"
                      >
                        홈페이지 바로가기 →
                      </a>
                    )}
                  </div>
                )
              })
            )}
          </div>
        </div>

        {/* 페이지네이션 */}
        {totalCount !== null && totalCount > PAGE_SIZE && (
          <div className="mt-6 flex items-center justify-between">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1 || loading}
              className={classNames(
                'px-4 py-2 rounded-lg text-sm font-medium border transition',
                page <= 1 || loading
                  ? 'border-gray-300 dark:border-gray-600 text-gray-400 dark:text-gray-500 cursor-not-allowed'
                  : 'border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'
              )}
            >
              ← 이전
            </button>
            
            <span className="text-sm text-gray-600 dark:text-gray-400">
              {page} / {pageCount}
            </span>

            <button
              onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
              disabled={page >= pageCount || loading}
              className={classNames(
                'px-4 py-2 rounded-lg text-sm font-medium border transition',
                page >= pageCount || loading
                  ? 'border-gray-300 dark:border-gray-600 text-gray-400 dark:text-gray-500 cursor-not-allowed'
                  : 'border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'
              )}
            >
              다음 →
            </button>
          </div>
        )}
      </main>

      {/* 푸터 */}
      <footer className="border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 mt-12">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-6">
          <div className="text-center text-sm text-gray-600 dark:text-gray-400">
            <div className="font-semibold text-gray-900 dark:text-gray-100">© 2026 OK금융그룹</div>
            <div className="mt-1">2026년 위탁교육 과정 리스트 시스템</div>
          </div>
        </div>
      </footer>
    </div>
  )
}

export default App
