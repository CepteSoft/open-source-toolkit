# @ceptesoft/money-utils

## 0.1.0

- Initial extraction from CepteCari `lib/numbers.ts`, `lib/kdv.ts`,
  `lib/currency.ts`.
- Renames: `toNum` → `toNumber`, `kdvHaric` → `netFromGross`, `kdvAmount` →
  `vatAmount`, `toGross` → `grossFromNet`, `MAX_AMOUNT` → `DEFAULT_MAX_AMOUNT`.
- New: `parseAmount` messages are overridable (`messages` option, English
  defaults); currency list is caller-supplied via `createCurrencyRegistry`
  instead of a hardcoded constant.
