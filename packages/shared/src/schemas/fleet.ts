import { z } from 'zod';
import { CHAPTER_STATES } from '../chapters';
import {
  nonNegativeMoney,
  optionalDate,
  optionalTrimmed,
  requiredDate,
  requiredTrimmed,
  uuid,
} from './common';

const CURRENT_YEAR = new Date().getFullYear();

export const vehicleSchema = z.object({
  make: requiredTrimmed.pipe(z.string().max(100)),
  model: requiredTrimmed.pipe(z.string().max(100)),
  year: z.coerce
    .number()
    .int()
    .min(1950, 'Vehicle year must be 1950 or later')
    .max(CURRENT_YEAR + 1, 'Vehicle year cannot be that far in the future'),
  color: optionalTrimmed,
  licensePlate: optionalTrimmed,
  vin: z.preprocess(
    (v) => (typeof v === 'string' && v.trim() === '' ? undefined : v),
    z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^[A-HJ-NPR-Z0-9]{11,17}$/, 'Invalid VIN')
      .optional(),
  ),
  mileage: z.coerce.number().int().min(0).optional(),
  assignedLocation: optionalTrimmed,
  // Chapter (§7.2): optional at the pipe — the service stamps a scoped
  // creator's chapter and requires a pick from all-chapters users.
  chapterState: z.enum(CHAPTER_STATES).optional(),
  active: z.boolean().default(true),
  insuranceExpiration: optionalDate,
  registrationExpiration: optionalDate,
  notes: optionalTrimmed,
});
export type VehicleInput = z.infer<typeof vehicleSchema>;

export const maintenanceRecordSchema = z.object({
  vehicleId: uuid,
  maintenanceDate: requiredDate,
  maintenanceType: requiredTrimmed.pipe(z.string().max(100)),
  mileageAtService: z.coerce.number().int().min(0).optional(),
  vendorId: uuid.optional(),
  cost: nonNegativeMoney.optional(),
  description: optionalTrimmed,
  nextServiceDueDate: optionalDate,
  nextServiceDueMileage: z.coerce.number().int().min(0).optional(),
  notes: optionalTrimmed,
});
export type MaintenanceRecordInput = z.infer<typeof maintenanceRecordSchema>;
