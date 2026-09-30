import { Component, OnInit, TemplateRef, ViewChild } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { AbstractControl, FormBuilder, FormGroup, ValidationErrors, ValidatorFn, Validators } from '@angular/forms';
import { MatDialog, MatDialogRef } from '@angular/material/dialog';
import { PageEvent } from '@angular/material/paginator';
import { filter, forkJoin, lastValueFrom, finalize, map } from 'rxjs';
import { GenerateQrService, QrEmissionIdentity } from 'src/app/services/generateqr.service';
import { AuthService } from 'src/app/services/auth.service';
import { MytoastrService } from 'src/app/services/mytoastr';
import { SpinnerService } from 'src/app/services/spinner.service';
import { ServicesService } from 'src/app/services/services.service';
import * as QRCode from 'qrcode';
import jwtDecode from 'jwt-decode';
import { CookieService } from 'ngx-cookie-service';

interface ServiceItem {
  id: string;
  name: string;
}

@Component({
  selector: 'uni-generateqr-reports',
  templateUrl: './generateqr-reports.component.html',
  styleUrls: ['./generateqr-reports.component.scss']
})
export class GenerateQrReportsComponent implements OnInit {
  public columns: any[] = [
    { name: 'ID QR', attribute: 'qr_id' },
    {
      name: 'Fecha generacion',
      attribute: 'qr_created_at',
      config: {
        formatDate: { format: 'dd/MM/yyyy HH:mm', locale: 'en-US' }
      }
    },
    {
      name: 'Fecha vencimiento',
      attribute: 'qr_expired_at',
      config: {
        formatDate: { format: 'dd/MM/yyyy HH:mm', locale: 'en-US' }
      }
    },
    { name: 'Servicio', attribute: 'servicio' },
    { name: 'Creado por', attribute: 'generatedBy' },
    { name: 'Referencia', attribute: 'referencia' },
    { name: 'Descripcion', attribute: 'descripcion' },
    { name: 'Monto', attribute: 'monto' },
    { name: 'Titular', attribute: 'titular' },
    { name: 'Vigencia', attribute: 'estado_vigencia', config: { styleClass: true } },
    { name: 'Estado pago', attribute: 'estado_pago_text', config: { styleClass: true } },
    {
      name: 'Notificacion',
      attribute: 'notificacion_at',
      config: {
        formatDate: { format: 'dd/MM/yyyy HH:mm', locale: 'en-US' }
      }
    },
    {
      name: 'Fecha pago',
      attribute: 'pago_at',
      config: {
        formatDate: { format: 'dd/MM/yyyy HH:mm', locale: 'en-US' }
      }
    },
    {
      name: 'Acciones',
      attribute: '',
      config: {
        type: 'buttonicons',
        restriccPermission: true,
        actions: [
          {
            permission: "qr-view-detail",
            bgClass: 'gray',
            toolTip: 'Ver detalles',
            icon: 'visibility',
            value: 'view_detail'
          },
          {
            permission: "qr-cancel",
            bgClass: 'red',
            toolTip: 'Anular QR',
            icon: 'cancel',
            value: 'cancel_qr'
          },
          {
            permission: "qr-mark-returned",
            bgClass: 'yellow',
            toolTip: 'Marcar devuelto',
            icon: 'undo',
            value: 'mark_returned'
          },
          {
            permission: "qr-re-notify",
            bgClass: 'teal',
            toolTip: 'Re notificar',
            icon: 'content_paste_go',
            value: 're_notify'
          },
        ]
      }
    }
  ];

  public reportForm!: FormGroup;
  public dataService: any[] = [];
  public dataFilter: any[] = [];
  public listFilters: any = {};
  public pageSize: any = 5;
  public page: number = 1;
  public count: number = null;
  public totalCount: number = 0;
  public totalAmount: number = 0;
  public totalPaidAmount: number = 0;
  public totalAnulados: number = 0;
  public totalVencidos: number = 0;
  public totalPagados: number = 0;
  public selectedRow: any = null;
  public detailQrImage: string = '';
  private detailDialogRef?: MatDialogRef<any>;
  private historyDialogRef?: MatDialogRef<any>;
  private markReturnedDialogRef?: MatDialogRef<any>;
  private markReturnedBlockedDialogRef?: MatDialogRef<any>;
  private reNotifyDialogRef?: MatDialogRef<any>;
  private reNotifyBlockedDialogRef?: MatDialogRef<any>;
  private cancelDialogRef?: MatDialogRef<any>;
  private cancelBlockedDialogRef?: MatDialogRef<any>;
  public notificationHistory: any = null;
  public notificationItems: any[] = [];
  public isLoadingHistory: boolean = false;
  public isMarkingReturned: boolean = false;
  public isReNotified: boolean = false;
  public pendingReturnRow: any = null;
  public isCancelling: boolean = false;
  public cancelRow: any = null;
  public filteredServices: ServiceItem[] = [];
  public allItems: ServiceItem[] = [];
  public serviceFilter: string = '';
  public filterServiceSelected: ServiceItem | null = null;
  private readonly personId: string;
  private reportMode: 'internal' | 'external' = 'internal';
  public headSubTitleAnulado: string = '';
  public headSubTitleReNotify: string = '';
  public contentSubTitleReNotify: string = '';
  public contentSubTitleAnulado: string = '';
  public headSubTitleReturned: string = '';
  public contentSubTitleReturned: string = '';
  public canGenerateQRIndividual: boolean = false;
  public qrResult: any = null;
  public qrImageSrc: string = '';
  public qrDialogMode: 'create' | 'view' = 'create';
  public isGeneratingQr: boolean = false;
  public qrForm!: FormGroup;
  public qrSelectedCategory: boolean = false;
  public qrServiceFilter: string = '';
  public qrFilteredServices: ServiceItem[] = [];
  public qrAllItems: ServiceItem[] = [];
  public qrSelectedService: ServiceItem | null = null;
  private qrDialogRef?: MatDialogRef<any>;
  private qrResultDialogRef?: MatDialogRef<any>;
  public minDate: Date = new Date();

