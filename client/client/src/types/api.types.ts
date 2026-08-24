export interface APIResponse<T> {
  data: T;
  meta: {
    timestamp: string;
  };
}

export interface PaginatedResponse<T> {
  data: T[];
  meta: {
    total: number;
    limit: number;
    offset: number;
    timestamp: string;
  };
}

export interface APIError {
  error: string;
  code: number;
  message: string;
  details?: any[];
}

export interface User {
  id: string;
  email: string;
}

export interface Organization {
  id: string;
  name: string;
  created_at: string;
  role?: string;
}

export interface Project {
  id: string;
  name: string;
  description?: string;
  organization_id: string;
  created_at: string;
}

export interface RetryPolicy {
  id?: string;
  strategy: 'fixed' | 'linear' | 'exponential';
  max_attempts: number;
  initial_delay_ms: number;
  max_delay_ms: number;
}

export interface Queue {
  id: string;
  project_id: string;
  name: string;
  priority: number;
  concurrency_limit: number;
  is_paused: boolean;
  retry_policy: RetryPolicy;
  created_at: string;
}

export interface QueueStats {
  queue_id: string;
  queue_name: string;
  is_paused: boolean;
  counts: {
    scheduled: number;
    queued: number;
    claimed: number;
    running: number;
    completed: number;
    failed: number;
    dlq: number;
  };
  concurrency_limit: number;
  active_workers: number;
  throughput_last_hour: number;
}

export interface JobTemplate {
  type: string;
  priority: number;
  payload: any;
}

export interface Schedule {
  id: string;
  queue_id: string;
  schedule_type: 'cron' | 'once';
  cron_expression?: string;
  run_at?: string;
  timezone: string;
  job_template?: JobTemplate;
  next_run_at: string | null;
  last_run_at: string | null;
  enabled: boolean;
  recent_jobs?: Job[];
  created_at: string;
}

export type JobStatus = 'SCHEDULED' | 'QUEUED' | 'CLAIMED' | 'RUNNING' | 'COMPLETED' | 'FAILED' | 'CANCELLED';

export interface Job {
  id: string;
  queue_id: string;
  schedule_id: string | null;
  type: string;
  status: JobStatus;
  priority: number;
  payload: any;
  attempt_count: number;
  max_attempts: number;
  worker_id?: string;
  idempotency_key?: string;
  available_at?: string;
  scheduled_at?: string | null;
  claimed_at?: string;
  started_at?: string;
  completed_at?: string;
  created_at: string;
  updated_at?: string;
}

export interface JobExecution {
  id: string;
  job_id: string;
  worker_id: string;
  attempt_number: number;
  status: 'COMPLETED' | 'FAILED';
  error_code?: string | null;
  error_message?: string | null;
  result?: any;
  started_at: string;
  completed_at: string;
  duration_ms: number;
}

export interface JobLog {
  id: string;
  job_id: string;
  execution_id: string;
  level: 'INFO' | 'WARN' | 'ERROR';
  message: string;
  created_at: string;
}

export interface DLQEntry {
  id: string;
  job_id: string;
  job: Job;
  executions?: JobExecution[];
  reason: string;
  attempts: number;
  error_message?: string;
  failed_at: string;
  ai_summary?: string | null;
}

export interface Worker {
  id: string;
  hostname: string;
  status: 'active' | 'idle' | 'unhealthy' | 'offline';
  concurrency: number;
  active_jobs: number;
  last_heartbeat_at: string;
  registered_at: string;
  current_jobs?: Job[];
  recent_heartbeats?: { active_jobs: number; heartbeat_at: string }[];
}

export interface Metrics {
  window: string;
  jobs: {
    total_queued: number;
    total_running: number;
    total_completed: number;
    total_failed: number;
    total_dlq: number;
    throughput_per_minute: number;
    success_rate: number;
    failure_rate: number;
    retry_rate: number;
    avg_wait_time_ms: number;
    avg_execution_time_ms: number;
  };
  queues: {
    id: string;
    name: string;
    depth: number;
    is_paused: boolean;
    active_jobs: number;
    concurrency_limit: number;
  }[];
  workers: {
    total: number;
    active: number;
    idle: number;
    unhealthy: number;
    total_capacity: number;
    used_capacity: number;
    utilization: number;
  };
  scheduler: {
    last_tick_at: string;
    due_schedules_evaluated: number;
    jobs_created_this_hour: number;
  };
}
