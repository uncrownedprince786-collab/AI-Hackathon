---
title: AI agents, explained in plain English
slug: ai-agents-explained-in-plain-english
date: 2026-10-04
description: What makes an AI agent different from a chatbot, how agents actually work, and the three things that stop them failing.
tags: AI Agents, LLM, Getting started
author: AI Hackathons
---

A chatbot answers. An agent does. That single difference explains most of the excitement, and most of the failures.

## What an agent is

An agent is a language model given a goal, a set of tools, and permission to act in a loop. Ask it to compare prices across three shops and it does not write you instructions. It reads a page, clicks to the next one, reads again, and returns with the numbers.

The loop is simple:

1. Look at the goal and what has happened so far.
2. Choose one action, such as calling a search or reading a file.
3. Read the result.
4. Repeat until it believes the goal is done, or until it runs out of steps.

## Why they fail in practice

- **They stop too early or loop forever.** Without a clear stopping rule, an agent either declares victory after one step or repeats the same action until the budget runs out.
- **Tools are described badly.** The model only calls a tool correctly if the tool's purpose and inputs are written clearly. Most agent bugs are documentation bugs.
- **No one checks the output.** An agent that can send an email or spend money needs a confirmation step. Autonomy without review is how demos become incidents.

## A practical rule

Give the agent a goal, a budget of steps, and a way to show its work. Ask it to list every action it took with the result of each one. When something goes wrong, the log tells you exactly where.

## Why judges like agent projects

Agent entries are easy to demonstrate live, and they show real work instead of a chat window. They also fail live, so the teams that win are the ones who tested the boring parts: error handling, step limits and a human confirming anything irreversible.
