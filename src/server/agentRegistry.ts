import fs from 'fs';
import path from 'path';
import { AgentManifest } from '../types.js';

const AGENTS_DIR = path.resolve(process.cwd(), 'agents');

export function getAgentManifest(agentId: string): AgentManifest | null {
  try {
    const filePath = path.join(AGENTS_DIR, `${agentId}.json`);
    if (!fs.existsSync(filePath)) {
      return null;
    }
    const content = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(content) as AgentManifest;
  } catch (err) {
    console.error(`Error reading agent manifest for ${agentId}:`, err);
    return null;
  }
}

export function getAllAgents(): AgentManifest[] {
  try {
    if (!fs.existsSync(AGENTS_DIR)) {
      return [];
    }
    const files = fs.readdirSync(AGENTS_DIR);
    return files
      .filter((file) => file.endsWith('.json'))
      .map((file) => {
        const content = fs.readFileSync(path.join(AGENTS_DIR, file), 'utf-8');
        return JSON.parse(content) as AgentManifest;
      });
  } catch (err) {
    console.error('Error reading agents directory:', err);
    return [];
  }
}
