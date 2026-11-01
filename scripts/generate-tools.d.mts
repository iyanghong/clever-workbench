export type DiscoveredTool = {
  id: string;
  title: string;
  description: string;
  icon: string;
  guidance: string | null;
  directory: string;
  renderer: string;
  contract: string;
  controller: string | null;
  worker: string | null;
  preferences: string | null;
};
export function discoverTools(root?: string): Promise<DiscoveredTool[]>;
export function generateToolRegistries(root?: string): Promise<DiscoveredTool[]>;
