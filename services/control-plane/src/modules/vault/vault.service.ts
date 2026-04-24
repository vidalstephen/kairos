import { Injectable, InternalServerErrorException, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import * as crypto from 'node:crypto';
import { Repository } from 'typeorm';
import { CredentialAccessLogEntity } from '../../entities/credential-access-log.entity.js';

export interface VaultResolveParams {
  alias: string;
  caller: string;
  purpose: string;
  runId?: string;
  toolExecutionId?: string;
}

export interface VaultResolveResult {
  resolved: string;
  accessId: string;
}

export interface VaultStoreParams {
  alias: string;
  value: string;
  metadata: {
    description: string;
    scope?: string;
    rotation_interval_days?: number;
  };
}

export interface VaultAliasMetadata {
  alias: string;
  description: string;
  scope: string;
  rotation_interval_days: number;
  created_at: string;
  rotates_at: string;
  last_accessed: string | null;
}

@Injectable()
export class VaultService {
  private readonly logger = new Logger(VaultService.name);
  private readonly vaultUrl: string;
  private readonly authSecret: string;

  constructor(
    private readonly config: ConfigService,
    @InjectRepository(CredentialAccessLogEntity)
    private readonly accessLogRepo: Repository<CredentialAccessLogEntity>,
  ) {
    this.vaultUrl = this.config.getOrThrow<string>('VAULT_INTERNAL_URL');
    this.authSecret = this.config.getOrThrow<string>('VAULT_AUTH_SECRET');
  }

  // ── resolve ─────────────────────────────────────────────────────────────────

  async resolve(params: VaultResolveParams): Promise<VaultResolveResult> {
    const { alias, caller, purpose, runId, toolExecutionId } = params;
    const body = JSON.stringify({ alias, caller, purpose, run_id: runId ?? null, tool_execution_id: toolExecutionId ?? null });

    const data = await this._post<{ resolved: string; access_id: string }>('/vault/resolve', body);

    // Write credential access log
    const entry = this.accessLogRepo.create({
      alias,
      callerService: caller,
      purpose,
      ...(runId != null ? { runId } : {}),
      ...(toolExecutionId != null ? { toolExecutionId } : {}),
      accessId: data.access_id,
    });
    await this.accessLogRepo.save(entry);

    return { resolved: data.resolved, accessId: data.access_id };
  }

  // ── store ────────────────────────────────────────────────────────────────────

  async store(params: VaultStoreParams): Promise<{ storedAt: string }> {
    const body = JSON.stringify({
      alias: params.alias,
      value: params.value,
      metadata: params.metadata,
    });
    const data = await this._post<{ stored: boolean; created_at: string }>('/vault/store', body);
    return { storedAt: data.created_at };
  }

  // ── metadata ─────────────────────────────────────────────────────────────────

  async metadata(alias: string): Promise<VaultAliasMetadata> {
    const body = JSON.stringify({ alias });
    return this._post<VaultAliasMetadata>('/vault/metadata', body);
  }

  // ── rotate ───────────────────────────────────────────────────────────────────

  async rotate(alias: string, newValue?: string): Promise<{ rotatedAt: string; newRotatesAt: string }> {
    const body = JSON.stringify({ alias, ...(newValue != null ? { new_value: newValue } : {}) });
    const data = await this._post<{ rotated_at: string; new_rotates_at: string }>('/vault/rotate', body);
    return { rotatedAt: data.rotated_at, newRotatesAt: data.new_rotates_at };
  }

  // ── aliases ──────────────────────────────────────────────────────────────────

  async aliases(): Promise<VaultAliasMetadata[]> {
    return this._get<VaultAliasMetadata[]>('/vault/aliases');
  }

  // ── health ───────────────────────────────────────────────────────────────────

  async health(): Promise<{ status: string; entries: number; oldestAccessMs: number }> {
    const data = await this._get<{ status: string; entries: number; oldest_access_ms: number }>('/vault/health');
    return { status: data.status, entries: data.entries, oldestAccessMs: data.oldest_access_ms };
  }

  // ── internal helpers ──────────────────────────────────────────────────────────

  private _sign(body: string): string {
    const mac = crypto.createHmac('sha256', this.authSecret).update(body).digest('hex');
    return `sha256=${mac}`;
  }

  private async _post<T>(path: string, body: string): Promise<T> {
    const url = `${this.vaultUrl}${path}`;
    let resp: Response;
    try {
      resp = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Internal-Service': 'control-plane',
          'X-Internal-Signature': this._sign(body),
        },
        body,
      });
    } catch (err) {
      this.logger.error(`Vault request failed: POST ${path}`, err);
      throw new InternalServerErrorException({ code: 'vault_unreachable', message: 'Vault service unavailable' });
    }

    if (resp.status === 404) {
      const detail = await resp.json() as { detail?: { message?: string } };
      throw new NotFoundException({ code: 'unknown_alias', message: detail?.detail?.message ?? 'Alias not found' });
    }

    if (!resp.ok) {
      const detail = await resp.text();
      this.logger.error(`Vault error: POST ${path} → ${resp.status}`, detail);
      throw new InternalServerErrorException({ code: 'vault_error', message: `Vault returned ${resp.status}` });
    }

    return resp.json() as Promise<T>;
  }

  private async _get<T>(path: string): Promise<T> {
    const url = `${this.vaultUrl}${path}`;
    let resp: Response;
    try {
      resp = await fetch(url, {
        method: 'GET',
        headers: {
          'X-Internal-Service': 'control-plane',
          'X-Internal-Signature': this._sign(''),
        },
      });
    } catch (err) {
      this.logger.error(`Vault request failed: GET ${path}`, err);
      throw new InternalServerErrorException({ code: 'vault_unreachable', message: 'Vault service unavailable' });
    }

    if (!resp.ok) {
      const detail = await resp.text();
      this.logger.error(`Vault error: GET ${path} → ${resp.status}`, detail);
      throw new InternalServerErrorException({ code: 'vault_error', message: `Vault returned ${resp.status}` });
    }

    return resp.json() as Promise<T>;
  }
}
