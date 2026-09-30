import { Component, OnInit, TemplateRef, ViewChild } from '@angular/core';
import { AbstractControl, FormBuilder, FormGroup, ValidationErrors, ValidatorFn, Validators } from '@angular/forms';
import { MatDialog, MatDialogRef } from '@angular/material/dialog';
import { Router } from '@angular/router';
import { ServicesService } from 'src/app/services/services.service';
import { DynamicTableComponent } from '../../library/dynamic-table/dynamic-table.component';
import { MasterService } from 'src/app/services/master.service';
import { PersonService } from 'src/app/services/person.service';
import { SpinnerService } from 'src/app/services/spinner.service';
import { MytoastrService } from 'src/app/services/mytoastr';
import { PageEvent } from '@angular/material/paginator';
import { PaginationUtils } from 'src/app/utilities/PaginationUtils';
import { filter, forkJoin, lastValueFrom, finalize, map } from 'rxjs';
import { DialogServiceConfigComponent } from 'src/app/dialogs/dialog-service-config/dialog-service-config.component';
import { GenerateQrService, QrEmissionIdentity } from 'src/app/services/generateqr.service';
import { AuthService } from 'src/app/services/auth.service';
import { environment } from 'src/environments/environment';
import * as QRCode from 'qrcode';
import jwtDecode from 'jwt-decode';
import { ActivatedRoute } from '@angular/router';

@Component({
  selector: 'uni-services',
  templateUrl: './generateqr.component.html',
  styleUrls: ['./generateqr.component.scss']
})
export class GenerateQR implements OnInit {

