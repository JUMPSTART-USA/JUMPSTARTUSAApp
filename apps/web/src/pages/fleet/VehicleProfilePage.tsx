import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Pencil, Plus, Trash2, Wrench } from 'lucide-react';
import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState, ErrorState, PageLoader } from '@/components/ui/spinner';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { api, qs } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { formatDate, formatMoney } from '@/lib/utils';
import { MaintenanceFormDialog } from './MaintenanceFormDialog';
import { ConfirmDialog, SeverityBadge, vehicleLabel } from './shared';
import { VehicleFormDialog } from './VehicleFormDialog';
import type { MaintenanceRecord, MaintenanceSummary, VehicleProfile } from './types';
import { BackLink } from '@/components/BackLink';

function DetailRow({ label, value }: { label: string; value: string | number | null | undefined }) {
  return (
    <div className="space-y-0.5">
      <p className="text-sm font-medium text-muted-foreground">{label}</p>
      <p className="text-sm">{value ?? '—'}</p>
    </div>
  );
}

export function VehicleProfilePage() {
  const { id = '' } = useParams();
  const { can } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [logOpen, setLogOpen] = useState(false);
  const [editingRecord, setEditingRecord] = useState<MaintenanceRecord | null>(null);
  const [deletingRecord, setDeletingRecord] = useState<MaintenanceRecord | null>(null);

  const query = useQuery({
    queryKey: ['fleet', 'vehicles', id, 'profile'],
    queryFn: () => api.get<VehicleProfile>(`/vehicles/${id}/profile`),
    enabled: !!id,
  });

  const summaryQuery = useQuery({
    queryKey: ['fleet', 'maintenance-summary', id],
    queryFn: () =>
      api.get<MaintenanceSummary>(`/vehicles/maintenance/summary${qs({ vehicleId: id })}`),
    enabled: !!id,
  });

  const deleteVehicle = useMutation({
    mutationFn: () => api.delete(`/vehicles/${id}`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['fleet'] });
      navigate('/vehicles');
    },
  });

  const deleteRecord = useMutation({
    mutationFn: (recordId: string) => api.delete(`/vehicles/maintenance/${recordId}`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['fleet'] });
      setDeletingRecord(null);
    },
  });

  if (query.isLoading) return <PageLoader />;
  if (query.isError) {
    return (
      <div className="space-y-4">
        <BackLink fallbackTo="/vehicles" fallbackLabel="Vehicles" />
        <ErrorState error={query.error} />
      </div>
    );
  }
  if (!query.data) return null;

  const { vehicle, maintenanceRecords, alerts } = query.data;
  const summary = summaryQuery.data;

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <BackLink fallbackTo="/vehicles" fallbackLabel="Vehicles" />
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-tight">{vehicleLabel(vehicle)}</h1>
            {vehicle.active ? (
              <Badge variant="success">Active</Badge>
            ) : (
              <Badge variant="outline">Inactive</Badge>
            )}
          </div>
          <p className="text-sm text-muted-foreground">
            {[vehicle.licensePlate, vehicle.assignedLocation].filter(Boolean).join(' · ') || '—'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {can('vehicles.create') ? (
            <Button onClick={() => setLogOpen(true)}>
              <Wrench className="h-4 w-4" /> Log maintenance
            </Button>
          ) : null}
          {can('vehicles.update') ? (
            <Button variant="outline" onClick={() => setEditOpen(true)}>
              <Pencil className="h-4 w-4" /> Edit
            </Button>
          ) : null}
          {can('vehicles.delete') ? (
            <Button variant="outline" onClick={() => setDeleteOpen(true)}>
              <Trash2 className="h-4 w-4" /> Delete
            </Button>
          ) : null}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-3">
              <DetailRow label="Color" value={vehicle.color} />
              <DetailRow label="License plate" value={vehicle.licensePlate} />
              <DetailRow
                label="Mileage"
                value={vehicle.mileage != null ? vehicle.mileage.toLocaleString('en-US') : null}
              />
              <DetailRow label="VIN" value={vehicle.vin} />
              <DetailRow label="Assigned location" value={vehicle.assignedLocation} />
              <DetailRow
                label="Registration expires"
                value={vehicle.registrationExpiration ? formatDate(vehicle.registrationExpiration) : null}
              />
              <DetailRow
                label="Insurance expires"
                value={vehicle.insuranceExpiration ? formatDate(vehicle.insuranceExpiration) : null}
              />
            </div>
            {vehicle.notes ? (
              <div className="space-y-1 border-t pt-3">
                <p className="text-sm font-medium text-muted-foreground">Notes</p>
                <p className="whitespace-pre-wrap text-sm">{vehicle.notes}</p>
              </div>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Alerts</CardTitle>
          </CardHeader>
          <CardContent>
            {alerts.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No alerts — maintenance, registration and insurance are all current.
              </p>
            ) : (
              <ul className="space-y-2">
                {alerts.map((alert, i) => (
                  <li key={`${alert.type}-${i}`} className="flex items-start gap-2 text-sm">
                    <SeverityBadge severity={alert.severity} />
                    <span>{alert.message}</span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Maintenance history</CardTitle>
            {can('vehicles.create') ? (
              <Button variant="outline" size="sm" onClick={() => setLogOpen(true)}>
                <Plus className="h-4 w-4" /> Log
              </Button>
            ) : null}
          </CardHeader>
          <CardContent>
            {maintenanceRecords.length === 0 ? (
              <EmptyState
                title="No maintenance logged yet"
                hint="The latest service record sets the next-due schedule for alerts."
              />
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead className="text-right">Mileage</TableHead>
                    <TableHead>Vendor</TableHead>
                    <TableHead className="text-right">Cost</TableHead>
                    <TableHead>Next due</TableHead>
                    {can('vehicles.update') || can('vehicles.delete') ? (
                      <TableHead className="w-20" />
                    ) : null}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {maintenanceRecords.map((record) => (
                    <TableRow key={record.id}>
                      <TableCell>{formatDate(record.maintenanceDate)}</TableCell>
                      <TableCell className="font-medium">{record.maintenanceType}</TableCell>
                      <TableCell className="text-right">
                        {record.mileageAtService != null
                          ? record.mileageAtService.toLocaleString('en-US')
                          : '—'}
                      </TableCell>
                      <TableCell>{record.vendor?.name ?? '—'}</TableCell>
                      <TableCell className="text-right">{formatMoney(record.cost)}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {[
                          record.nextServiceDueDate ? formatDate(record.nextServiceDueDate) : null,
                          record.nextServiceDueMileage != null
                            ? `${record.nextServiceDueMileage.toLocaleString('en-US')} mi`
                            : null,
                        ]
                          .filter(Boolean)
                          .join(' · ') || '—'}
                      </TableCell>
                      {can('vehicles.update') || can('vehicles.delete') ? (
                        <TableCell className="text-right">
                          {can('vehicles.update') ? (
                            <Button
                              variant="ghost"
                              size="icon"
                              aria-label="Edit maintenance record"
                              onClick={() => setEditingRecord(record)}
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                          ) : null}
                          {can('vehicles.delete') ? (
                            <Button
                              variant="ghost"
                              size="icon"
                              aria-label="Delete maintenance record"
                              onClick={() => setDeletingRecord(record)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          ) : null}
                        </TableCell>
                      ) : null}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Maintenance cost</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {summaryQuery.isError ? (
              <ErrorState error={summaryQuery.error} />
            ) : (
              <>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 rounded-md border bg-muted/30 p-3 text-center">
                  <div>
                    <p className="text-2xl font-semibold">{formatMoney(summary?.totalCost ?? 0)}</p>
                    <p className="text-xs text-muted-foreground">Total cost</p>
                  </div>
                  <div>
                    <p className="text-2xl font-semibold">{summary?.records ?? 0}</p>
                    <p className="text-xs text-muted-foreground">Services</p>
                  </div>
                </div>
                {summary && summary.byType.length > 0 ? (
                  <ul className="space-y-1.5">
                    {summary.byType.map((row) => (
                      <li key={row.type} className="flex items-center justify-between text-sm">
                        <span>{row.type}</span>
                        <span className="font-medium">{formatMoney(row.total)}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-muted-foreground">No costs recorded yet.</p>
                )}
              </>
            )}
          </CardContent>
        </Card>
      </div>

      <VehicleFormDialog open={editOpen} onOpenChange={setEditOpen} vehicle={vehicle} />
      <MaintenanceFormDialog open={logOpen} onOpenChange={setLogOpen} vehicleId={vehicle.id} />
      <MaintenanceFormDialog
        open={!!editingRecord}
        onOpenChange={(open) => {
          if (!open) setEditingRecord(null);
        }}
        vehicleId={vehicle.id}
        record={editingRecord ?? undefined}
      />
      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title="Delete vehicle"
        description={`Delete ${vehicleLabel(vehicle)}? The record is retained for audit but removed from lists.`}
        confirmLabel="Delete vehicle"
        pending={deleteVehicle.isPending}
        onConfirm={() => deleteVehicle.mutate()}
      />
      <ConfirmDialog
        open={!!deletingRecord}
        onOpenChange={(open) => {
          if (!open) setDeletingRecord(null);
        }}
        title="Delete maintenance record"
        description={
          deletingRecord
            ? `Delete the ${deletingRecord.maintenanceType} record from ${formatDate(deletingRecord.maintenanceDate)}? This may change the vehicle's next-due alerts.`
            : ''
        }
        confirmLabel="Delete record"
        pending={deleteRecord.isPending}
        onConfirm={() => deletingRecord && deleteRecord.mutate(deletingRecord.id)}
      />
    </div>
  );
}
