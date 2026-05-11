export interface Device {
    id: string;
    group_id: number | null;
    name: string;
    os: string;
    cpu_name: string;
    ram_total: number;
    hardware_data: string;
    status: 'online' | 'offline';
    last_seen: string;
}

export interface DeviceGroup {
    id: number;
    name: string;
    permissions: string;
}

export interface ActivityLog {
    id: number;
    device_id: string;
    event: 'connected' | 'disconnected' | 'paired';
    message: string;
    timestamp: string;
}

export interface AppSettings {
    id: number;
    log_retention_period: string;
}

// --- Client Parity Types ---

export interface DiskInfo {
  name: string;
  mount_point: string;
  total_space: number;
  available_space: number;
  is_removable: boolean;
}

export interface HardwareInfo {
  os_name: string;
  os_version: string;
  host_name: string;
  cpu_name: string;
  cpu_cores: number;
  total_memory: number;
  used_memory: number;
  gpu_name: string;
  disks: DiskInfo[];
}

export interface CpuData { name: string; usage: number; }
export interface TempData { label: string; temperature: number; }
export interface NetworkData { download_bytes_per_sec: number; upload_bytes_per_sec: number; }
export interface RealtimeStats {
  cpu_cores: CpuData[];
  global_cpu_usage: number;
  used_memory: number;
  temps: TempData[];
  network: NetworkData;
}

export type ThemeMode = "light" | "dark" | "system";
export type LangKey = "en" | "vi" | "ru" | "zh" | "ja";
