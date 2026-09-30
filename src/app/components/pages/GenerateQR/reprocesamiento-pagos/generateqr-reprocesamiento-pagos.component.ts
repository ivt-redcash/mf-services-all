import { Component, OnInit, TemplateRef, ViewChild } from '@angular/core';
import { MatDialog, MatDialogRef } from '@angular/material/dialog';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { PageEvent } from '@angular/material/paginator';
import { finalize } from 'rxjs/operators';
import { GenerateQrService } from 'src/app/services/generateqr.service';
import { AuthService } from 'src/app/services/auth.service';
import { MytoastrService } from 'src/app/services/mytoastr';
import { SpinnerService } from 'src/app/services/spinner.service';
import { DynamicTableComponent } from '../../../library/dynamic-table/dynamic-table.component';
import jwtDecode from 'jwt-decode';

interface ServiceItem {
  id: string;
  name: string;
}

@Component({
  selector: 'uni-generateqr-reprocesamiento-pagos',
  templateUrl: './generateqr-reprocesamiento-pagos.component.html',
  styleUrls: ['./generateqr-reprocesamiento-pagos.component.scss']
})
export class GenerateQrReprocesamientoPagosComponent implements OnInit {
  @ViewChild('scheduleDialog') scheduleDialog!: TemplateRef<any> | null;
  private scheduleDialogRef?: MatDialogRef<any>;
  @ViewChild('historyDialog') historyDialog!: TemplateRef<any> | null;
  private historyDialogRef?: MatDialogRef<any>;
  @ViewChild('editNextAttemptDialog') editNextAttemptDialog!: TemplateRef<any> | null;
  private editNextAttemptDialogRef?: MatDialogRef<any>;


  @ViewChild('queueTable') queueTable?: DynamicTableComponent;
  scheduleForm: FormGroup;
  queueForm: FormGroup;

  editNextAttemptForm: FormGroup;
  editingQueueRow: any = null;
  isUpdatingNextAttempt = false;

  scheduleColumns: any[] = [
    { name: 'Servicio', attribute: 'service' },
    { name: 'Hora apertura', attribute: 'open_time' },
    { name: 'Hora cierre', attribute: 'close_time' },
    { name: 'Timezone', attribute: 'timezone' },
    {
      name: 'Acciones',
      attribute: '',
      config: {
        type: 'buttonicons',
        actions: [
          { hide: false, bgClass: 'gray', toolTip: 'Editar', icon: 'edit', value: 'edit' },
          { hide: false, bgClass: 'red', toolTip: 'Eliminar', icon: 'delete', value: 'delete' }
        ]
      }
    }
  ];
  scheduleData: any[] = [];
  editingServiceId: string | null = null;
  queueColumns: any[] = [
    { name: 'Instruction ID', attribute: 'instruction_id' },
    { name: 'ID QR', attribute: 'id_qr' },
    { name: 'CCI', attribute: 'efimero_cci' },
    { name: 'Servicio', attribute: 'service_name' },
    { name: 'Referencia', attribute: 'reference' },
    { name: 'Monto', attribute: 'amount' },
    { name: 'Estado', attribute: 'status', config: { styleClass: true } },
    { name: 'Intentos', attribute: 'attempt_count' },
    { name: 'Código error', attribute: 'last_error_code' },
    { name: 'Detalle error', attribute: 'last_error_message' },
    {
      name: 'Próximo intento',
      attribute: 'next_attempt_at',
      config: { formatDate: { format: 'dd/MM/yyyy HH:mm', locale: 'en-US' } }
    },
    {
      name: 'Último intento',
      attribute: 'last_attempt_at',
      config: { formatDate: { format: 'dd/MM/yyyy HH:mm', locale: 'en-US' } }
    },
    { name: 'Responsable', attribute: 'responsable' },
    {
      name: 'Notificado',
      attribute: 'created_at',
      config: { formatDate: { format: 'dd/MM/yyyy HH:mm', locale: 'en-US' } }
    },
    {
      name: 'Acciones',
      attribute: '',
      config: {
        type: 'buttonicons',
        actions: [
          { hide: false, bgClass: 'yellow', toolTip: 'Editar fecha reproceso', icon: 'edit', value: 'edit_next_attempt' },
          { hide: false, bgClass: 'gray', toolTip: 'Ver historial', icon: 'visibility', value: 'view_history' }
        ]
      }
    }
  ];
  queueData: any[] = [];
  selectedQueueIds: number[] = [];
  isReprocessingSelected = false;
  queuePage = 1;
  queuePageSize = 20;
  queueTotal = 0;
  todayStats: any = { pending: 0, processing: 0, success: 0, failed: 0, skipped: 0 };
  historyData: any[] = [];
  historyPage = 1;
  historyPageSize = 20;
  historyTotal = 0;
  historyQueueId: string | null = null;

