import { Component, ElementRef, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { Router } from '@angular/router';
import { ActionSheetController, AlertController, ModalController } from '@ionic/angular/lazy';
import dayjs from 'dayjs';
import { DbService } from 'src/app/services/db.service';
import { supabase } from 'src/app/services/base/supabase';
import { ProfileService } from 'src/app/services/profile/profile.service';
import { DEFAULT_IMAGE, FieldType, Role } from 'src/app/utilities/constants';
import { Church, Group, Tenant, TenantUser } from 'src/app/utilities/interfaces';
import { Utils } from 'src/app/utilities/Utils';
import { LegalModalComponent } from 'src/app/login/legal-modal/legal-modal.component';
import { translate } from '@jsverse/transloco';

@Component({
    selector: 'app-tenant-register',
    templateUrl: './tenant-register.page.html',
    styleUrls: ['./tenant-register.page.scss'],
    standalone: false
})
export class TenantRegisterPage implements OnInit, OnDestroy {
  @ViewChild('chooser') chooser: ElementRef;
  public tenantData: Tenant | null = null;
  public groups: Group[] = [];
  public firstName = '';
  public lastName = '';
  public birthDate: string = dayjs().subtract(18, 'year').toISOString();
  public email = '';
  public password = '';
  public phone = '';
  public confirmPassword = '';
  public selectedGroupId: number | null = null;
  public profilePicture: string = DEFAULT_IMAGE;
  public additionalFields: { id: string; name: string; value: any; type: FieldType; options?: string[] }[] = [];
  private profileImgFile: File | null = null;
  public notes = '';
  public churches: Church[] = [];
  public customChurchName = '';
  public isChurchModalOpen = false;
  public churchSearch = '';
  /** Passwordless email-OTP (code) registration state. */
  public otpMode = false;
  public otpSent = false;
  public otpCode = '';
  public resendCooldown = 0;
  private cooldownTimer: any = null;
  public privacyAccepted = false;
  public noGroupsAvailable = false;

  constructor(
    public db: DbService,
    private router: Router,
    private alertController: AlertController,
    private actionSheetController: ActionSheetController,
    private profileSvc: ProfileService,
    private modalController: ModalController,
  ) { }

  async ngOnInit() {
    await this.db.waitForSession();

    const pathParts = window.location.pathname.split('/');
    const registerId = pathParts[pathParts.length - 1];
    this.tenantData = await this.db.getTenantByRegisterId(registerId);
    if (!this.tenantData) {
      Utils.showToast(translate('tenantRegister.invalidLink'));
      return;
    }

    if (this.db.user) {
      const tenantUsers = await this.db.getTenantsByUserId();
      const alreadyRegistered = await this.checkExistent(tenantUsers);
      if (!alreadyRegistered) {
        await this.prefillFromProfile(tenantUsers);
      }
    }

    for (const fieldName of this.tenantData.registration_fields || []) {
      const field = this.tenantData.additional_fields.find(f => f.id === fieldName);

      if (field?.id === 'bfecg_church') {
        this.churches = await this.db.getChurches();
      }

      if (field) {
        this.additionalFields.push({
          id: field.id,
          name: field.name,
          value: field?.id === 'bfecg_church' ? null : field.defaultValue,
          type: field.type,
          options: field.options
        });
      }
    }

    this.groups = (await this.db.getGroups(this.tenantData.id)).filter(g => g.maingroup !== true);
    this.selectedGroupId = this.groups.length > 0 ? this.groups[0].id : null;
    if (this.groups.length === 0) {
      this.noGroupsAvailable = true;
    }
  }

  async checkExistent(tenantUsers?: TenantUser[]): Promise<boolean> {
    const loading = await Utils.getLoadingElement();
    await loading.present();
    const users = tenantUsers ?? await this.db.getTenantsByUserId();
    const tenant = users.find(t => t.tenantId === this.tenantData.id);
    if (tenant) {
      Utils.showToast(translate('tenantRegister.alreadyRegistered'), 'warning', 5000);
      this.router.navigate(['/login']);
      await loading.dismiss();
      return true;
    }
    await loading.dismiss();
    return false;
  }

  private async prefillFromProfile(tenantUsers?: TenantUser[]) {
    try {
      const users = tenantUsers ?? await this.db.getTenantsByUserId();
      if (!users?.length) { return; }
      const player = await this.profileSvc.getFirstPlayerProfile(this.db.user.id);
      if (!player) { return; }
      if (player.firstName) { this.firstName = player.firstName; }
      if (player.lastName) { this.lastName = player.lastName; }
      if (player.phone) { this.phone = player.phone; }
      if (player.birthday && this.tenantData?.registration_fields?.includes('birthDate')) {
        this.birthDate = player.birthday;
      }
    } catch (_) { }
  }

  ngOnDestroy() {
    this.clearCooldown();
  }

  async openPrivacy(event: Event) {
    event.preventDefault();
    event.stopPropagation();
    const modal = await this.modalController.create({ component: LegalModalComponent });
    await modal.present();
  }

  enterOtpMode() {
    this.otpMode = true;
    this.otpSent = false;
    this.otpCode = '';
  }

  exitOtpMode() {
    this.otpMode = false;
    this.otpSent = false;
    this.otpCode = '';
    this.clearCooldown();
  }

  /** Segment handler: switch between password and email-code (OTP) registration. */
  onModeChange(ev: CustomEvent) {
    if (ev.detail.value === 'otp') {
      this.enterOtpMode();
    } else {
      this.exitOtpMode();
    }
  }

  async requestCode() {
    const email = this.email?.toLowerCase().trim();
    if (!Utils.validateEmail(email)) {
      Utils.showToast(translate('login.toast.invalidEmail'), 'danger');
      return;
    }
    if (!this.privacyAccepted) {
      Utils.showToast(translate('tenantRegister.acceptTermsToast'), 'danger');
      return;
    }
    const loading = await Utils.getLoadingElement();
    await loading.present();
    try {
      // Registration surface: allow creating a new account.
      const ok = await this.db.sendEmailOtp(email, true);
      if (ok) {
        this.otpSent = true;
        this.startResendCooldown();
      }
    } finally {
      await loading.dismiss();
    }
  }

  async resendCode() {
    if (this.resendCooldown > 0) {
      return;
    }
    await this.requestCode();
  }

  async verifyCode() {
    const email = this.email?.toLowerCase().trim();
    const loading = await Utils.getLoadingElement();
    await loading.present();
    try {
      // returnEarly: stay on this page so the user can complete the profile form.
      const ok = await this.db.verifyEmailOtp(email, this.otpCode, true);
      if (!ok) {
        return;
      }
      // Stamp terms acceptance on the live session — the checkbox was already
      // accepted before requestCode() was allowed to proceed.
      const now = new Date().toISOString();
      await supabase.auth.updateUser({ data: { terms_accepted_at: now } });
      if (this.db.user?.user_metadata) {
        this.db.user.user_metadata['terms_accepted_at'] = now;
      }
      await loading.dismiss();
      // Signed in now: if already a member of this tenant, checkExistent redirects
      // to /login; otherwise db.user is set, the account block collapses to the
      // "angemeldet als" state, and the user completes the profile + taps Registrieren.
      const tenantUsers = await this.db.getTenantsByUserId();
      const alreadyRegistered = await this.checkExistent(tenantUsers);
      if (!alreadyRegistered) {
        await this.prefillFromProfile(tenantUsers);
      }
    } finally {
      await loading.dismiss();
    }
  }

  private startResendCooldown() {
    this.clearCooldown();
    this.resendCooldown = 30;
    this.cooldownTimer = setInterval(() => {
      this.resendCooldown -= 1;
      if (this.resendCooldown <= 0) {
        this.clearCooldown();
      }
    }, 1000);
  }

  private clearCooldown() {
    if (this.cooldownTimer) {
      clearInterval(this.cooldownTimer);
      this.cooldownTimer = null;
    }
    this.resendCooldown = 0;
  }

  goHome() {
    if (this.db.user && this.db.tenantUser()) {
      this.router.navigate([Utils.getUrl(this.db.tenantUser().role)]);
    } else {
      this.router.navigate(['/login']);
    }
  }

  async login() {
    const alert = await this.alertController.create({
      header: translate('login.signIn'),
      inputs: [
        {
          name: 'email',
          type: 'email',
          placeholder: translate('tenantRegister.emailAddress')
        },
        {
          name: 'password',
          type: 'password',
          placeholder: translate('login.modePassword')
        }
      ],
      buttons: [
        {
          text: translate('common.cancel'),
          role: 'cancel'
        },
        {
          text: translate('login.signIn'),
          handler: async (data) => {
            try {
              await this.db.login(data.email, data.password, true);
              const tenantUsers = await this.db.getTenantsByUserId();
              const alreadyRegistered = await this.checkExistent(tenantUsers);
              if (!alreadyRegistered) {
                await this.prefillFromProfile(tenantUsers);
              }
              return true;
            } catch (error) {
              return false;
            }
          }
        }
      ]
    });

    await alert.present();
  }

  async register() {
    if (!this.validate()) {
      return;
    }

    const loading = await Utils.getLoadingElement(45000, translate('registerModal.running'));
    await loading.present();

    const additional_fields: { [key: string]: any } = {};
    for (const field of this.additionalFields) {
      additional_fields[field.id] = field.value;
    }

    let isNew;

    try {
      if (additional_fields && additional_fields.bfecg_church === '') {
        const churchId = await this.db.createChurch(this.customChurchName);
        additional_fields.bfecg_church = churchId;
      }

      const normalizedEmail = (this.db.user?.email ?? this.email).toLowerCase().trim();
      const normalizedPhone = this.phone.replace(/\s+/g, '');

      const hasBirthDateField = Boolean(this.tenantData?.registration_fields?.includes('birthDate'));

      const { userId, created } = await this.db.addPlayer({
        firstName: this.firstName,
        lastName: this.lastName,
        email: normalizedEmail,
        pending: !Boolean(this.tenantData?.auto_approve_registrations),
        birthday: hasBirthDateField ? this.birthDate : null,
        phone: normalizedPhone,
        img: this.profilePicture, // Will be handled by addPlayer if it's a data URL
        additional_fields,
        instrument: this.selectedGroupId,
        hasTeacher: false,
        playsSince: dayjs().startOf('day').utc(true).toISOString(),
        isCritical: false,
        isLeader: false,
        correctBirthday: hasBirthDateField,
        history: [],
        tenantId: this.tenantData.id,
        joined: dayjs().startOf('day').utc(true).toISOString(),
        notes: this.notes ?? '',
        self_register: true
      }, true, this.tenantData.auto_approve_registrations ? Role.PLAYER : Role.APPLICANT, this.tenantData.id, this.password, this.tenantData.longName);

      // A brand-new account only needs email confirmation when it was created
      // with a password. OTP registration already verified the email and signed
      // the user in (db.user is set), so no confirmation step remains.
      isNew = created && !this.db.user && !this.otpMode;

      // Only upload if addPlayer didn't already handle it (i.e., if we have a File object and img wasn't a data URL)
      if (this.tenantData?.registration_fields?.includes('picture') && this.profileImgFile && !this.profilePicture.startsWith('data:image/')) {
        const url: string = await this.db.updateImage(userId, this.profileImgFile, this.db.user?.id);
        this.profilePicture = url;
      }
    } catch (error) {
      await loading.dismiss();
      console.error('Registration error:', error);

      if (error?.message === translate('db.createAccountFailedWith', { error: translate('db.emailExists') })) {
        Utils.showToast(error.message, 'danger', 4000);
        return;
      }

      Utils.showToast(translate('tenantRegister.failed', { error: error?.message ?? translate('common.unknownError') }), 'danger', 6000);
      return;
    }

    await loading.dismiss();

    if (!isNew && this.db.user) {
      // Existing account added to a new tenant — switch directly into that tenant.
      await this.db.routeAfterAuth(undefined, this.tenantData.id);
    } else {
      this.router.navigate(['/login']);
    }

    const alert = await this.alertController.create({
      header: translate('tenantRegister.success.header'),
      message: this.tenantData.auto_approve_registrations ?
        !isNew ? translate('tenantRegister.success.joined') : translate('tenantRegister.success.newConfirm') :
        !isNew ? translate('tenantRegister.success.pending') : translate('tenantRegister.success.newPending'),
      buttons: [{
        text: translate('common.ok')
      }]
    });

    await alert.present();
  }

  validate(): boolean {
    if (this.noGroupsAvailable) {
      Utils.showToast(translate('tenantRegister.noGroupsToast'), 'danger');
      return false;
    }

    if (!this.db.user) {
      if (!this.privacyAccepted) {
        Utils.showToast(translate('tenantRegister.acceptTermsToast'), 'danger');
        return false;
      } else if (!Utils.validateEmail(this.email)) {
        Utils.showToast(translate('login.toast.invalidEmail'), 'danger');
        return false;
      } else if (this.password.length < 6) {
        Utils.showToast(translate('tenantRegister.passwordTooShort'), 'danger');
        return false;
      } else if (this.password !== this.confirmPassword) {
        Utils.showToast(translate('tenantRegister.passwordMismatch'), 'danger');
        return false;
      }
    }

    if (!this.firstName || !this.lastName) {
      Utils.showToast(translate('tenantRegister.nameRequired'), 'danger');
      return false;
    }

    if (this.tenantData?.registration_fields?.includes('picture')) {
      if (this.profilePicture === DEFAULT_IMAGE) {
        Utils.showToast(translate('tenantRegister.pictureRequired'), 'danger');
        return false;
      }
    }

    if (this.tenantData.registration_fields?.includes('birthDate')) {
      const birthDateObj = dayjs(this.birthDate);
      if (!birthDateObj.isValid()) {
        Utils.showToast(translate('tenantRegister.birthDateRequired'), 'danger');
        return false;
      }
    }

    if (this.tenantData.registration_fields?.includes('phone')) {
      if (!Utils.validatePhoneNumber(this.phone.replace(/\s+/g, ''))) {
        Utils.showToast(translate('tenantRegister.phoneRequired'), 'danger');
        return false;
      }
    }

    for (const field of this.additionalFields) {
      if (field.type === FieldType.TEXT || field.type === FieldType.TEXTAREA) {
        if (typeof field.value !== 'string' || field.value.trim() === '') {
          Utils.showToast(translate('tenantRegister.fieldRequired', { field: field.name }), 'danger');
          return false;
        }
      } else if (field.type === FieldType.NUMBER) {
        if (isNaN(Number(field.value))) {
          Utils.showToast(translate('tenantRegister.fieldNumber', { field: field.name }), 'danger');
          return false;
        }
      } else if (field.type === FieldType.DATE) {
        if (isNaN(Date.parse(field.value))) {
          Utils.showToast(translate('tenantRegister.fieldDate', { field: field.name }), 'danger');
          return false;
        }
      } else if (field.type === FieldType.BOOLEAN) {
        if (typeof field.value !== 'boolean') {
          Utils.showToast(translate('tenantRegister.fieldValue', { field: field.name }), 'danger');
          return false;
        }
        if (field.value === false && field.name.toLowerCase().includes('einverständnis')) {
          Utils.showToast(translate('tenantRegister.fieldAccept', { field: field.name }), 'danger');
          return false;
        }
      } else if (field.type === FieldType.BFECG_CHURCH) {
        if (typeof field.value !== 'string') {
          Utils.showToast(translate('tenantRegister.churchRequired'), 'danger');
          return false;
        }
        if (field.value === '' && (!this.customChurchName || this.customChurchName.trim().length < 5)) {
          Utils.showToast(translate('tenantRegister.churchNameRequired'), 'danger');
          return false;
        }
      }
    }

    return true;
  }

  async changeImg() {
    if (this.profilePicture !== DEFAULT_IMAGE) {
      const actionSheet = await this.actionSheetController.create({
        buttons: [{
          text: translate('tenantRegister.replacePicture'),
          handler: () => {
            this.chooser.nativeElement.click();
          }
        }, {
          text: translate('common.cancel')
        }]
      });
      await actionSheet.present();
      return;
    }

    this.chooser.nativeElement.click();
  }

  async onImageSelect(evt: any) {
    const loading = await Utils.getLoadingElement();
    loading.present();
    const imgFile: File = evt.target.files[0];

    if (imgFile) {
      if (imgFile.size > 15 * 1024 * 1024) {
        loading.dismiss();
        Utils.showToast(translate('tenantRegister.pictureTooLarge'), 'danger');
        return;
      }

      if (imgFile.type.substring(0, 5) === 'image') {
        const reader: FileReader = new FileReader();

        reader.readAsDataURL(imgFile);

        reader.onload = async () => {
          this.profilePicture = String(reader.result);
          this.profileImgFile = imgFile;
          loading.dismiss();
        };
      } else {
        loading.dismiss();
        Utils.showToast(translate('tenantRegister.pictureFailed'), 'danger');
      }
    }
  }

  get filteredChurches(): Church[] {
    const term = this.churchSearch.trim().toLowerCase();
    if (!term) {
      return this.churches;
    }
    return this.churches.filter(c => c.name.toLowerCase().includes(term));
  }

  getChurchLabel(field: { value: any }): string {
    if (field.value === null || field.value === undefined) {
      return translate('tenantRegister.pleaseChoose');
    }
    if (field.value === '') {
      return translate('tenantRegister.notListed');
    }
    const church = this.churches.find(c => c.id === field.value);
    return church ? church.name : translate('tenantRegister.pleaseChoose');
  }

  openChurchModal() {
    this.churchSearch = '';
    this.isChurchModalOpen = true;
  }

  selectChurch(field: { value: any }, churchId: string) {
    field.value = churchId;
    this.isChurchModalOpen = false;
  }
}
