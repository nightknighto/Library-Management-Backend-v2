# Rules Directory

This directory is the canonical location for project rules and AI instruction documents.

## What belongs here
- Agent behavior policies
- Mandatory workflow and validation rules
- Type-inference governance and contribution requirements

## Key documents
- [create-handler-inference-policy.md](create-handler-inference-policy.md): lane structure and contribution rules for inference tests.
- [create-handler-auth-inference-limitations.md](create-handler-auth-inference-limitations.md): detailed analysis of TypeScript inference limitations around `security.authenticate`, with mitigation policy.

## What does not belong here
- General implementation guides
- Feature tutorials
- API walkthroughs

For example, docs/create-handler-security-guide.md is a usage guide, not a rules document.
