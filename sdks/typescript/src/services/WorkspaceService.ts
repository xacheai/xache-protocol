/**
 * Workspace Service
 * Enterprise workspace and fleet management
 */

import type { XacheClient } from '../XacheClient';
import type { DID } from '../types';

/**
 * Workspace configuration
 */
export interface Workspace {
  workspaceId: string;
  ownerDID: DID;
  workspaceName: string;
  description?: string;
  budgetLimitCents?: number;
  enabledChains?: string[];
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

/**
 * Workspace member
 */
export interface WorkspaceMember {
  workspaceId: string;
  agentDID: DID;
  role: 'admin' | 'member';
  addedAt: string;
}

/**
 * Workspace analytics
 */
export interface WorkspaceAnalytics {
  workspaceId: string;
  totalAgents: number;
  totalMemories: number;
  totalSpentUSD: string;
  totalOperations: number;
  operationsByType: Record<string, number>;
  periodStart: string;
  periodEnd: string;
}

/**
 * Workspace budget status
 */
export interface WorkspaceBudget {
  workspaceId: string;
  budgetLimitCents: number;
  totalSpentCents: number;
  remainingCents: number;
  percentageUsed: number;
  agentBudgets: Array<{
    agentDID: DID;
    spentCents: number;
    percentageOfTotal: number;
  }>;
}

/**
 * Create workspace request
 */
export interface CreateWorkspaceRequest {
  workspaceName: string;
  description?: string;
  budgetLimitCents?: number;
  enabledChains?: string[];
}

/**
 * Update workspace request
 */
export interface UpdateWorkspaceRequest {
  workspaceName?: string;
  description?: string;
  budgetLimitCents?: number;
  enabledChains?: string[];
  enabled?: boolean;
}

/**
 * Add agent to workspace request
 */
export interface AddAgentRequest {
  agentDID: DID;
  role?: 'admin' | 'member';
}

/**
 * Workspace service for enterprise fleet management
 */
export class WorkspaceService {
  constructor(private readonly client: XacheClient) {}

  /**
   * Create a new workspace
   * Requires owner authentication
   *
   * @example
   * ```typescript
   * const workspace = await client.workspaces.create({
   *   workspaceName: 'Production Agents',
   *   description: 'Fleet of production AI agents',
   *   budgetLimitCents: 100000, // $1000 limit
   *   enabledChains: ['evm', 'solana'],
   * });
   * console.log('Created workspace:', workspace.workspaceId);
   * ```
   */
  async create(params: CreateWorkspaceRequest): Promise<Workspace> {
    const response = await this.client.request<{ workspace: Workspace }>(
      'POST',
      '/v1/workspaces',
      { ...params }
    );

    if (!response.success || !response.data?.workspace) {
      throw new Error(response.error?.message || 'Failed to create workspace');
    }

    return response.data.workspace;
  }

  /**
   * List all workspaces owned by the authenticated owner
   * Requires owner authentication
   *
   * @example
   * ```typescript
   * const { workspaces } = await client.workspaces.list();
   * workspaces.forEach(ws => {
   *   console.log(`${ws.workspaceName}: ${ws.enabled ? 'active' : 'disabled'}`);
   * });
   * ```
   */
  async list(): Promise<{ workspaces: Workspace[]; count: number }> {
    const response = await this.client.request<{ workspaces: Workspace[]; count: number }>(
      'GET',
      '/v1/workspaces'
    );

    if (!response.success || !response.data) {
      throw new Error(response.error?.message || 'Failed to list workspaces');
    }

    return response.data;
  }

  /**
   * Get workspace by ID
   * Requires owner authentication
   *
   * @example
   * ```typescript
   * const workspace = await client.workspaces.get('ws_abc123');
   * console.log('Budget limit:', workspace.budgetLimitCents);
   * ```
   */
  async get(workspaceId: string): Promise<Workspace> {
    const response = await this.client.request<{ workspace: Workspace }>(
      'GET',
      `/v1/workspaces/${encodeURIComponent(workspaceId)}`
    );

    if (!response.success || !response.data?.workspace) {
      throw new Error(response.error?.message || 'Workspace not found');
    }

    return response.data.workspace;
  }

