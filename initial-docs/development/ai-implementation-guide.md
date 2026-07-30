# AI Implementation Guide

Project: PulseTrace

Version: 1.0

Status: Living Document

---

# Purpose

This document defines how AI assistants (ChatGPT, Claude, Cursor, GitHub Copilot, etc.) should contribute to the PulseTrace codebase.

AI is an implementation assistant—not the architect.

All architectural decisions are made through the project documentation.

If an AI-generated implementation conflicts with any design document, the documentation takes precedence.

---

# Source of Truth

Before implementing any feature, AI must follow these documents in order:

1. Engineering Principles
2. Product Requirements Document (PRD)
3. System Architecture
4. Feature Specification
5. Core Modules Specification
6. Database Design
7. API Specification
8. Folder Structure

Never invent architecture that contradicts these documents.

---

# AI Role

AI is responsible for:

- Writing implementation code
- Explaining concepts
- Refactoring existing code
- Writing tests
- Improving readability
- Suggesting optimizations
- Finding bugs
- Generating documentation
- Reviewing code quality

AI is NOT responsible for:

- Changing architecture
- Renaming modules without approval
- Introducing unnecessary libraries
- Reorganizing the project structure
- Creating features not defined in the documentation
- Modifying unrelated files

---

# Development Workflow

Every feature follows the same workflow.

## Step 1: Understand

Read the relevant documentation before writing any code.

Never start implementation without understanding the feature.

---

## Step 2: Plan

Before generating code, explain:

- What will be implemented
- Which files will be created
- Which files will be modified
- Why each change is necessary

Do not write code yet.

---

## Step 3: Implement

Implement only the requested feature.

Avoid touching unrelated modules.

Keep changes focused and minimal.

---

## Step 4: Explain

After implementation, explain:

- What changed
- Why it changed
- How it works
- Any assumptions made

---

## Step 5: Review

Check for:

- Compilation errors
- Type errors
- Lint issues
- Logic bugs
- Architecture violations

---

# Coding Principles

Code should be:

- Readable
- Modular
- Predictable
- Testable
- Maintainable

Avoid clever solutions.

Prefer explicit code over compact code.

Functions should do one thing well.

---

# Architecture Rules

Follow the existing architecture.

Never introduce new architectural patterns unless requested.

Respect module boundaries.

Controllers should never contain business logic.

Business logic belongs in services.

Database access belongs in repositories.

External APIs belong in adapters.

Background processing belongs in workers.

---

# File Modification Rules

Only modify files required for the task.

Never rename files without approval.

Never move folders without approval.

Do not remove existing functionality unless requested.

---

# Dependency Rules

Before adding a package:

Explain:

- Why it is needed
- What problem it solves
- Whether the project already has an alternative

Do not install dependencies automatically.

---

# API Rules

Keep controllers thin.

Validate all requests.

Return consistent response structures.

Handle errors centrally.

Do not expose internal implementation details.

---

# Database Rules

Never modify the schema without updating the Database Design document.

Use UUIDs for primary keys.

Prefer migrations over manual SQL changes.

Do not duplicate data unnecessarily.

Store historical information in Notification Events.

---

# Event Rules

Every significant state transition should create an event.

Events are immutable.

Events are append-only.

Never overwrite event history.

---

# Queue Rules

Workers should never block API requests.

Heavy processing belongs in BullMQ jobs.

Jobs should be idempotent whenever possible.

Handle retries gracefully.

Move exhausted jobs to the Dead Letter Queue.

---

# Error Handling

Never ignore errors.

Use structured error handling.

Return meaningful error messages.

Log unexpected failures.

Avoid silent failures.

---

# Logging Rules

Log meaningful events.

Avoid excessive logging.

Never log secrets.

Use structured logs where possible.

---

# Security Rules

Validate all user input.

Never expose secrets.

Use environment variables for configuration.

Sanitize external data.

Protect sensitive endpoints.

---

# Code Style

Use descriptive variable names.

Avoid abbreviations.

Keep functions small.

Remove unused code.

Avoid deep nesting.

Prefer early returns.

Write self-explanatory code.

---

# Documentation Rules

Every new module should include:

- Purpose
- Responsibilities
- Public API
- Dependencies

Update documentation when behavior changes.

---

# Testing Rules

New features should include:

- Unit tests where appropriate
- Integration tests for API behavior
- Worker tests for background jobs

Tests should verify expected behavior, not implementation details.

---

# Git Rules

One logical feature per commit.

Use meaningful commit messages.

Examples:

feat: add notification creation API

fix: resolve worker retry bug

refactor: simplify event service

docs: update database design

---

# Prompting Guidelines

When asking AI to implement a feature:

Always provide:

- Feature name
- Relevant documentation
- Files involved
- Expected behavior
- Constraints

Avoid prompts like:

"Build the notification system."

Prefer:

"Implement the Notification Creation API using the architecture and database design documents. Create the controller, service, repository, and validation layer only. Do not implement queue processing."

---

# Review Checklist

Before considering a task complete, verify:

- Documentation followed
- Architecture respected
- Minimal file changes
- No unrelated modifications
- No duplicated logic
- Consistent naming
- Error handling implemented
- Logging included where appropriate
- Tests added where necessary
- Project builds successfully

---

# Principles to Remember

- Documentation is the source of truth.
- Simplicity is preferred over complexity.
- Build only what is required.
- Keep modules loosely coupled.
- Preserve a clear separation of concerns.
- Favor readability over cleverness.
- Every notification should be traceable.
- Every architectural decision should support maintainability and learning.

---

# Definition of Success

AI has successfully completed a task when:

- The implementation matches the documentation.
- The architecture remains consistent.
- The code is clean, modular, and testable.
- Only the requested functionality has been implemented.
- The project is easier—not harder—to maintain after the change.

# AI Implementation Strategy

Before writing any code, read and understand all documentation.

The purpose of reading the documentation is to understand the project—not to implement everything at once.

After understanding the overall architecture, follow the Development Roadmap strictly.

## Implementation Rules

Implement only the current roadmap phase.

Do not implement future phases.

Do not create files for future features.

Do not create abstractions that are not currently required.

Do not anticipate requirements from later phases.

Every implementation should satisfy only the current milestone.

When a phase is complete:

- verify the implementation
- ensure tests pass (if applicable)
- update documentation if required
- wait for approval before moving to the next phase

Never skip phases.

Never merge multiple roadmap phases into one implementation.

The roadmap is the single source of truth for implementation order.

# AI Phase Workflow

For every development session:

Step 1

Read the relevant project documentation.

↓

Step 2

Identify the current roadmap phase.

↓

Step 3

Determine only the files required for that phase.

↓

Step 4

Implement only that phase.

↓

Step 5

Explain what was changed.

↓

Step 6

Wait for review.

↓

Step 7

Proceed to the next phase only after approval.


# Golden Rule

The documentation defines the vision.

The roadmap defines the implementation order.

The current phase defines the implementation scope.

If documentation mentions a feature that belongs to a future phase, understand it but do not implement it yet.

Understanding the complete architecture is encouraged.

Implementing beyond the current roadmap phase is prohibited.