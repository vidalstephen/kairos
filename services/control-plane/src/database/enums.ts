export enum UserRole {
  OWNER = 'OWNER',
  ADMIN = 'ADMIN',
  OPERATOR = 'OPERATOR',
  VIEWER = 'VIEWER',
}

export enum MemberRole {
  OWNER = 'OWNER',
  ADMIN = 'ADMIN',
  OPERATOR = 'OPERATOR',
  VIEWER = 'VIEWER',
}

export enum SessionStatus {
  ACTIVE = 'ACTIVE',
  IDLE = 'IDLE',
  CLOSED = 'CLOSED',
  EXPIRED = 'EXPIRED',
}

export enum SessionMode {
  DESIGN = 'design',
  EXECUTION = 'execution',
  RESEARCH = 'research',
  REVIEW = 'review',
  IDLE = 'idle',
}

export enum MessageRole {
  USER = 'user',
  ASSISTANT = 'assistant',
  SYSTEM = 'system',
  TOOL = 'tool',
}

export enum RunStatus {
  QUEUED = 'QUEUED',
  RUNNING = 'RUNNING',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
  CANCELLED = 'CANCELLED',
  TIMED_OUT = 'TIMED_OUT',
}

export enum ToolTier {
  T0 = 'T0',
  T1 = 'T1',
  T2 = 'T2',
  T3 = 'T3',
}

export enum ToolExecStatus {
  PENDING = 'PENDING',
  EXECUTING = 'EXECUTING',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
  REJECTED = 'REJECTED',
}

export enum BlastRadius {
  READ = 'read',
  WRITE_LOCAL = 'write_local',
  INSTALL = 'install',
  STATEFUL_EXTERNAL = 'stateful_external',
  DESTRUCTIVE = 'destructive',
  NETWORK_EGRESS_NEW = 'network_egress_new',
}

export enum MemoryScope {
  HOT = 'hot',
  WARM = 'warm',
  COLD = 'cold',
  GLOBAL = 'global',
}

export enum SensitivityLevel {
  PUBLIC = 'public',
  INTERNAL = 'internal',
  CONFIDENTIAL = 'confidential',
  SECRET = 'secret', // pragma: allowlist secret
}

export enum MemoryApprovalState {
  AUTO = 'auto',
  PENDING = 'pending',
  APPROVED = 'approved',
  REJECTED = 'rejected',
}

export enum ApprovalStateMachine {
  PENDING = 'PENDING',
  APPROVED = 'APPROVED',
  DENIED = 'DENIED',
  EXPIRED = 'EXPIRED',
  CANCELLED = 'CANCELLED',
}

export enum GoalPriority {
  CRITICAL = 'critical',
  HIGH = 'high',
  NORMAL = 'normal',
  LOW = 'low',
}

export enum GoalStatus {
  ACTIVE = 'active',
  STANDING = 'standing',
  PAUSED = 'paused',
  COMPLETE = 'complete',
}

export enum AuditCategory {
  AUTH = 'auth',
  RUN = 'run',
  TOOL = 'tool',
  MEMORY = 'memory',
  POLICY = 'policy',
  APPROVAL = 'approval',
  SYSTEM = 'system',
  SELF_MODIFICATION = 'self_modification',
}

export enum SpanType {
  EGO_PASS = 'ego_pass',
  TASK_DISPATCH = 'task_dispatch',
  TOOL_CALL = 'tool_call',
  MEMORY_OP = 'memory_op',
  APPROVAL_EVENT = 'approval_event',
  SELF_MODIFICATION = 'self_modification',
  HEARTBEAT = 'heartbeat',
}
