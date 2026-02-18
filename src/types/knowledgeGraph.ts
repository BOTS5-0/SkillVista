export type SkillLevel = 'beginner' | 'intermediate' | 'advanced';

export type DataSource = 'github' | 'notion' | 'certification' | 'manual';

export interface StudentProfile {
  id: string;
  name: string;
  title: string;
  bio: string;
  location: string;
  avatarUrl: string;
  githubUrl: string;
  notionUrl: string;
}

export interface Skill {
  id: string;
  name: string;
  category: string;
  level: SkillLevel;
  source: DataSource;
  confidence: number;
}

export interface Project {
  id: string;
  name: string;
  summary: string;
  repoUrl: string;
  tags: string[];
  skills: string[];
  startDate: string;
  endDate?: string;
}

export interface Certification {
  id: string;
  name: string;
  issuer: string;
  issueDate: string;
  credentialId: string;
  relatedSkills: string[];
}

export type MilestoneStatus = 'planned' | 'in_progress' | 'completed';

export interface LearningMilestone {
  id: string;
  title: string;
  status: MilestoneStatus;
  targetDate: string;
  completedDate?: string;
  relatedSkills: string[];
}

export type GraphNodeType =
  | 'student'
  | 'source'
  | 'skill'
  | 'project'
  | 'certification'
  | 'concept'
  | 'milestone';

export interface GraphNode {
  id: string;
  label: string;
  type: GraphNodeType;
  group?: string;
  level?: SkillLevel;
  position?: {
    x: number;
    y: number;
    z: number;
  };
  meta?: Record<string, string | number | boolean>;
}

export type GraphRelation =
  | 'BUILT'
  | 'FROM'
  | 'USES'
  | 'CERTIFIED_IN'
  | 'VALIDATES'
  | 'RELATED_TO';

export interface GraphEdge {
  id: string;
  source: string;
  target: string;
  relation: GraphRelation;
  weight?: number;
}
