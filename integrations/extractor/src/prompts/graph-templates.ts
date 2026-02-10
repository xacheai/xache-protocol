/**
 * Graph Extraction Prompt Templates
 *
 * Entity/relationship extraction prompts for the knowledge graph.
 * Separate from the learning extraction prompts in templates.ts.
 */

/**
 * Builds the graph extraction prompt for the LLM.
 *
 * @param trace - Normalized agent execution trace
 * @param knownEntities - Formatted summary of existing entities for resolution
 * @param contextHint - Optional domain hint (e.g., 'customer-support')
 */
export function buildGraphExtractionPrompt(
  trace: string,
  knownEntities: string,
  contextHint?: string,
): string {
  return `You are an entity and relationship extractor for agent memory.

AGENT TRACE:
${trace}
${knownEntities ? `
KNOWN ENTITIES (match against these before creating new ones):
${knownEntities}
` : ''}${contextHint ? `DOMAIN: ${contextHint}
` : ''}
TASK:
Extract entities (people, organizations, tools, concepts, locations) and relationships between them from this trace.

RULES:
1. Check KNOWN ENTITIES first. If an entity matches an existing one, use its KEY. Do not create duplicates.
2. Only output key "NEW" for genuinely new entities not in the known list.
3. Resolve references carefully: "Alice", "Alice Chen", "their CTO", "she" could all be the same person.
4. Extract relationships only between entities with clear evidence in the trace.
5. If a fact contradicts a known entity's current state (e.g., new role, new company), include it in temporalUpdates.
6. Assign confidence based on evidence strength. Skip anything below 0.5.

ENTITY TYPES: person, organization, tool, concept, location, event, product, project

RELATIONSHIP TYPES: works_at, knows, uses, manages, reports_to, part_of, created, owns, located_in, related_to (or any domain-specific type)

OUTPUT (valid JSON only, no markdown fences, no commentary):
{
  "entities": [
    {
      "key": "KEY_abc123 or NEW",
      "type": "person",
      "name": "Alice Chen",
      "summary": "CTO of Acme Corp, based in SF",
      "attributes": { "role": "CTO" },
      "confidence": 0.92,
      "evidence": "direct quote from trace"
    }
  ],
  "relationships": [
    {
      "from": "KEY_abc123",
      "to": "KEY_def456",
      "type": "works_at",
      "description": "Alice is CTO at Acme Corp",
      "attributes": { "since": "2026-01" },
      "confidence": 0.88,
      "evidence": "direct quote from trace"
    }
  ],
  "temporalUpdates": [
    {
      "entityKey": "KEY_abc123",
      "field": "role",
      "oldValue": "VP Engineering",
      "newValue": "CTO",
      "effectiveDate": "2026-01-15",
      "evidence": "Alice mentioned her recent promotion"
    }
  ]
}

If no entities or relationships are found, return: { "entities": [], "relationships": [], "temporalUpdates": [] }`;
}

/**
 * Formats known entities for inclusion in the extraction prompt.
 * Includes current attributes so the LLM can detect temporal changes.
 */
export function formatKnownEntities(
  entities: Array<{
    key: string;
    type: string;
    name: string;
    summary: string;
    attributes?: Record<string, unknown>;
  }>,
): string {
  if (entities.length === 0) return '';
  return entities
    .map((e) => {
      let line = `- ${e.key}: ${e.type} - "${e.name}: ${e.summary}"`;
      if (e.attributes && Object.keys(e.attributes).length > 0) {
        line += `\n  Current: ${JSON.stringify(e.attributes)}`;
      }
      return line;
    })
    .join('\n');
}

/**
 * Builds a GraphRAG prompt for answering questions over a knowledge graph.
 */
export function buildGraphAskPrompt(
  question: string,
  graphContext: string,
): string {
  return `You have access to the following knowledge graph context:

${graphContext}

Based on this context, answer the following question. If the context does not contain enough information, say so. Cite specific entities and relationships in your answer.

QUESTION: ${question}

OUTPUT (valid JSON only, no markdown fences):
{
  "answer": "Your natural language answer here",
  "sourcesUsed": ["entity_key_1", "entity_key_2"],
  "confidence": 0.85
}`;
}

/**
 * Builds a context string from graph entities and relationships for GraphRAG.
 */
export function buildGraphContext(
  entities: Array<{ key: string; name: string; type: string; summary: string; attributes: Record<string, unknown> }>,
  relationships: Array<{ fromName: string; toName: string; type: string; description: string }>,
): string {
  const lines: string[] = [];

  if (entities.length > 0) {
    lines.push('ENTITIES:');
    for (const e of entities) {
      lines.push(`- ${e.name} (${e.type}): ${e.summary}`);
      if (Object.keys(e.attributes).length > 0) {
        lines.push(`  Attributes: ${JSON.stringify(e.attributes)}`);
      }
    }
  }

  if (relationships.length > 0) {
    lines.push('');
    lines.push('RELATIONSHIPS:');
    for (const r of relationships) {
      lines.push(`- ${r.fromName} --[${r.type}]--> ${r.toName}: ${r.description}`);
    }
  }

  return lines.join('\n');
}

/**
 * Builds a merge prompt for intelligently merging two entities.
 */
export function buildEntityMergePrompt(
  source: { name: string; summary: string; attributes: Record<string, unknown> },
  target: { name: string; summary: string; attributes: Record<string, unknown> },
): string {
  return `Merge these two entity records into one. Keep the most complete and recent information.

ENTITY A (will be merged INTO Entity B):
Name: ${source.name}
Summary: ${source.summary}
Attributes: ${JSON.stringify(source.attributes)}

ENTITY B (the primary record):
Name: ${target.name}
Summary: ${target.summary}
Attributes: ${JSON.stringify(target.attributes)}

OUTPUT (valid JSON only, no markdown fences):
{
  "name": "best name to use",
  "summary": "merged summary with all relevant details",
  "attributes": { "merged attributes object" }
}`;
}
