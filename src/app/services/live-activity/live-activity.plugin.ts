import { registerPlugin, PluginListenerHandle } from '@capacitor/core';
import { LivePlanState } from '../../utilities/live-plan';

/**
 * App-local native plugin (ios/App/App/LiveActivityPlugin.swift,
 * android/.../LiveActivityPlugin.java). Older app builds that got this web
 * code via OTA don't have it, so callers check Capacitor.isPluginAvailable first.
 */
export interface LiveActivityTarget {
  attendanceId: number;
  planKey: string;
}

export interface LiveActivityTokenEvent extends LiveActivityTarget {
  token: string;
}

export interface LiveActivityPlugin {
  isAvailable(): Promise<{ available: boolean; pushToStart: boolean }>;
  start(options: LiveActivityTarget & { title: string; state: LivePlanState }): Promise<{ id: string }>;
  update(options: LiveActivityTarget & { state: LivePlanState }): Promise<{ updated: boolean }>;
  end(options: LiveActivityTarget & { state?: LivePlanState; immediate?: boolean }): Promise<void>;
  endAll(): Promise<void>;
  list(): Promise<{ activities: (LiveActivityTarget & { id: string })[] }>;
  getTokens(): Promise<{ pushToStartToken?: string; activityTokens: LiveActivityTokenEvent[] }>;
  addListener(event: 'pushToStartToken', listener: (e: { token: string }) => void): Promise<PluginListenerHandle>;
  addListener(event: 'activityToken', listener: (e: LiveActivityTokenEvent) => void): Promise<PluginListenerHandle>;
}

export const LiveActivity = registerPlugin<LiveActivityPlugin>('LiveActivity');
