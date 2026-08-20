import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  getHealth,
  getNotification,
  getReplayHistory,
  getTimeline,
  listNotifications,
  replayNotification,
} from '../api/client';
import type { ListNotificationsParams } from '../types';

export function useHealth() {
  return useQuery({
    queryKey: ['health'],
    queryFn: getHealth,
    refetchInterval: 30_000,
  });
}

export function useNotifications(params?: ListNotificationsParams) {
  return useQuery({
    queryKey: ['notifications', params],
    queryFn: () => listNotifications(params),
  });
}

export function useNotification(id: string) {
  return useQuery({
    queryKey: ['notification', id],
    queryFn: () => getNotification(id),
    enabled: !!id,
  });
}

export function useTimeline(id: string) {
  return useQuery({
    queryKey: ['timeline', id],
    queryFn: () => getTimeline(id),
    enabled: !!id,
  });
}

export function useReplayHistory(id: string) {
  return useQuery({
    queryKey: ['replays', id],
    queryFn: () => getReplayHistory(id),
    enabled: !!id,
  });
}

export function useReplayNotification(id: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (reason?: string) => replayNotification(id, reason),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['replays', id] });
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
    },
  });
}
