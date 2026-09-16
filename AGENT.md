# AGENT.md

This file is context for any AI agent (Codex, Claude Code, Cursor, etc.) working in this repository. Read it before doing anything else, and follow it for the whole session — not just the first message.

## What this project is

A hybrid of Notion and a shareable to-do app.

- The core UI is a **board** — a colored canvas where the user places small sticky notes.
- Notes can be **linked to each other**, graph-style — the board behaves conceptually like an ERD diagram (entities + relationships), not a flat list.
- A user can have **many boards**, each with many notes.
- Boards can be **shared** — other users who join a board can add/edit notes on it too.
- There's an **in-app chat** to talk with other users sharing a board.

## Stack

ASP.NET Core (Web API) · EF Core · PostgreSQL · React · Nginx · containerized/DevOps deployment.

## Architecture

The repo follows **vertical slice architecture** — code is organized by feature/use case (each slice owns its request, handler, and data access), not by horizontal technical layers. Any change should stay scoped to the slice it belongs to. If a change needs to touch shared/horizontal code (a shared service, cross-cutting concern, shared model), that's a flag-and-ask moment, not a silent refactor toward layered architecture.

## Why this project exists — read this before doing anything

This repo is a **learning vehicle**, not just a delivery target. The owner is using it specifically to learn ASP.NET Core, EF Core, PostgreSQL, React, Nginx, and DevOps hands-on, by working through it alongside the agent — not by having it done for them silently. That purpose shapes how changes get made here, not just what gets built.

## Operating rules for any agent in this repo

1. **You may write and modify code.** But before any non-trivial change, present it as a decision first: 2–3 concrete approach options, each with what it is, why you'd pick it, and its trade-offs (simplicity, scalability, idiomatic fit for this stack, maintenance cost). Recommend one, but let the owner choose before implementing.
2. **Read the actual repo state before proposing anything.** Check current structure, recent commits, and existing code — don't propose from the feature description alone.
3. **Work step-by-step and modularly, scoped to vertical slices.** Once an approach is picked, break it into small steps — implement one step at a time (ideally one slice, or part of one), stop, summarize what changed and why, and get confirmation before the next step. Never deliver a large multi-slice diff in one shot.
4. **Gate progress on understanding, not just working code.** After each step, the owner should be able to explain the decision back in their own words before moving on. If they can't, pause there.
5. **Code review = name the issue, then offer fix options** — don't silently patch things that weren't part of the current task. Same options-first treatment: what's wrong, why it matters, and a couple of ways to address it.
6. **Narrate meaningful trade-offs while implementing**, not just before — when a line or pattern is a real decision (not boilerplate), say why this way over the alternative.
7. **If asked to just push through and skip the options/step-by-step process** ("just do the whole thing"), push back once and confirm that's really wanted for this task before doing it that way.

## Session format

When doing feature/implementation work, structure the response as:

- **Current state** — a quick honest read of where the repo/project actually is.
- **Approach options** — 2–3 ways to do the next piece of work, with reasoning and a recommendation (skip only for trivial, single-way changes).
- **Chosen step plan** — the small modular steps to take, scoped to vertical slices, once an approach is picked.
- **Implementation** — the current step's actual code change, with a short explanation.
- **Checkpoint question** — something the owner should be able to explain back before moving to the next step.

## Status

_Update this section as milestones/slices are completed, so future agent sessions pick up context instead of re-deriving it._

- Current milestone/slice: Google OAuth code is implemented; a real provider round trip awaits a configured Google client secret. Note CRUD and per-note authorization are future slices.
- Completed milestones/slices: Board membership model (owner/guest with guest edit permission), self-referencing notes and checklist items with `xmin` concurrency, typed note connections, JWT access-token and rotating refresh-cookie authentication, user-wide refresh-token revocation, membership-gated board list/detail/create/guest endpoints, global snake_case PostgreSQL naming, two applied migrations, one-time Google exchange, protected explicit linking, safe unlinking, and React authentication screens.
