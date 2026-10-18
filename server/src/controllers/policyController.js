import { checkCashOnDelivery, checkDamagedProduct, checkReturn, checkShipping } from '../services/policyService.js';
import { HttpError } from '../utils/httpError.js';

function ensureValid(result) {
  if (!result.valid) throw new HttpError(400, 'INVALID_POLICY_INPUT', result.reason);
  return result;
}

export function createPolicyController() {
  return {
    shipping(req, res) {
      res.json({ data: ensureValid(checkShipping(req.body?.orderTotal)) });
    },
    returns(req, res) {
      res.json({ data: ensureValid(checkReturn(req.body)) });
    },
    damagedProduct(req, res) {
      res.json({ data: ensureValid(checkDamagedProduct(req.body)) });
    },
    cashOnDelivery(req, res) {
      res.json({ data: ensureValid(checkCashOnDelivery(req.body)) });
    },
  };
}