  get showNotificationHistoryAction(): boolean {
    return this.reportMode !== 'external';
  }

  public estadoPagoOptions = [
    { value: '', label: 'NINGUNO' },
    { value: '0', label: 'pendiente' },
    { value: '1', label: 'pagado' },
    { value: '2', label: 'notificado no pagado' },
    { value: '3', label: 'fallido' },
    { value: '4', label: 'devuelto' }
  ];

  public vigenciaOptions = [
    { value: '', label: 'NINGUNO' },
    { value: 'vigente', label: 'VIGENTE' },
    { value: 'vencido', label: 'VENCIDO' },
    { value: 'anulado', label: 'ANULADO' }
  ];

  @ViewChild('detailDialog') detailDialog!: TemplateRef<any>;
  @ViewChild('generateQrDialog') generateQrDialog!: TemplateRef<any>;
  @ViewChild('generateQrResultDialog') generateQrResultDialog!: TemplateRef<any>;
  @ViewChild('notificationHistoryDialog') notificationHistoryDialog!: TemplateRef<any>;
  @ViewChild('markReturnedDialog') markReturnedDialog!: TemplateRef<any>;
  @ViewChild('reNotifyDialog') reNotifyDialog!: TemplateRef<any>;
  @ViewChild('reNotifyBlockedDialog') reNotifyBlockedDialog!: TemplateRef<any>;
  @ViewChild('cancelDialog') cancelDialog!: TemplateRef<any>;
  @ViewChild('cancelBlockedDialog') cancelBlockedDialog!: TemplateRef<any>;
  @ViewChild('markReturnedBlockedDialog') markReturnedBlockedDialog!: TemplateRef<any>;

  constructor(
    private fb: FormBuilder,
    private services: ServicesService,
    private generateQrService: GenerateQrService,
    private spinner: SpinnerService,
    private mytoastr: MytoastrService,
    private authService: AuthService,
    private cookieService: CookieService,
    private route: ActivatedRoute,
    public dialog: MatDialog
  ) {
    this.personId = this.cookieService.get('person_id');
  }

  ngOnInit(): void {
    this.authService.permissions$.subscribe(permissions => {
      this.canGenerateQRIndividual = !!permissions['qr-generate-individual'];

      this.reportMode = this.route.snapshot.data?.['reportMode'] === 'external' ? 'external' : 'internal';
      
      if(this.route.snapshot.data?.['reportMode'] === 'external') {
        this.reportMode = 'external'
      }else{
        this.reportMode = 'internal'
        this.canGenerateQRIndividual = false
      }
    });
    this.formReport();
    this.loadServices();
    this.loadReports();
    this.minDate.setHours(0, 0, 0, 0);
    this.minDate.setDate(this.minDate.getDate() + 1);
    this.formQr();
      
    // Suscribirse a cambios y convertir a mayusculas titular
    this.qrForm.get('titular')?.valueChanges.subscribe(value => {
      if (value) {
        this.qrForm.get('titular')?.setValue(value.toUpperCase(), { emitEvent: false });
      }
    });
  }

  formReport() {
    this.reportForm = this.fb.group({
      start: [''],
      end: [''],
      paymentFrom: [''],
      paymentTo: [''],
      notificationFrom: [''],
      notificationTo: [''],
      idQr: ['', [Validators.pattern(/^\d*$/)]],
      servicio: [''],
      referencia: [''],
      titular: [''],
      expiredFrom: [''],
      expiredTo: [''],
      vigencia: [''],
      estadoPago: [''],
      jobId: [''],
      generatedBy: [''],
    }, { validators: [
      this.dateRangeValidator('start', 'end'),
      this.dateRangeValidator('expiredFrom', 'expiredTo'),
      this.dateRangeValidator('paymentFrom', 'paymentTo'),
      this.dateRangeValidator('notificationFrom', 'notificationTo')
    ] });
  }


  formQr() {
    this.qrForm = this.fb.group({
      service_type: [''],
      idService: ['', [Validators.required]],
      referencia: ['', [Validators.required]],
      titular: ['', [Validators.required]],
      amount: ['', [Validators.required, Validators.pattern(/^\d+(\.\d{2})$/), this.maxAmountValidator(500)]],
      receipt_number: ['', [Validators.pattern(/^\d+$/)]],
      due_date: ['', [Validators.required, this.futureDateValidator()]],
      due_date_date: ['', [Validators.required]],
      due_date_time: ['23:59', [Validators.required]]
    })

    this.qrForm.get('due_date_date')?.valueChanges.subscribe(() => this.syncDueDate());
    this.qrForm.get('due_date_time')?.valueChanges.subscribe(() => this.syncDueDate());
  }
  
  private maxAmountValidator(max: number): ValidatorFn {
    return (control: AbstractControl): ValidationErrors | null => {
      const value = control.value;
      if (value === null || value === undefined || value === '') {
        return null;
      }
      const num = Number(value);
      if (Number.isNaN(num)) {
        return { invalidAmount: true };
      }
      return num > max ? { maxAmount: { max, actual: num } } : null;
    };
  }
  
