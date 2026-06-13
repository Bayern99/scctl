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
  | 'capability_unavailable'
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

export type PilotAction =
  | 'check'
  | 'status'
  | 'health'
  | 'eval'
  | 'run'
  | 'logs'
  | 'render'
  | 'render_nrt'
  | 'stop'
  | 'reset'
  | 'reboot'
  | 'reclaim';

export type PilotRouteSurface = 'cli' | 'mcp';

export type PilotSourceKind = 'inline_code' | 'none' | 'scd_file';

export type RenderMode = 'draft' | 'nrt';
export type RenderTier = 'draft' | 'final_nrt';
export type EngineKind = 'scsynth' | 'supernova';
export type EnginePreference = 'auto' | EngineKind;
export type RequestedSampleFormat = 'double' | 'float';
export type RenderSampleFormat =
  | RequestedSampleFormat
  | 'int16'
  | 'int24'
  | 'int32'
  | 'uint8'
  | 'unknown';

export interface BinaryCapability {
  available: boolean;
  path: string | null;
}

export interface Sc3PluginsCapability {
  detected: boolean;
  plugin_count: number;
  plugin_paths: string[];
}

export interface RuntimeCapabilities {
  sclang: BinaryCapability;
  scsynth: BinaryCapability;
  supernova: BinaryCapability;
  extensions_paths: string[];
  quarks_paths: string[];
  sc3_plugins: Sc3PluginsCapability;
  nrt_available: boolean;
}

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

export interface RenderArtifactVerification {
  exists: boolean;
  non_empty: boolean;
  output_error_detected: boolean;
  stop_completed: boolean;
  failure_reasons: string[];
}

export interface RenderArtifact {
  path: string;
  bytes: number;
  duration_sec: number;
  source_path?: string | null;
  render_mode?: RenderMode;
  engine_used?: EngineKind;
  sample_rate?: number;
  sample_format?: RenderSampleFormat;
  channel_count?: number;
  frame_count?: number;
  verification?: RenderArtifactVerification;
}

export type ComplianceStatus = 'failed' | 'not_applicable' | 'passed';

export interface PilotRouteEvidence {
  action: PilotAction;
  source_kind: PilotSourceKind;
  source_path: string | null;
  surface: PilotRouteSurface;
}

export interface ComplianceSnapshot {
  artifact_complete: boolean;
  reasons: string[];
  requires_render_artifact: boolean;
  requires_source: boolean;
  route: PilotRouteEvidence;
  status: ComplianceStatus;
  task_tag: string | null;
  used_pilot: boolean;
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
  capabilities?: RuntimeCapabilities;
  compliance?: ComplianceSnapshot;
  session?: SessionSnapshot;
  health?: HealthSnapshot;
}
