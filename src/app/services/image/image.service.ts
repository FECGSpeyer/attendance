import { Injectable, inject } from '@angular/core';
import { supabase } from '../base/supabase';
import { User } from '@supabase/supabase-js';

@Injectable({
  providedIn: 'root'
})
export class ImageService {

  async removeImage(id: number, imgPath: string, newUser: boolean = false, appId: string = '', currentUserId?: string): Promise<void> {
    if (!newUser) {
      if (appId && currentUserId === appId) {
        await supabase
          .from('player')
          .update({ img: '' })
          .match({ appId });
      } else {
        await supabase
          .from('player')
          .update({ img: '' })
          .match({ id });
      }
    }

    await supabase.storage
      .from('profiles')
      .remove([imgPath]);
  }

  async updateImage(id: number, image: File | Blob, appId: string, currentUserId?: string): Promise<string> {
    const fileName = `${id}`;

    const { error } = await supabase.storage
      .from('profiles')
      .upload(fileName, image, { upsert: true });

    if (error) {
      throw new Error(error.message);
    }

    const { data } = await supabase
      .storage
      .from('profiles')
      .getPublicUrl(fileName);

    if (appId && currentUserId === appId) {
      await supabase
        .from('player')
        .update({ img: data.publicUrl })
        .match({ appId });
    } else {
      await supabase
        .from('player')
        .update({ img: data.publicUrl })
        .match({ id });
    }

    return data.publicUrl;
  }

  /**
   * Upload a tenant branding logo to the public `branding` bucket, keyed by
   * tenant id, and return its public URL. Unlike updateImage this does NOT
   * write the tenant row — the caller persists logo_url via
   * DbService.updateTenantData so the tenant signal stays in sync.
   */
  async updateTenantLogo(tenantId: number, image: File | Blob): Promise<string> {
    const fileName = `${tenantId}`;

    const { error } = await supabase.storage
      .from('branding')
      .upload(fileName, image, { upsert: true });

    if (error) {
      throw new Error(error.message);
    }

    const { data } = await supabase
      .storage
      .from('branding')
      .getPublicUrl(fileName);

    // Cache-bust so an updated logo isn't served from the CDN-cached old URL.
    return `${data.publicUrl}?v=${Date.now()}`;
  }

  async removeTenantLogo(tenantId: number): Promise<void> {
    await supabase.storage
      .from('branding')
      .remove([`${tenantId}`]);
  }

  async updateOrgLogo(orgId: number, image: File | Blob): Promise<string> {
    const fileName = `org-${orgId}`;
    const { error } = await supabase.storage
      .from('branding')
      .upload(fileName, image, { upsert: true });

    if (error) {
      throw new Error(error.message);
    }

    const { data } = await supabase.storage
      .from('branding')
      .getPublicUrl(fileName);

    return `${data.publicUrl}?v=${Date.now()}`;
  }

  async removeOrgLogo(orgId: number): Promise<void> {
    await supabase.storage
      .from('branding')
      .remove([`org-${orgId}`]);
  }

  async updateAttendanceImage(id: number, image: File): Promise<string> {    const { error } = await supabase.storage
      .from('attendances')
      .upload(id.toString(), image, { upsert: true });

    if (error) {
      throw new Error(error.message);
    }

    const { data } = await supabase
      .storage
      .from('attendances')
      .getPublicUrl(id.toString());

    await supabase
      .from('attendance')
      .update({ img: data.publicUrl })
      .match({ id });

    return data.publicUrl;
  }
}
