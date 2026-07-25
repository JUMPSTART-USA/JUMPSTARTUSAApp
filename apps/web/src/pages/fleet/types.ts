export interface Vehicle {
  id: string;
  make: string;
  model: string;
  year: number;
  color: string | null;
  licensePlate: string | null;
  vin: string | null;
  mileage: number | null;
  assignedLocation: string | null;
  active: boolean;
  insuranceExpiration: string | null;
  registrationExpiration: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface VehicleListItem extends Vehicle {
  _count: { maintenanceRecords: number };
}

export interface MaintenanceRecord {
  id: string;
  vehicleId: string;
  maintenanceDate: string;
  maintenanceType: string;
  mileageAtService: number | null;
  vendorId: string | null;
  vendor?: { id: string; name: string } | null;
  cost: string | number | null;
  description: string | null;
  nextServiceDueDate: string | null;
  nextServiceDueMileage: number | null;
  notes: string | null;
}

export type AlertSeverity = 'overdue' | 'due_soon' | 'upcoming';

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
  dueDate: string | null;
  dueMileage: number | null;
}

export interface VehicleProfile {
  vehicle: Vehicle;
  maintenanceRecords: MaintenanceRecord[];
  alerts: VehicleAlert[];
}

export interface MaintenanceSummary {
  totalCost: number;
  records: number;
  byType: { type: string; total: number }[];
}

export interface VendorOption {
  id: string;
  name: string;
}
