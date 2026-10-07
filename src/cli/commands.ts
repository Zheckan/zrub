import { loadCatalog } from '../catalog/load-catalog.js';
import { describeResource, readResource } from '../catalog/resource-content.js';
import { asError } from '../errors.js';

interface CommandDependencies {
  resourcesRoot: string;
  stdout(text: string): void;
  stderr(text: string): void;
  install(): Promise<number>;
}

const HELP = `Zrub

Usage:
  zrub                              Interactive resource installation
  zrub list [--json]                 Discover resources and their source files
  zrub read <resource-id> [--json]    Receive instructions without installing them
  zrub --help                       Show this help

For a one-time task, list resources, read the matching resource, then follow the instructions.
The read command prints content; the calling agent performs the requested work.
Neither list nor read writes files in the target project or executes the instructions.
Reading is repeatable and does not record an installation.

Example:
  zrub read typescript-ci-setup
`;

export async function runCommand(
  args: string[],
  { resourcesRoot, stdout, stderr, install }: CommandDependencies,
): Promise<number> {
  try {
    if (args.length === 0) {
      return await install();
    }

    if (args.length === 1 && ['--help', '-h', 'help'].includes(args[0] ?? '')) {
      stdout(HELP);
      return 0;
    }

    if (
      args[0] === 'list' &&
      (args.length === 1 || (args.length === 2 && args[1] === '--json'))
    ) {
      const resources = await loadCatalog(resourcesRoot);
      const summaries = resources.map(describeResource);
      stdout(
        args[1] === '--json'
          ? `${JSON.stringify(summaries, null, 2)}\n`
          : summaries
              .map(
                (resource) =>
                  `${resource.id} - ${resource.name} [${resource.kind}]\n${resource.description}\nFiles: ${resource.files.join(', ')}`,
              )
              .join('\n\n') + '\n',
      );
      return 0;
    }

    if (
      args[0] === 'read' &&
      (args.length === 2 || (args.length === 3 && args[2] === '--json'))
    ) {
      const resources = await loadCatalog(resourcesRoot);
      const resource = resources.find(({ id }) => id === args[1]);
      if (resource === undefined) {
        throw new Error(
          `Unknown resource: ${args[1]}. Use zrub list to find an ID.`,
        );
      }
      const content = await readResource(resource);
      stdout(
        args[2] === '--json'
          ? `${JSON.stringify(content, null, 2)}\n`
          : [
              `# ${content.name}`,
              `Resource ID: ${content.id}`,
              `Kind: ${content.kind}`,
              content.description,
              ...content.files.map(
                (file) => `## Source: ${file.source}\n\n${file.content}`,
              ),
            ].join('\n\n') + '\n',
      );
      return 0;
    }

    throw new Error('Invalid command. Use zrub --help for usage.');
  } catch (error) {
    stderr(`zrub: ${asError(error).message}\n`);
    return 1;
  }
}
