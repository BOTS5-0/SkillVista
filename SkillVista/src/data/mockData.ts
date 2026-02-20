import {
  Certification,
  GraphEdge,
  GraphNode,
  LearningMilestone,
  Project,
  Skill,
  StudentProfile,
} from '@/types/knowledgeGraph';

export const mockProfile: StudentProfile = {
  id: 'student-arin-dixit',
  name: 'Arin Dixit',
  title: 'Full Stack Learner',
  bio: 'Exploring web apps, NLP, and AI powered knowledge graphs.',
  location: 'New Delhi, IN',
  avatarUrl: 'https://i.pravatar.cc/150?img=12',
  githubUrl: 'https://github.com/arin-dixit',
  notionUrl: 'https://www.notion.so/arin-dixit',
};

export const mockSkills: Skill[] = [
  {
    id: 'skill-react',
    name: 'React',
    category: 'Frontend',
    level: 'intermediate',
    source: 'github',
    confidence: 0.8,
  },
  {
    id: 'skill-node',
    name: 'Node.js',
    category: 'Backend',
    level: 'intermediate',
    source: 'github',
    confidence: 0.76,
  },
  {
    id: 'skill-mongo',
    name: 'MongoDB',
    category: 'Database',
    level: 'beginner',
    source: 'github',
    confidence: 0.62,
  },
  {
    id: 'skill-python',
    name: 'Python',
    category: 'Backend',
    level: 'intermediate',
    source: 'notion',
    confidence: 0.72,
  },
  {
    id: 'skill-nlp',
    name: 'NLP',
    category: 'AI',
    level: 'beginner',
    source: 'notion',
    confidence: 0.58,
  },
];

export const mockProjects: Project[] = [
  {
    id: 'project-studify',
    name: 'Studify',
    summary: 'Study planner with tasks, streaks, and progress analytics.',
    repoUrl: 'https://github.com/arin-dixit/studify',
    tags: ['react', 'node', 'mongodb'],
    skills: ['skill-react', 'skill-node', 'skill-mongo'],
    startDate: '2025-08-10',
    endDate: '2025-09-22',
  },
  {
    id: 'project-ml-notes',
    name: 'ML Notes',
    summary: 'Personal ML notes organized with NLP tagging.',
    repoUrl: 'https://github.com/arin-dixit/ml-notes',
    tags: ['python', 'nlp'],
    skills: ['skill-python', 'skill-nlp'],
    startDate: '2025-10-05',
  },
];

export const mockCertifications: Certification[] = [
  {
    id: 'cert-cs50-ai',
    name: 'CS50 AI',
    issuer: 'HarvardX',
    issueDate: '2025-12-12',
    credentialId: 'CS50AI-11882',
    relatedSkills: ['skill-python'],
  },
];

export const mockMilestones: LearningMilestone[] = [
  {
    id: 'milestone-studify',
    title: 'Ship Studify MVP',
    status: 'completed',
    targetDate: '2025-09-30',
    completedDate: '2025-09-22',
    relatedSkills: ['skill-react', 'skill-node', 'skill-mongo'],
  },
  {
    id: 'milestone-ml-notes',
    title: 'Publish ML Notes v1',
    status: 'in_progress',
    targetDate: '2026-02-15',
    relatedSkills: ['skill-python', 'skill-nlp'],
  },
];

export const mockGraphNodes: GraphNode[] = [
  {
    id: 'node-student-arin',
    label: 'Arin Dixit',
    type: 'student',
    group: 'Student',
    position: { x: 0, y: 0, z: 0 },
  },
  {
    id: 'node-source-github',
    label: 'GitHub',
    type: 'source',
    group: 'Source',
    position: { x: -18, y: 6, z: 6 },
  },
  {
    id: 'node-source-notion',
    label: 'Notion',
    type: 'source',
    group: 'Source',
    position: { x: 18, y: 6, z: 6 },
  },
  {
    id: 'node-project-studify',
    label: 'Studify',
    type: 'project',
    group: 'Project',
    position: { x: -14, y: -8, z: 2 },
  },
  {
    id: 'node-project-ml-notes',
    label: 'ML Notes',
    type: 'project',
    group: 'Project',
    position: { x: 14, y: -8, z: 2 },
  },
  {
    id: 'node-skill-react',
    label: 'React',
    type: 'skill',
    group: 'Skill',
    level: 'intermediate',
    position: { x: -18, y: -2, z: -4 },
  },
  {
    id: 'node-skill-node',
    label: 'Node.js',
    type: 'skill',
    group: 'Skill',
    level: 'intermediate',
    position: { x: -10, y: -2, z: -6 },
  },
  {
    id: 'node-skill-mongo',
    label: 'MongoDB',
    type: 'skill',
    group: 'Skill',
    level: 'beginner',
    position: { x: -6, y: 2, z: -8 },
  },
  {
    id: 'node-skill-python',
    label: 'Python',
    type: 'skill',
    group: 'Skill',
    level: 'intermediate',
    position: { x: 10, y: -2, z: -6 },
  },
  {
    id: 'node-skill-nlp',
    label: 'NLP',
    type: 'skill',
    group: 'Skill',
    level: 'beginner',
    position: { x: 18, y: -2, z: -4 },
  },
  {
    id: 'node-cert-cs50-ai',
    label: 'CS50 AI',
    type: 'certification',
    group: 'Certification',
    position: { x: 4, y: 14, z: 6 },
  },
];

export const mockGraphEdges: GraphEdge[] = [
  {
    id: 'edge-student-built-studify',
    source: 'node-student-arin',
    target: 'node-project-studify',
    relation: 'BUILT',
    weight: 0.9,
  },
  {
    id: 'edge-student-built-ml-notes',
    source: 'node-student-arin',
    target: 'node-project-ml-notes',
    relation: 'BUILT',
    weight: 0.85,
  },
  {
    id: 'edge-studify-from-github',
    source: 'node-project-studify',
    target: 'node-source-github',
    relation: 'FROM',
    weight: 0.7,
  },
  {
    id: 'edge-ml-notes-from-notion',
    source: 'node-project-ml-notes',
    target: 'node-source-notion',
    relation: 'FROM',
    weight: 0.65,
  },
  {
    id: 'edge-studify-uses-react',
    source: 'node-project-studify',
    target: 'node-skill-react',
    relation: 'USES',
    weight: 0.8,
  },
  {
    id: 'edge-studify-uses-node',
    source: 'node-project-studify',
    target: 'node-skill-node',
    relation: 'USES',
    weight: 0.78,
  },
  {
    id: 'edge-studify-uses-mongo',
    source: 'node-project-studify',
    target: 'node-skill-mongo',
    relation: 'USES',
    weight: 0.72,
  },
  {
    id: 'edge-ml-notes-uses-python',
    source: 'node-project-ml-notes',
    target: 'node-skill-python',
    relation: 'USES',
    weight: 0.76,
  },
  {
    id: 'edge-ml-notes-uses-nlp',
    source: 'node-project-ml-notes',
    target: 'node-skill-nlp',
    relation: 'USES',
    weight: 0.7,
  },
  {
    id: 'edge-student-certified-in',
    source: 'node-student-arin',
    target: 'node-cert-cs50-ai',
    relation: 'CERTIFIED_IN',
    weight: 0.9,
  },
  {
    id: 'edge-cert-validates-python',
    source: 'node-cert-cs50-ai',
    target: 'node-skill-python',
    relation: 'VALIDATES',
    weight: 0.8,
  },
];

export const mockGraph = {
  nodes: mockGraphNodes,
  edges: mockGraphEdges,
};
