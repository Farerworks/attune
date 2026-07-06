# Attune

상대방 생년월일로 한국식 사주를 계산해 성향 분석과 대화 조언을 영어로 제공하는 웹앱.

## Running

```bash
npm run dev   # development server (http://localhost:3000)
npm test      # run all tests
```

## Verification

The values below are computed by `lunar-javascript` (solar-term based month pillar). Cross-check with a Korean 만세력 site (e.g. saju.co.kr) before relying on these for production.

### Fixture dates — Year / Month / Day pillars

| Date       | Year pillar            | Month pillar          | Day pillar           |
|------------|------------------------|-----------------------|----------------------|
| 1999-03-14 | 己卯 Yin Earth/Rabbit  | 丁卯 Yin Fire/Rabbit  | 乙丑 Yin Wood/Ox     |
| 2000-11-02 | 庚辰 Yang Metal/Dragon | 丙戌 Yang Fire/Dog    | 甲子 Yang Wood/Rat   |
| 1991-05-17 | 辛未 Yin Metal/Goat    | 癸巳 Yin Water/Snake  | 丁亥 Yin Fire/Pig    |

### 입춘(立春, Ipchun) solar-term boundary — year 2000

| Date       | Year pillar              | Note                         |
|------------|--------------------------|------------------------------|
| 2000-02-03 | 己卯 Yin Earth/Rabbit    | Before 입춘 — 1999 year pillar |
| 2000-02-04 | 己卯 Yin Earth/Rabbit    | 입춘 day — still prior year  |
| 2000-02-05 | 庚辰 Yang Metal/Dragon   | After 입춘 — 2000 year pillar  |

The year pillar changes between 2000-02-03 and 2000-02-05, confirming that month/year pillar calculation correctly uses solar terms (절기).
