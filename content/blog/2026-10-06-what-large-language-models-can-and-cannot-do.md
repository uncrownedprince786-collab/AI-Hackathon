---
title: What large language models can and cannot do
slug: what-large-language-models-can-and-cannot-do
date: 2026-10-06
description: A plain-English look at what LLMs like ChatGPT, Claude and Gemini are good at, where they fail, and how to use them safely.
tags: LLM, Generative AI, Getting started
author: AI Hackathons
---

Large language models (LLMs) are the technology behind ChatGPT, Claude, Gemini and most AI chat tools. They look like they think, but they do not. Understanding what they are actually doing is the fastest way to get good results from them.

## What they are good at

- **Writing and rewriting.** Drafting an email, turning notes into a summary, changing the tone of a paragraph.
- **Explaining code.** Reading a function and telling you what it does, or suggesting why an error appeared.
- **Translating and structuring text.** Moving meaning between languages, or turning messy notes into a table or list.
- **Generating ideas quickly.** A hundred weak ideas in a minute is often more useful than one strong idea in an hour.

## Where they fail

LLMs predict likely text. That creates three predictable problems.

1. **They can be confidently wrong.** A model can state a fact that does not exist with total confidence, because the sentence reads well. This is often called hallucination.
2. **They have a cut-off date.** They do not know what happened after their training data ended, unless they can search for it.
3. **They do not check their own work.** Ask for a calculation and it may guess instead of computing. Ask for a citation and it may invent the reference.

## How to use them safely

Ask the model to show its reasoning step by step. Give it the source material instead of asking it to remember. Ask it to list what it is unsure about. And for anything that matters — money, medicine, law, or a page you are going to publish — check the output yourself.

The people who get the most from AI are not the ones with the cleverest prompts. They are the ones who treat the output as a first draft from a very fast, very confident assistant who sometimes makes things up.

## What this means for hackathons

Most AI hackathon projects use an LLM as a component, not as the whole idea. The winning entries usually pair a model with something it cannot do alone: your own documents, a real data source, a tool that takes an action, or a person who reviews the result before it ships.
