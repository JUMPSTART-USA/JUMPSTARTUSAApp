import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma, Vehicle, VehicleMaintenanceRecord } from '@jumpstart/database';
import type { ListQuery, MaintenanceRecordInput, VehicleInput } from '@jumpstart/shared';
import { AuditService } from '../../audit/audit.service';
import { PrismaService } from '../../prisma/prisma.service';

export interface VehicleListFilters {
  active?: boolean;
  assignedLocation?: string;
}

export interface MaintenanceSummaryFilters {
  vehicleId?: string;
  from?: Date;
  to?: Date;
}

export type AlertSeverity = 'overdue' | 'due_soon' | 'upcoming';

/** One row of the dashboard's "attention needed" pattern (§6.10, §6.13). */
export interface VehicleAlert {
  vehicleId: string;
  vehicle: {
    id: string;
    make: string;
    model: string;
    year: number;
    licensePlate: string | null;
  };
  type: 'maintenance_due' | 'registration_expiring' | 'insurance_expiring';
  severity: AlertSeverity;
  message: string;
  dueDate: Date | null;
  dueMileage: number | null;
}

// Whitelist of sortable columns — sortBy comes from the query string and must
// never reach Prisma unchecked.
const SORTABLE = new Set(['make', 'model', 'year', 'mileage', 'assignedLocation', 'createdAt']);

const DAY_MS = 24 * 60 * 60 * 1000;
const SEVERITY_ORDER: Record<AlertSeverity, number> = { overdue: 0, due_soon: 1, upcoming: 2 };

const isoDate = (d: Date) => d.toISOString().slice(0, 10);

