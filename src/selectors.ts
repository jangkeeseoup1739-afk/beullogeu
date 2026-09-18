/**
 * 네이버 스마트에디터 ONE 의 CSS 셀렉터를 전부 여기 모아둡니다.
 *
 * 네이버는 클래스명에 해시를 붙여 배포하기 때문에(`publish_btn__m9KHH` 처럼)
 * UI 개편이 있으면 셀렉터가 깨집니다. 깨졌을 때 이 파일만 고치면 되도록
 * 코드 어디에서도 셀렉터를 직접 쓰지 않습니다.
 *
 * 각 항목은 쉼표로 구분된 후보 목록입니다. Playwright 가 그중 먼저 맞는 것을
 * 씁니다. 해시가 붙은 정확한 클래스명을 앞에, 해시에 영향받지 않는
 * 부분일치(`[class*="..."]`) 를 뒤에 두어 개편에 견디게 했습니다.
 *
 * 셀렉터를 새로 찾는 법:
 *   1. 크롬에서 블로그 글쓰기 화면을 연다
 *   2. F12 → 요소 선택(화살표 아이콘) → 해당 버튼 클릭
 *   3. 하이라이트된 요소에서 우클릭 → Copy → Copy selector
 */

/** 글쓰기 페이지 전체를 감싸는 iframe. 에디터는 이 안에 있습니다. */
export const EDITOR_FRAME = '#mainFrame';

export const SELECTORS = {
  /** 제목 입력 영역 (contenteditable) */
  title: '.se-documentTitle .se-text-paragraph, .se-documentTitle',

  /** 본문 입력 영역 (contenteditable) */
  body: '.se-main-container .se-text-paragraph, .se-main-container',

  /** 우상단 [발행] 버튼 — 누르면 발행 설정 패널이 열립니다 */
  publishOpen: '.publish_btn__m9KHH, button[class*="publish_btn"]',

  /** 발행 설정 패널 안의 최종 [발행] 확인 버튼 */
  publishConfirm:
    '.confirm_btn__WEaBq, .btn_apply__ea-Qf, button[class*="confirm_btn"], button[data-testid="seOnePublishBtn"]',

  /** [저장] 버튼 — 임시저장용 */
  draftSave: '.save_btn__bzc5B, button[class*="save_btn"]',

  /** 발행 패널의 태그 입력칸 */
  tagInput: '#tag-input, .tag_input__rvUB5, input[class*="tag_input"]',

  /** 발행 패널의 카테고리 선택 버튼 */
  categoryOpen: '.selectbox_button__jb1Dt, button[class*="selectbox_button"]',
  /** 열린 카테고리 목록의 항목들 */
  categoryItem: '.option_list__c4gEs li, ul[class*="option_list"] li',

  /**
   * "작성 중인 글이 있습니다" 복구 팝업의 [취소] 버튼.
   * 이전 세션이 비정상 종료되면 뜹니다. 누르지 않으면 이전 내용 위에 덧쓰게 됩니다.
   */
  restoreCancel:
    '.se-popup-button-cancel, button.se-popup-button[class*="cancel"]',

  /** 에디터 첫 진입 시 뜨는 도움말 패널 닫기 */
  helpClose: '.se-help-panel-close-button, button[class*="help-panel-close"]',
} as const;

/** 로그인 페이지로 튕겼는지 판별할 때 씁니다 */
export const LOGIN_URL_PATTERN = /nid\.naver\.com/;

/** 로그인이 끝나면 생기는 인증 쿠키들 */
export const AUTH_COOKIE_NAMES = ['NID_AUT', 'NID_SES'];
