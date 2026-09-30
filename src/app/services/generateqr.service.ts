import { HttpBackend, HttpClient, HttpHeaders, HttpParams } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { CookieService } from 'ngx-cookie-service';
import { Observable } from 'rxjs';
import { AuthService } from './auth.service';
import { environment } from 'src/environments/environment';

export interface QrEmissionIdentity {
  idQr?: string | null;
  efimeroCci?: string | null;
  emissionId?: number | string | null;
}

@Injectable({
  providedIn: 'root'
})
export class GenerateQrService {

  private url = `${environment.URL_API_GENERATE_QR}/v1/qr/individual`;
  private listUrl = `${environment.URL_API_GENERATE_QR}/v1/qr/list`;
  private sftpListUrl = `${environment.URL_API_GENERATE_QR}/v1/sftp/list`;
  private massiveUrl = `${environment.URL_API_GENERATE_QR}/v1/batch/start`;
  private serviceScheduleUrl = `${environment.URL_API_GENERATE_QR}/v1/service-schedule`;
  private reprocessQueueUrl = `${environment.URL_API_GENERATE_QR}/v1/reprocess/queue`;
  private reprocessHistoryUrl = `${environment.URL_API_GENERATE_QR}/v1/reprocess/history`;
  private qrServicesUrl = `${environment.URL_API_GENERATE_QR}/v1/services`;
  private qrServicesConfigUrl = `${environment.URL_API_GENERATE_QR}/v1/services-config`;
  private sftpProviderConfigsUrl = `${environment.URL_API_GENERATE_QR}/v1/sftp/provider-configs`;
  private serviceSftpProviderUrl = `${environment.URL_API_GENERATE_QR}/v1/service-sftp-provider`;
  private notificationEmailsUrl = `${environment.URL_API_GENERATE_QR}/v1/notification-emails`;
  private URL1 = `${environment.URL_API_GATEWAY}/export`;

  private urlGenerateByUserExternal = `${environment.URL_API_GENERATE_QR}/v1/external/qr/individual`;

  private rawHttpClient: HttpClient;

  constructor(
    private httpClient: HttpClient,
    private authService: AuthService,
    private httpBackend: HttpBackend,
    private cookieService: CookieService,
  ) {
    this.rawHttpClient = new HttpClient(this.httpBackend);
  }

  generateIndividual(payload: any): Observable<any> {
    const frontendUsername = String(this.cookieService.get('userName') || '').trim();
    return this.httpClient.post<any>(this.url, {
      ...payload,
      frontendUsername
    });
  }

  generateIndividualByExternalUser(payload: any): Observable<any> {
    const token = this.authService.getToken();
    
    let headers = new HttpHeaders();
    if (token) {
      headers = headers.set('Authorization', `Bearer ${token}`);
    }

    if (environment.URL_API_GENERATE_QR_API_KEY) {
      headers = headers.set('x-api-key', environment.URL_API_GENERATE_QR_API_KEY);
    }

    headers = headers.set('X-Skip-GenerateQr-Auth', 'true')

    return this.httpClient.post<any>(this.urlGenerateByUserExternal, payload, {headers});
  }


  listIndividuals(page?: number, pageSize?: number, filters?: Record<string, any>): Observable<any> {
    let params = new HttpParams();
    if (page !== undefined) {
      params = params.set('page', page);
    }
    if (pageSize !== undefined) {
      params = params.set('pageSize', pageSize);
    }
    params = params.set('isfront', true);
    if (filters) {
      Object.keys(filters).forEach(key => {
        const value = filters[key];
        if (value !== undefined && value !== null && value !== '') {
          params = params.set(key, value);
        }
      });
    }

    console.log('[QR LIST REQUEST]', `${this.listUrl}?${params.toString()}`);
    return this.httpClient.get<any>(this.listUrl, { params });
  }

  listSftp(path: string, serviceName?: string): Observable<any> {
    let params = new HttpParams();
    if (path) {
      params = params.set('path', path);
    }
    if (serviceName) {
      params = params.set('serviceName', serviceName);
    }
    return this.httpClient.get<any>(this.sftpListUrl, { params });
  }

  generateMassive(payload: any): Observable<any> {
    return this.httpClient.post<any>(this.massiveUrl, payload);
  }