  serviceFilter = '';
  queueServiceFilter = '';
  allServices: ServiceItem[] = [];
  filteredServices: ServiceItem[] = [];
  filteredQueueServices: ServiceItem[] = [];
  selectedServiceName = '';

  scheduleItems: any[] = [];
  page = 1;
  pageSize = 50;
  total = 0;
  isLoading = false;
  isSaving = false;

  constructor(
    private fb: FormBuilder,
    private generateQrService: GenerateQrService,
    private authService: AuthService,
    private spinner: SpinnerService,
    private toastr: MytoastrService,
    private dialog: MatDialog
  ) {
    this.scheduleForm = this.fb.group({
      serviceName: ['', Validators.required],
      open_time: ['', Validators.required],
      close_time: ['', Validators.required],
    });

    this.editNextAttemptForm = this.fb.group({
      date: ['', Validators.required],
      time: ['', Validators.required]
    });

    this.queueForm = this.fb.group({
      status: [''],
      instructionId: ['', [Validators.pattern(/^\d*$/)]],
      serviceId: [''],
      idQr: ['', [Validators.pattern(/^\d*$/)]],
      efimeroCci: ['', [Validators.pattern(/^\d*$/)]],
      reference: [''],
      responsable: [''],
      dateFrom: [''],
      dateTo: [''],
      minAmount: [''],
      maxAmount: ['']
    });
  }

  openScheduleDialog() {
    if (!this.scheduleDialog) {
      return;
    }
    this.scheduleDialogRef = this.dialog.open(this.scheduleDialog, {
      width: '980px',
      maxWidth: '95vw',
      maxHeight: '90vh',
      panelClass: ['service-schedule-dialog']
    });
  }

  ngOnInit(): void {
    this.loadServices();
    this.loadSchedules();
    this.loadQueue();
  }

  loadServices(): void {
    this.spinner.spinnerOnOff();
    this.generateQrService.listConfiguredServices(1, 200).pipe(
      finalize(() => this.spinner.spinnerOnOff())
    ).subscribe({
      next: (response) => {
        const items = response?.data?.items ?? response?.items ?? [];
        this.allServices = (items || [])
          .filter((item: any) => this.isConfiguredQrService(item))
          .map((item: any) => ({
            id: item?.serviceId ?? item?.id,
            name: item?.serviceName ?? item?.name
          }));
        this.filterServices();
        this.filterQueueServices();
      },
      error: (error) => {
        this.toastr.handleHttpError(error);
      }
    });
  }

  filterServices(): void {
    const term = (this.serviceFilter || '').toLowerCase();
    this.filteredServices = this.allServices.filter(service =>
      service.name?.toLowerCase().includes(term)
    );
  }

  filterQueueServices(): void {
    const term = (this.queueServiceFilter || '').toLowerCase();
    this.filteredQueueServices = this.allServices.filter(service =>
      service.name?.toLowerCase().includes(term)
    );
  }

  private isConfiguredQrService(item: any): boolean {
    return item?.active === true || Number(item?.active) === 1;
  }

  onServiceChange(event: any): void {
    this.selectedServiceName = event?.value || '';
  }

