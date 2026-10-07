# Read-once resource access

Agents need to discover a resource and receive its instructions for one task
without installing the guide in the target project. For example, an agent can
read the TypeScript CI guide and create `.github/workflows/ci.yml` while leaving
`docs/` and `AGENTS.md` unchanged.

## Commands

- `zrub list` lists resource IDs, names, kinds, descriptions, and source files.
- `zrub read <resource-id>` prints the resource's metadata and complete payload
  contents, with each source file identified. It works for every resource kind.
- Both commands accept `--json` for structured output without prompts or ANSI
  formatting. Errors go to stderr with a nonzero exit code.
- `zrub --help` explains the commands and the one-time agent workflow.
- With no arguments, Zrub keeps its existing interactive installation flow.
  Invalid arguments fail instead of falling through to the installer.

The agent runs `list` to find the resource, runs `read` to receive its
instructions, and follows those instructions for the user's requested task.
Zrub reads and prints content; the calling agent performs the described work.
There is no execution tracking or restriction on reading a resource again.

## Catalog and output

Use the same validated bundled catalog for installation and read-once access.
Keep metadata schema version 1 and its existing file mappings. Reading never
uses a target destination or depends on the target project's existing files.
Include alternate template sources so agents receive both new-project and
existing-project instructions, and list each distinct source once.

JSON discovery returns an array of resources with `id`, `name`, `description`,
`kind`, and `files`, an array of source filenames. JSON reading returns a
resource with the same metadata and `files` entries containing `source` and
`content`. Preserve each file's contents in the JSON result.

Load all content successfully before emitting a read result. Unknown IDs,
invalid command arguments, malformed metadata, missing payloads, and paths
outside the resource root produce an error rather than partial instructions.

## Ownership and verification

Keep argument dispatch and terminal output in `src/cli/`. Catalog validation
and payload reading belong in `src/catalog/`. Installation planning and
execution remain in `src/installer/` and are used only by the installation
flow.

Verify the public CLI with real catalog resources, output and exit-code checks,
and a temporary target project whose files must stay unchanged. Exercise
multi-file templates, plain and JSON output, invalid inputs, and payload path
containment. Verify the packaged CLI can discover and read resources after
extraction outside the checkout.

Global agent skills and automatic execution of repository profiles are outside
this change.
