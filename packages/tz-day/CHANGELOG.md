# @ceptesoft/tz-day

## 0.1.0

- Initial extraction from CepteCari `utils/date.ts`
  (`getTodayISOAppTimezone`).
- New: timezone is a parameter (`isoDayInTimeZone`) instead of a hardcoded
  constant; `createTodayFn` binds an app-wide timezone with eager validation;
  optional `instant` argument for testability.