  loadSchedules(): void {
    this.isLoading = true;
    const serviceName = this.scheduleForm.get('serviceName')?.value || '';
    this.generateQrService.listServiceSchedule(this.page, this.pageSize, serviceName).pipe(
      finalize(() => {
        this.isLoading = false;
      })
    ).subscribe({
      next: (response) => {
        this.scheduleItems = response?.items ?? [];
        this.scheduleData = this.scheduleItems.map((item: any) => ({
          service_id: item.service_id || item.serviceId || item.id || item.service || '',
          service: item.serviceName || item.service_name || item.service || item.service_id || '-',
          open_time: item.open_time || '-',
          close_time: item.close_time || '-',
          timezone: item.timezone || 'America/Lima'
        }));
        this.total = response?.total ?? 0;
      },
      error: (error) => {
        this.toastr.handleHttpError(error);
      }
    });
  }

  saveSchedule(): void {
    if (this.scheduleForm.invalid || this.isSaving) {
      this.scheduleForm.markAllAsTouched();
      return;
    }

    this.isSaving = true;
    const payload = {
      serviceName: this.scheduleForm.get('serviceName')?.value,
      open_time: this.scheduleForm.get('open_time')?.value,
      close_time: this.scheduleForm.get('close_time')?.value,
      timezone: 'America/Lima'
    };

    const request$ = this.editingServiceId
      ? this.generateQrService.updateServiceSchedule(this.editingServiceId, payload)
      : this.generateQrService.createServiceSchedule(payload);

    request$.pipe(
      finalize(() => {
        this.isSaving = false;
      })
    ).subscribe({
      next: () => {
        this.toastr.showSuccess('OK', this.editingServiceId ? 'Horario actualizado' : 'Horario registrado');
        this.editingServiceId = null;
        this.clearForm();
        this.loadSchedules();
    this.loadQueue();
      },
      error: (error) => {
        this.toastr.handleHttpError(error);
      }
    });
  }

  onScheduleAction(event: any) {
    const action = event?.action || event?.value || event?.event || event?.type;
    const row = event?.element || event?.row || event?.data || event;
    if (!row) {
      return;
    }

    if (action === 'edit') {
      const serviceName = row.service || row.serviceName || row.service_name || row.service_id || '';
      this.editingServiceId = this.getServiceId(row);
      this.scheduleForm.patchValue({
        serviceName,
        open_time: row.open_time || '',
        close_time: row.close_time || ''
      });
      this.selectedServiceName = serviceName;
      this.serviceFilter = '';
      if (!this.scheduleDialogRef) {
        this.openScheduleDialog();
      }
      return;
    }

    if (action === 'delete') {
      const serviceId = this.getServiceId(row);
      if (!serviceId) {
        return;
      }
      if (!confirm('?Seguro que deseas eliminar este horario?')) {
        return;
      }
      this.generateQrService.deleteServiceSchedule(serviceId).subscribe({
        next: () => {
          this.toastr.showSuccess('OK', 'Horario eliminado');
          this.loadSchedules();
    this.loadQueue();
        },
        error: (error) => this.toastr.handleHttpError(error)
      });
    }
  }

  getServiceId(row: any): string {
    return row.service_id || row.serviceId || row.id || '';
  }

  onPageChange(event: PageEvent) {
    const sizeChanged = event.pageSize !== this.pageSize;
    this.pageSize = event.pageSize;
    this.page = event.pageIndex + 1;
    if (sizeChanged) {
      this.page = 1;
    }
    this.loadSchedules();
    this.loadQueue();
  }

  clearForm(): void {
    this.scheduleForm.reset({
      serviceName: '',
      open_time: '',
      close_time: '',
    });
    this.selectedServiceName = '';
    this.serviceFilter = '';
    this.filterServices();
  }


  private normalizeStatus(status: any): string {
    return String(status || '').trim().toLowerCase();
  }

