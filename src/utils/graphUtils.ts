import { Skill, Project, Certification } from '@/types/knowledgeGraph';
import { GraphNode, GraphLink } from '@/components/Graph3D';

/**
 * Converts skills, projects, and certifications into graph nodes and links
 */
export function transformDataToGraph(
  skills: Skill[],
  projects: Project[],
  certifications: Certification[]
): { nodes: GraphNode[]; links: GraphLink[] } {
  const nodes: GraphNode[] = [];
  const links: GraphLink[] = [];
  const nodeIds = new Set<string>();

  // Add skill nodes
  skills.forEach((skill) => {
    nodes.push({
      id: skill.id,
      name: skill.name,
      category: skill.category,
      level: skill.level,
      confidence: skill.confidence,
      x: Math.random() * 20 - 10,
      y: Math.random() * 20 - 10,
      z: Math.random() * 20 - 10,
    });
    nodeIds.add(skill.id);
  });

  // Add project nodes (lighter color, representing applications)
  projects.forEach((project) => {
    nodes.push({
      id: project.id,
      name: project.name,
      category: 'Project',
      level: 'advanced',
      confidence: 0.9,
      x: Math.random() * 20 - 10,
      y: Math.random() * 20 - 10,
      z: Math.random() * 20 - 10,
    });
    nodeIds.add(project.id);

    // Link project to its skills
    project.skills.forEach((skillId) => {
      links.push({
        source: project.id,
        target: skillId,
        value: 1,
      });
    });
  });

  // Add certification nodes
  certifications.forEach((cert) => {
    nodes.push({
      id: cert.id,
      name: cert.name,
      category: 'Certification',
      level: 'advanced',
      confidence: 0.95,
      x: Math.random() * 20 - 10,
      y: Math.random() * 20 - 10,
      z: Math.random() * 20 - 10,
    });
    nodeIds.add(cert.id);

    // Link certification to its skills
    cert.relatedSkills.forEach((skillId) => {
      links.push({
        source: cert.id,
        target: skillId,
        value: 1,
      });
    });
  });

  // Add inter-skill links based on shared projects
  const skillProjectMap = new Map<string, Set<string>>();

  projects.forEach((project) => {
    project.skills.forEach((skillId1) => {
      if (!skillProjectMap.has(skillId1)) {
        skillProjectMap.set(skillId1, new Set());
      }
      project.skills.forEach((skillId2) => {
        if (skillId1 !== skillId2) {
          skillProjectMap.get(skillId1)!.add(skillId2);
        }
      });
    });
  });

  // Create skill-to-skill links (with reduced connection to avoid clutter)
  const connectedPairs = new Set<string>();
  skillProjectMap.forEach((connectedSkills, skillId1) => {
    connectedSkills.forEach((skillId2) => {
      const pairKey = [skillId1, skillId2].sort().join('-');
      if (!connectedPairs.has(pairKey)) {
        links.push({
          source: skillId1,
          target: skillId2,
          value: 0.5, // Weaker links for skill connections
        });
        connectedPairs.add(pairKey);
      }
    });
  });

  return { nodes, links };
}

/**
 * Transforms backend graph data (nodes/edges) into 3D graph format
 */
export function transformBackendGraphToNodes(
  backendNodes: Array<{
    id: string | number;
    label: string;
    type: string;
    category?: string;
  }>,
  backendEdges: Array<{
    source: string | number;
    target: string | number;
    relationship: string;
  }>
): { nodes: GraphNode[]; links: GraphLink[] } {
  const CATEGORY_COLORS: Record<string, string> = {
    'Language': 'Backend',
    'Framework': 'Frontend',
    'Database': 'Database',
    'CloudService': 'DevOps',
    'Tool': 'DevOps',
    'Concept': 'Core CS',
  };

  const nodes: GraphNode[] = backendNodes.map((node) => ({
    id: node.id.toString(),
    name: node.label,
    category: CATEGORY_COLORS[node.category || ''] || node.category || 'Other',
    level: 'intermediate',
    confidence: 0.8,
    x: Math.random() * 20 - 10,
    y: Math.random() * 20 - 10,
    z: Math.random() * 20 - 10,
  }));

  const nodeIdMap = new Map(backendNodes.map((n) => [n.id.toString(), n.id.toString()]));

  const links: GraphLink[] = backendEdges
    .map((edge) => ({
      source: edge.source.toString(),
      target: edge.target.toString(),
      value: 1,
    }))
    .filter(
      (link) => nodeIdMap.has(link.source) && nodeIdMap.has(link.target)
    );

  return { nodes, links };
}

/**
 * Transforms backend student skills into graph nodes and links
 */
export function transformStudentSkillsToGraph(
  skills: Array<{
    student_id: number;
    skill_id: number;
    proficiency_score: number;
    confidence_score: number;
    usage_count: number;
    last_used: string;
    skills: {
      id: number;
      name: string;
      category: string;
    };
  }>
): { nodes: GraphNode[]; links: GraphLink[] } {
  const nodes: GraphNode[] = skills.map((skill) => {
    const level =
      skill.proficiency_score > 0.7
        ? 'advanced'
        : skill.proficiency_score > 0.4
        ? 'intermediate'
        : 'beginner';

    return {
      id: `skill-${skill.skill_id}`,
      name: skill.skills.name,
      category: skill.skills.category,
      level,
      confidence: skill.confidence_score,
      x: Math.random() * 20 - 10,
      y: Math.random() * 20 - 10,
      z: Math.random() * 20 - 10,
    };
  });

  // Create links between frequently used skills
  const links: GraphLink[] = [];
  for (let i = 0; i < skills.length; i++) {
    for (let j = i + 1; j < skills.length; j++) {
      // Link if both skills have been recently used
      const skill1Date = new Date(skills[i].last_used);
      const skill2Date = new Date(skills[j].last_used);
      const daysDiff = Math.abs(skill1Date.getTime() - skill2Date.getTime()) / (1000 * 60 * 60 * 24);

      // Link skills used within 30 days of each other
      if (daysDiff < 30) {
        links.push({
          source: `skill-${skills[i].skill_id}`,
          target: `skill-${skills[j].skill_id}`,
          value: 1 - daysDiff / 30, // Stronger link if used closer together
        });
      }
    }
  }

  return { nodes, links };
}

/**
 * Filter nodes and links based on search query
 */
export function filterGraph(
  nodes: GraphNode[],
  links: GraphLink[],
  query: string,
  categoryFilter?: string
): { nodes: GraphNode[]; links: GraphLink[] } {
  if (!query && !categoryFilter) {
    return { nodes, links };
  }

  const queryLower = query.toLowerCase();

  // Filter nodes
  const filteredNodes = nodes.filter((node) => {
    const matchesQuery =
      node.name.toLowerCase().includes(queryLower) ||
      node.category.toLowerCase().includes(queryLower);
    const matchesCategory = !categoryFilter || node.category === categoryFilter;
    return matchesQuery && matchesCategory;
  });

  const filteredNodeIds = new Set(filteredNodes.map((n) => n.id));

  // Filter links - keep only links between filtered nodes
  const filteredLinks = links.filter((link) => {
    const sourceId = typeof link.source === 'string' ? link.source : link.source.id;
    const targetId = typeof link.target === 'string' ? link.target : link.target.id;
    return filteredNodeIds.has(sourceId) && filteredNodeIds.has(targetId);
  });

  return { nodes: filteredNodes, links: filteredLinks };
}

/**
 * Get all unique categories from nodes
 */
export function getCategories(nodes: GraphNode[]): string[] {
  const categories = new Set(nodes.map((n) => n.category));
  return Array.from(categories).sort();
}
