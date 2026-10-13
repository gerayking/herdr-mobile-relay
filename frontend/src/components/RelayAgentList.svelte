<script lang="ts">
  import AgentList from '$components/AgentList.svelte';
  import { agentStatusGroup } from '$lib/agents';
  import type { Agent, RelayConfig, RelayConnectionView, RelayWorkspace } from '$lib/types';

  let {
    agents, relays, connections, workspaces, responding, onopen,
    workspaceDisclosure = $bindable<Record<string, boolean>>({}),
    relayDisclosure = $bindable<Record<string, boolean>>({}),
  }: {
    agents: Agent[];
    relays: RelayConfig[];
    connections: Map<string, RelayConnectionView>;
    workspaces: RelayWorkspace[];
    responding: Set<string>;
    onopen: (agent: Agent) => void;
    workspaceDisclosure?: Record<string, boolean>;
    relayDisclosure?: Record<string, boolean>;
  } = $props();

  const groups = $derived(relays.map((relay) => {
    const visible = agents.filter((agent) => agent.relay_id === relay.id);
    const connection = connections.get(relay.id);
    const ready = connection?.status === 'connected' && connection.inventory.state === 'ready';
    const needsInput = visible.filter((agent) => ['blocked', 'attention'].includes(agentStatusGroup(agent))).length;
    const working = visible.filter((agent) => agentStatusGroup(agent) === 'working').length;
    const state = connection?.authRejected || connection?.pairingRequired || connection?.pairingDeferred
      ? 'Pairing required'
      : ready ? 'Connected'
        : connection?.status === 'connected'
          ? connection.inventory.state === 'error' ? 'Inventory unavailable' : 'Loading agents'
          : connection?.status === 'connecting' ? 'Connecting' : 'Disconnected';
    return {
      relay, agents: visible,
      workspaces: workspaces.filter((workspace) => workspace.relay_id === relay.id),
      state, needsInput, working,
      tone: ready ? 'success' : connection?.status === 'connecting' || connection?.status === 'connected' ? 'warning' : 'danger',
    };
  }));

  function rememberRelay(relayId: string, event: Event) {
    if (!(event.currentTarget instanceof HTMLDetailsElement)) return;
    relayDisclosure = { ...relayDisclosure, [relayId]: event.currentTarget.open };
    try {
      const current = Object.fromEntries(relays
        .filter((relay) => typeof relayDisclosure[relay.id] === 'boolean')
        .map((relay) => [relay.id, relayDisclosure[relay.id]]));
      localStorage.setItem('herdr_relay_disclosure', JSON.stringify(current));
    } catch { /* Keep navigation usable when browser storage is unavailable. */ }
  }
</script>

<main class="agent-list relay-agent-list" aria-label="Agents">
  {#if !relays.length}
    <AgentList {agents} {relays} {connections} {workspaces} {responding} {onopen} bind:workspaceDisclosure />
  {/if}
  {#each groups as group, index (group.relay.id)}
    <details
      class="relay-group"
      data-relay-id={group.relay.id}
      open={relayDisclosure[group.relay.id] ?? index === 0}
      ontoggle={(event) => rememberRelay(group.relay.id, event)}
    >
      <summary aria-label={`${group.relay.label} agents`}>
        <span class={`status-dot status-${group.tone}`} aria-hidden="true"></span>
        <span class="relay-group-copy">
          <strong>{group.relay.label}</strong>
          <span class="relay-group-meta">
            <span>{group.state}</span>
            <span>{group.agents.length} {group.agents.length === 1 ? 'agent' : 'agents'}</span>
            {#if group.working}<span>{group.working} working</span>{/if}
          </span>
        </span>
        {#if group.needsInput}<span class="relay-attention-count">{group.needsInput} pending</span>{/if}
      </summary>
      <div class="relay-group-content">
        <AgentList
          agents={group.agents} relays={[group.relay]} workspaces={group.workspaces}
          {connections} {responding} {onopen} bind:workspaceDisclosure
        />
      </div>
    </details>
  {/each}
</main>
