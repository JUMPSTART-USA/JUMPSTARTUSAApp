import { z } from 'zod';
import {
  endNotBeforeStart,
  optionalDate,
  optionalTrimmed,
  requiredDate,
  requiredTrimmed,
} from './common';

/**
 * DOC data-sharing agreements (§7.5): the table that turns "we comply with
 * our DOC agreements" into a query. Admin-managed.
 */
export const dataSharingAgreementSchema = z
  .object({
    stateOrAgency: requiredTrimmed.pipe(z.string().max(200)),
    effectiveDate: requiredDate,
    expiryDate: optionalDate,
    permittedUses: optionalTrimmed,
    reDisclosureRestrictions: optionalTrimmed,
    requiredSafeguards: optionalTrimmed,
    purgeOnTermination: z.boolean().default(false),
    active: z.boolean().default(true),
    notes: optionalTrimmed,
  })
  .superRefine(
    endNotBeforeStart('effectiveDate', 'expiryDate', 'Expiry cannot be before effective date'),
  );
export type DataSharingAgreementInput = z.infer<typeof dataSharingAgreementSchema>;
