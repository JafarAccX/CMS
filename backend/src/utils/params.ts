import { BadRequestError } from "./errors.js";

export function requireParam(param: string | string[] | undefined, name: string): string {
  if (!param) {
    throw new BadRequestError(`${name} is required`);
  }
  if (Array.isArray(param)) {
    if (param.length === 0) throw new BadRequestError(`${name} is required`);
    if (param.length > 1) throw new BadRequestError(`${name} must be a single value`);
    return param[0];
  }
  return param;
}
