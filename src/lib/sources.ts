/**
 * [3] 신뢰도 높은 출처.
 * 조사 1단계에서 공식 자료를 먼저 확인하고, 그다음 언론 보도를 확인합니다.
 */

/** 정부·공공기관 (우선 확인) */
export const OFFICIAL_DOMAINS: string[] = [
  'molit.go.kr', // 국토교통부
  'reb.or.kr', // 한국부동산원
  'r-one.co.kr', // 한국부동산원 부동산통계정보
  'applyhome.co.kr', // 청약Home
  'lh.or.kr', // 한국토지주택공사
  'apply.lh.or.kr', // LH청약플러스
  'khug.or.kr', // 주택도시보증공사
  'hf.go.kr', // 한국주택금융공사
  'kostat.go.kr', // 통계청
  'moef.go.kr', // 기획재정부
  'fsc.go.kr', // 금융위원회
  'fss.or.kr', // 금융감독원
  'bok.or.kr', // 한국은행
  'nts.go.kr', // 국세청
  'rtms.molit.go.kr', // 실거래가 공개시스템
  'seoul.go.kr',
  'gg.go.kr',
  'incheon.go.kr',
  'busan.go.kr',
  'daegu.go.kr',
  'gwangju.go.kr',
  'daejeon.go.kr',
  'ulsan.go.kr',
  'sejong.go.kr',
  'jeju.go.kr',
  'korea.kr', // 정책브리핑
  'data.go.kr',
];

/** 주요 언론·업계 매체 (보조 확인) */
export const MEDIA_DOMAINS: string[] = [
  'yna.co.kr',
  'yonhapnews.co.kr',
  'hankyung.com',
  'mk.co.kr',
  'sedaily.com',
  'fnnews.com',
  'edaily.co.kr',
  'news1.kr',
  'newsis.com',
  'chosun.com',
  'joongang.co.kr',
  'donga.com',
  'hani.co.kr',
  'khan.co.kr',
  'asiae.co.kr',
  'mt.co.kr',
  'biz.heraldcorp.com',
  'land.naver.com',
  'realty.chosun.com',
  'dailian.co.kr',
];

export function officialFirstDomains(): string[] {
  return [...OFFICIAL_DOMAINS, ...MEDIA_DOMAINS];
}

/** URL에서 출처 기관 이름을 추정합니다. 게시물에 "출처: OOO" 를 붙일 때 씁니다. */
const PUBLISHER_BY_DOMAIN: Record<string, string> = {
  'molit.go.kr': '국토교통부',
  'reb.or.kr': '한국부동산원',
  'r-one.co.kr': '한국부동산원',
  'applyhome.co.kr': '청약홈',
  'lh.or.kr': 'LH',
  'apply.lh.or.kr': 'LH청약플러스',
  'khug.or.kr': '주택도시보증공사',
  'hf.go.kr': '한국주택금융공사',
  'kostat.go.kr': '통계청',
  'moef.go.kr': '기획재정부',
  'fsc.go.kr': '금융위원회',
  'fss.or.kr': '금융감독원',
  'bok.or.kr': '한국은행',
  'nts.go.kr': '국세청',
  'rtms.molit.go.kr': '국토교통부 실거래가 공개시스템',
  'korea.kr': '정책브리핑',
};

export function publisherFromUrl(url: string): string {
  try {
    const host = new URL(url).hostname.replace(/^www\./, '');
    for (const [domain, name] of Object.entries(PUBLISHER_BY_DOMAIN)) {
      if (host === domain || host.endsWith(`.${domain}`)) return name;
    }
    return host;
  } catch {
    return '출처 확인 필요';
  }
}

export function isOfficialSource(url: string): boolean {
  try {
    const host = new URL(url).hostname.replace(/^www\./, '');
    return OFFICIAL_DOMAINS.some((d) => host === d || host.endsWith(`.${d}`));
  } catch {
    return false;
  }
}
