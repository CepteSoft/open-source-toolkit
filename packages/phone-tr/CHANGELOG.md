# @ceptesoft/phone-tr

## 0.2.0

### Minor Changes

- New `getLineType` (mobile / landline / corporate-850 / tollfree / premium
  from the TR numbering plan — deliberately not operator detection, which
  number portability makes unreliable) and `formatPhone` display helper
  (`"0532 111 22 33"`). README gains a libphonenumber-js comparison.

## 0.1.0

- Initial extraction from CepteCari `lib/phone.ts`: `normalizePhone`,
  `isValidPhone`, `parsePhone`.
- New: `parsePhone` accepts `{ invalidMessage }` to override the default
  Turkish error text (`DEFAULT_INVALID_MESSAGE` export).
