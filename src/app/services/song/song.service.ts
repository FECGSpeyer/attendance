import { Injectable } from '@angular/core';
import { Song, SongCategory, SongFile } from '../../utilities/interfaces';
import { supabase } from '../base/supabase';

@Injectable({
  providedIn: 'root'
})
export class SongService {

  constructor() {}

  encodeFilename(filename: string): string {
    const nameParts = filename.split('.');
    const ext = nameParts.pop() || '';
    const name = nameParts.join('.');

    const sanitizedName = name
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^\w\s-]/g, '-')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-+|-+$/g, '');

    const randomNumber = Math.floor(100 + Math.random() * 900);
    return `${sanitizedName}_${randomNumber}.${ext}`;
  }

  async getSongs(tenantId: number): Promise<Song[]> {
    const { data } = await supabase
      .from('songs')
      .select('*')
      .eq('tenantId', tenantId)
      .order("number", { ascending: true });

    return data as any;
  }

  async getSong(id: number, tenantId: number): Promise<Song> {
    const { data } = await supabase
      .from('songs')
      .select('*')
      .match({ id })
      .match({ tenantId })
      .single();

    return {
      ...data,
      files: data.files?.sort((a, b) => ((a as any).instrumentId || 0) - ((b as any).instrumentId || 0)) || [],
    } as any;
  }

  async addSong(song: Song, tenantId: number): Promise<Song> {
    const { data } = await supabase
      .from('songs')
      .insert({ ...song, tenantId } as any)
      .select()
      .single();

    return data as unknown as Song;
  }

  async editSong(id: number, song: Song): Promise<Song[]> {
    const { data } = await supabase
      .from('songs')
      .update(song as any)
      .match({ id });

    return data as any;
  }

  async removeSong(song: Song, tenantId: number): Promise<void> {
    if (song.files && song.files.length) {
      const paths: string[] = song.files.map((file) => `${tenantId}/${song.id}/${file.fileName}`);
      await supabase.storage.from('songs').remove(paths);
    }

    const { error } = await supabase
      .from('songs')
      .delete()
      .match({ id: song.id });

    if (error) {
      throw new Error("Fehler beim Löschen des Werks");
    }
  }

  async uploadSongFile(
    songId: number,
    file: File,
    instrumentId: number | null,
    tenantId: number,
    mainGroupId: number,
    note?: string
  ): Promise<SongFile> {
    const fileId = this.encodeFilename(file.name);
    const filePath = `songs/${tenantId}/${songId}/${fileId}`;
    const fileName = file.name;

    const { error } = await supabase.storage
      .from('songs')
      .upload(filePath, file, { upsert: true });
    if (error) throw new Error(error.message);

    const { data } = await supabase.storage
      .from('songs')
      .getPublicUrl(filePath);

    const songFile: SongFile = {
      storageName: fileId,
      fileName,
      fileType: file.type,
      url: data.publicUrl,
      instrumentId,
      note,
      created_at: new Date().toISOString(),
    };

    const song = await this.getSong(songId, tenantId);
    const files = song.files ? [...song.files, songFile] : [songFile];
    const filesJson = files.map(f => ({
      storageName: f.storageName,
      fileName: f.fileName,
      fileType: f.fileType,
      url: f.url,
      instrumentId: f.instrumentId ?? null,
      note: f.note,
    }));

    await supabase
      .from('songs')
      .update({
        files: filesJson,
        instrument_ids: Array.from(new Set(
          filesJson.map(f => f.instrumentId).filter(id => id !== null && id !== 1 && id !== mainGroupId)
        ))
      })
      .match({ id: songId });

    return songFile;
  }

  async downloadSongFile(fileName: string, songId: number, tenantId: number): Promise<Blob> {
    const filePath = `songs/${tenantId}/${songId}/${fileName}`;
    const { data, error } = await supabase.storage.from('songs').download(filePath);
    if (error) throw new Error(error.message);
    return data;
  }

  async downloadSongFileFromPath(filePath: string): Promise<Blob> {
    const { data, error } = await supabase.storage.from('songs').download(filePath);
    if (error) throw new Error(error.message);
    return data;
  }

  async deleteSongFile(songId: number, file: SongFile, tenantId: number): Promise<void> {
    const song = await this.getSong(songId, tenantId);
    const files = song.files ? song.files.filter(f => f.url !== file.url) : [];
    const filesJson = files.map(f => ({
      fileName: f.fileName,
      fileType: f.fileType,
      url: f.url,
      instrumentId: f.instrumentId ?? null,
      note: f.note,
    }));

    const filePath = `${tenantId}/${songId}/${file.fileName}`;
    await supabase.storage.from('songs').remove([filePath]);

    await supabase
      .from('songs')
      .update({ files: filesJson })
      .match({ id: songId });
  }

  async copySongToTenant(
    song: Song,
    sourceTenantId: number,
    targetTenantId: number,
    instrumentMapping: { [key: number]: number | null },
    onProgress?: (current: number, total: number) => void
  ): Promise<Song> {
    const newSong: Song = {
      name: song.name,
      number: song.number,
      prefix: song.prefix,
      withChoir: song.withChoir,
      withSolo: song.withSolo,
      link: song.link,
      difficulty: song.difficulty,
      instrument_ids: [],
      category: null,
    };

    const { data, error: insertError } = await supabase
      .from('songs')
      .insert({ ...newSong, tenantId: targetTenantId } as any)
      .select()
      .single();

    if (insertError) throw new Error(insertError.message);

    const createdSong = data as unknown as Song;

    if (song.files?.length) {
      const newFiles: SongFile[] = [];
      const totalFiles = song.files.length;

      for (let i = 0; i < song.files.length; i++) {
        const file = song.files[i];
        if (onProgress) onProgress(i + 1, totalFiles);

        const blob = await this.downloadSongFileFromPath(
          file.url.split("https://ultyjzgwejpehfjuyenr.supabase.co/storage/v1/object/public/songs/")[1]
        );

        const mappedInstrumentId = file.instrumentId
          ? (instrumentMapping[file.instrumentId] ?? null)
          : null;

        const newFile = await this.uploadSongFileToTenant(
          createdSong.id,
          blob,
          file.fileName,
          file.fileType,
          targetTenantId,
          mappedInstrumentId,
          file.note
        );

        newFiles.push(newFile);
      }

      const filesJson = newFiles.map(f => ({
        storageName: f.storageName,
        fileName: f.fileName,
        fileType: f.fileType,
        url: f.url,
        instrumentId: f.instrumentId ?? null,
        note: f.note,
      }));

      await supabase
        .from('songs')
        .update({
          files: filesJson,
          instrument_ids: Array.from(new Set(
            filesJson.map(f => f.instrumentId).filter(id => id !== null && id !== 1 && id !== 2)
          ))
        })
        .match({ id: createdSong.id });
    }

    return createdSong;
  }

  private async uploadSongFileToTenant(
    songId: number,
    blob: Blob,
    fileName: string,
    fileType: string,
    targetTenantId: number,
    instrumentId: number | null,
    note?: string
  ): Promise<SongFile> {
    const fileId = this.encodeFilename(fileName);
    const filePath = `songs/${targetTenantId}/${songId}/${fileId}`;

    const { error } = await supabase.storage
      .from('songs')
      .upload(filePath, blob, { upsert: true });
    if (error) throw new Error(error.message);

    const { data } = await supabase.storage.from('songs').getPublicUrl(filePath);

    return {
      storageName: fileId,
      fileName,
      fileType,
      url: data.publicUrl,
      instrumentId,
      note,
      created_at: new Date().toISOString(),
    };
  }

  // Song Categories
  async getSongCategories(tenantId: number): Promise<SongCategory[]> {
    const { data } = await supabase
      .from('song_categories')
      .select('*')
      .eq('tenant_id', tenantId)
      .order("index", { ascending: true });

    return data;
  }

  async addSongCategory(category: Partial<SongCategory>, tenantId: number): Promise<void> {
    const { error } = await supabase
      .from('song_categories')
      .insert({ ...category, tenant_id: tenantId } as SongCategory)
      .select();

    if (error) {
      throw new Error("Fehler beim hinzufügen der Werkkategorie");
    }
  }

  async updateSongCategory(category: Partial<SongCategory>, id: string): Promise<SongCategory[]> {
    const { data } = await supabase
      .from('song_categories')
      .update(category)
      .match({ id });

    return data;
  }

  async removeSongCategory(id: string): Promise<void> {
    await supabase
      .from('song_categories')
      .delete()
      .match({ id });
  }
}
