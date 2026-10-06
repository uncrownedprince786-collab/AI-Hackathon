---
title: How AI answers questions about your own documents
slug: how-rag-answers-questions-about-your-documents
date: 2026-10-05
description: Retrieval augmented generation in plain English: how to let an AI answer using your files without retraining it.
tags: RAG, LLM, Getting started
author: AI Hackathons
---

Ask a general chatbot about your company's holiday policy and it will either guess or refuse. It has never seen your policy document. Retrieval augmented generation, or RAG, fixes that without retraining anything.

## The idea in one paragraph

Instead of hoping the model already knows the answer, you search your own documents first, find the few paragraphs that matter, and hand those to the model with the question. The model then answers using evidence you gave it.

## Why this beats retraining

Training a model on your documents costs a lot of money and needs doing again every time something changes. With RAG, you update a search index instead. Edit the document this afternoon, ask the question this afternoon, and the answer already reflects the edit.

## What the pipeline actually does

1. **Split the documents.** Pages and files are cut into short chunks so each one is a complete, searchable thought.
2. **Make them searchable.** Each chunk is turned into numbers that capture meaning, or indexed as plain text, so similar questions find similar passages.
3. **Fetch the relevant chunks.** A question comes in, the system pulls the best five or ten passages.
4. **Answer with sources.** The model writes an answer using only that material, and good implementations show you which passage it used.

## Where it goes wrong

- **Bad chunks.** Split a table down the middle and the model receives nonsense. Splitting matters more than people expect.
- **Too much context.** Handing over fifty pages makes the answer worse, not better. Quality beats quantity.
- **No source shown.** If the system does not show which paragraph it used, you cannot check it. Always prefer an answer that cites the passage it read.

## Try this at a hackathon

RAG remains one of the most reliable projects you can build in a weekend, because you can demonstrate it with a folder of documents anyone understands. Pick a boring, specific document set — a university handbook, a product manual, a set of regulations — and make the answers visibly accurate.