  cancelQr(idQrs: string[], responsable?: string): Observable<any> {
    const body: any = { idQrs };
    if (responsable) {
      body.responsable = responsable;
    }
    return this.httpClient.post<any>(`${environment.URL_API_GENERATE_QR}/v1/qr/cancel`, body);
  }

  markReturned(identities: Array<string | QrEmissionIdentity>, responsable?: string): Observable<any> {
    const body: any = this.buildMultipleEmissionIdentityBody(identities);
    if (responsable) {
      body.responsable = responsable;
    }
    return this.httpClient.post<any>(`${environment.URL_API_GENERATE_QR}/v1/qr/mark-returned`, body);
  }
  reNotifyByExternalUser(identity: string | QrEmissionIdentity, responsable?: string): Observable<any> {
    const token = this.authService.getToken();
    
    let headers = new HttpHeaders();
    if (token) {
      headers = headers.set('Authorization', `Bearer ${token}`);
    }

    if (environment.URL_API_GENERATE_QR_API_KEY) {
      headers = headers.set('x-api-key', environment.URL_API_GENERATE_QR_API_KEY);
    }

    headers = headers.set('X-Skip-GenerateQr-Auth', 'true')

    const body: any = this.buildEmissionIdentityBody(identity);
    if (responsable) {
      body.responsable = responsable;
    }
    return this.httpClient.post<any>(`${environment.URL_API_GENERATE_QR}/v1/external/qr/payment-webhook/replay`, body, { headers});
  }
  reNotifyByInternalUser(identity: string | QrEmissionIdentity, responsable?: string): Observable<any> {
    const body: any = this.buildEmissionIdentityBody(identity);
    if (responsable) {
      body.responsable = responsable;
    }
    return this.httpClient.post<any>(`${environment.URL_API_GENERATE_QR}/v1/qr/payment-webhook/replay`, body);
  }

  listReports(page?: number, pageSize?: number, filters?: Record<string, any>): Observable<any> {
    let params = new HttpParams();
    if (page !== undefined) {
      params = params.set('page', page);
    }
    if (pageSize !== undefined) {
      params = params.set('pageSize', pageSize);
    }
    if (filters) {
      Object.keys(filters).forEach(key => {
        const value = filters[key];
        if (value !== undefined && value !== null && value !== '') {
          params = params.set(key, value);
        }
      });
    }
    return this.httpClient.get<any>(`${environment.URL_API_GENERATE_QR}/v1/reports/qr`, { params });
  }

  listExternalReports(page?: number, pageSize?: number, filters?: Record<string, any>): Observable<any> {
    const token = this.authService.getToken();
    let headers = new HttpHeaders();
    if (token) {
      headers = headers.set('Authorization', `Bearer ${token}`);
    }
    
    if (environment.URL_API_GENERATE_QR_API_KEY) {
      headers = headers.set('x-api-key', environment.URL_API_GENERATE_QR_API_KEY);
    }

    headers = headers.set('X-Skip-GenerateQr-Auth', 'true')

    let params = new HttpParams();
    if (page !== undefined) {
      params = params.set('page', page);
    }
    if (pageSize !== undefined) {
      params = params.set('pageSize', pageSize);
    }
    if (filters) {
      Object.keys(filters).forEach(key => {
        const value = filters[key];
        if (value !== undefined && value !== null && value !== '') {
          params = params.set(key, value);
        }
      });
    }
    return this.httpClient.get<any>(`${environment.URL_API_GENERATE_QR}/v1/external/reports/qr-services`, { params, headers });
  }

  getQrSummaryByService(
    start: string,
    end: string,
    page: number = 1,
    pageSize: number = 6,
    serviceId?: string
  ): Observable<QrSummaryByServiceResponse> {
    let params = new HttpParams()
      .set('start', start)
      .set('end', end)
      .set('paymentFrom', start)
      .set('paymentTo', end)
      .set('page', page)
      .set('pageSize', pageSize);

    if (serviceId) {
      params = params.set('serviceId', serviceId);
    }

    return this.httpClient.get<QrSummaryByServiceResponse>(
      `${environment.URL_API_GENERATE_QR}/v1/reports/qr-summary-by-service`,
      { params }
    );
  }

  listConfiguredServices(page: number = 1, pageSize: number = 50): Observable<any> {
    const params = new HttpParams()
      .set('page', page)
      .set('pageSize', pageSize);
    return this.httpClient.get<any>(this.qrServicesConfigUrl, { params });
  }

