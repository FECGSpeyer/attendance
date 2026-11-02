import { Injectable, inject } from '@angular/core';
import { supabase } from '../base/supabase';
import { User } from '@supabase/supabase-js';
import { DEFAULT_IMAGE } from '../../utilities/constants';

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
   * Copy a person's profile picture to another player row (e.g. after a
   * handover into another instance). Pictures from our `profiles` bucket are
   * duplicated to `profiles/<targetId>`, so the new row owns its own file and
   * later changes on either side stay independent. Any other URL is reused
   * as-is. Default avatars, empty values and `data:` URLs are skipped.
   * Returns the URL written to the target row, or null if nothing was copied.
   */
  async copyProfileImage(sourceImg: string | null | undefined, targetId: number): Promise<string | null> {
    if (!sourceImg || sourceImg.startsWith('data:') || sourceImg === DEFAULT_IMAGE) {
      return null;
    }

    let url = sourceImg;
    const marker = '/storage/v1/object/public/profiles/';
    const markerIndex = sourceImg.indexOf(marker);
    if (markerIndex !== -1) {
      const sourcePath = decodeURIComponent(sourceImg.slice(markerIndex + marker.length).split('?')[0]);
      const targetPath = `${targetId}`;
      if (sourcePath && sourcePath !== targetPath) {
        await supabase.storage.from('profiles').remove([targetPath]);
        const { error } = await supabase.storage.from('profiles').copy(sourcePath, targetPath);
        if (!error) {
          const { data } = supabase.storage.from('profiles').getPublicUrl(targetPath);
          // Cache-bust in case an older picture with the same id was cached.
          url = `${data.publicUrl}?v=${Date.now()}`;
        }
      }
    }

    const { error: updateError } = await supabase
      .from('player')
      .update({ img: url })
      .match({ id: targetId });

    if (updateError) {
      throw new Error(updateError.message);
    }

    return url;
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