  private futureDateValidator(): ValidatorFn {
    return (control: AbstractControl): ValidationErrors | null => {
      const value = (control.value || '').trim();
      if (!value) {
        return null;
      }
      const match = value.match(/^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})$/);
      if (!match) {
        return { invalidFormat: true };
      }
      const [_, y, m, d, hh, mm, ss] = match;
      const year = Number(y);
      const month = Number(m);
      const day = Number(d);
      const hour = Number(hh);
      const min = Number(mm);
      const sec = Number(ss);
      const date = new Date(year, month - 1, day, hour, min, sec);
      if (
        Number.isNaN(date.getTime()) ||
        date.getFullYear() !== year ||
        date.getMonth() !== month - 1 ||
        date.getDate() !== day ||
        date.getHours() !== hour ||
        date.getMinutes() !== min ||
        date.getSeconds() !== sec
      ) {
        return { invalidDate: true };
      }
      if (date.getTime() <= Date.now()) {
        return { notFuture: true };
      }
      return null;
    };
  }
  
  private syncDueDate() {
    const dateValue = this.qrForm.get('due_date_date')?.value;
    const timeValue = this.qrForm.get('due_date_time')?.value;
    if (!dateValue || !timeValue) {
      this.qrForm.get('due_date')?.setValue('', { emitEvent: false });
      this.qrForm.get('due_date')?.updateValueAndValidity({ emitEvent: false });
      return;
    }
    const date = new Date(dateValue);
    const [hh, mm] = String(timeValue).split(':');
    const hour = Number(hh);
    const minute = Number(mm);
    if (Number.isNaN(date.getTime()) || Number.isNaN(hour) || Number.isNaN(minute)) {
      this.qrForm.get('due_date')?.setValue('', { emitEvent: false });
      this.qrForm.get('due_date')?.updateValueAndValidity({ emitEvent: false });
      return;
    }
    date.setHours(hour, minute, 59, 0);
    const yyyy = date.getFullYear();
    const MM = String(date.getMonth() + 1).padStart(2, '0');
    const dd = String(date.getDate()).padStart(2, '0');
    const HH = String(date.getHours()).padStart(2, '0');
    const mmStr = String(date.getMinutes()).padStart(2, '0');
    const formatted = `${yyyy}-${MM}-${dd} ${HH}:${mmStr}:59`;
    this.qrForm.get('due_date')?.setValue(formatted, { emitEvent: false });
    this.qrForm.get('due_date')?.updateValueAndValidity({ emitEvent: false });
  }


  openGenerateQrDialog() {
    this.qrResult = null;
    this.qrImageSrc = '';
    this.qrDialogMode = 'create';
    this.isGeneratingQr = false;
    this.qrForm.reset();
    this.qrSelectedCategory = false;
    this.qrServiceFilter = '';
    this.qrFilteredServices = [];
    this.qrAllItems = [];
    this.qrSelectedService = null;
    const defaultType = 'LUZ';
    this.qrForm.get('service_type')?.setValue(defaultType);
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    console.log('tomorrow',tomorrow)
    this.qrForm.get('due_date_date')?.setValue(tomorrow);
    this.qrForm.get('due_date_time')?.setValue('23:59');
    if (defaultType) {
      this.qrSelectedCategory = true;
      this.cargarServiciosQr();
    }
    this.qrDialogRef = this.dialog.open(this.generateQrDialog, {
      width: '640px',
      maxWidth: '92vw',
      panelClass: 'qr-dialog'
    });
  }
  
  async cargarServiciosQr(): Promise<void> {
    let request$ = this.services.getExternalServicesForIdClient(this.personId)
     
    const type = this.qr_service_type?.value;

    request$.subscribe({
      next: (response) => {
        const items = response?.data?.Items
          ?? response?.data?.items
          ?? response?.Items
          ?? response?.items
          ?? response?.data
          ?? [];
        //PENDIENTE A mejorar para buscar servicios activos segun apiQRCASH
        const normalizedItems = this.reportMode === "internal"
          ? (items || []).filter((item: any) => this.isConfiguredQrService(item))
          : items || [];
        this.allItems = normalizedItems.map((item: any) => ({
          id: item.id ?? item.serviceId,
          name: item.name ?? item.serviceName
        }));
        this.qrFilteredServices = this.allItems;
        this.qrAllItems = this.allItems;
        this.qrServiceFilter = '';
        this.filterQrServices();
      },
      error: (err) => {
        console.error(err);
        this.mytoastr.showError('', 'No tiene Servicios')
        this.qrFilteredServices = [];
      }
    });
  }

  filterQrServices() {
    const value = this.qrServiceFilter?.toLowerCase() || '';
    this.qrFilteredServices = this.qrAllItems.filter(service =>
      service.name.toLowerCase().includes(value)
    );
  }
  
  loadAllServicesByType(serviceType: string) {
    return this.generateQrService.listConfiguredServices(1, 200).pipe(
      map((response: any) => {
        const items = response?.data?.items ?? response?.items ?? [];
        return (items || [])
          .filter((item: any) => this.isConfiguredQrService(item))
          .map((item: any) => ({
            id: item?.serviceId ?? item?.id,
            name: item?.serviceName ?? item?.name
          }));
      })
    );
  }

  generateQr() {
    if (this.qrForm.invalid) {
      this.qrForm.markAllAsTouched();
      this.mytoastr.showWarning('Complete los campos obligatorios', '');
      return;
    }
    if (this.isGeneratingQr) {
      return;
    }
    const payload = {
      referencia: this.qrForm.get('referencia')?.value,
      empresa: this.qrSelectedService?.name || '',
      cliente: this.qrForm.get('titular')?.value,
      amount: this.qr_amount_cents,
      description: this.qrForm.get('receipt_number')?.value || '',
      expiredAt: this.qrForm.get('due_date')?.value,
      cellphone: '',
      email: ''
    };
    console.log('GenerateQR payload:', payload);
    this.isGeneratingQr = true;
    this.spinner.spinnerOnOff();
    let request$ = this.generateQrService.generateIndividualByExternalUser(payload)

    //this.reportMode === 'external'
      //? 
      //: 
    
    request$.pipe(
      finalize(() => this.spinner.spinnerOnOff())
    ).subscribe({
      next: (data) => {
        console.log('data',data)
        this.isGeneratingQr = false;
        if (data?.logError || data?.excelError) {
          const msg = data?.logError || data?.excelError || 'Error al generar QR';
          this.mytoastr.showError(msg, '');
          return;
        }
        this.qrResult = data;
        this.qrImageSrc = data?.imageBase64
          ? `data:image/png;base64,${data.imageBase64}`
          : '';
        if (this.qrDialogRef) {
          this.qrDialogRef.close();
        }
        this.dataFilter = [];
        this.loadReports();
        this.openQrResultDialog('create');
      },
      error: (err) => {
        console.error(err);
        this.isGeneratingQr = false;
        this.mytoastr.showError('Error al generar QR', '');
      }
    });
  }
  private openQrResultDialog(mode: 'create' | 'view') {
    this.qrDialogMode = mode;
    this.qrResultDialogRef = this.dialog.open(this.generateQrResultDialog, {
      width: '640px',
      maxWidth: '92vw',
      panelClass: 'qr-dialog'
    });
  }

  get qr_amount_cents(): number {
    const value = this.qrForm?.get('amount')?.value;
    const num = Number(value);
    if (Number.isNaN(num)) {
      return 0;
    }
    return Math.round(num * 100);
  }
  get qrEstadoPagoLabel(): string {
    return this.formatEstadoPago(this.qrResult?.estado_pago);
  }


  backToForm() {
    if (this.qrDialogMode === 'view') {
      return;
    }
    this.openGenerateQrDialog();
  }
  get qrExpiredAtDisplay(): string {
    const formValue = this.qrForm?.get('due_date')?.value;
    const value = this.qrDialogMode === 'create'
      ? (formValue || this.qrResult?.expired_at || this.qrResult?.expiredAt)
      : (this.qrResult?.expired_at || this.qrResult?.expiredAt);
    return this.formatDateTimeDisplay(value);
  }

  get qrDisplayAmount(): string {
    const formAmount = this.qrForm?.get('amount')?.value;
    if (this.qrDialogMode === 'create' && formAmount) {
      return this.formatAmountInSoles(formAmount);
    }
    return this.formatAmountInCents(this.qrResult?.amount);
  }
  
  onNumericInput(event: Event, maxLength: number) {
    const input = event.target as HTMLInputElement;
    const digits = (input.value || '').replace(/\D/g, '').slice(0, maxLength);
    input.value = digits;
    return digits;
  }
  onAmountBlur() {
    const value = this.qrForm.get('amount')?.value;
    if (value === null || value === undefined || value === '') {
      return;
    }
    const num = Number(value);
    if (!Number.isNaN(num)) {
      this.qrForm.get('amount')?.setValue(num.toFixed(2), { emitEvent: false });
    }
  }
  onAmountInput(event: Event) {
    const input = event.target as HTMLInputElement;
    let digits = (input.value || '').replace(/\D/g, '');
    if (digits.length > 5) {
      digits = digits.slice(0, 5);
    }
    if (!digits) {
      input.value = '';
      this.qrForm.get('amount')?.setValue('', { emitEvent: false });
      return;
    }
    let intPart = digits.length > 2 ? digits.slice(0, -2) : '0';
    const decPart = digits.length > 1 ? digits.slice(-2) : `0${digits}`;
    intPart = intPart.replace(/^0+(?=\d)/, '');
    if (intPart === '') {
      intPart = '0';
    }
    const value = `${intPart}.${decPart}`;
    input.value = value;
    this.qrForm.get('amount')?.setValue(value, { emitEvent: false });
  }

  get qrServiceName(): string {
    return this.qrSelectedService?.name || '';
  }

  onQrServiceChange(event: any) {
    const selectedId = Array.isArray(event.value)
      ? event.value[event.value.length - 1]
      : event.value;
    const selectedObject = this.qrAllItems.find(s => s.id === selectedId);
    this.qrSelectedService = selectedObject ?? null;
    this.qrForm.get('idService')?.setValue(selectedId || '');
  }

  downloadQrImage() {
    if (!this.qrImageSrc) {
      return;
    }
    const fileBase = this.buildQrFileName();
    const link = document.createElement('a');
    link.href = this.qrImageSrc;
    link.download = `${fileBase}.png`;
    link.click();
  }
  
  private buildQrFileName(): string {
    const base = this.qrDetailTitle && this.qrDetailTitle !== '-' ? this.qrDetailTitle : 'qr';
    const cleaned = base
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-zA-Z0-9\s_-]/g, '')
      .trim()
      .replace(/\s+/g, '_');
    return cleaned || 'qr';
  }

  get qrDetailTitle(): string {
    const fromResult = this.buildQrTitle(
      this.qrResult?.referencia ?? this.qrResult?.suministro,
      this.qrResult?.empresa,
      this.qrResult?.cliente
    );
    if (fromResult !== '-') {
      return fromResult;
    }
    const fromForm = this.buildQrTitle(
      this.qrForm?.get('referencia')?.value,
      this.qrSelectedService?.name || this.qrResult?.empresa,
      this.qrForm?.get('titular')?.value
    );
    return fromForm;
  }

  private buildQrTitle(referencia: any, empresa: any, cliente: any): string {
    const parts = [referencia, empresa, cliente]
      .filter((value: any) => value !== null && value !== undefined && String(value).trim() !== '')
      .map((value: any) => String(value).trim());
    return parts.length ? parts.join(' ') : '-';
  }

  onPageChange(event: PageEvent) {
    console.log('onPageChange report', event);
    const sizeChanged = event.pageSize !== this.pageSize;
    this.pageSize = event.pageSize;
    this.page = event.pageIndex + 1;
    if (sizeChanged) {
      this.dataFilter = [];
      this.dataService = [];
    }
    this.loadReports();
  }

  searchData() {
    this.page = 1;
    this.dataFilter = [];
    this.listFilters = this.buildListFilters();
    this.loadReports();
  }

  clearFilters() {
    this.reportForm.reset();
    this.page = 1;
    this.dataFilter = [];
    this.listFilters = {};
    this.loadReports();
  }

  clickButton(event: any) {
    const { value, element } = event;
    if (value === 'view_detail') {
      this.openDetailDialog(element);
      return;
    }
    if (value === 'cancel_qr') {
      this.openCancelDialog(element);
      return;
    }
    if (value === 'mark_returned') {
      this.openMarkReturnedDialog(element);
    }
    if (value === 're_notify') {
      this.openReNotifyDialog(element);
    }
  }

  private openDetailDialog(row: any) {
    this.selectedRow = row;
    console.log('selectrow',this.selectedRow)
    this.detailQrImage = '';
    this.buildDetailQrImage(row);
    this.detailDialogRef = this.dialog.open(this.detailDialog, {
      width: '720px',
      maxWidth: '95vw',
      panelClass: 'qr-dialog'
    });
  }

  private async buildDetailQrImage(row: any) {
    const hash = row?.hash_qr;
    if (!hash) {
      this.detailQrImage = '';
      return;
    }
    try {
      this.detailQrImage = await QRCode.toDataURL(String(hash), { margin: 1, width: 220 });
    } catch (error) {
      console.error('Error generando QR desde hash_qr:', error);
      this.detailQrImage = '';
    }
  }



  loadServices() {
    const request$ = this.reportMode === "external"
      ? this.services.getExternalServicesForIdClient(this.personId)
      : this.generateQrService.listConfiguredServices(1, 200);

    request$.subscribe({
      next: (response) => {
        const items = response?.data?.Items
          ?? response?.data?.items
          ?? response?.Items
          ?? response?.items
          ?? response?.data
          ?? [];
        const normalizedItems = this.reportMode === "internal"
          ? (items || []).filter((item: any) => this.isConfiguredQrService(item))
          : items || [];
        this.allItems = normalizedItems.map((item: any) => ({
          id: item.id ?? item.serviceId,
          name: item.name ?? item.serviceName
        }));
        this.filteredServices = [...this.allItems];
      },
      error: (err) => {
        console.error(err);
        this.filteredServices = [];
      }
    });
  }

  filterServices() {
    const value = this.serviceFilter?.toLowerCase() || '';
    this.filteredServices = this.allItems.filter(service =>
      service.name.toLowerCase().includes(value)
    );
  }

  onFilterServiceChange(event: any) {
    const selectedName = event.value;
    const selectedObject = this.filteredServices.find(s => s.name === selectedName);
    this.filterServiceSelected = selectedObject ?? null;
    this.reportForm.get('servicio')?.setValue(selectedName || '');
  }

  get filterServiceName(): string {
    return this.filterServiceSelected?.name || '';
  }

  private isConfiguredQrService(item: any): boolean {
    return item?.active === true || Number(item?.active) === 1;
  }


  openNotificationHistory() {
    const identity = this.getRowIdentity(this.selectedRow);
    if (!identity.idQr && !identity.efimeroCci) {
      this.mytoastr.showWarning('ID QR no disponible', '');
      return;
    }
    this.isLoadingHistory = true;
    this.notificationHistory = null;
    this.notificationItems = [];
    this.generateQrService.notificationHistory(identity).pipe(
      finalize(() => {
        this.isLoadingHistory = false;
      })
    ).subscribe({
      next: (data) => {
        this.notificationHistory = data;
        this.notificationItems = Array.isArray(data?.items) ? data.items : [];
        this.historyDialogRef = this.dialog.open(this.notificationHistoryDialog, {
          width: '900px',
          maxWidth: '96vw',
          panelClass: 'qr-dialog'
        });
      },
      error: (err) => {
        console.error(err);
        this.showApiError(err, 'Error al cargar historial');
      }
    });
  }

  formatJson(value: any): string {
    if (!value) {
      return '';
    }
    try {
      const parsed = typeof value === 'string' ? JSON.parse(value) : value;
      return JSON.stringify(parsed, null, 2);
    } catch {
      return String(value);
    }
  }

  private openCancelDialog(row: any) {
    this.cancelRow = row;
    const estadoPago = String(row?.estado_pago_text || '').toLowerCase();
    const estadoPagoRaw = row?.estado_pago_raw;
    const estadoVigencia = String(row?.estado_vigencia || '').toLowerCase();
    if (estadoPago === 'pagado' || estadoPagoRaw === 1 || estadoPagoRaw === '1') {
      this.headSubTitleAnulado = "El QR se encuentra en estado de pago pagado."
      this.contentSubTitleAnulado = "Para anular un QR en estado pagado, primero debes marcarlo como devuelto."
      this.cancelBlockedDialogRef = this.dialog.open(this.cancelBlockedDialog, {
        width: '480px',
        maxWidth: '95vw',
        panelClass: 'qr-dialog'
      });
    }else if( estadoVigencia === "anulado" ){
      this.headSubTitleAnulado = "El QR ya se encuentra en estado de vigencia anulado."
      this.contentSubTitleAnulado = "No es necesario realizar ninguna acción adicional."
      this.cancelBlockedDialogRef = this.dialog.open(this.cancelBlockedDialog, {
        width: '420px',
        maxWidth: '92vw',
        panelClass: 'qr-dialog'
      });
    }else{
      this.cancelDialogRef = this.dialog.open(this.cancelDialog, {
        width: '420px',
        maxWidth: '92vw',
        panelClass: 'qr-dialog'
      });
    }
    return;
  }

  confirmCancel() {
    if (!this.cancelRow?.qr_id || this.isCancelling) {
      return;
    }
    this.isCancelling = true;
    const responsable = this.getResponsable();
    this.generateQrService.cancelQr([String(this.cancelRow.qr_id)], responsable)
      .pipe(finalize(() => {
        this.isCancelling = false;
      }))
      .subscribe({
        next: () => {
          this.mytoastr.showSuccess('QR anulado correctamente', '');
          this.cancelDialogRef?.close();
          this.dataFilter = [];
          this.loadReports();
        },
        error: (err) => {
          console.error(err);
          this.showApiError(err, 'No se pudo anular el QR');
        }
      });
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

  private openMarkReturnedDialog(row: any) {
    console.log('row devolver', row)
    this.pendingReturnRow = row;
    const idQr = this.getRowIdQr(row);
    if (!idQr && !this.getRowEfimeroCci(row)) {
      this.mytoastr.showWarning('ID QR no disponible', '');
      return;
    }
    
    const estadoPago = String(row?.estado_pago_text || '').toLowerCase();
    const estadoPagoRaw = row?.estado_pago_raw;
    
    if (estadoPago === 'devuelto' || estadoPagoRaw === 4 || estadoPagoRaw === '4') {
      this.headSubTitleReturned = "El QR ya se encuentra en estado de pago devuelto."
      this.contentSubTitleReturned = "No es necesario realizar ninguna acción adicional."
      this.markReturnedBlockedDialogRef = this.dialog.open(this.markReturnedBlockedDialog, {
        width: '420px',
        maxWidth: '92vw',
        panelClass: 'qr-dialog'
      });
    }else if (estadoPago === 'pendiente' || estadoPagoRaw === 0 || estadoPagoRaw === '0') {
      this.headSubTitleReturned = "Solo es posible marcar como devuelto un QR en estado pagado, notificado no pagado o fallido."
      this.contentSubTitleReturned = "El estado de pago actual del QR es pendiente."
      this.markReturnedBlockedDialogRef = this.dialog.open(this.markReturnedBlockedDialog, {
        width: '420px',
        maxWidth: '92vw',
        panelClass: 'qr-dialog'
      });
    } else{
      this.headSubTitleReturned = "Esta acción solo actualizará el estado del QR en el sistema."
      this.contentSubTitleReturned = `La devolución del pago debe gestionarse por el proceso correspondiente. ¿Deseas marcar como devuelto el QR ${idQr || '-'}?`
      this.markReturnedDialogRef = this.dialog.open(this.markReturnedDialog, {
        width: '480px',
        maxWidth: '95vw',
        panelClass: 'qr-dialog'
      });
    }
    return;
  }

  confirmMarkReturned() {
    const row = this.pendingReturnRow;
    if (!row || this.isMarkingReturned) {
      return;
    }
    this.isMarkingReturned = true;
    this.spinner.spinnerOnOff();
    const responsable = this.getResponsable();
    this.generateQrService.markReturned([this.getRowIdentity(row)], responsable)
      .pipe(finalize(() => {
        this.isMarkingReturned = false;
      }))
      .subscribe({
        next: (rspta) => {
          if ( rspta.dbUpdated === 1 ) {
            this.mytoastr.showSuccess('QR devuelto correctamente', '');
            this.spinner.spinnerOnOff();
            this.dataFilter = []
            this.loadReports();
          }else{
            this.mytoastr.showWarning('Error.', rspta.note);
            this.spinner.spinnerOnOff();
          }
          this.markReturnedDialogRef?.close();
        },
        error: (err) => {
          console.error(err);
          this.spinner.spinnerOnOff();
          this.showApiError(err, 'Error al actualizar estado');
        }
      });
  }


  private openReNotifyDialog(row: any) {
    console.log('row a renotificar', row)
    this.pendingReturnRow = row;
    const idQr = this.getRowIdQr(row);
    if (!idQr && !this.getRowEfimeroCci(row)) {
      this.mytoastr.showWarning('ID QR no disponible', '');
      return;
    }
    
    const estadoPago = String(row?.estado_pago_text || '').toLowerCase();
    const estadoPagoRaw = row?.estado_pago_raw;
    
    if (estadoPago === 'pagado' || estadoPagoRaw === 1 || estadoPagoRaw === '1') {
      this.headSubTitleReNotify = "Se enviará nuevamente la notificación de pago al webhook del cliente."
      this.contentSubTitleReNotify = `¿Deseas renotificar el QR ${idQr || '-'}?`
      this.reNotifyDialogRef = this.dialog.open(this.reNotifyDialog, {
        width: '480px',
        maxWidth: '95vw',
        panelClass: 'qr-dialog'
      });
    }else{
      this.headSubTitleReNotify = "Solo es posible re notificar un QR en estado pagado."
      this.contentSubTitleReNotify = `El estado de pago actual del QR es ${estadoPago}`
      this.reNotifyBlockedDialogRef = this.dialog.open(this.reNotifyBlockedDialog, {
        width: '420px',
        maxWidth: '92vw',
        panelClass: 'qr-dialog'
      });
    }
    return;
  }
  
  confirmReNotify() {
    const row = this.pendingReturnRow;
    if (!row || this.isReNotified) {
      return;
    }
    this.isReNotified = true;
    this.spinner.spinnerOnOff();
    const responsable = this.getResponsable();
    
    const request$ = this.reportMode === "external"
      ? this.generateQrService.reNotifyByExternalUser(this.getRowIdentity(row), responsable)
      : this.generateQrService.reNotifyByInternalUser(this.getRowIdentity(row), responsable);

    request$.pipe(
      finalize(() => this.isReNotified = false)
    ).subscribe({
      next: (rspta) => {
        if ( rspta.status === "ok" ) {
          this.mytoastr.showSuccess('QR re procesada correctamente', '');
          this.spinner.spinnerOnOff();
          //this.dataFilter = []
          //this.loadReports();
        }else{
          this.mytoastr.showWarning('Error.', rspta.note);
          this.spinner.spinnerOnOff();
        }
        this.reNotifyDialogRef?.close();
      },
      error: (err) => {
        console.error(err);
        this.spinner.spinnerOnOff();
        this.showApiError(err, 'Error al reprocesar');
      }
    });
  }

  private getRowIdQr(row: any): string {
    return String(row?.qr_id ?? row?.id_qr ?? row?.idQr ?? '').trim();
  }

  private getRowEfimeroCci(row: any): string {
    return String(row?.efimeroCci ?? row?.efimero_cci ?? '').trim();
  }

  private getRowIdentity(row: any): QrEmissionIdentity {
    return {
      idQr: this.getRowIdQr(row),
      efimeroCci: this.getRowEfimeroCci(row),
      emissionId: row?.emissionId ?? row?.emission_id
    };
  }

  private showApiError(error: any, fallback: string): void {
    const detail = error?.error?.detail ?? error?.error?.message ?? error?.error;
    const message = typeof detail === 'string' ? detail : detail ? JSON.stringify(detail) : fallback;
    this.mytoastr.showError(fallback, message);
  }

  downloadDetailQrImage() {
    if (!this.detailQrImage) {
      return;
    }
    const referencia = this.selectedRow?.referencia || this.selectedRow?.suministro || '';
    const servicio = this.selectedRow?.servicio || '';
    const titular = this.selectedRow?.titular || '';
    const fechaRaw = this.selectedRow?.qr_created_at || '';
    const fecha = String(fechaRaw).replace('T', '_').replace(/[:\s]/g, '-');
    const base = [referencia, servicio, titular, fecha]
      .filter(Boolean)
      .join('_')
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-zA-Z0-9_-]/g, '_')
      .replace(/_+/g, '_')
      .replace(/^_+|_+$/g, '') || 'qr';
    const link = document.createElement('a');
    link.href = this.detailQrImage;
    link.download = `${base}.png`;
    link.click();
  }

  private loadReports() {
    this.spinner.spinnerOnOff();
    const page = this.page && this.page > 0 ? this.page : 1;
    const requiredLength = page * this.pageSize;
    if (this.dataFilter?.length >= requiredLength) {
      this.dataService = [...this.dataFilter];
      this.spinner.spinnerOnOff();
      return;
    }
    const request$ = this.reportMode === "external"
      ? this.generateQrService.listExternalReports(page, this.pageSize, this.listFilters)
      : this.generateQrService.listReports(page, this.pageSize, this.listFilters);

    request$.pipe(
      finalize(() => this.spinner.spinnerOnOff())
    ).subscribe({
      next: (data) => {
        const items = Array.isArray(data?.data?.items)
          ? data.data.items
          : Array.isArray(data?.items)
            ? data.items
            : Array.isArray(data?.data)
              ? data.data
              : Array.isArray(data)
                ? data
                : [];
        const normalized = items.map((item: any) => this.normalizeReport(item));
        if (page === 1) {
          this.dataFilter = [];
        }
        this.dataFilter = [...this.dataFilter, ...normalized];
        this.dataService = [...this.dataFilter];
        this.count = data?.total ?? data?.data?.total ?? normalized.length;
        this.totalCount = data?.totals?.count ?? data?.totals?.total ?? this.count ?? 0;
        this.totalAmount = data?.totals?.amount ?? 0;
        this.totalPaidAmount = data?.totals?.paidAmount ?? 0;
        this.totalAnulados = data?.totals?.anulados ?? 0;
        this.totalVencidos = data?.totals?.vencidos ?? 0;
        this.totalPagados = data?.totals?.pagados ?? 0;
      },
      error: (err) => {
        console.error(err);
        this.mytoastr.showError('Error al cargar reportes', '');
      }
    });
  }
  private normalizeReport(item: any) {
    const estadoPagoRaw = item?.estado_pago ?? item?.estadoPago ?? item?.estado;
    const estadoPagoLabel = this.formatEstadoPago(estadoPagoRaw);
    const vigenciaLabel = this.formatVigencia(item?.estado_vigencia ?? item?.vigencia);
    return {
      emissionId: item?.emissionId ?? item?.emission_id ?? item?.id,
      efimeroCci: item?.efimeroCci ?? item?.efimero_cci,
      rowIdentity: item?.emissionId ?? item?.emission_id ?? item?.efimeroCci ?? item?.efimero_cci ?? item?.qr_id ?? item?.id_qr ?? item?.idQr ?? item?.id,
      qr_id: item?.qr_id ?? item?.id_qr ?? item?.idQr ?? item?.id,
      hash_qr: item?.hash_qr ?? item?.hash ?? item?.qrHash,
      qr_created_at: item?.qr_created_at ?? item?.created_at ?? item?.createdAt ?? item?.fecha_generacion,
      servicio: item?.servicio ?? item?.service ?? item?.empresa ?? item?.service_name,
      generatedBy: item?.generatedBy ?? item?.generated_by ?? item?.frontendUsername ?? item?.frontend_username ?? '-',
      job_id: item?.job_id ?? "-",
      referencia: item?.referencia ?? item?.suministro ?? item?.reference ?? item?.supply ?? item?.codigo_usuario,
      monto: this.hasAmountValue(item?.monto)
        ? this.formatAmountInSoles(item.monto)
        : this.formatAmountInCents(item?.amount),
      titular: item?.titular ?? item?.cliente ?? item?.customer ?? item?.client_name,
      qr_expired_at: item?.qr_expired_at ?? item?.expired_at ?? item?.expiredAt ?? item?.fecha_vencimiento,
      descripcion: item?.descripcion ?? item?.description ?? item?.numero_recibo ?? item?.receipt_number ?? item?.recibo ?? '',
      numero_recibo: item?.numero_recibo ?? item?.receipt_number ?? item?.recibo ?? '',
      estado_vigencia: vigenciaLabel,
      estado_pago_text: item?.estado_pago_text ?? estadoPagoLabel,
      estado_pago_raw: estadoPagoRaw,
      notificacion_at: item?.notificacion_at ?? item?.notified_at ?? item?.fecha_notificacion,
      pago_at: item?.pago_at ?? item?.paid_at ?? item?.fecha_pago,
      qr_image_path: item?.qr_image_path
    };
  }

  private formatEstadoPago(value: any): string {
    if (value === null || value === undefined || value === '') {
      return '-';
    }
    const num = Number(value);
    if (!Number.isNaN(num)) {
      switch (num) {
        case 0:
          return 'pendiente';
        case 1:
          return 'pagado';
        case 2:
          return 'notificado_no_pagado';
        case 3:
          return 'fallido';
        case 4:
          return 'devuelto';
        default:
          return String(value).toLowerCase().replace(/\s+/g, '_');
      }
    }
    return String(value).toLowerCase().replace(/\s+/g, '_');
  }

  private formatVigencia(value: any): string {
    if (value === null || value === undefined || value === '') {
      return '-';
    }
    return String(value).toLowerCase().replace(/\s+/g, '_');
  }

  private hasAmountValue(value: any): boolean {
    return value !== null && value !== undefined && value !== '';
  }

  private formatAmountInSoles(value: any): string {
    if (value === null || value === undefined || value === '') {
      return '-';
    }
    const raw = String(value).trim();
    if (/pen/i.test(raw)) {
      return raw;
    }
    const num = Number(raw.replace(',', '.'));
    if (Number.isNaN(num)) {
      return raw;
    }
    return `${num.toFixed(2)} PEN`;
  }

  private formatAmountInCents(value: any): string {
    if (value === null || value === undefined || value === '') {
      return '-';
    }
    const raw = String(value).trim();
    if (/pen/i.test(raw)) {
      return raw;
    }
    if (raw.includes('.') || raw.includes(',')) {
      return this.formatAmountInSoles(raw);
    }
    const num = Number(raw);
    if (Number.isNaN(num)) {
      return raw;
    }
    return `${(num / 100).toFixed(2)} PEN`;
  }

  private buildListFilters(): Record<string, any> {
    const filters: Record<string, any> = {};
    const get = (key: string) => String(this.reportForm?.get(key)?.value || '').trim();
    const start = this.formatDateParam(this.reportForm?.get('start')?.value);
    const end = this.formatDateParam(this.reportForm?.get('end')?.value);
    const expiredFrom = this.formatDateParam(this.reportForm?.get('expiredFrom')?.value);
    const expiredTo = this.formatDateParam(this.reportForm?.get('expiredTo')?.value);
    const paymentFrom = this.formatDateParam(this.reportForm?.get('paymentFrom')?.value);
    const paymentTo = this.formatDateParam(this.reportForm?.get('paymentTo')?.value);
    const notificationFrom = this.formatDateParam(this.reportForm?.get('notificationFrom')?.value);
    const notificationTo = this.formatDateParam(this.reportForm?.get('notificationTo')?.value);

    if (start) filters['start'] = start;
    if (end) filters['end'] = end;
    if (paymentFrom) filters['paymentFrom'] = paymentFrom;
    if (paymentTo) filters['paymentTo'] = paymentTo;
    if (notificationFrom) filters['notificationFrom'] = notificationFrom;
    if (notificationTo) filters['notificationTo'] = notificationTo;

    const idQr = get('idQr');
    const servicio = get('servicio');
    const referencia = get('referencia');
    const titular = get('titular');
    const vigencia = get('vigencia');
    const estadoPago = get('estadoPago');
    const jobId = get('jobId');
    const generatedBy = get('generatedBy');

    if (idQr) filters['idQr'] = idQr;
    if (servicio) filters['servicio'] = servicio;
    if (referencia) filters['referencia'] = referencia;
    if (titular) filters['cliente'] = titular;
    if (expiredFrom) filters['expiredFrom'] = expiredFrom;
    if (expiredTo) filters['expiredTo'] = expiredTo;
    if (vigencia) {
      filters['vigencia'] = vigencia;
      filters['estado_vigencia'] = vigencia;
    }
    if (estadoPago) filters['estadoPago'] = estadoPago;
    if (jobId) filters['jobId'] = jobId;
    if (generatedBy) filters['generatedBy'] = generatedBy;

    return filters;
  }

  private dateRangeValidator(startKey: string, endKey: string): ValidatorFn {
    return (group: AbstractControl): ValidationErrors | null => {
      const startValue = group.get(startKey)?.value;
      const endValue = group.get(endKey)?.value;
      if (!startValue || !endValue) {
        return null;
      }
      const start = new Date(startValue);
      const end = new Date(endValue);
      if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
        return null;
      }
      return start.getTime() <= end.getTime() ? null : { invalidDateRange: true };
    };
  }


  public formatDateTimeDisplay(value: any): string {
    if (!value) {
      return '-';
    }
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return String(value).replace('T', ' ');
    }
    const yyyy = date.getFullYear();
    const MM = String(date.getMonth() + 1).padStart(2, '0');
    const dd = String(date.getDate()).padStart(2, '0');
    const HH = String(date.getHours()).padStart(2, '0');
    const mm = String(date.getMinutes()).padStart(2, '0');
    const ss = String(date.getSeconds()).padStart(2, '0');
    return `${yyyy}-${MM}-${dd} ${HH}:${mm}:${ss}`;
  }

  private formatDateParam(value: any): string {
    if (!value) {
      return '';
    }
    if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
      return value;
    }
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return '';
    }
    const yyyy = date.getFullYear();
    const MM = String(date.getMonth() + 1).padStart(2, '0');
    const dd = String(date.getDate()).padStart(2, '0');
    return `${yyyy}-${MM}-${dd}`;
  }
  
  exportDataViaAPI(fileType: 'xlsx' | 'csv'): void {
    console.log('exportDataViaAPI called with', fileType);
    this.spinner.spinnerOnOff();

    const exportFilters: Record<string, any> = Object.keys(this.listFilters || {}).length
      ? { ...this.listFilters }
      : this.buildListFilters();

    // alias keys for backend compatibility
    if (exportFilters['estado'] && !exportFilters['estadoPago']) {
      exportFilters['estadoPago'] = exportFilters['estado'];
    }
    if (exportFilters['estado_vigencia'] && !exportFilters['vigencia']) {
      exportFilters['vigencia'] = exportFilters['estado_vigencia'];
    }
    if (exportFilters['empresa'] && !exportFilters['servicio']) {
      exportFilters['servicio'] = exportFilters['empresa'];
    }
    exportFilters['export'] = true;

    const token = localStorage.getItem('fcmToken');
    const inbx = this.reportMode === "external" ? 'generate_pago_external_qr' : 'generate_pago_qr';

    this.generateQrService.exportServices(fileType, exportFilters, inbx, token).subscribe({
      next: (response) => {
        this.spinner.spinnerOnOff();
        if (response.statusCode === 200) {
          this.mytoastr.showWarning('', 'Procesando Archivo...')
        } else {
          this.mytoastr.showError('', 'Error al enviar la solicitud')
        }
      },
      error: (error) => {
        this.spinner.spinnerOnOff();
        console.error('Error durante la exportación:', error);
        this.mytoastr.showError('Error durante la exportación', '');
      }
    });
  }

  get qr_service_type() {
    return this.qrForm?.get('service_type')
  }
}