  registerConfiguredService(serviceName: string): Observable<any> {
    return this.httpClient.post<any>(`${environment.URL_API_GENERATE_QR}/v1/service/register`, { serviceName });
  }

  updateConfiguredService(serviceId: string, payload: any): Observable<any> {
    return this.httpClient.put<any>(`${this.qrServicesUrl}/${serviceId}`, payload);
  }

  listSftpProviderConfigs(page: number = 1, pageSize: number = 50, filters?: Record<string, any>): Observable<any> {
    let params = new HttpParams()
      .set('page', page)
      .set('pageSize', pageSize);

    if (filters) {
      Object.keys(filters).forEach(key => {
        const value = filters[key];
        if (value !== undefined && value !== null && value !== '') {
          params = params.set(key, value);
        }
      });
    }

    return this.httpClient.get<any>(this.sftpProviderConfigsUrl, { params });
  }

  createSftpProviderConfig(payload: any): Observable<any> {
    return this.httpClient.post<any>(this.sftpProviderConfigsUrl, payload);
  }

  getSftpProviderConfig(providerId: number | string): Observable<any> {
    return this.httpClient.get<any>(`${this.sftpProviderConfigsUrl}/${providerId}`);
  }

  updateSftpProviderConfig(providerId: number | string, payload: any): Observable<any> {
    return this.httpClient.put<any>(`${this.sftpProviderConfigsUrl}/${providerId}`, payload);
  }


  listServiceSftpProvider(page?: number, pageSize?: number, filters?: Record<string, any>): Observable<any> {
    let params = new HttpParams();
    if (page !== undefined) {
      params = params.set('page', page);
    }
    if (pageSize !== undefined) {
      params = params.set('pageSize', pageSize);
    }
    if (filters) {
      Object.keys(filters).forEach(key => {
        const value = filters[key];
        if (value !== undefined && value !== null && value !== '') {
          params = params.set(key, value);
        }
      });
    }
    return this.httpClient.get<any>(this.serviceSftpProviderUrl, { params });
  }

  upsertServiceSftpProvider(serviceName: string, providerId: number | string, active: number): Observable<any> {
    return this.httpClient.post<any>(this.serviceSftpProviderUrl, {
      serviceName,
      providerId,
      active
    });
  }

  deleteServiceSftpProvider(serviceId: string): Observable<any> {
    return this.httpClient.delete<any>(`${this.serviceSftpProviderUrl}/${serviceId}`);
  }


  listServiceSchedule(page?: number, pageSize?: number, serviceName?: string): Observable<any> {
    let params = new HttpParams();
    if (page !== undefined) {
      params = params.set('page', page);
    }
    if (pageSize !== undefined) {
      params = params.set('pageSize', pageSize);
    }
    if (serviceName) {
      params = params.set('serviceName', serviceName);
    }
    return this.httpClient.get<any>(this.serviceScheduleUrl, { params });
  }

  createServiceSchedule(payload: any): Observable<any> {
    return this.httpClient.post<any>(this.serviceScheduleUrl, payload);
  }

  updateServiceSchedule(serviceId: string, payload: any): Observable<any> {
    return this.httpClient.put<any>(`${this.serviceScheduleUrl}/${serviceId}`, payload);
  }

  deleteServiceSchedule(serviceId: string): Observable<any> {
    return this.httpClient.delete<any>(`${this.serviceScheduleUrl}/${serviceId}`);
  }

  listReprocessQueue(page?: number, pageSize?: number, filters?: Record<string, any>): Observable<any> {
    let params = new HttpParams();
    if (page !== undefined) {
      params = params.set('page', page);
    }
    if (pageSize !== undefined) {
      params = params.set('pageSize', pageSize);
    }
    if (filters) {
      Object.keys(filters).forEach(key => {
        const value = filters[key];
        if (value !== undefined && value !== null && value !== '') {
          params = params.set(key, value);
        }
      });
    }
    return this.httpClient.get<any>(this.reprocessQueueUrl, { params });
  }

  listReprocessHistory(page?: number, pageSize?: number, filters?: Record<string, any>): Observable<any> {
    let params = new HttpParams();
    if (page !== undefined) {
      params = params.set('page', page);
    }
    if (pageSize !== undefined) {
      params = params.set('pageSize', pageSize);
    }
    if (filters) {
      Object.keys(filters).forEach(key => {
        const value = filters[key];
        if (value !== undefined && value !== null && value !== '') {
          params = params.set(key, value);
        }
      });
    }
    return this.httpClient.get<any>(this.reprocessHistoryUrl, { params });
  }