  private formatDateParam(value: any): string {
    if (!value) {
      return '';
    }
    if (value instanceof Date) {
      const year = value.getFullYear();
      const month = String(value.getMonth() + 1).padStart(2, '0');
      const day = String(value.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    }
    if (typeof value === 'string' && value.includes('T')) {
      return value.split('T')[0];
    }
    return String(value);
  }

  private formatHistoryMessage(code: any, msg: any): string {
    const codeText = String(code || '').trim();
    const msgText = String(msg || '').trim();
    const baseMessage = codeText && msgText ? `${codeText}: ${msgText}` : (msgText || codeText || '-');
    if (baseMessage === '-') {
      return baseMessage;
    }

    const recommendationRegex = /\b(recomendaci(?:o|\u00f3)n|recommendation)\s*:\s*/i;
    const match = baseMessage.match(recommendationRegex);
    if (!match || match.index === undefined) {
      return baseMessage;
    }

    const summary = baseMessage.slice(0, match.index).trim();
    const recommendation = baseMessage.slice(match.index + match[0].length).trim();
    if (!recommendation) {
      return summary || baseMessage;
    }

    if (!summary) {
      return `Recomendacion:\n${recommendation}`;
    }

    return `${summary}\n\nRecomendacion:\n${recommendation}`;
  }

  clearQueueFilters(): void {
    this.queueForm.reset({
      status: '',
      instructionId: '',
      serviceId: '',
      idQr: '',
      efimeroCci: '',
      reference: '',
      responsable: '',
      dateFrom: '',
      dateTo: '',
      minAmount: '',
      maxAmount: ''
    });
    this.queueServiceFilter = '';
    this.filterQueueServices();
    this.queuePage = 1;
    this.queueData = [];
    this.clearQueueSelection();
    this.loadQueue();
  }

  searchQueue(): void {
    this.queuePage = 1;
    this.queueData = [];
    this.clearQueueSelection();
    this.loadQueue();
  }
  loadQueue(): void {
    const formValue = this.queueForm.getRawValue();
    const filters: Record<string, any> = {
      status: formValue.status || undefined,
      instructionId: formValue.instructionId || undefined,
      serviceId: formValue.serviceId || undefined,
      idQr: formValue.idQr || undefined,
      efimeroCci: formValue.efimeroCci || undefined,
      reference: formValue.reference || undefined,
      responsable: formValue.responsable || undefined,
      dateFrom: this.formatDateParam(formValue.dateFrom) || undefined,
      dateTo: this.formatDateParam(formValue.dateTo) || undefined,
      minAmount: formValue.minAmount || undefined,
      maxAmount: formValue.maxAmount || undefined
    };

    const page = this.queuePage && this.queuePage > 0 ? this.queuePage : 1;
    this.spinner.spinnerOnOff();
    this.generateQrService.listReprocessQueue(page, this.queuePageSize, filters).pipe(
      finalize(() => this.spinner.spinnerOnOff())
    ).subscribe({
      next: (response) => {
        this.queueTotal = response?.total ?? 0;
        const items = Array.isArray(response?.items) ? response.items : [];
        const normalized = items.map((item: any) => ({
          ...item,
          efimero_cci: item.efimero_cci || item.efimeroCci || '-',
          service_name: item.service_name || item.serviceName || '-',
          reference: item.reference || item.referencia || item.supply_number || item.supplyNumber || '-',
          status: this.normalizeStatus(item.status),
          styleClass: this.normalizeStatus(item.status),
          amount: item.amount ?? '-',
          attempt_count: item.attempt_count ?? '-',
          last_error_code: item.last_error_code || item.lastErrorCode || '-',
          last_error_message: item.last_error_message || item.lastErrorMessage || '-',
          next_attempt_at: item.next_attempt_at || null,
          last_attempt_at: item.last_attempt_at || null,
          created_at: item.created_at || null
        }));

        if (page === 1) {
          this.queueData = [...normalized];
        } else {
          const currentIds = new Set(this.queueData.map(row => this.getQueueId(row)).filter(id => id !== null));
          const append = normalized.filter(row => {
            const id = this.getQueueId(row);
            if (id === null) {
              return true;
            }
            return !currentIds.has(id);
          });
          this.queueData = [...this.queueData, ...append];
        }

        this.todayStats = response?.today ?? {
          pending: 0,
          processing: 0,
          success: 0,
          failed: 0,
          skipped: 0
        };
      },
      error: (error) => this.toastr.handleHttpError(error)
    });
  }
  onQueuePageChange(event: PageEvent): void {
    const sizeChanged = event.pageSize !== this.queuePageSize;
    this.queuePageSize = event.pageSize;
    this.queuePage = event.pageIndex + 1;
    if (sizeChanged) {
      this.queuePage = 1;
      this.queueData = [];
    }
    this.loadQueue();
  }
  onQueueSelection(selected: any[]): void {
    const rows = Array.isArray(selected) ? selected : [];
    const ids: number[] = [];
    for (const row of rows) {
      const id = this.getQueueId(row);
      if (id !== null) {
        ids.push(id);
      }
    }
    // unique
    this.selectedQueueIds = Array.from(new Set(ids));
  }

  clearQueueSelection(): void {
    this.selectedQueueIds = [];
    this.queueTable?.clearSelection();
  }

  reprocessSelected(): void {
    if (!this.selectedQueueIds.length || this.isReprocessingSelected) {
      return;
    }
    this.isReprocessingSelected = true;
    const responsable = this.getResponsable();
    this.spinner.spinnerOnOff();
    this.generateQrService.reprocessPayments(this.selectedQueueIds, responsable).pipe(
      finalize(() => {
        this.isReprocessingSelected = false;
        this.spinner.spinnerOnOff();
      })
    ).subscribe({
      next: () => {
        this.toastr.showSuccess('OK', 'Reproceso encolado');
        this.clearQueueSelection();
        this.loadQueue();
      },
      error: (error) => this.toastr.handleHttpError(error)
    });
  }

  public getQueueId(row: any): number | null {
    const value = row?.queue_id ?? row?.id ?? row?.queueId;
    const num = Number(value);
    return Number.isFinite(num) ? num : null;
  }

  private getResponsable(): string {
    const user = this.authService.getUser?.();
    const candidate = user?.username || user?.user_name || user?.name || user?.full_name || user?.email || user?.user || user?.nombre;
    if (candidate) {
      return String(candidate);
    }
    try {
      const token = this.authService.getToken?.();
      if (token) {
        const decoded: any = jwtDecode(token);
        return String(decoded?.username || decoded?.email || decoded?.['cognito:username'] || decoded?.sub || '');
      }
    } catch {
      return '';
    }
    return '';
  }
  onQueueAction(event: any): void {
    const action = event?.action || event?.value || event?.event || event?.type;
    const row = event?.element || event?.row || event?.data || event;
    if (!row) {
      return;
    }

    if (action === 'edit_next_attempt') {
      this.openEditNextAttempt(row);
      return;
    }

    if (action === 'view_history') {
      this.openHistory(row);
    }
  }

  private pad2(value: number): string {
    return String(value).padStart(2, '0');
  }

  private formatTime(date: Date): string {
    return `${this.pad2(date.getHours())}:${this.pad2(date.getMinutes())}`;
  }

  private parseDateTimeToForm(value: any): { date: Date | null; time: string } {
    if (!value) {
      return { date: null, time: '' };
    }
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) {
      return { date: null, time: '' };
    }
    const date = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    const time = this.formatTime(d);
    return { date, time };
  }