  public columns: any[] = [
    { name: 'ID QR', attribute: 'id_qr' },
    { name: 'Referencia', attribute: 'referencia' },
    { name: 'Servicio', attribute: 'empresa' },
    { name: 'Creado por', attribute: 'generatedBy' },
    {
      name: 'Fecha creacion',
      attribute: 'qr_created_at',
      config: {
        formatDate: { format: 'dd/MM/yyyy HH:mm', locale: 'en-US' }
      }
    },
    {
      name: 'Fecha vencimiento',
      attribute: 'expired_at',
      config: {
        formatDate: { format: 'dd/MM/yyyy HH:mm', locale: 'en-US' }
      }
    },
    { name: 'Monto', attribute: 'amount' },
    {
      name: 'Estado pago',
      attribute: 'estado_pago_label',
      config: {
        styleClass: true
      }
    },
    {
      name: 'Vigencia',
      attribute: 'estado_vigencia_label',
      config: {
        styleClass: true
      }
    },
    { name: 'Job ID', attribute: 'job_id' },
    {
      name: 'Acciones',
      attribute: '',
      config: {
        type: 'buttonicons',
        restriccPermission: true,
        actions: [
          {
            permission: "qr-view",
            bgClass: 'gray',
            toolTip: 'Ver QR',
            icon: 'visibility',
            value: 'view_qr'
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
    },
  ];
  public options: any[] = [
    { value: 'Servicio', id: '1' },
    { value: 'Entidad-Servicio', id: '2' },
    { value: 'Client-Servicio', id: '3' },
  ]

  public pageSize: any = 5;
  public pageKey: any[];
  public close: boolean = false;
  public serviceForm!: FormGroup;
  public qrForm!: FormGroup;
  public massiveForm!: FormGroup;
  public dataFilter: any = [];
  public dataService: any[];
  public listFilters: any = {};
  public functionDataCurrent: (pageSize: any) => any;
  public disabledEditOption: any
  public editOption: any;
  public selectedIds: any;
  public stateMaster: any;
  public dataIdService: any;
  public optionId: any
  public categoriesService: any[] = [];
  public filteredServices: ServiceItem[] = []; // Lista filtrada que se mostrará
  public listServicesSelected: ServiceItem[] = [];
  public listServicesSelected1: ServiceItem[] = [];
  public allItems1: ServiceItem[] = []; // Lista filtrada que se mostrará
  public allItems: any[] = [];
  public serviceFilter: string = '';
  public filterServiceSelected: ServiceItem | null = null;

  public estadoPagoOptions = [
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
  public qrFilteredServices: ServiceItem[] = [];
  public qrAllItems: ServiceItem[] = [];
  public qrServiceFilter: string = '';
  public qrSelectedCategory: boolean = false;
  public qrSelectedService: ServiceItem | null = null;
  public minDate: Date = new Date();
  public qrResult: any = null;
  public qrImageSrc: string = '';
  public pendingCancelId: string | null = null;
  public pendingReturnRow: any = null;
  public massiveResult: any = null;
  public sftpItems: string[] = [];
  public massiveServiceFilter: string = '';
  public massiveFilteredServices: ServiceItem[] = [];
  public massiveSelectedServiceName: string = '';
  public massiveWorkersEditEnabled: boolean = false;
  private qrDialogRef?: MatDialogRef<any>;
  private qrResultDialogRef?: MatDialogRef<any>;
  private cancelDialogRef?: MatDialogRef<any>;
  private cancelBlockedDialogRef?: MatDialogRef<any>;
  private markReturnedDialogRef?: MatDialogRef<any>;
  private markReturnedBlockedDialogRef?: MatDialogRef<any>;
  private reNotifyDialogRef?: MatDialogRef<any>;
  private reNotifyBlockedDialogRef?: MatDialogRef<any>;
  private qrMassiveDialogRef?: MatDialogRef<any>;
  public qrDialogMode: 'create' | 'view' = 'create';
  public isGeneratingQr: boolean = false;
  public isGeneratingMassive: boolean = false;
  public isCancellingQr: boolean = false;
  public isMarkingReturned: boolean = false;
  public isReNotified: boolean = false;
  public headSubTitleAnulado: string = '';
  public contentSubTitleAnulado: string = '';
  public headSubTitleReturned: string = '';
  public contentSubTitleReturned: string = '';
  public headSubTitleReNotify: string = '';
  public contentSubTitleReNotify: string = '';  

  private pagUtils: PaginationUtils | undefined;
  public page: number = 1; // Variable para la página actual
  public count: number = null; // Variable para el total de elementos
  public listProviders: any;
  public selectedCategory: boolean = false;
  public canGenerateQRIndividual: boolean = false;
  public canGenerateQRMassive: boolean = false;

  @ViewChild(DynamicTableComponent) dynamic!: DynamicTableComponent;
  @ViewChild('generateQrDialog') generateQrDialog!: TemplateRef<any>;
  @ViewChild('generateQrResultDialog') generateQrResultDialog!: TemplateRef<any>;
  @ViewChild('cancelQrDialog') cancelQrDialog!: TemplateRef<any>;
  @ViewChild('cancelBlockedDialog') cancelBlockedDialog!: TemplateRef<any>;
  @ViewChild('markReturnedDialog') markReturnedDialog!: TemplateRef<any>;
  @ViewChild('generateQrMassiveDialog') generateQrMassiveDialog!: TemplateRef<any>;
  @ViewChild('markReturnedBlockedDialog') markReturnedBlockedDialog!: TemplateRef<any>;
  @ViewChild('reNotifyDialog') reNotifyDialog!: TemplateRef<any>;
  @ViewChild('reNotifyBlockedDialog') reNotifyBlockedDialog!: TemplateRef<any>;


  constructor(
    private router: Router,
    private services: ServicesService,
    private fb: FormBuilder,
    private master: MasterService,
    private person: PersonService,
    private spinner: SpinnerService,
    private mytoastr: MytoastrService,
    private personService: PersonService,
    private generateQrService: GenerateQrService,
    private authService: AuthService,
    public dialog: MatDialog,
    private route: ActivatedRoute,
  ) {
    this.pagUtils = new PaginationUtils();
  }

  ngOnInit(): void {
    this.authService.permissions$.subscribe(permissions => {
      this.canGenerateQRIndividual = !!permissions['qr-generate-individual'];
      this.canGenerateQRMassive = !!permissions['qr-generate-massive'];
    });

    this.minDate.setHours(0, 0, 0, 0);
    this.minDate.setDate(this.minDate.getDate() + 1);
    this.formService();//inicializa los inputs como vacios
    this.formQr();
    this.formMassive();
    this.dataMaster();//carga lista de estados
    this.listData();//carga lista de tipos de servicios
    this.serviceForm.get('service_type')?.setValue('LUZ');
    this.cargarServicios();
    // Suscribirse a cambios y convertir a mayusculas
    this.service_name?.valueChanges.subscribe(value => {
      if (value) {
        this.service_name?.setValue(value.toUpperCase(), { emitEvent: false });
      }
    });
    // Suscribirse a cambios y convertir a mayusculas titular
    this.qrForm.get('titular')?.valueChanges.subscribe(value => {
      if (value) {
        this.qrForm.get('titular')?.setValue(value.toUpperCase(), { emitEvent: false });
      }
    });
    this.functionDataCurrent = this.dataInitial.bind(this); //replica la funcion
    this.functionDataCurrent(this.pageSize);
  }

  async selectCategory() {
    if (!this.service_type.value) {
      this.selectedCategory = false;
      this.filteredServices = [];
      this.listServicesSelected = [];
      this.serviceForm.get('idService')?.setValue('')
      this.serviceForm.get('service_name')?.setValue('')
      return;
    }
    this.serviceForm.get('service_name')?.setValue('')
    this.selectedCategory = true;
    await this.cargarServicios();
  }

  onServicesChange(event: any) {
    const selectedId = Array.isArray(event.value)
      ? event.value[event.value.length - 1]
      : event.value;
    const selectedObject = this.allItems1.find(s => s.id === selectedId);
    this.listServicesSelected = selectedObject ? [selectedObject] : [];
    this.serviceForm.get('idService')?.setValue(selectedId || '');
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
  onFilterServiceChange(event: any) {
    const selectedId = event.value;
    const selectedObject = this.filteredServices.find(s => s.name === selectedId);
    this.filterServiceSelected = selectedObject ?? null;
    this.serviceForm.get('empresa')?.setValue(selectedId || '');
  }

  get filterServiceName(): string {
    return this.filterServiceSelected?.name || '';
  }

  openCancelQrDialog(element: any) {
    this.pendingCancelId = String(element?.id_qr || element?.id || '');
    if (!this.pendingCancelId) {
      this.mytoastr.showWarning('ID QR no disponible', '');
      return;
    }
    const estadoPago = String(element?.estado_pago_label || '').toLowerCase();
    const estadoPagoRaw = element?.estado_pago;
    const estadoVigencia = String(element?.estado_vigencia || '').toLowerCase();
    if (estadoPago === 'pagado' || estadoPagoRaw === 1 || estadoPagoRaw === '1') {
      this.headSubTitleAnulado = "El QR esta en estado pagado."
      this.contentSubTitleAnulado = "Para anular un QR pagado primero debes marcarlo como devuelto."
      this.cancelBlockedDialogRef = this.dialog.open(this.cancelBlockedDialog, {
        width: '480px',
        maxWidth: '95vw',
        panelClass: 'qr-dialog'
      });
    }else if( estadoVigencia === "anulado" ){
      this.headSubTitleAnulado = "El QR ya se encuentra en estado anulado."
      this.contentSubTitleAnulado = "No es necesario realizar ninguna acción adicional."
      this.cancelBlockedDialogRef = this.dialog.open(this.cancelBlockedDialog, {
        width: '420px',
        maxWidth: '92vw',
        panelClass: 'qr-dialog'
      });
    }else{
      this.cancelDialogRef = this.dialog.open(this.cancelQrDialog, {
        width: '420px',
        maxWidth: '92vw',
        panelClass: 'qr-dialog'
      });
    }
      return;
  }

  confirmCancelQr() {
    if (!this.pendingCancelId || this.isCancellingQr) {
      return;
    }
    this.isCancellingQr = true;
    this.spinner.spinnerOnOff();
    const responsable = this.getResponsable();
    this.generateQrService.cancelQr([this.pendingCancelId], responsable).pipe(
      finalize(() => {
        this.isCancellingQr = false;
      })
    ).subscribe({
      next: (response) => {
        this.spinner.spinnerOnOff();
        this.mytoastr.showSuccess('QR anulado correctamente', '');
        if (this.cancelDialogRef) {
          this.cancelDialogRef.close();
        }
        this.reload();
      },
      error: (err) => {
        console.error(err);
        this.spinner.spinnerOnOff();
        this.showApiError(err, 'No se pudo anular el QR');
      }
    });
  }

  openMarkReturnedDialog(element: any) {
    this.pendingReturnRow = element;
    const idQr = this.getRowIdQr(element);
    if (!idQr && !this.getRowEfimeroCci(element)) {
      this.mytoastr.showWarning('ID QR no disponible', '');
      return;
    }
    
    const estadoPago = String(element?.estado_pago_label || '').toLowerCase();
    const estadoPagoRaw = element?.estado_pago;
    
    if (estadoPago === 'devuelto' || estadoPagoRaw === 4 || estadoPagoRaw === '4') {
      this.headSubTitleReturned = "El QR ya se encuentra en estado devuelto."
      this.contentSubTitleReturned = "No es necesario realizar ninguna acción adicional."
      this.markReturnedBlockedDialogRef = this.dialog.open(this.markReturnedBlockedDialog, {
        width: '420px',
        maxWidth: '92vw',
        panelClass: 'qr-dialog'
      });
    }else{
      this.headSubTitleReturned = "Solo se puede actualizar cuando el estado es pagado, notificado no pagado o fallido."
      this.contentSubTitleReturned = `La devolución debe gestionarse por el proceso correspondiente. ¿Deseas marcar como devuelto el QR ${idQr || '-'}?`
      this.markReturnedDialogRef = this.dialog.open(this.markReturnedDialog, {
        width: '480px',
        maxWidth: '95vw',
        panelClass: 'qr-dialog'
      });
    }
      return;
    
  }

  confirmMarkReturned() {
    if (!this.pendingReturnRow || this.isMarkingReturned) {
      return;
    }
    this.isMarkingReturned = true;
    this.spinner.spinnerOnOff();
    const responsable = this.getResponsable();
    this.generateQrService.markReturned([this.getRowIdentity(this.pendingReturnRow)], responsable).pipe(
      finalize(() => {
        this.isMarkingReturned = false;
      })
    ).subscribe({
      next: (rspta) => {
        if ( rspta.dbUpdated === 1 ) {
          this.mytoastr.showSuccess('QR devuelto correctamente', '');
          this.spinner.spinnerOnOff();
          this.reload();
        }else{
          this.mytoastr.showWarning('Error.', rspta.note);
          this.spinner.spinnerOnOff();
        }
        if (this.markReturnedDialogRef) {
          this.markReturnedDialogRef.close();
        }
      },
      error: (err) => {
        console.error(err);
        this.spinner.spinnerOnOff();
        this.showApiError(err, 'Error al actualizar estado');
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

  openGenerateQrMassiveDialog() {
    this.massiveResult = null;
    this.sftpItems = [];
    this.massiveServiceFilter = '';
    this.massiveSelectedServiceName = '';
    this.massiveFilteredServices = [...this.allItems1];
    if (!this.massiveFilteredServices.length) {
      this.cargarServicios();
    }
    this.isGeneratingMassive = false;
    this.massiveWorkersEditEnabled = false;
    this.massiveForm.reset();
    this.massiveForm.get('workers')?.setValue(1, { emitEvent: false });
    this.massiveForm.get('workers')?.disable({ emitEvent: false });
    this.qrMassiveDialogRef = this.dialog.open(this.generateQrMassiveDialog, {
      width: '640px',
      maxWidth: '92vw',
      panelClass: 'qr-dialog'
    });
  }

  onMassiveWorkersEditToggle(enabled: boolean) {
    this.massiveWorkersEditEnabled = enabled;
    const workersControl = this.massiveForm.get('workers');
    if (!workersControl) {
      return;
    }

    if (enabled) {
      workersControl.enable({ emitEvent: false });
      return;
    }

    workersControl.setValue(1, { emitEvent: false });
    workersControl.disable({ emitEvent: false });
  }

  onMassiveServiceChange(event: any) {
    const serviceName = event?.value || '';
    this.massiveSelectedServiceName = serviceName;
    this.massiveForm.get('fileName')?.setValue('');
    this.sftpItems = [];
    if (serviceName) {
      this.loadSftpItems(serviceName);
    }
  }

  filterMassiveServices() {
    const value = this.massiveServiceFilter?.toLowerCase() || '';
    this.massiveFilteredServices = this.allItems1.filter(service =>
      service.name.toLowerCase().includes(value)
    );
  }

  private loadSftpItems(serviceName: string) {
    this.spinner.spinnerOnOff();
    this.generateQrService.listSftp('in', serviceName).subscribe({
      next: (response) => {
        const items = response?.items ?? response?.data?.items ?? [];
        this.sftpItems = Array.isArray(items) ? items : [];
      },
      error: (err) => {
        console.error(err);
        this.mytoastr.showError('Error al cargar archivos SFTP', '');
      },
      complete: () => {
        this.spinner.spinnerOnOff();
      }
    });
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
    let request$ = this.generateQrService.generateIndividual(payload);

    request$.pipe(
      finalize(() => this.spinner.spinnerOnOff())
    ).subscribe({
      next: (data) => {
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
        
        this.reload();
        this.openQrResultDialog('create');
      },
      error: (err) => {
        console.error(err);
        this.isGeneratingQr = false;
        this.mytoastr.showError('Error al generar QR', '');
      }
    });
  }

  generateQrMassive() {
    if (this.massiveForm.invalid) {
      this.massiveForm.markAllAsTouched();
      this.mytoastr.showWarning('Complete los campos obligatorios', '');
      return;
    }
    if (this.isGeneratingMassive) {
      return;
    }
    const raw = this.massiveForm.getRawValue();
    const fileName = raw.fileName;
    const payload = {
      sftpPath: `in/${fileName}`,
      outputDir: 'out',
      workers: Number(raw.workers) || 1,
      serviceName: raw.serviceName
    };
    this.isGeneratingMassive = true;
    this.spinner.spinnerOnOff();
    this.generateQrService.generateMassive(payload).subscribe({
      next: (response) => {
        this.spinner.spinnerOnOff();
        this.isGeneratingMassive = false;
        this.massiveResult = response;
      },
      error: (err) => {
        console.error(err);
        this.spinner.spinnerOnOff();
        this.isGeneratingMassive = false;
        this.mytoastr.showError('Error al generar QR masivo', '');
      }
    });
  }

  backToForm() {
    if (this.qrDialogMode === 'view') {
      return;
    }
    this.openGenerateQrDialog();
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

  async selectCategoryQr() {
    if (!this.qr_service_type?.value) {
      this.qrSelectedCategory = false;
      this.qrFilteredServices = [];
      this.qrAllItems = [];
      this.qrSelectedService = null;
      this.qrForm.get('idService')?.setValue('');
      return;
    }
    this.qrSelectedCategory = true;
    await this.cargarServiciosQr();
  }

  onQrServiceChange(event: any) {
    const selectedId = Array.isArray(event.value)
      ? event.value[event.value.length - 1]
      : event.value;
    const selectedObject = this.qrAllItems.find(s => s.id === selectedId);
    this.qrSelectedService = selectedObject ?? null;
    this.qrForm.get('idService')?.setValue(selectedId || '');
  }

  filterQrServices() {
    const value = this.qrServiceFilter?.toLowerCase() || '';
    this.qrFilteredServices = this.qrAllItems.filter(service =>
      service.name.toLowerCase().includes(value)
    );
  }

  async cargarServiciosQr(): Promise<void> {
    try {
      this.spinner.spinnerOnOff();
      const type = this.qr_service_type?.value;
      const allItems = await lastValueFrom(
        this.loadAllServicesByType(type).pipe(
          filter((items: any) => items.length > 0),
          finalize(() => this.spinner.spinnerOnOff())
        )
      );
      this.qrFilteredServices = allItems;
      this.qrAllItems = allItems;
      this.qrServiceFilter = '';
      this.filterQrServices();
    } catch (error) {
      console.error('Error al cargar servicios QR:', error);
      this.qrFilteredServices = [];
      this.mytoastr.showError('', 'No tiene Servicios')
    }
  }


  filterServices() {
    const value = this.serviceFilter?.toLowerCase() || '';
    this.filteredServices = this.allItems1.filter(service =>
      service.name.toLowerCase().includes(value)
    );
  }

  async cargarServicios(): Promise<void> {
    try {
      this.spinner.spinnerOnOff();
      const allItems = await lastValueFrom(
        this.loadAllServices().pipe(
          filter((items: any) => items.length > 0),
          finalize(() => this.spinner.spinnerOnOff())
        )
      );
      this.filteredServices = allItems;
      this.allItems1 = allItems;
      this.serviceFilter = '';
      this.filterServices();
    } catch (error) {
      console.error("❌ Error al cargar servicios:", error);
      this.filteredServices = [];
      this.mytoastr.showError('', 'No tiene Servicios')
    }
  }

  loadAllServices() {
    return this.loadAllServicesByType(this.service_type.value);
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

  private isConfiguredQrService(item: any): boolean {
    return item?.active === true || Number(item?.active) === 1;
  }

  dataInitial(pageSize: any) {
    this.spinner.spinnerOnOff();
    const page = this.page && this.page > 0 ? this.page : 1;
    const requiredLength = page * pageSize;
    if (this.dataFilter?.length >= requiredLength) {
      this.dataService = [...this.dataFilter];
      this.spinner.spinnerOnOff();
      this.close = true;
      return;
    }
    this.generateQrService.listIndividuals(page, pageSize, this.listFilters).subscribe({
      next: (data) => {
        if (data?.statusCode && data.statusCode !== 200) {
          this.mytoastr.showWarning(data?.messages || 'No se pudo cargar el listado', '')
          return
        }
        const items = Array.isArray(data?.data?.items)
          ? data.data.items
          : Array.isArray(data?.items)
            ? data.items
            : Array.isArray(data?.data?.Items)
              ? data.data.Items
              : Array.isArray(data?.Items)
                ? data.Items
                : Array.isArray(data?.data)
                  ? data.data
                  : Array.isArray(data)
                    ? data
                    : [];
        if (page === 1) {
          this.dataFilter = [];
        }
        const normalizedItems = items.map((item: any) => ({
          ...item,
          emissionId: item?.emissionId ?? item?.emission_id ?? item?.id,
          efimeroCci: item?.efimeroCci ?? item?.efimero_cci,
          rowIdentity: item?.emissionId ?? item?.emission_id ?? item?.efimeroCci ?? item?.efimero_cci ?? item?.id_qr ?? item?.id,
          referencia: item?.referencia ?? item?.suministro ?? item?.reference ?? item?.codigo_usuario,
          generatedBy: item?.generatedBy ?? item?.generated_by ?? item?.frontendUsername ?? item?.frontend_username ?? '-',
          amount: this.formatAmountInCents(item?.amount),
          estado_pago_label: this.formatEstadoPago(item?.estado_pago),
          estado_vigencia_label: this.formatVigencia(item?.estado_vigencia ?? item?.vigencia)
        }));
        this.dataFilter = [...this.dataFilter, ...normalizedItems];
        this.dataService = [...this.dataFilter];
        this.count =
          data?.data?.total ??
          data?.total ??
          data?.data?.Count ??
          data?.Count ??
          data?.count ??
          this.dataService.length;
      },
      error: (err) => {
        console.log(err);
        this.spinner.spinnerOnOff();
      },
      complete: () => {
        this.spinner.spinnerOnOff();
        this.close = true
      }
    })
  }

  formService() {
    this.serviceForm = this.fb.group({
      start_date: [''],
      end_date: [''],
      paymentFrom: [''],
      paymentTo: [''],
      estado_pago: [''],
      vigencia: [''],
      referencia: [''],
      empresa: [''],
      jobId: [''],
      idQr: ['', [Validators.pattern(/^\d*$/)]],
      generatedBy: [''],
      service_name: [''],
      idService: [''],
      service_type: [''],
      service_id: [''],
      provider: [''],
      status: ['']
    }, { validators: [
      this.dateRangeValidator('start_date', 'end_date'),
      this.dateRangeValidator('paymentFrom', 'paymentTo')
    ] })
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

  formMassive() {
    this.massiveForm = this.fb.group({
      serviceName: ['', [Validators.required]],
      fileName: ['', [Validators.required]],
      workers: [{ value: 1, disabled: true }, [Validators.required, Validators.min(1)]]
    })
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

  onNumericInput(event: Event, maxLength: number) {
    const input = event.target as HTMLInputElement;
    const digits = (input.value || '').replace(/\D/g, '').slice(0, maxLength);
    input.value = digits;
    return digits;
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

  addService() {
    this.router.navigate(['service/add'])
  }

  updateService() {
    this.router.navigate(['service/import', 'update']);
  }

  createService() {
    this.router.navigate(['service/import', 'create']);
  }

  searchData() {
    this.listFilters = this.buildListFilters();
    this.clearData();
    this.dataInitial(this.pageSize);
  }

  cleanSearch() {
    this.service_name.setValue('')
    this.close = false;
    this.serviceFilter = '';
    this.filteredServices = [];
    this.listServicesSelected = [];
    this.allItems = [];
    this.listServicesSelected = [];
    this.listFilters = {};
    this.clearData();
  }

  clickButton(event) {
    console.log("event", event)
    const { value, element } = event
    if (value == "view_qr") {
      this.openQrPreview(element)
    } else if (value == "cancel_qr") {
      this.openCancelQrDialog(element)
    } else if (value == "mark_returned") {
      this.openMarkReturnedDialog(element)
    } else if (value === 're_notify') {
      this.openReNotifyDialog(element);
    }
  }

  openDialogConfigService(element) {

    const dialogRef = this.dialog.open(DialogServiceConfigComponent, {

      width: '600px',
      data: {
        serviceName: element.name,
        serviceId: element.id,
        serviceAmountTransactionRestriccion: element.amountTransactionRestriccion,
        serviceAmountDailyRestriccion: element.amountDailyRestriccion,
      }
    });

    dialogRef.afterClosed().subscribe(
      response => {
        if (response) {
          console.log('result en afterClosed of openDialogMinBalance', response)
          this.reload();
        }
      });



  }

  editElement(id: any) {
    this.router.navigate([`/service/edit/${id}`]);
  }

  dataMaster() {
    this.master.getItemsMasterTable('1').subscribe({
      next: (data) => {
        this.stateMaster = data;
      },
      error: (error) => {
        console.error('Error:', error);
      },
    });
  }

  listData() {
    this.spinner.spinnerOnOff();
    forkJoin([
      this.master.getItemsMasterTable('14'), // CategoriaService
      this.personService.getPerson('PROVEEDOR'),
    ]).subscribe({
      next: (response) => {
        const [categoryService, providers] = response;
        this.categoriesService = categoryService;
        this.listProviders = providers.data;
      },
      error: (error) => {
        this.spinner.spinnerOnOff();
        console.error("Error loading master table data:", error);
      },
      complete: () => {
        this.spinner.spinnerOnOff();
      },
    });
  }

  clearData() {
    this.count = null;
    this.pageKey = undefined;
    this.dataService = [];
    this.dataFilter = [];
    this.allItems = [];
    this.page = 1;
  }

  reload() {
    this.clearData();
    this.dynamic.clearSelection();
    this.dataInitial(this.pageSize);
    // this.functionDataCurrent(this.pageSize);
  }

  /************************************* METODOS DE BOTONES ***********************************/
  clearFormAndData() {
    this.clearData();
    this.cleanSearch();
    this.serviceForm.reset();
    this.listFilters = {};
    this.selectedCategory = false;
    this.listServicesSelected = [];
    this.cargarServicios();
    // Suscribirse a cambios y convertir a mayusculas
    this.service_name?.valueChanges.subscribe(value => {
      if (value) {
        this.service_name?.setValue(value.toUpperCase(), { emitEvent: false });
      }
    });
    this.dataInitial(this.pageSize);
  }


  /******************************** METODOS DE PAGINADO *************************************/
  onPageChange(event: PageEvent) {
    console.log('onPageChange', event);
    console.log('pageSize', this.pageSize);
    const sizeChanged = event.pageSize !== this.pageSize;
    this.pageSize = event.pageSize;
    this.page = event.pageIndex + 1;
    if (sizeChanged) {
      this.dataFilter = [];
      this.dataService = [];
    }
    this.dataInitial(this.pageSize);
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

    const inbx = 'generate_qr';
    const token = localStorage.getItem('fcmToken');
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

  
/******************************************** METODOS GET ****************************************/

  get service_name() {
    return this.serviceForm.get('service_name')
  }

  get service_type() {
    return this.serviceForm?.get('service_type')
  }

  get status() {
    return this.serviceForm.get('status')
  }

  get service_id() {
    return this.serviceForm.get('service_id')
  }

  get provider() {
    return this.serviceForm.get('provider')
  }

  get qr_service_type() {
    return this.qrForm?.get('service_type')
  }

  get qr_idService() {
    return this.qrForm?.get('idService')
  }

  get qr_amount_cents(): number {
    const value = this.qrForm?.get('amount')?.value;
    const num = Number(value);
    if (Number.isNaN(num)) {
      return 0;
    }
    return Math.round(num * 100);
  }

  get qrServiceName(): string {
    return this.qrSelectedService?.name || '';
  }

  get qrDisplayName(): string {
    if (!this.qrResult) {
      return '-';
    }
    return (
      this.qrResult.business_name ||
      this.qrResult.name ||
      this.qrResult.empresa ||
      '-'
    );
  }

  get qrDisplayAmount(): string {
    const formAmount = this.qrForm?.get('amount')?.value;
    if (this.qrDialogMode === 'create' && formAmount) {
      return this.formatAmountInSoles(formAmount);
    }
    return this.formatAmountInCents(this.qrResult?.amount);
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

  get qrEstadoPagoLabel(): string {
    return this.formatEstadoPago(this.qrResult?.estado_pago);
  }

  get qrExpiredAtDisplay(): string {
    const formValue = this.qrForm?.get('due_date')?.value;
    const value = this.qrDialogMode === 'create'
      ? (formValue || this.qrResult?.expired_at || this.qrResult?.expiredAt)
      : (this.qrResult?.expired_at || this.qrResult?.expiredAt);
    return this.formatDateTimeDisplay(value);
  }

  get servicesNames(): string {
    return this.listServicesSelected.map(s => s.name).join(', ');
  }

  get servicesId(): string {
    return this.listServicesSelected.map(s => s.id).join(', ');
  }

  private openQrResultDialog(mode: 'create' | 'view') {
    this.qrDialogMode = mode;
    this.qrResultDialogRef = this.dialog.open(this.generateQrResultDialog, {
      width: '640px',
      maxWidth: '92vw',
      panelClass: 'qr-dialog'
    });
  }

  private resolveQrImageSrc(row: any): string {
    if (!row) {
      return '';
    }
    const base64 = row?.imageBase64 || row?.qr_image_base64 || row?.qrImageBase64;
    if (base64) {
      return `data:image/png;base64,${base64}`;
    }
    const path = row?.qr_image_path;
    if (!path) {
      return '';
    }
    if (/^https?:\/\//i.test(path)) {
      return path;
    }
    const base = (environment.URL_API_GENERATE_QR || '').replace(/\/$/, '');
    return `${base}/${String(path).replace(/^\/+/, '')}`;
  }


  private buildListFilters(): Record<string, any> {
    const start = this.formatDateParam(this.serviceForm?.get('start_date')?.value);
    const end = this.formatDateParam(this.serviceForm?.get('end_date')?.value);
    const paymentFrom = this.formatDateParam(this.serviceForm?.get('paymentFrom')?.value);
    const paymentTo = this.formatDateParam(this.serviceForm?.get('paymentTo')?.value);
    const estadoPago = String(this.serviceForm?.get('estado_pago')?.value || '').trim();
    const vigencia = String(this.serviceForm?.get('vigencia')?.value || '').trim();
    const referencia = String(this.serviceForm?.get('referencia')?.value || '').trim();
    const empresa = String(this.serviceForm?.get('empresa')?.value || '').trim();
    const jobId = String(this.serviceForm?.get('jobId')?.value || '').trim();
    const idQr = String(this.serviceForm?.get('idQr')?.value || '').trim();
    const generatedBy = String(this.serviceForm?.get('generatedBy')?.value || '').trim();
    const filters: Record<string, any> = {};
    if (start) {
      filters['start'] = start;
    }
    if (end) {
      filters['end'] = end;
    }
    if (paymentFrom) {
      filters['paymentFrom'] = paymentFrom;
    }
    if (paymentTo) {
      filters['paymentTo'] = paymentTo;
    }
    if (estadoPago) {
      filters['estado'] = estadoPago;
    }
    if (vigencia) {
      filters['estado_vigencia'] = vigencia;
      filters['vigencia'] = vigencia;
    }
    if (referencia) {
      filters['referencia'] = referencia;
    }
    if (empresa) {
      filters['empresa'] = empresa;
    }
    if (jobId) {
      filters['jobId'] = jobId;
    }
    if (idQr) {
      filters['idQr'] = idQr;
    }
    if (generatedBy) {
      filters['generatedBy'] = generatedBy;
    }
    return filters;
  }

  private formatDateTimeDisplay(value: any): string {
    if (!value) {
      return '-';
    }
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return String(value);
    }
    const yyyy = date.getFullYear();
    const MM = String(date.getMonth() + 1).padStart(2, '0');
    const dd = String(date.getDate()).padStart(2, '0');
    const HH = String(date.getHours()).padStart(2, '0');
    const mm = String(date.getMinutes()).padStart(2, '0');
    return `${yyyy}-${MM}-${dd} hora : ${HH}:${mm}`;
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

  private formatVigencia(value: any): string {
    if (value === null || value === undefined || value === '') {
      return '-';
    }
    return String(value).toLowerCase().replace(/\s+/g, '_');
  }

  private formatEstadoPago(value: any): string {

    if (value === null || value === undefined || value === '') {
      return '-';
    }
    const num = Number(value);
    if (Number.isNaN(num)) {
      return String(value);
    }
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
        return String(value);
    }
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

  copyText(value: string | null | undefined) {
    if (!value) {
      return;
    }
    if (navigator?.clipboard?.writeText) {
      navigator.clipboard.writeText(String(value));
    }
  }

  private async openQrPreview(row: any) {
    this.qrResult = row;
    this.qrImageSrc = '';
    this.openQrResultDialog('view');
    const hash = row?.hash_qr;
    if (hash) {
      try {
        this.qrImageSrc = await this.buildQrImageFromHash(hash);
        return;
      } catch (error) {
        console.error('Error generando QR desde hash:', error);
      }
    }
    this.qrImageSrc = this.resolveQrImageSrc(row);
  }

  private buildQrImageFromHash(hash: string): Promise<string> {
    return QRCode.toDataURL(hash, {
      width: 220,
      margin: 1
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
      this.headSubTitleReNotify = "Solo es posible re notificar un pago de QR en estado pagado."
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
    
    const request$ = this.generateQrService.reNotifyByInternalUser(this.getRowIdentity(row), responsable);

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
    return String(row?.id_qr ?? row?.idQr ?? row?.qr_id ?? '').trim();
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

}

interface ServiceItem {
  id: string;
  name: string;
}
