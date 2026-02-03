import { Injectable, inject } from '@angular/core';
import { supabase } from '../base/supabase';
import { User } from '@supabase/supabase-js';

@Injectable({
  providedIn: 'root'
})
export class ImageService {

  async removeImage(id: number, imgPath: string, newUser: boolean = false, appId: string = "", currentUserId?: string): Promise<void> {
    if (!newUser) {
      if (appId && currentUserId === appId) {
        await supabase
          .from("player")
          .update({ img: "" })
          .match({ appId });
      } else {
        await supabase
          .from("player")
          .update({ img: "" })
          .match({ id });
      }
    }

    await supabase.storage
      .from("profiles")
      .remove([imgPath]);
  }

  async updateImage(id: number, image: File | Blob, appId: string, currentUserId?: string): Promise<string> {
    const fileName: string = `${id}`;

    const { error } = await supabase.storage
      .from("profiles")
      .upload(fileName, image, { upsert: true });

    if (error) {
      throw new Error(error.message);
    }

    const { data } = await supabase
      .storage
      .from("profiles")
      .getPublicUrl(fileName);

    if (appId && currentUserId === appId) {
      await supabase
        .from("player")
        .update({ img: data.publicUrl })
        .match({ appId });
    } else {
      await supabase
        .from("player")
        .update({ img: data.publicUrl })
        .match({ id });
    }

    return data.publicUrl;
  }

  async updateAttendanceImage(id: number, image: File): Promise<string> {
    const { error } = await supabase.storage
      .from("attendances")
      .upload(id.toString(), image, { upsert: true });

    if (error) {
      throw new Error(error.message);
    }

    const { data } = await supabase
      .storage
      .from("attendances")
      .getPublicUrl(id.toString());

    await supabase
      .from("attendance")
      .update({ img: data.publicUrl })
      .match({ id });

    return data.publicUrl;
  }
}
