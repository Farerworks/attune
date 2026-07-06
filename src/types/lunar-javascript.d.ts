declare module 'lunar-javascript' {
  interface EightChar {
    setSect(sect: number): void;
    getSect(): number;
    getYear(): string;
    getYearGan(): string;
    getYearZhi(): string;
    getYearWuXing(): string;
    getMonth(): string;
    getMonthGan(): string;
    getMonthZhi(): string;
    getMonthWuXing(): string;
    getDay(): string;
    getDayGan(): string;
    getDayZhi(): string;
    getDayWuXing(): string;
    getTime(): string;
    getTimeGan(): string;
    getTimeZhi(): string;
    getTimeWuXing(): string;
  }

  interface Lunar {
    getEightChar(): EightChar;
  }

  interface Solar {
    getLunar(): Lunar;
  }

  interface SolarStatic {
    fromYmd(year: number, month: number, day: number): Solar;
    fromYmdHms(year: number, month: number, day: number, hour: number, minute: number, second: number): Solar;
  }

  const Solar: SolarStatic;
}
