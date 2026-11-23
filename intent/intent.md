# Intent: CommonShense SessionStack

Author: user request, recorded by Codex. Implementation authorized in the conversation on 27 September 2026, using RESEARCH_EVIDENCE.md and the accepted concept.

## Problem
Separate AI sessions should contribute to the same goal without a conversation fork. Each should hold complementary context, discuss evidence, and produce one central result.

## Proposed outcome
A runnable local application with independent lane contexts, a durable shared board, source ownership, selective retrieval, a central evidence-linked result, historical comparison, and an A/B/C evaluation harness.

## Affected users and systems
One local user. Changes confined to this product directory. Browser, local Node process, SQLite, and an optional explicit OpenAI API run.

## Constraints
No pooled native context or latency-free claims. Preserve original evidence. No model-authorized shell or filesystem tools. Keep API credentials server-side. Label offline demo output and estimated metrics. No cloud deployment or external publication.

## Open questions
Production providers, independent evaluation reviewers, quality/cost gates, and multi-user deployment remain future product decisions. They do not block a local prototype.
