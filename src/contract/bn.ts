import BigNumber from "bignumber.js";
import { DEFAULT_DECIMAL } from "../domain/constant";
import { invalid_amount, need } from "./contract-utils";

export const bn = BigNumber as typeof BigNumber;

// global config
bn.config({
  EXPONENTIAL_AT: 1e9,
  DECIMAL_PLACES: 0,
  ROUNDING_MODE: bn.ROUND_DOWN,
});

const bnMap: { [decimal: string]: typeof BigNumber } = {};
for (let i = 0; i <= 18; i++) {
  bnMap[i] = bn.clone({
    EXPONENTIAL_AT: 1e9,
    DECIMAL_PLACES: parseInt(i.toString()),
    ROUNDING_MODE: bn.ROUND_DOWN,
  });
}

export type BnCalSymbol = "add" | "sub" | "mul" | "div" | "sqrt";

export function bnUint(value: string, decimal: string) {
  return uintCal([value, "mul", uintCal(["10", "pow", decimal])]);
}

export function bnDecimalPlacesValid(amount: string, decimal: string) {
  const valid1 = bn(bn(amount).decimalPlaces()).lte(decimal);
  const valid2 = bn(decimal).gte(amount.split(".")[1]?.length || "0"); // 10.0
  return valid1 && valid2;
}

export function bnIsInteger(value: BigNumber.Value) {
  // 10.0 is false
  return bn(value).isInteger() && value.toString().indexOf(".") == -1;
}

export function bnDecimal(value: string, decimal: string) {
  const _bn = bnMap[18];
  return _bn(value)
    .div(_bn("10").pow(decimal))
    .decimalPlaces(parseInt(decimal))
    .toString();
}

function _bnCal(
  items: (BnCalSymbol | BigNumber.Value)[],
  decimalPlaces: string
): string {
  const _bn = bnMap[decimalPlaces] || bnMap[DEFAULT_DECIMAL];
  let ret = _bn(items[0]);
  need(!_bn(items[0]).isNaN());
  need(_bn(items[1]).isNaN());
  for (let i = 1; i < items.length; i++) {
    const cur = items[i];
    const next = items[i + 1];
    if (cur == "add") {
      need(_bn(next).gte("0"), invalid_amount);
      ret = ret.plus(next);
      i++;
    } else if (cur == "sub") {
      need(_bn(ret).gte(next), invalid_amount);
      ret = ret.minus(next);
      i++;
    } else if (cur == "mul") {
      need(_bn(next).gte("0"), invalid_amount);
      ret = ret.times(next);
      i++;
    } else if (cur == "div") {
      need(_bn(next).gt("0"), invalid_amount);
      ret = ret.div(next);
      i++;
    } else if (cur == "pow") {
      need(_bn(next).gte("0"), invalid_amount);
      ret = ret.pow(next);
      i++;
    } else if (cur == "sqrt") {
      ret = ret.sqrt();
    } else if (!_bn(cur).isNaN()) {
      need(_bn(next).isNaN());
    }
  }

  if (decimalPlaces) {
    return ret.decimalPlaces(parseInt(decimalPlaces)).toString();
  } else {
    return ret.toString();
  }
}

export function uintCal(items: (BnCalSymbol | BigNumber.Value)[]): string {
  return _bnCal(items, "0");
}

export function decimalCal(
  items: (BnCalSymbol | BigNumber.Value)[],
  decimalPlaces?: string
): string {
  return _bnCal(items, decimalPlaces || DEFAULT_DECIMAL);
}

export function bnGte(amount0: string, amount1: string): boolean {
  return bn(amount0).gte(amount1);
}