  private openEditNextAttempt(row: any): void {
    const queueId = this.getQueueId(row);
    if (queueId === null || !this.editNextAttemptDialog) {
      return;
    }

    this.editingQueueRow = row;
    this.isUpdatingNextAttempt = false;

    const parsed = this.parseDateTimeToForm(row?.next_attempt_at);
    const fallback = new Date();

    this.editNextAttemptForm.reset({
      date: parsed.date || fallback,
      time: parsed.time || this.formatTime(fallback)
    });

    this.editNextAttemptDialogRef = this.dialog.open(this.editNextAttemptDialog, {
      width: '720px',
      maxWidth: '95vw',
      panelClass: ['reprocess-history-dialog']
    });
  }

  confirmUpdateNextAttempt(): void {
    if (this.editNextAttemptForm.invalid || this.isUpdatingNextAttempt) {
      this.editNextAttemptForm.markAllAsTouched();
      return;
    }

    const queueId = this.getQueueId(this.editingQueueRow);
    if (queueId === null) {
      return;
    }

    const dateVal: any = this.editNextAttemptForm.get('date')?.value;
    const timeVal = String(this.editNextAttemptForm.get('time')?.value || '').trim();
    const date = dateVal instanceof Date ? dateVal : new Date(dateVal);

    if (Number.isNaN(date.getTime()) || !/^\d{2}:\d{2}$/.test(timeVal)) {
      this.toastr.showError('Error', 'Fecha u hora invalida');
      return;
    }

    const yyyy = date.getFullYear();
    const MM = this.pad2(date.getMonth() + 1);
    const dd = this.pad2(date.getDate());
    const nextAttemptAt = `${yyyy}-${MM}-${dd}T${timeVal}:00`;

    this.isUpdatingNextAttempt = true;
    const responsable = this.getResponsable();

    this.spinner.spinnerOnOff();
    this.generateQrService.reprocessNextAttempt(queueId, nextAttemptAt, responsable).pipe(
      finalize(() => {
        this.isUpdatingNextAttempt = false;
        this.spinner.spinnerOnOff();
      })
    ).subscribe({
      next: () => {
        this.toastr.showSuccess('OK', 'Fecha de reproceso actualizada');
        this.editNextAttemptDialogRef?.close();
        this.loadQueue();
      },
      error: (error) => this.toastr.handleHttpError(error)
    });
  }