  /**
   * Update workspace settings
   * Requires owner authentication
   *
   * @example
   * ```typescript
   * const updated = await client.workspaces.update('ws_abc123', {
   *   budgetLimitCents: 200000, // Increase to $2000
   *   description: 'Updated description',
   * });
   * ```
   */
  async update(workspaceId: string, params: UpdateWorkspaceRequest): Promise<Workspace> {
    const response = await this.client.request<{ workspace: Workspace }>(
      'PATCH',
      `/v1/workspaces/${encodeURIComponent(workspaceId)}`,
      { ...params }
    );

    if (!response.success || !response.data?.workspace) {
      throw new Error(response.error?.message || 'Failed to update workspace');
    }

    return response.data.workspace;
  }

  /**
   * Delete (disable) workspace
   * Requires owner authentication
   *
   * @example
   * ```typescript
   * await client.workspaces.delete('ws_abc123');
   * console.log('Workspace deleted');
   * ```
   */
  async delete(workspaceId: string): Promise<void> {
    const response = await this.client.request<{ message: string }>(
      'DELETE',
      `/v1/workspaces/${encodeURIComponent(workspaceId)}`
    );

    if (!response.success) {
      throw new Error(response.error?.message || 'Failed to delete workspace');
    }
  }

  /**
   * Add an agent to a workspace
   * Requires owner authentication
   *
   * @example
   * ```typescript
   * const member = await client.workspaces.addAgent('ws_abc123', {
   *   agentDID: 'did:agent:evm:0x1234...',
   *   role: 'member',
   * });
   * console.log('Added agent with role:', member.role);
   * ```
   */
  async addAgent(workspaceId: string, params: AddAgentRequest): Promise<WorkspaceMember> {
    const response = await this.client.request<{ member: WorkspaceMember }>(
      'POST',
      `/v1/workspaces/${encodeURIComponent(workspaceId)}/agents`,
      { ...params }
    );

    if (!response.success || !response.data?.member) {
      throw new Error(response.error?.message || 'Failed to add agent to workspace');
    }

    return response.data.member;
  }

  /**
   * Remove an agent from a workspace
   * Requires owner authentication
   *
   * @example
   * ```typescript
   * await client.workspaces.removeAgent('ws_abc123', 'did:agent:evm:0x1234...');
   * console.log('Agent removed from workspace');
   * ```
   */
  async removeAgent(workspaceId: string, agentDID: DID): Promise<void> {
    const response = await this.client.request<{ message: string }>(
      'DELETE',
      `/v1/workspaces/${encodeURIComponent(workspaceId)}/agents/${encodeURIComponent(agentDID)}`
    );

    if (!response.success) {
      throw new Error(response.error?.message || 'Failed to remove agent from workspace');
    }
  }

  /**
   * Get workspace analytics
   * Requires owner authentication
   *
   * @example
   * ```typescript
   * const analytics = await client.workspaces.getAnalytics('ws_abc123');
   * console.log('Total agents:', analytics.totalAgents);
   * console.log('Total spent:', analytics.totalSpentUSD);
   * console.log('Operations:', analytics.totalOperations);
   * ```
   */
  async getAnalytics(workspaceId: string): Promise<WorkspaceAnalytics> {
    const response = await this.client.request<{ analytics: WorkspaceAnalytics }>(
      'GET',
      `/v1/workspaces/${encodeURIComponent(workspaceId)}/analytics`
    );

    if (!response.success || !response.data?.analytics) {
      throw new Error(response.error?.message || 'Failed to get workspace analytics');
    }

    return response.data.analytics;
  }

  /**
   * Get workspace budget aggregation
   * Requires owner authentication
   *
   * @example
   * ```typescript
   * const budget = await client.workspaces.getBudget('ws_abc123');
   * console.log('Limit:', budget.budgetLimitCents / 100, 'USD');
   * console.log('Spent:', budget.totalSpentCents / 100, 'USD');
   * console.log('Usage:', budget.percentageUsed.toFixed(1), '%');
   *
   * // See per-agent breakdown
   * budget.agentBudgets.forEach(ab => {
   *   console.log(`  ${ab.agentDID}: $${ab.spentCents / 100}`);
   * });
   * ```
   */
  async getBudget(workspaceId: string): Promise<WorkspaceBudget> {
    const response = await this.client.request<{ budget: WorkspaceBudget }>(
      'GET',
      `/v1/workspaces/${encodeURIComponent(workspaceId)}/budget`
    );

    if (!response.success || !response.data?.budget) {
      throw new Error(response.error?.message || 'Failed to get workspace budget');
    }

    return response.data.budget;
  }
}
