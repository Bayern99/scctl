export type DriverState =
  | 'engine_missing'
  | 'idle'
  | 'booting'
  | 'ready'
  | 'busy'
  | 'degraded'
  | 'stopping'
  | 'stopped';

export type DriverErrorKind =
  | 'boot_timeout'
  | 'cleanup_failed'
  | 'engine_missing'
  | 'invalid_argument'
  | 'process_exit'
  | 'protocol_error'
  | 'render_failed'
  | 'sc_runtime_error'
  | 'server_not_ready'
  | 'session_conflict'
  | 'session_missing';

export interface SessionSnapshot {
  state: DriverState;
  phase: string;
  session_id: string | null;
  engine_path: string | null;
  has_controller: boolean;
  busy: boolean;
  last_error_kind: DriverErrorKind | null;
  recoverable: boolean;
}

export interface HealthSnapshot extends SessionSnapshot {
  process_alive: boolean;
  server_ready: boolean;
  log_bytes: number;
  degraded_reason: string | null;
}

export interface RenderArtifact {
  path: string;
  bytes: number;
  duration_sec: number;
}

export interface DriverResult<TArtifact = never> {
  success: boolean;
  state: DriverState;
  phase: string;
  session_id: string | null;
  recoverable: boolean;
  error_kind: DriverErrorKind | null;
  summary: string;
  raw_output: string;
  artifact?: TArtifact;
  session?: SessionSnapshot;
  health?: HealthSnapshot;
}
