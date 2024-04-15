import { Injectable } from '@angular/core';
import { Tenant, TenantUser } from '../utilities/interfaces';

@Injectable({
  providedIn: 'root'
})
export class TenantService {

  private _tenant: Tenant;
  private _tenantUser: TenantUser;

  constructor() { }

  set tenant(tenant: Tenant) {
    this._tenant = tenant;
  }

  get tenant(): Tenant {
    return this._tenant;
  }

  set tenantUser(tenantUser: TenantUser) {
    this._tenantUser = tenantUser;
  }

  get tenantUser(): TenantUser {
    return this._tenantUser;
  }
}