  private openHistory(row: any): void {
    const queueId = row?.queue_id || row?.id || row?.queueId;
    if (!queueId) {
      return;
    }
    this.historyQueueId = String(queueId);
    this.historyPage = 1;
    this.historyData = [];
    this.historyTotal = 0;
    if (!this.historyDialog) {
      return;
    }
    this.historyDialogRef = this.dialog.open(this.historyDialog, {
      width: '980px',
      maxWidth: '95vw',
      maxHeight: '90vh',
      panelClass: ['reprocess-history-dialog']
    });
    this.loadHistory();
  }

  private loadHistory(): void {
    if (!this.historyQueueId) {
      return;
    }
    const page = this.historyPage && this.historyPage > 0 ? this.historyPage : 1;
    this.spinner.spinnerOnOff();
    this.generateQrService.listReprocessHistory(page, this.historyPageSize, {
      queueId: this.historyQueueId
    }).pipe(
      finalize(() => this.spinner.spinnerOnOff())
    ).subscribe({
      next: (response) => {
        this.historyTotal = response?.total ?? 0;
        const items = Array.isArray(response?.items) ? response.items : [];
        const normalized = items.map((item: any) => {
          const code = item?.error_code || item?.errorCode || '';
          const msg = item?.error_message || item?.errorMessage || item?.message || '';
          const message = this.formatHistoryMessage(code, msg);
          return {
            ...item,
            status: this.normalizeStatus(item.status),
            styleClass: this.normalizeStatus(item.status),
            action: item.action || '-',
            message,
            created_at: item.created_at || null
          };
        });

        if (page === 1) {
          this.historyData = [...normalized];
        } else {
          const currentIds = new Set(this.historyData.map(row => row?.id).filter(id => id !== undefined && id !== null));
          const append = normalized.filter(row => row?.id === undefined || row?.id === null || !currentIds.has(row.id));
          this.historyData = [...this.historyData, ...append];
        }
      },
      error: (error) => this.toastr.handleHttpError(error)
    });
  }
  onHistoryPageChange(event: PageEvent): void {
    const sizeChanged = event.pageSize !== this.historyPageSize;
    this.historyPageSize = event.pageSize;
    this.historyPage = event.pageIndex + 1;
    if (sizeChanged) {
      this.historyPage = 1;
      this.historyData = [];
    }
    this.loadHistory();
  }

}
