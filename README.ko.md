# `@kr-pro-labs/ui2vibe-mcp`

> **바이브 코딩을 위한 UI 디자인 토큰, 반응형 레이아웃 골격, 모션 물리 방정식 및 인터랙티브 컴포넌트 흡수·합성 MCP 서버**
>
> **[English (영어)](README.md)** | **[한국어](README.ko.md)**

[![CI](https://github.com/KR-PRO-Labs/ui2vibe-mcp/actions/workflows/ci.yml/badge.svg)](https://github.com/KR-PRO-Labs/ui2vibe-mcp/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/Node.js-%3E%3D20.0.0-339933)](https://nodejs.org/)
[![MCP](https://img.shields.io/badge/MCP-1.0.4-7C3AED)](https://modelcontextprotocol.io/)

**`ui2vibe-mcp`**는 **[KR-PRO-Labs](https://github.com/KR-PRO-Labs)** (`@sjdhfjdj30-hash`)에서 개발한 차세대 프론트엔드 역설계 및 디자인 흡수 전용 Model Context Protocol (MCP) 서버입니다. [`clonevibe-mcp`](https://github.com/KR-PRO-Labs/clonevibe-mcp)가 백엔드/코어 알고리즘 엔진을 레퍼런스로부터 추출·이식한다면, **`ui2vibe-mcp`**는 모든 UI 레퍼런스(HTML/CSS/Tailwind 스니펫, React JSX/TSX, Vue SFC, 또는 DOM 스타일 덤프)로부터 시각적·물리적 본질을 추출하여 내 프로젝트에 무의존성으로 정밀 이식합니다:

1. **지각적 디자인 토큰 추출 (`extract_design_tokens`)**: sRGB/Hex/HSL 색상을 지각 균일 색공간인 **OKLCH**로 변환하고, 상대 휘도($L$) 기반 다크/라이트 모드 대칭 토큰 자동 합성, 8pt 그리드 여백 양자화, 타이포그래피 스케일 및 다중 레이어 그림자·글래스모피즘 토큰을 추출합니다.
2. **시맨틱 반응형·컨테이너 쿼리 레이아웃 골격 분해 (`decompose_layout_skeleton`)**: 불필요하게 중첩된 래퍼 `div` 체인("div-soup")을 제거하여 시맨틱 HTML5 랜드마크(`header`, `nav`, `main`, `section`, `article`, `aside`, `footer`)로 정제하고 Flex/CSS Grid 축, 반응형 브레이크포인트(`sm`, `md`, `lg`, `xl`), 컨테이너 쿼리(`@container`) 및 CSS Subgrid 상속 구조를 도출합니다.
3. **모션 물리 방정식 및 스크롤 타임라인 역산 (`extract_motion_physics`)**: CSS `transition`, `@keyframes`, `cubic-bezier(x1, y1, x2, y2)` 및 Tailwind 트랜지션 유틸리티로부터 물리적 스프링 계수(`stiffness`, `damping`, `mass`)를 역산하고, 최신 스크롤 기반 타임라인(`animation-timeline: view()`) 및 3차 베지어 정규화 기반 SVG 패스 모핑(`d: path(...)`)을 추출합니다.
4. **카멜레온 멀티 프레임워크 컴포넌트 합성 (`synthesize_vibe_component`)**: 호스트 프로젝트의 UI 스택(`react-tailwind`, `react-css-vars`, `vanilla-css`, `vue-tailwind`, `svelte-css`)에 맞춰 컨테이너 쿼리 클래스, Subgrid 스타일, `:root`/`.dark` CSS 변수 테마 블록과 무의존성 인터랙티브 컴포넌트 코드를 즉각 생성합니다.
5. **WCAG 접근성 및 시각 정합성 감사 (`audit_ui_fidelity`)**: 모든 전경/배경 조합의 **WCAG 2.1 명암비**($CR = (L_1 + 0.05)/(L_2 + 0.05)$), 최소 터치 타겟(`44x44px`), `@media (prefers-reduced-motion: reduce)` 접근성 가드레일, `@supports` 스크롤 타임라인 점진적 향상(Progressive Enhancement) 가드레일, CLS 레이아웃 안정성을 수학적으로 검증합니다.

---

## 6대 MCP 도구 요약

| 도구 이름 | 핵심 역할 |
| :--- | :--- |
| `capture_ui_reference` | HTML/JSX/Vue 마크업, 인라인 스타일, CSS 규칙 및 Tailwind 클래스를 정규화된 `UiReferenceSnapshot` 트리와 의사 상태(`:hover`, `:focus-visible`, `:active`, 다크 모드)로 캡처합니다. |
| `extract_design_tokens` | OKLCH 지각 색공간 변환, 다크 모드 대응 색상 자동 합성, 시맨틱 역할(`surface`, `accent`, `text-primary`, `glass` 등) 분류 및 8pt 그리드 여백/타이포그래피 스케일을 추출합니다. |
| `decompose_layout_skeleton` | 중첩 `div` 래퍼를 시맨틱 HTML5 컨테이너로 압축하고 Flex/Grid 축과 반응형 브레이크포인트를 추론합니다. |
| `extract_motion_physics` | `cubic-bezier` 제어점으로부터 2차 조화 진동자 스프링 물리 계수(`stiffness`, `damping`, `mass`, `settlingTimeMs`)와 `@keyframes` 규칙을 도출합니다. |
| `synthesize_vibe_component` | 타깃 프레임워크(`react-tailwind`, `vanilla-css`, `vue-tailwind` 등)에 맞춘 무의존성 컴포넌트와 `:root`/`.dark` 테마 블록을 생성합니다. |
| `audit_ui_fidelity` | WCAG 2.1 AA/AAA 명암비, 44x44px 터치 영역, 모션 축소 가드레일, CLS 안정성 및 종합 정합성 점수(`0–100`)를 감사(Audit)합니다. |

---

## 빠른 시작 (Quick Start)

```bash
git clone https://github.com/KR-PRO-Labs/ui2vibe-mcp.git
cd ui2vibe-mcp
npm install
npm run typecheck
npm test
npm run build
```

## 라이선스
MIT © [KR-PRO-Labs](https://github.com/KR-PRO-Labs) & [@sjdhfjdj30-hash](https://github.com/sjdhfjdj30-hash)
