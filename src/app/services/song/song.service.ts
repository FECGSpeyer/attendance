import { Injectable, inject } from '@angular/core';
import { Network } from '@capacitor/network';
import { Storage } from '@ionic/storage-angular';
import { OrgSongFile, OrgSongResult, Song, SongCategory, SongCopiedFrom, SongFile } from '../../utilities/interfaces';
import { instrumentIdsFromFiles } from '../../utilities/song-copy';
import { supabase } from '../base/supabase';
import { translate } from '@jsverse/transloco';

@Injectable({
  providedIn: 'root'
})
export class SongService {

  private storage = inject(Storage);

  constructor() {}

  encodeFilename(filename: string): string {
    const nameParts = filename.split('.');
    const ext = nameParts.pop() || '';
    const name = nameParts.join('.');

    const sanitizedName = name
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^\w\s-]/g, '-')
      .replace(/\s+/g, ' ')
      .replace(/-+/g, '-')
      .replace(/^-+|-+$/g, '')
      .trim();

    const randomNumber = Math.floor(100 + Math.random() * 900);
    return `${sanitizedName}_${randomNumber}.${ext}`;
  }

  async getSongs(tenantId: number): Promise<Song[]> {
    const cacheKey = `offline_songs_v1_${tenantId}`;
    const { connected } = await Network.getStatus();

    if (!connected) {
      const cached = await this.storage.get(cacheKey);
      return (cached ?? []) as Song[];
    }

    // PostgREST caps each response, so load in pages until a short page arrives.
    const pageSize = 1000;
    const songs: Song[] = [];
    for (let from = 0; ; from += pageSize) {
      const { data, error } = await supabase
        .from('songs')
        .select('*')
        .eq('tenantId', tenantId)
        .order('number', { ascending: true })
        .order('id', { ascending: true })
        .range(from, from + pageSize - 1);

      if (error || !data) {
        if (!songs.length) { return data as any; }
        break;
      }
      songs.push(...(data as any));
      if (data.length < pageSize) { break; }
    }

    void this.storage.set(cacheKey, songs);
    return songs;
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
      throw new Error(translate('svc.deleteSongFailed'));
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
    if (error) {throw new Error(error.message);}

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
    if (error) {throw new Error(error.message);}
    return data;
  }

  async downloadSongFileFromPath(filePath: string): Promise<Blob> {
    const { data, error } = await supabase.storage.from('songs').download(filePath);
    if (error) {throw new Error(error.message);}
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
      category_ids: [],
    };

    const { data, error: insertError } = await supabase
      .from('songs')
      .insert({ ...newSong, tenantId: targetTenantId } as any)
      .select()
      .single();

    if (insertError) {throw new Error(insertError.message);}

    const createdSong = data as unknown as Song;

    if (song.files?.length) {
      const newFiles: SongFile[] = [];
      const totalFiles = song.files.length;

      for (let i = 0; i < song.files.length; i++) {
        const file = song.files[i];
        if (onProgress) {onProgress(i + 1, totalFiles);}

        const blob = await this.downloadSongFileFromPath(
          file.url.split('/storage/v1/object/public/songs/')[1]
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
    if (error) {throw new Error(error.message);}

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
      .order('index', { ascending: true });

    return data;
  }

  async addSongCategory(category: Partial<SongCategory>, tenantId: number): Promise<void> {
    const { error } = await supabase
      .from('song_categories')
      .insert({ ...category, tenant_id: tenantId } as SongCategory)
      .select();

    if (error) {
      throw new Error(translate('svc.addSongCategoryFailed'));
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

  // Organisation-wide Werk search

  /** Ids of the categories with these names in the library; missing ones are created. */
  async ensureSongCategories(tenantId: number, names: string[]): Promise<string[]> {
    const existing = await this.getSongCategories(tenantId) ?? [];
    const ids: string[] = [];
    let nextIndex = existing.reduce((max, c) => Math.max(max, c.index ?? 0), -1) + 1;
    for (const name of names) {
      const match = existing.find(c => c.name.trim().toLowerCase() === name.trim().toLowerCase());
      if (match) { ids.push(match.id); continue; }
      const { data, error } = await supabase
        .from('song_categories')
        .insert({ name, index: nextIndex++, tenant_id: tenantId } as SongCategory)
        .select()
        .single();
      if (error) { throw new Error(translate('svc.addSongCategoryFailed')); }
      existing.push(data as SongCategory);
      ids.push((data as SongCategory).id);
    }
    return ids;
  }

  async searchOrgSongs(
    tenantId: number,
    query: string,
    options: { tenantIds?: number[] | null; onlyWithFiles?: boolean; limit?: number; offset?: number } = {},
  ): Promise<OrgSongResult[]> {
    const { data, error } = await (supabase as any).rpc('search_org_songs', {
      p_tenant_id: tenantId,
      p_query: query ?? '',
      p_tenant_ids: options.tenantIds?.length ? options.tenantIds : null,
      p_only_with_files: !!options.onlyWithFiles,
      p_limit: options.limit ?? 50,
      p_offset: options.offset ?? 0,
    });
    if (error) { throw new Error(error.message); }
    return (data ?? []) as OrgSongResult[];
  }

  /**
   * Copies a Werk found in another instance into a target library: either as a new Werk
   * (`existingSongId` empty) or into an existing one. Only the given fields and files are taken over.
   * If copying the files fails, everything uploaded in this run is removed again, and a newly created Werk too.
   */
  async copyOrgSong(params: {
    source: OrgSongResult;
    targetLibraryId: number;
    existingSongId?: number | null;
    fields: Partial<Song>;
    files: { file: OrgSongFile; instrumentId: number | null }[];
    mainGroupId?: number;
    onProgress?: (current: number, total: number) => void;
  }): Promise<Song> {
    const { source, targetLibraryId, existingSongId, fields, files, mainGroupId, onProgress } = params;
    const copiedFrom: SongCopiedFrom = {
      tenantId: source.tenant_id,
      tenantName: source.tenant_name,
      songId: source.id,
      copiedAt: new Date().toISOString(),
    };

    let song: Song;
    if (existingSongId) {
      song = await this.getSong(existingSongId, targetLibraryId);
      if (!song) { throw new Error(translate('orgSongs.targetMissing')); }
      const update: Partial<Song> = { ...fields };
      if (fields.additional_fields) {
        update.additional_fields = { ...(song.additional_fields ?? {}), ...fields.additional_fields };
      }
      if (!song.copied_from) { update.copied_from = copiedFrom; }
      if (Object.keys(update).length) {
        const { error } = await supabase.from('songs').update(update as any).match({ id: song.id });
        if (error) { throw new Error(error.message); }
        song = { ...song, ...update };
      }
    } else {
      const { data, error } = await supabase
        .from('songs')
        .insert({
          name: source.name,
          number: source.number,
          prefix: source.prefix ?? null,
          withChoir: false,
          withSolo: false,
          instrument_ids: [],
          category: null,
          category_ids: [],
          ...fields,
          copied_from: copiedFrom,
          tenantId: targetLibraryId,
        } as any)
        .select()
        .single();
      if (error) { throw new Error(error.message); }
      song = data as unknown as Song;
    }

    if (!files.length) { return song; }

    const uploadedPaths: string[] = [];
    const newFiles: SongFile[] = [];
    try {
      for (let i = 0; i < files.length; i++) {
        onProgress?.(i + 1, files.length);
        const { file, instrumentId } = files[i];
        const blob = await this.downloadSongFileFromPath(file.url.split('/storage/v1/object/public/songs/')[1]);
        const fileId = this.encodeFilename(file.fileName);
        const filePath = `songs/${targetLibraryId}/${song.id}/${fileId}`;
        const { error } = await supabase.storage.from('songs').upload(filePath, blob, { upsert: true });
        if (error) { throw new Error(error.message); }
        uploadedPaths.push(filePath);
        const { data } = supabase.storage.from('songs').getPublicUrl(filePath);
        newFiles.push({
          storageName: fileId,
          fileName: file.fileName,
          fileType: file.fileType,
          url: data.publicUrl,
          instrumentId,
          note: file.note,
          created_at: new Date().toISOString(),
        });
      }

      const allFiles = [...(song.files ?? []), ...newFiles].map(f => ({
        storageName: f.storageName,
        fileName: f.fileName,
        fileType: f.fileType,
        url: f.url,
        instrumentId: f.instrumentId ?? null,
        note: f.note,
      }));
      const instrument_ids = instrumentIdsFromFiles(allFiles, mainGroupId);
      const { error } = await supabase
        .from('songs')
        .update({ files: allFiles, instrument_ids } as any)
        .match({ id: song.id });
      if (error) { throw new Error(error.message); }
      return { ...song, files: allFiles as SongFile[], instrument_ids };
    } catch (error) {
      if (uploadedPaths.length) {
        await supabase.storage.from('songs').remove(uploadedPaths);
      }
      if (!existingSongId) {
        await supabase.from('songs').delete().match({ id: song.id });
      }
      throw error;
    }
  }
}