  reprocessPayments(queueIds: number[], responsable?: string): Observable<any> {
    const body: any = { queueIds };
    if (responsable) {
      body.responsable = responsable;
    }
    return this.httpClient.post<any>(`${environment.URL_API_REPROCESS}/v1/reprocess-payments`, body);
  }

  reprocessNextAttempt(queueId: number, nextAttemptAt: string, responsable?: string): Observable<any> {
    const body: any = { queueId, nextAttemptAt };
    if (responsable) {
      body.responsable = responsable;
    }
    return this.httpClient.post<any>(`${environment.URL_API_REPROCESS}/v1/reprocess-next-attempt`, body);
  }

  notificationHistory(identity: string | QrEmissionIdentity): Observable<any> {
    return this.httpClient.post<any>(
      `${environment.URL_API_GENERATE_QR}/v1/qr/notification-history`,
      this.buildEmissionIdentityBody(identity)
    );
  }

  private buildEmissionIdentityBody(identity: string | QrEmissionIdentity): { idQr?: string; efimeroCci?: string } {
    if (typeof identity === 'string') {
      return { idQr: identity };
    }
    const efimeroCci = String(identity?.efimeroCci || '').trim();
    if (efimeroCci) {
      return { efimeroCci };
    }
    const idQr = String(identity?.idQr || '').trim();
    return idQr ? { idQr } : {};
  }

  private buildMultipleEmissionIdentityBody(
    identities: Array<string | QrEmissionIdentity>
  ): { idQrs?: string[]; efimeroCcis?: string[] } {
    const idQrs: string[] = [];
    const efimeroCcis: string[] = [];
    identities.forEach(identity => {
      const body = this.buildEmissionIdentityBody(identity);
      if (body.efimeroCci) {
        efimeroCcis.push(body.efimeroCci);
      } else if (body.idQr) {
        idQrs.push(body.idQr);
      }
    });
    return {
      ...(idQrs.length ? { idQrs } : {}),
      ...(efimeroCcis.length ? { efimeroCcis } : {})
    };
  }


  listNotificationEmails(page: number = 1, pageSize: number = 20, filters?: Record<string, any>): Observable<any> {
    let params = new HttpParams()
      .set('page', page)
      .set('pageSize', pageSize);

    if (filters) {
      Object.keys(filters).forEach(key => {
        const value = filters[key];
        if (value !== undefined && value !== null && value !== '') {
          params = params.set(key, value);
        }
      });
    }

    return this.httpClient.get<any>(this.notificationEmailsUrl, { params });
  }

  getNotificationEmail(notificationEmailId: number | string): Observable<any> {
    return this.httpClient.get<any>(`${this.notificationEmailsUrl}/${notificationEmailId}`);
  }

  createNotificationEmail(payload: any): Observable<any> {
    return this.httpClient.post<any>(this.notificationEmailsUrl, payload);
  }

  updateNotificationEmail(notificationEmailId: number | string, payload: any): Observable<any> {
    return this.httpClient.put<any>(`${this.notificationEmailsUrl}/${notificationEmailId}`, payload);
  }

  deleteNotificationEmail(notificationEmailId: number | string): Observable<any> {
    return this.httpClient.delete<any>(`${this.notificationEmailsUrl}/${notificationEmailId}`);
  }

  exportServices(
    format: 'xlsx' | 'csv',
    filters: Record<string, any>,
    bandeja: string,
    token: any
  ): Observable<any> {
    let params = new HttpParams();

    if (filters) {
      Object.keys(filters).forEach(key => {
        const value = filters[key];
        if (value !== undefined && value !== null && value !== '') {
          params = params.set(key, value);
        }
      });
    }

    params = params.set('format', format);
    params = params.set('inbx', bandeja);
    params = params.set('token', token);

    return this.httpClient.get(`${this.URL1}`, { params });
  }
}

export interface QrSummaryByServiceItem {
  serviceId: string;
  serviceName: string;
  generated: number;
  paid: number;
  pending: number;
  expired: number;
  cancelled: number;
  totalAmount: number;
  collectedAmount: number;
}

export interface QrSummaryByServiceResponse {
  page: number;
  pageSize: number;
  total: number;
  items: QrSummaryByServiceItem[];
}