@Injectable()
export class VehiclesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(query: ListQuery, filters: VehicleListFilters) {
    const where: Prisma.VehicleWhereInput = {
      deletedAt: null,
      ...(filters.active !== undefined ? { active: filters.active } : {}),
      ...(filters.assignedLocation
        ? { assignedLocation: { contains: filters.assignedLocation, mode: 'insensitive' } }
        : {}),
      ...(query.search
        ? {
            OR: [
              { make: { contains: query.search, mode: 'insensitive' } },
              { model: { contains: query.search, mode: 'insensitive' } },
              { licensePlate: { contains: query.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const orderBy: Prisma.VehicleOrderByWithRelationInput =
      query.sortBy && SORTABLE.has(query.sortBy)
        ? { [query.sortBy]: query.sortDir }
        : { make: 'asc' };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.vehicle.findMany({
        where,
        orderBy,
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        include: {
          _count: { select: { maintenanceRecords: { where: { deletedAt: null } } } },
        },
      }),
      this.prisma.vehicle.count({ where }),
    ]);

    return { items, total, page: query.page, pageSize: query.pageSize };
  }

  async get(id: string) {
    const vehicle = await this.prisma.vehicle.findFirst({
      where: { id, deletedAt: null },
    });
    if (!vehicle) throw new NotFoundException('Vehicle not found');
    return vehicle;
  }

  /** Vehicle profile: record + full maintenance history + its open alerts (§6.10). */
  async profile(id: string) {
    const vehicle = await this.get(id);
    const maintenanceRecords = await this.prisma.vehicleMaintenanceRecord.findMany({
      where: { vehicleId: id, deletedAt: null },
      orderBy: { maintenanceDate: 'desc' },
      include: { vendor: { select: { id: true, name: true } } },
    });
    return {
      vehicle,
      maintenanceRecords,
      alerts: this.computeAlerts(vehicle, maintenanceRecords[0]),
    };
  }

  async create(input: VehicleInput, userId: string) {
    const vehicle = await this.prisma.vehicle.create({
      data: { ...input, createdById: userId, updatedById: userId },
    });
    await this.audit.logCreate(userId, 'vehicle', vehicle.id, vehicle);
    return vehicle;
  }

  async update(id: string, input: Partial<VehicleInput>, userId: string) {
    const existing = await this.get(id);
    const updated = await this.prisma.vehicle.update({
      where: { id },
      data: { ...input, updatedById: userId },
    });
    await this.audit.logUpdate(userId, 'vehicle', id, existing, updated);
    return updated;
  }

  async softDelete(id: string, userId: string) {
    const existing = await this.get(id);
    await this.prisma.vehicle.update({
      where: { id },
      data: { deletedAt: new Date(), updatedById: userId },
    });
    await this.audit.logDelete(userId, 'vehicle', id, existing);
    return { ok: true };
  }

  /**
   * Fleet-wide alert feed (§6.10): maintenance due by date (within 30 days or
   * past) or mileage (within 500 miles of next-due), registration/insurance
   * expiring within 30/60 days or expired. Only active vehicles alert.
   */
  async alerts() {
    const vehicles = await this.prisma.vehicle.findMany({
      where: { deletedAt: null, active: true },
      include: {
        maintenanceRecords: {
          where: { deletedAt: null },
          orderBy: { maintenanceDate: 'desc' },
          take: 1,
        },
      },
    });

    const items = vehicles
      .flatMap((v) => this.computeAlerts(v, v.maintenanceRecords[0]))
      .sort(
        (a, b) =>
          SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] ||
          (a.dueDate?.getTime() ?? Number.POSITIVE_INFINITY) -
            (b.dueDate?.getTime() ?? Number.POSITIVE_INFINITY),
      );

    return { items, total: items.length };
  }

  // The LATEST maintenance record defines the service schedule — the most
  // recent service sets next-due date/mileage.
  private computeAlerts(
    vehicle: Vehicle,
    latest: VehicleMaintenanceRecord | undefined,
  ): VehicleAlert[] {
    const summary = {
      id: vehicle.id,
      make: vehicle.make,
      model: vehicle.model,
      year: vehicle.year,
      licensePlate: vehicle.licensePlate,
    };
    const alerts: VehicleAlert[] = [];
    const now = Date.now();

    if (latest?.nextServiceDueDate) {
      const due = latest.nextServiceDueDate.getTime();
      if (due <= now + 30 * DAY_MS) {
        alerts.push({
          vehicleId: vehicle.id,
          vehicle: summary,
          type: 'maintenance_due',
          severity: due < now ? 'overdue' : 'due_soon',
          message: `${latest.maintenanceType} due ${isoDate(latest.nextServiceDueDate)}`,
          dueDate: latest.nextServiceDueDate,
          dueMileage: null,
        });
      }
    }
    if (
      latest?.nextServiceDueMileage != null &&
      vehicle.mileage != null &&
      latest.nextServiceDueMileage <= vehicle.mileage + 500
    ) {
      alerts.push({
        vehicleId: vehicle.id,
        vehicle: summary,
        type: 'maintenance_due',
        severity: latest.nextServiceDueMileage <= vehicle.mileage ? 'overdue' : 'due_soon',
        message: `${latest.maintenanceType} due at ${latest.nextServiceDueMileage} mi (odometer ${vehicle.mileage})`,
        dueDate: null,
        dueMileage: latest.nextServiceDueMileage,
      });
    }

    const documents = [
      ['registration_expiring', vehicle.registrationExpiration, 'Registration'],
      ['insurance_expiring', vehicle.insuranceExpiration, 'Insurance'],
    ] as const;
    for (const [type, expiration, label] of documents) {
      if (!expiration) continue;
      const t = expiration.getTime();
      if (t > now + 60 * DAY_MS) continue;
      alerts.push({
        vehicleId: vehicle.id,
        vehicle: summary,
        type,
        severity: t < now ? 'overdue' : t <= now + 30 * DAY_MS ? 'due_soon' : 'upcoming',
        message: `${label} ${t < now ? 'expired' : 'expires'} ${isoDate(expiration)}`,
        dueDate: expiration,
        dueMileage: null,
      });
    }
    return alerts;
  }

  // ── Maintenance records ───────────────────────────────────────────────────

  async getMaintenance(id: string) {
    const record = await this.prisma.vehicleMaintenanceRecord.findFirst({
      where: { id, deletedAt: null },
      include: { vendor: { select: { id: true, name: true } } },
    });
    if (!record) throw new NotFoundException('Maintenance record not found');
    return record;
  }

  /** Without the vendor include — used for audit diffs. */
  private async getMaintenanceRaw(id: string) {
    const record = await this.prisma.vehicleMaintenanceRecord.findFirst({
      where: { id, deletedAt: null },
    });
    if (!record) throw new NotFoundException('Maintenance record not found');
    return record;
  }

  async createMaintenance(input: MaintenanceRecordInput, userId: string) {
    const vehicle = await this.prisma.vehicle.findFirst({
      where: { id: input.vehicleId, deletedAt: null },
    });
    if (!vehicle) throw new BadRequestException('Vehicle not found');
    if (input.vendorId) await this.assertVendorExists(input.vendorId);

    const record = await this.prisma.vehicleMaintenanceRecord.create({
      data: { ...input, createdById: userId, updatedById: userId },
    });
    await this.audit.logCreate(userId, 'vehicleMaintenanceRecord', record.id, record);

    // The odometer only moves forward: a service logged at higher mileage
    // advances the vehicle's current reading (§6.10).
    if (
      input.mileageAtService != null &&
      (vehicle.mileage == null || input.mileageAtService > vehicle.mileage)
    ) {
      const updatedVehicle = await this.prisma.vehicle.update({
        where: { id: vehicle.id },
        data: { mileage: input.mileageAtService, updatedById: userId },
      });
      await this.audit.logUpdate(userId, 'vehicle', vehicle.id, vehicle, updatedVehicle);
    }
    return record;
  }

  async updateMaintenance(id: string, input: Partial<MaintenanceRecordInput>, userId: string) {
    const existing = await this.getMaintenanceRaw(id);
    if (input.vehicleId && input.vehicleId !== existing.vehicleId) {
      const vehicle = await this.prisma.vehicle.findFirst({
        where: { id: input.vehicleId, deletedAt: null },
        select: { id: true },
      });
      if (!vehicle) throw new BadRequestException('Vehicle not found');
    }
    if (input.vendorId && input.vendorId !== existing.vendorId) {
      await this.assertVendorExists(input.vendorId);
    }
    const updated = await this.prisma.vehicleMaintenanceRecord.update({
      where: { id },
      data: { ...input, updatedById: userId },
    });
    await this.audit.logUpdate(userId, 'vehicleMaintenanceRecord', id, existing, updated);
    return updated;
  }

  async deleteMaintenance(id: string, userId: string) {
    const existing = await this.getMaintenanceRaw(id);
    await this.prisma.vehicleMaintenanceRecord.update({
      where: { id },
      data: { deletedAt: new Date(), updatedById: userId },
    });
    await this.audit.logDelete(userId, 'vehicleMaintenanceRecord', id, existing);
    return { ok: true };
  }

  /** Maintenance cost report feed (§6.10): totals per vehicle/period, by type. */
  async maintenanceSummary(filters: MaintenanceSummaryFilters) {
    const where: Prisma.VehicleMaintenanceRecordWhereInput = {
      deletedAt: null,
      ...(filters.vehicleId ? { vehicleId: filters.vehicleId } : {}),
      ...(filters.from || filters.to
        ? {
            maintenanceDate: {
              ...(filters.from ? { gte: filters.from } : {}),
              ...(filters.to ? { lte: filters.to } : {}),
            },
          }
        : {}),
    };

    const [aggregate, byType] = await this.prisma.$transaction([
      this.prisma.vehicleMaintenanceRecord.aggregate({
        where,
        _sum: { cost: true },
        _count: true,
      }),
      this.prisma.vehicleMaintenanceRecord.groupBy({
        by: ['maintenanceType'],
        where,
        _sum: { cost: true },
        orderBy: { _sum: { cost: 'desc' } },
      }),
    ]);

    return {
      totalCost: Number(aggregate._sum.cost ?? 0),
      records: aggregate._count,
      byType: byType.map((row) => ({
        type: row.maintenanceType,
        total: Number(row._sum?.cost ?? 0),
      })),
    };
  }

  private async assertVendorExists(vendorId: string) {
    const vendor = await this.prisma.vendor.findFirst({
      where: { id: vendorId, deletedAt: null },
      select: { id: true },
    });
    if (!vendor) throw new BadRequestException('Vendor not found');
  }
}
